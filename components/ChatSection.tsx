import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ChatConfig } from '../types';
import { getChatResponseStream, getReflectionStream } from '../services/gemini';
import { LoaderIcon, WandIcon, RefreshCwIcon } from './common/Icons';
import { ContextDisplay } from './ContextDisplay';
import { Button, Textarea, ChatMessageContent, Select } from './common';

interface ChatSectionProps {
	documentsContent: string[];
	documentHtml: string;
	selectedText: string;
	onDocumentEdit: (newHtml: string, reason: string) => void;
	apiKey?: string;
	highlightedContent?: string | null;
	onHighlightChange?: (content: string | null) => void;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
	documentsContent,
	documentHtml,
	selectedText,
	onDocumentEdit,
	apiKey,
	highlightedContent,
	onHighlightChange,
}) => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isStreamingText, setIsStreamingText] = useState(false);
	const [contextText, setContextText] = useState('');
	const [chatConfig, setChatConfig] = useState<ChatConfig>({
		model: 'gemini-2.5-pro',
	});
	const abortControllerRef = useRef<AbortController | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setContextText(selectedText);
	}, [selectedText]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, [input]);

	const handleSendMessage = async (prompt?: string) => {
		const messageToSend = prompt || input;
		if (!messageToSend.trim()) return;

		const userMessage: ChatMessage = { role: 'user', content: messageToSend };
		setMessages((prev) => [...prev, userMessage]);
		setInput('');
		setIsLoading(true);
		setIsStreamingText(true);

		// Create new AbortController for this message
		abortControllerRef.current = new AbortController();

		// Create a placeholder for the model's streaming response with loading indicator
		setMessages((prev) => [...prev, { role: 'model', content: '' }]);

		try {
			const responseStream = getChatResponseStream(
				messages,
				messageToSend,
				documentsContent,
				documentHtml,
				contextText,
				apiKey,
				chatConfig.model,
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
			if (!fullResponse) return;

			const functionCalls = fullResponse.functionCalls;
			if (functionCalls && functionCalls.length > 0) {
				// Keep streaming indicator on - we'll make a reflection call
				setIsStreamingText(true);
				setIsLoading(true);

				const editCall = functionCalls.find((fc) => fc.name === 'edit_document');
				if (editCall && editCall.args) {
					const { full_document_html, html_snippet_to_replace, replacement_html } =
						editCall.args;

					let newHtml = '';

					if (full_document_html) {
						newHtml = full_document_html as string;
					} else if (html_snippet_to_replace && replacement_html) {
						const snippetToReplace = html_snippet_to_replace as string;

						console.log(
							'🔍 Looking for snippet:',
							snippetToReplace.substring(0, 100)
						);
						console.log('📄 Document length:', documentHtml.length);

						// Try exact match first
						if (documentHtml.includes(snippetToReplace)) {
							newHtml = documentHtml.replace(
								snippetToReplace,
								replacement_html as string
							);
						} else {
							console.warn(
								'❌ Exact match not found, trying normalized comparison...'
							);

							// Try normalized comparison (strip whitespace and normalize case)
							const normalizeHtml = (html: string) => {
								const div = document.createElement('div');
								div.innerHTML = html;
								return div.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
							};

							const normalizedDoc = normalizeHtml(documentHtml);
							const normalizedSnippet = normalizeHtml(snippetToReplace);

							console.log(
								'📝 Normalized snippet:',
								normalizedSnippet.substring(0, 100)
							);
							console.log(
								'📝 Normalized doc excerpt:',
								normalizedDoc.substring(0, 200)
							);

							// Use fuzzy matching - find the starting position in normalized text
							const startIndex = normalizedDoc.indexOf(
								normalizedSnippet.substring(0, 50)
							); // Match on first 50 chars

							if (startIndex !== -1) {
								console.log('✅ Fuzzy match found at position:', startIndex);
								// Find the equivalent position in the original HTML
								// This is tricky, so let's use a different approach: find by content
								const originalContent = documentHtml.substring(
									0,
									Math.min(documentHtml.length, 5000)
								);
								const snippetContent = snippetToReplace;

								// Try to find the snippet with relaxed matching
								const relaxedMatch = originalContent.match(
									new RegExp(
										snippetContent.replace(/[<>]/g, '[<>]').replace(/\s+/g, '\\s*'),
										'i'
									)
								);

								if (relaxedMatch) {
									newHtml = documentHtml.replace(
										relaxedMatch[0],
										replacement_html as string
									);
								} else {
									// Last resort: ask AI to use full document HTML
									console.log('⚠️ Could not find exact match in document');
									setMessages((prev) => [
										...prev,
										{
											role: 'model',
											content:
												"I couldn't find the exact text to replace. Please try selecting a larger portion of content or ask me to rewrite the entire section.",
										},
									]);
									setIsLoading(false);
									return;
								}
							} else {
								console.error('❌ Fuzzy match failed');
								console.warn("AI tried to replace a snippet that wasn't found.");
								setMessages((prev) => [
									...prev,
									{
										role: 'model',
										content:
											"I tried to make an edit, but couldn't find the exact text to change. Try highlighting it first.",
									},
								]);
								setIsLoading(false);
								return;
							}
						}
					}

					if (newHtml) {
						// Execute the edit
						onDocumentEdit(newHtml, messageToSend);

						// Show tool usage and get AI's explanation of changes
						try {
							// Add a message indicating tool was used, with a placeholder for AI's reflection
							const toolUsageMessage = accumulatedText
								? `${accumulatedText}\n\n**Tool used: edit_document**\n\n`
								: '**Tool used: edit_document**\n\n';

							setMessages((prev) => {
								const updated = [...prev];
								updated[updated.length - 1] = {
									role: 'model',
									content: toolUsageMessage,
								};
								return updated;
							});

							// Build conversation history
							const conversationHistory: ChatMessage[] = [
								...messages,
								{ role: 'user', content: messageToSend },
								{
									role: 'model',
									content: accumulatedText || 'Executed edit_document tool',
								},
							];

							// Get what was changed for context
							let changeDescription = '';
							if (html_snippet_to_replace && replacement_html) {
								changeDescription = `Partial content replacement was made to the document.`;
							} else if (full_document_html) {
								changeDescription = `Full document was updated with new content.`;
							}

							const toolResultMessage = `The edit_document tool was executed successfully. ${changeDescription}`;

							// Get the reflection stream
							const reflectionStream = getReflectionStream(
								conversationHistory,
								toolResultMessage,
								apiKey,
								chatConfig.model,
								abortControllerRef.current.signal
							);

							// Stream the reflection
							let reflectionText = '';
							for await (const chunk of await reflectionStream) {
								if (chunk.text) {
									reflectionText += chunk.text;

									// Append the reflection to the tool usage message
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

							// Turn off streaming indicator after reflection is complete
							setIsStreamingText(false);
						} catch (error) {
							console.error('Reflection error:', error);
							// Continue even if reflection fails
							setIsStreamingText(false);
						}
					}
				} else {
					// No function calls, turn off streaming
					setIsStreamingText(false);
				}
			} else {
				// No function calls at all, turn off streaming
				setIsStreamingText(false);
			}
			// Streaming text has already been accumulated, so no need to add it again
		} catch (error) {
			// Check if it was an abort error
			if (error instanceof Error && error.name === 'AbortError') {
				console.log('Chat aborted by user');
			} else {
				console.error('Chat error:', error);
				const errorMessage: ChatMessage = {
					role: 'model',
					content: "Sorry, I couldn't get a response. Please try again.",
				};
				setMessages((prev) => [...prev, errorMessage]);
			}
		} finally {
			// Only turn off loading after everything is complete (both AI calls + tool execution)
			setIsLoading(false);
			setIsStreamingText(false);
			abortControllerRef.current = null;
		}
	};

	const handleStopGeneration = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
	};

	const actionButtons = [
		{ label: 'Improve', prompt: 'Improve the writing of the selected text.' },
		{
			label: 'Fix Grammar',
			prompt: 'Fix spelling & grammar for the selected text.',
		},
		{ label: 'Summarize', prompt: 'Summarize the selected text.' },
	];

	const handleResetChat = () => {
		setMessages([]);
		setInput('');
		setContextText('');
	};

	return (
		<div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full">
			<div className="p-3 border-b border-gray-700 space-y-2">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold text-cyan-400">AI Assistant</h3>
					{messages.length > 0 && (
						<button
							onClick={handleResetChat}
							className="p-1.5 text-gray-400 hover:text-cyan-400 transition-colors rounded hover:bg-gray-700"
							title="Clear chat history"
							disabled={isLoading}
						>
							<RefreshCwIcon className="h-5 w-5" />
						</button>
					)}
				</div>
				<Select
					label="Model"
					size="md"
					options={[
						{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
						{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
						{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
					]}
					value={chatConfig.model}
					onChange={(e) =>
						setChatConfig({
							model: e.target.value as ChatConfig['model'],
						})
					}
					disabled={isLoading}
				/>
			</div>

			<div className="grow p-3 space-y-3 overflow-y-auto overflow-x-hidden">
				{messages.length === 0 && !isLoading && (
					<div className="flex flex-col items-center justify-center text-center text-gray-500 h-[calc(100%-100px)]">
						<WandIcon className="h-10 w-10 mb-2" />
						<p className="text-sm">
							Select text in the editor to get contextual actions, or type a general
							question below.
						</p>
					</div>
				)}
				{messages.map((msg, index) => {
					const isLastMessage = index === messages.length - 1;
					const isStreamingState = isLastMessage && isStreamingText;

					return (
						<div
							key={index}
							className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[slideIn_0.3s_ease-out]`}
						>
							{msg.role === 'system' ? (
								<p className="text-center text-xs text-gray-500 italic py-2 w-full">
									{msg.content}
								</p>
							) : (
								<div
									className={`max-w-[95%] px-4 py-3 rounded-lg shadow-md ${msg.role === 'user' ? 'bg-gradient-to-br from-cyan-600 to-cyan-700 text-white text-right' : 'bg-gray-700 text-gray-200 border border-gray-600 text-left'}`}
								>
									{/* Show thinking indicator on top if this is the last message and streaming */}
									{isStreamingState && (
										<div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
											<LoaderIcon className="h-4 w-4 animate-spin text-cyan-400" />
											<span>Thinking...</span>
										</div>
									)}
									<div className="overflow-hidden break-words">
										<ChatMessageContent
											content={msg.content}
											className={`text-sm ${msg.role === 'user' ? '[&_strong]:text-white [&_code]:bg-cyan-800/50 [&_code]:text-white' : '[&_strong]:text-cyan-300'}`}
											onHighlight={onHighlightChange}
										/>
									</div>
								</div>
							)}
						</div>
					);
				})}
				<div ref={messagesEndRef} />
			</div>

			<div className="p-3 border-t border-gray-700 bg-gray-800/80 backdrop-blur-sm">
				<ContextDisplay
					contextText={contextText}
					onClear={() => setContextText('')}
				/>
				{contextText && (
					<div className="grid grid-cols-3 gap-2 mb-2">
						{actionButtons.map((btn) => (
							<Button
								key={btn.label}
								variant="secondary"
								size="sm"
								onClick={() => handleSendMessage(btn.prompt)}
								disabled={isLoading}
							>
								{btn.label}
							</Button>
						))}
					</div>
				)}
				<div className="flex gap-2 items-start">
					<Textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
								e.preventDefault();
								handleSendMessage();
							}
						}}
						placeholder={contextText ? 'Ask about selection...' : 'Ask a question...'}
						disabled={isLoading}
						rows={1}
						size="md"
						className="max-h-[200px] overflow-y-auto"
					/>
					<Button
						variant={isLoading ? 'danger' : 'primary'}
						disabled={isLoading ? false : !input.trim()}
						onClick={isLoading ? handleStopGeneration : () => handleSendMessage()}
						className="h-full"
					>
						{isLoading ? 'Stop' : 'Send'}
					</Button>
				</div>
			</div>
		</div>
	);
};
