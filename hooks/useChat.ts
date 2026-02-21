import { useState, useRef, useEffect } from 'react';
import {
	ChatMessage,
	ChatConfig,
	QaConfig,
	ImageAttachment,
	SelectionMetadata,
	ScrollTarget,
	DocumentAttachment,
} from '../types';
import { getChatResponseStream } from '../services/gemini';
import { compactHistory, buildContextBudget } from '../services/contextManager';
import { classifyError, delay } from '../services/errorClassifier';
import { processStream, createStreamUpdateHandler } from './useStreamProcessor';
import {
	MAX_AGENT_TURNS,
	handleFunctionCalls,
	buildToolResultMessage,
} from './useToolExecution';
import { LLMTransport } from '../services/llmTransport';
import { prompts } from '../services/prompts';
import { getTemplateById } from '../services/templateStorage';

interface UseChatProps {
	documentHtml: string;
	selectedText: SelectionMetadata | null;
	documentsContent: DocumentAttachment[];
	qaConfig: QaConfig;
	chatConfig: ChatConfig;
	transport: LLMTransport;
	onDocumentEdit: (
		newHtml: string,
		reason: string,
		scrollTo?: ScrollTarget,
		scrollTargets?: ScrollTarget[]
	) => void;
}

interface UseChatReturn {
	messages: ChatMessage[];
	input: string;
	isLoading: boolean;
	isStreamingText: boolean;
	chatConfig: ChatConfig;
	setInput: (value: string) => void;
	setChatConfig: (config: ChatConfig) => void;
	handleSendMessage: (
		prompt?: string,
		images?: ImageAttachment[]
	) => Promise<void>;
	handleEditMessage: (index: number, newContent: string) => Promise<void>;
	handleRetryMessage: (index: number) => Promise<void>;
	handleRetryAIMessage: (index: number) => Promise<void>;
	handleStopGeneration: () => void;
	handleResetChat: () => void;
	handleQuickGenerate: () => Promise<void>;
	removePlaceholderMessage: () => void;
	replacePlaceholderMessage: (message: ChatMessage) => void;
	sessionTokens: number | null;
	inputImages: ImageAttachment[];
	setInputImages: (images: ImageAttachment[]) => void;
}

/**
 * Helper function to remove the placeholder message from the messages array
 */
const removePlaceholder = (messages: ChatMessage[]): ChatMessage[] => {
	const updated = [...messages];
	if (
		updated.length > 0 &&
		updated[updated.length - 1].role === 'model' &&
		updated[updated.length - 1].content === ''
	) {
		updated.pop();
	}
	return updated;
};

/**
 * Helper function to replace the placeholder message with a new message
 */
const replacePlaceholder = (
	messages: ChatMessage[],
	newMessage: ChatMessage
): ChatMessage[] => {
	const updated = [...messages];
	if (
		updated.length > 0 &&
		updated[updated.length - 1].role === 'model' &&
		updated[updated.length - 1].content === ''
	) {
		updated[updated.length - 1] = newMessage;
	} else {
		// Fallback: if placeholder not found, append (shouldn't happen)
		updated.push(newMessage);
	}
	return updated;
};

export const useChat = ({
	documentHtml,
	selectedText,
	documentsContent,
	qaConfig,
	chatConfig: initialChatConfig,
	transport,
	onDocumentEdit,
}: UseChatProps): UseChatReturn => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [inputImages, setInputImages] = useState<ImageAttachment[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isStreamingText, setIsStreamingText] = useState(false);
	const [chatConfig, setChatConfig] = useState<ChatConfig>(initialChatConfig);
	const [sessionTokens, setSessionTokens] = useState<number | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Estimate total session tokens with debounce
	useEffect(() => {
		// IMPORTANT: Do not recalculate token counts while the stream is actively
		// generating new messages. The `messages` array changes on every chunk,
		// which would aggressively fire this effect and spam the token counting API.
		if (isLoading || isStreamingText) return;

		const timer = setTimeout(() => {
			const nativeDocTokens = documentsContent
				.filter((d) => d.type === 'native' || (d.type === 'text' && !d.parsedText))
				.reduce((sum, d) => sum + (d.tokenCount || 0), 0);

			const textStrings = documentsContent
				.filter((d) => d.type === 'text' && d.parsedText)
				.map((d) => d.parsedText!);

			const baseSystemInstruction = prompts.baseChatSystemInstruction(
				documentsContent.length > 0,
				qaConfig
			);

			buildContextBudget({
				systemPrompt: baseSystemInstruction,
				sourceDocuments: textStrings,
				nativeDocTokens,
				documentHtml,
				history: messages,
				newMessage: input,
				modelName: chatConfig.model,
			})
				.then((budget) => {
					const inputImagesTokens = inputImages.reduce(
						(sum, img) => sum + (img.tokenCount || 0),
						0
					);
					setSessionTokens(budget.total + inputImagesTokens);
				})
				.catch((err) => console.error('Failed to count session tokens:', err));
		}, 800);
		return () => clearTimeout(timer);
	}, [
		documentHtml,
		documentsContent,
		messages,
		input,
		inputImages,
		chatConfig.model,
		qaConfig,
		isLoading,
		isStreamingText,
	]);

	const removePlaceholderMessage = () => {
		setMessages(removePlaceholder);
	};

	const replacePlaceholderMessage = (message: ChatMessage) => {
		setMessages((prev) => replacePlaceholder(prev, message));
	};

	const onStreamUpdate = createStreamUpdateHandler(setMessages);

	/** Wrapper around processStream that uses the hook's abort controller */
	const processChatStream = async (
		responseStream: AsyncGenerator<any, void, unknown>
	) => {
		return processStream(
			responseStream,
			abortControllerRef.current?.signal || null,
			onStreamUpdate
		);
	};

	/**
	 * Send a message and run the agent loop.
	 *
	 * Implements a unified loop: LLM → tool calls → execute → feed result
	 * back → repeat until the LLM responds with text only (no tool calls)
	 * or MAX_AGENT_TURNS is reached.
	 *
	 * This fixes the stale-HTML bug by tracking `latestHtml` across iterations.
	 */
	const sendMessageWithContext = async (
		messageToSend: string,
		contextMessages: ChatMessage[],
		images?: ImageAttachment[]
	) => {
		if (!messageToSend.trim()) return;

		const userMessage: ChatMessage = {
			role: 'user',
			content: messageToSend,
			...(images?.length ? { images } : {}),
		};
		const updatedMessages = [...contextMessages, userMessage];

		setIsLoading(true);
		setIsStreamingText(true);

		// Create new AbortController for this message
		abortControllerRef.current = new AbortController();

		// Set messages with user message and placeholder for model response
		setMessages([...updatedMessages, { role: 'model', content: '' }]);

		// Compact history before sending to the API (UI still shows all messages)
		let loopHistory = await compactHistory(contextMessages, chatConfig.model);
		let latestHtml = documentHtml;
		let currentMessage = messageToSend;
		let iteration = 0;

		try {
			while (iteration < MAX_AGENT_TURNS) {
				iteration++;

				// --- Call LLM ---
				const responseStream = getChatResponseStream(
					loopHistory,
					currentMessage,
					documentsContent,
					latestHtml,
					selectedText,
					qaConfig.apiKey,
					chatConfig.model,
					qaConfig,
					abortControllerRef.current!.signal,
					transport,
					iteration === 1 ? images : undefined // Only send images on first iteration
				);

				const streamResult = await processChatStream(responseStream);

				if (!streamResult.fullResponse) {
					removePlaceholderMessage();
					break;
				}

				// --- Process tool calls ---
				const result = await handleFunctionCalls(
					streamResult,
					latestHtml,
					transport
				);

				if (abortControllerRef.current?.signal.aborted) {
					const abortError = new Error('Aborted');
					abortError.name = 'AbortError';
					throw abortError;
				}

				// No function calls — normal text response, we're done
				if (!result.newHtml && !result.toolResponse && result.success) {
					break;
				}

				// --- Apply successful edit ---
				if (result.success && result.newHtml !== undefined) {
					onDocumentEdit(
						result.newHtml,
						messageToSend,
						result.scrollTo,
						result.scrollTargets
					);
					latestHtml = result.newHtml; // Fix stale HTML bug
				}

				// --- Check if this is a terminal tool result (successful edit with no more work needed) ---
				// For a successful edit, show the result and let the loop continue
				// so the LLM can decide if it needs to do more
				if (
					result.success &&
					result.newHtml !== undefined &&
					!result.toolResponse
				) {
					// Show success in chat but continue loop so LLM can respond
					setMessages((prev) => {
						const updated = [...prev];
						updated[updated.length - 1] = {
							role: 'model',
							content:
								result.toolUsageMessage || '✅ *Document updated successfully.*',
						};
						return updated;
					});
					break;
				}

				// --- Build tool result and feed back to LLM ---
				const toolResultMsg = buildToolResultMessage(
					result,
					iteration,
					MAX_AGENT_TURNS
				);

				// Show agent working status
				if (iteration < MAX_AGENT_TURNS) {
					setMessages((prev) => {
						const updated = [...prev];
						updated[updated.length - 1] = {
							role: 'model',
							content: `🔄 *Working... (step ${iteration}/${MAX_AGENT_TURNS})*`,
						};
						return updated;
					});
				}

				// Advance the conversation: add AI response + tool result as next turn
				loopHistory = [
					...loopHistory,
					{ role: 'user', content: currentMessage },
					{
						role: 'model',
						content: streamResult.accumulatedText || 'I processed the tool call.',
					},
				];
				currentMessage = toolResultMsg;

				// Reset placeholder for the next streaming response
				setMessages((prev) => {
					const updated = [...prev];
					updated[updated.length - 1] = { role: 'model', content: '' };
					return updated;
				});
			}

			// Max turns reached — show status (Continue button handled by UI)
			if (iteration >= MAX_AGENT_TURNS) {
				console.warn(
					`[useChat] Agent loop reached max turns (${MAX_AGENT_TURNS}).`
				);
				setMessages((prev) => {
					const updated = [...prev];
					const last = updated[updated.length - 1];
					if (last.role === 'model' && last.content === '') {
						updated[updated.length - 1] = {
							role: 'model',
							content: `⚠️ *Reached maximum steps (${MAX_AGENT_TURNS}). You can ask me to continue if there's more work to do.*`,
						};
					}
					return updated;
				});
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				console.log('Chat aborted by user');
				removePlaceholderMessage();
				return;
			}

			const classified = classifyError(error);
			console.error(`[useChat] ${classified.type} error:`, error);

			// Auto-retry for transient errors
			if (classified.retryable && classified.retryDelayMs !== undefined) {
				// Show retry message to user
				replacePlaceholderMessage({
					role: 'model',
					content: classified.userMessage,
				});

				try {
					if (classified.retryDelayMs > 0) {
						await delay(classified.retryDelayMs);
					}

					// For context overflow, aggressively prune before retry
					const retryHistory =
						classified.type === 'context_overflow'
							? (await compactHistory(contextMessages, chatConfig.model)).slice(-6) // Keep only last 3 turns
							: await compactHistory(contextMessages, chatConfig.model);

					abortControllerRef.current = new AbortController();

					const retryStream = getChatResponseStream(
						retryHistory,
						messageToSend,
						documentsContent,
						latestHtml, // Use latest HTML, not stale documentHtml
						selectedText,
						qaConfig.apiKey,
						chatConfig.model,
						qaConfig,
						abortControllerRef.current.signal,
						transport
					);

					// Replace with a fresh placeholder for retry
					setMessages((prev) => {
						const updated = [...prev];
						updated[updated.length - 1] = { role: 'model', content: '' };
						return updated;
					});

					const retryResult = await processChatStream(retryStream);
					if (retryResult.fullResponse) {
						const result = await handleFunctionCalls(
							retryResult,
							latestHtml,
							transport
						);

						if (result.success && result.newHtml !== undefined) {
							onDocumentEdit(
								result.newHtml,
								messageToSend,
								result.scrollTo,
								result.scrollTargets
							);
							setMessages((prev) => {
								const updated = [...prev];
								updated[updated.length - 1] = {
									role: 'model',
									content:
										result.toolUsageMessage || '✅ *Document updated successfully.*',
								};
								return updated;
							});
						}
						// If no edit, the streamed text is already shown
					}
					return;
				} catch (retryError) {
					console.error('[useChat] Retry also failed:', retryError);
					// Fall through to show error
				}
			}

			// Non-retryable or retry failed — show classified error
			replacePlaceholderMessage({
				role: 'model',
				content: classified.userMessage,
			});
		} finally {
			setIsLoading(false);
			setIsStreamingText(false);
			abortControllerRef.current = null;
		}
	};

	const handleSendMessage = async (
		prompt?: string,
		images?: ImageAttachment[]
	) => {
		const messageToSend = prompt || input;
		if (!messageToSend.trim() && !images?.length) return;

		setInput('');
		await sendMessageWithContext(messageToSend, messages, images);
	};

	const handleEditMessage = async (index: number, newContent: string) => {
		if (index < 0 || index >= messages.length) return;
		if (messages[index].role !== 'user') return;

		// Truncate messages up to and including the target message
		const truncatedMessages = messages.slice(0, index + 1);

		// Update the target message with new content
		truncatedMessages[index] = { role: 'user', content: newContent };

		// Send the updated message
		await sendMessageWithContext(newContent, truncatedMessages.slice(0, -1));
	};

	const handleRetryMessage = async (index: number) => {
		if (index < 0 || index >= messages.length) return;
		if (messages[index].role !== 'user') return;

		const messageContent = messages[index].content;

		// Truncate messages up to and including the target message
		const truncatedMessages = messages.slice(0, index + 1);

		// Send the message again (without the last message since it will be added in sendMessageWithContext)
		await sendMessageWithContext(messageContent, truncatedMessages.slice(0, -1));
	};

	const handleRetryAIMessage = async (index: number) => {
		if (index < 0 || index >= messages.length) return;
		if (messages[index].role !== 'model') return;

		// Find the previous user message (the one that generated this AI response)
		let userMessageIndex = -1;
		for (let i = index - 1; i >= 0; i--) {
			if (messages[i].role === 'user') {
				userMessageIndex = i;
				break;
			}
		}

		// If no previous user message exists, do nothing
		if (userMessageIndex === -1) return;

		const userMessageContent = messages[userMessageIndex].content;

		// Truncate messages up to (but not including) the AI message
		// This means we keep all messages up to and including the user message
		const truncatedMessages = messages.slice(0, userMessageIndex + 1);

		// Send the user message again (without the last message since it will be added in sendMessageWithContext)
		await sendMessageWithContext(
			userMessageContent,
			truncatedMessages.slice(0, -1)
		);
	};

	const handleStopGeneration = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
	};

	const handleResetChat = () => {
		setMessages([]);
		setInput('');
	};

	const handleQuickGenerate = async () => {
		const selectedTemplate = qaConfig.selectedTemplateId
			? getTemplateById(qaConfig.selectedTemplateId)
			: null;
		const prompt = prompts.buildGenerationPrompt(
			qaConfig,
			selectedTemplate?.templateString
		);
		// Reset chat for a fresh generation
		setMessages([]);
		await sendMessageWithContext(prompt, []);
	};

	return {
		messages,
		input,
		isLoading,
		isStreamingText,
		chatConfig,
		setInput,
		setChatConfig,
		handleSendMessage,
		handleEditMessage,
		handleRetryMessage,
		handleRetryAIMessage,
		handleStopGeneration,
		handleResetChat,
		handleQuickGenerate,
		removePlaceholderMessage,
		replacePlaceholderMessage,
		sessionTokens,
		inputImages,
		setInputImages,
	};
};
