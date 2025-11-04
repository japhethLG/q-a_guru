import { useState, useRef } from 'react';
import { ChatMessage, ChatConfig, SelectionMetadata } from '../types';
import {
	getChatResponseStream,
	getReflectionStream,
	processFunctionCalls,
} from '../services/gemini';

interface UseChatProps {
	documentHtml: string;
	selectedText: SelectionMetadata | null;
	documentsContent: string[];
	qaConfig: any;
	generationConfig: any;
	chatConfig: ChatConfig;
	onDocumentEdit: (newHtml: string, reason: string) => void;
}

interface UseChatReturn {
	messages: ChatMessage[];
	input: string;
	isLoading: boolean;
	isStreamingText: boolean;
	chatConfig: ChatConfig;
	setInput: (value: string) => void;
	setChatConfig: (config: ChatConfig) => void;
	handleSendMessage: (prompt?: string) => Promise<void>;
	handleEditMessage: (index: number, newContent: string) => Promise<void>;
	handleRetryMessage: (index: number) => Promise<void>;
	handleRetryAIMessage: (index: number) => Promise<void>;
	handleStopGeneration: () => void;
	handleResetChat: () => void;
	removePlaceholderMessage: () => void;
	replacePlaceholderMessage: (message: ChatMessage) => void;
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
	generationConfig,
	chatConfig: initialChatConfig,
	onDocumentEdit,
}: UseChatProps): UseChatReturn => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isStreamingText, setIsStreamingText] = useState(false);
	const [chatConfig, setChatConfig] = useState<ChatConfig>(initialChatConfig);
	const abortControllerRef = useRef<AbortController | null>(null);

	const removePlaceholderMessage = () => {
		setMessages(removePlaceholder);
	};

	const replacePlaceholderMessage = (message: ChatMessage) => {
		setMessages((prev) => replacePlaceholder(prev, message));
	};

	/**
	 * Helper function to send a message with a specific messages array context
	 */
	const sendMessageWithContext = async (
		messageToSend: string,
		contextMessages: ChatMessage[]
	) => {
		if (!messageToSend.trim()) return;

		const userMessage: ChatMessage = { role: 'user', content: messageToSend };
		const updatedMessages = [...contextMessages, userMessage];
		
		setIsLoading(true);
		setIsStreamingText(true);

		// Create new AbortController for this message
		abortControllerRef.current = new AbortController();

		// Set messages with user message and placeholder for model response
		setMessages([...updatedMessages, { role: 'model', content: '' }]);

		try {
			const responseStream = getChatResponseStream(
				contextMessages,
				messageToSend,
				documentsContent,
				documentHtml,
				selectedText,
				qaConfig.apiKey,
				chatConfig.model,
				generationConfig || qaConfig,
				abortControllerRef.current.signal
			);

			// Accumulate chunks and aggregate the final response
			let fullResponse = null;
			let accumulatedText = '';
			let isFirstChunk = true;

			for await (const chunk of await responseStream) {
				// Check if aborted
				if (abortControllerRef.current?.signal.aborted) {
					break;
				}

				fullResponse = chunk; // Store the latest chunk

				// Accumulate text for streaming display
				if (chunk.text) {
					// On first chunk, replace "Thinking..." with actual content
					if (isFirstChunk) {
						accumulatedText = chunk.text;
						isFirstChunk = false;
					} else {
						accumulatedText += chunk.text;
					}

					// Update the last message with accumulated text
					setMessages((prev) => {
						const updated = [...prev];
						updated[updated.length - 1] = { role: 'model', content: accumulatedText };
						return updated;
					});
				}
			}

			// Process the final response for function calls
			if (!fullResponse) {
				// Remove the placeholder message if no response was received
				removePlaceholderMessage();
				return;
			}

			const result = processFunctionCalls({
				functionCalls: (fullResponse as any).functionCalls,
				documentHtml,
				messages: updatedMessages,
				userMessage: messageToSend,
				accumulatedText,
			});

			if (result.errorMessage) {
				setMessages((prev) => [
					...prev,
					{ role: 'model', content: result.errorMessage as string },
				]);
				setIsLoading(false);
				return;
			}

			if (result.newHtml !== undefined && result.newHtml !== null) {
				// Execute the edit
				onDocumentEdit(result.newHtml, messageToSend);

				// Show tool usage and then stream reflection
				try {
					const toolUsageMessage =
						result.toolUsageMessage || '**Tool used: edit_document**\n\n';
					setMessages((prev) => {
						const updated = [...prev];
						updated[updated.length - 1] = {
							role: 'model',
							content: toolUsageMessage,
						};
						return updated;
					});

					if (result.reflection) {
						const reflectionStream = getReflectionStream(
							result.reflection.history,
							result.reflection.toolResultMessage,
							qaConfig.apiKey,
							chatConfig.model,
							abortControllerRef.current.signal
						);

						let reflectionText = '';
						for await (const chunk of await reflectionStream) {
							if (chunk.text) {
								reflectionText += chunk.text;
								setMessages((prev) => {
									const updated = [...prev];
									if (updated.length > 0) {
										updated[updated.length - 1] = {
											role: 'model',
											content: toolUsageMessage + reflectionText,
										};
									}
									return updated;
								});
							}
						}
						setIsStreamingText(false);
					}
				} catch (error) {
					console.error('Reflection error:', error);
					setIsStreamingText(false);
				}
			} else {
				// No function calls, turn off streaming
				setIsStreamingText(false);
			}
		} catch (error) {
			// Check if it was an abort error
			if (error instanceof Error && error.name === 'AbortError') {
				console.log('Chat aborted by user');
				// Remove the placeholder message on abort
				removePlaceholderMessage();
			} else {
				console.error('Chat error:', error);
				const errorMessage: ChatMessage = {
					role: 'model',
					content: "Sorry, I couldn't get a response. Please try again.",
				};
				// Replace the placeholder message with the error message instead of appending
				replacePlaceholderMessage(errorMessage);
			}
		} finally {
			// Only turn off loading after everything is complete (both AI calls + tool execution)
			setIsLoading(false);
			setIsStreamingText(false);
			abortControllerRef.current = null;
		}
	};

	const handleSendMessage = async (prompt?: string) => {
		const messageToSend = prompt || input;
		if (!messageToSend.trim()) return;

		setInput('');
		await sendMessageWithContext(messageToSend, messages);
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
		await sendMessageWithContext(userMessageContent, truncatedMessages.slice(0, -1));
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
		removePlaceholderMessage,
		replacePlaceholderMessage,
	};
};

