import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ChatConfig, SelectionMetadata } from '../types';
import {
	getChatResponseStream,
	getReflectionStream,
	processFunctionCalls,
} from '../services/gemini';
import { LoaderIcon, WandIcon, RefreshCwIcon } from './common/Icons';
import { ContextDisplay } from './ContextDisplay';
import { Button, Textarea, ChatMessageContent, Select } from './common';
import { useAppContext } from '../contexts/AppContext';

interface ChatSectionProps {
	documentHtml: string;
	selectedText: SelectionMetadata | null;
	onDocumentEdit: (newHtml: string, reason: string) => void;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
	documentHtml,
	selectedText,
	onDocumentEdit,
}) => {
	const {
		documentsContent,
		qaConfig,
		generationConfig,
		highlightedContent,
		setHighlightedContent,
	} = useAppContext();

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isStreamingText, setIsStreamingText] = useState(false);
	const [chatConfig, setChatConfig] = useState<ChatConfig>({
		model: 'gemini-2.5-pro',
	});
	const abortControllerRef = useRef<AbortController | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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
				selectedText,
				qaConfig.apiKey,
				chatConfig.model,
				generationConfig || qaConfig, // Use generation config if available, otherwise use current config
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

			const result = processFunctionCalls({
				functionCalls: (fullResponse as any).functionCalls,
				documentHtml,
				messages,
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

			if (result.newHtml) {
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
	};

	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg">
			<div className="space-y-2 border-b border-gray-700 p-3">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold text-cyan-400">AI Assistant</h3>
					{messages.length > 0 && (
						<Button
							variant="icon"
							onClick={handleResetChat}
							title="Clear chat history"
							disabled={isLoading}
							icon={<RefreshCwIcon className="h-5 w-5" />}
						/>
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

			<div className="grow space-y-3 overflow-x-hidden overflow-y-auto p-3">
				{messages.length === 0 && !isLoading && (
					<div className="flex h-[calc(100%-100px)] flex-col items-center justify-center text-center text-gray-500">
						<WandIcon className="mb-2 h-10 w-10" />
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
								<p className="w-full py-2 text-center text-xs text-gray-500 italic">
									{msg.content}
								</p>
							) : (
								<div
									className={`max-w-[95%] rounded-lg px-4 py-3 shadow-md ${msg.role === 'user' ? 'bg-linear-to-br from-cyan-600 to-cyan-700 text-right text-white' : 'border border-gray-600 bg-gray-700 text-left text-gray-200'}`}
								>
									{/* Show thinking indicator on top if this is the last message and streaming */}
									{isStreamingState && (
										<div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
											<LoaderIcon className="h-4 w-4 animate-spin text-cyan-400" />
											<span>Thinking...</span>
										</div>
									)}
									<div className="wrap-break-words overflow-hidden">
										<ChatMessageContent
											content={msg.content}
											className={`text-sm ${msg.role === 'user' ? '[&_code]:bg-cyan-800/50 [&_code]:text-white [&_strong]:text-white' : '[&_strong]:text-cyan-300'}`}
											onHighlight={setHighlightedContent}
										/>
									</div>
								</div>
							)}
						</div>
					);
				})}
				<div ref={messagesEndRef} />
			</div>

			<div className="border-t border-gray-700 bg-gray-800/80 p-3 backdrop-blur-sm">
				<ContextDisplay selectedText={selectedText} onClear={() => {}} />
				{selectedText && (
					<div className="mb-2 grid grid-cols-3 gap-2">
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
				<div className="flex items-start gap-2">
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
						placeholder={
							selectedText ? 'Ask about selection...' : 'Ask a question...'
						}
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
