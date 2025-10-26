import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { getChatResponse } from '../services/gemini';
import { LoaderIcon, WandIcon } from './common/Icons';
import { ContextDisplay } from './ContextDisplay';
import { Button, Textarea } from './common';

interface ChatSectionProps {
	documentsContent: string[];
	documentHtml: string;
	selectedText: string;
	onDocumentEdit: (newHtml: string, reason: string) => void;
	apiKey?: string;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
	documentsContent,
	documentHtml,
	selectedText,
	onDocumentEdit,
	apiKey,
}) => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [contextText, setContextText] = useState('');
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

		const currentContext = contextText;
		if (currentContext) {
			setContextText('');
		}

		try {
			const response = await getChatResponse(
				messages,
				messageToSend,
				documentsContent,
				documentHtml,
				currentContext,
				apiKey
			);

			const functionCalls = response.functionCalls;
			if (functionCalls && functionCalls.length > 0) {
				const editCall = functionCalls.find((fc) => fc.name === 'edit_document');
				if (editCall && editCall.args) {
					const { full_document_html, html_snippet_to_replace, replacement_html } =
						editCall.args;

					let newHtml = '';

					if (full_document_html) {
						newHtml = full_document_html as string;
					} else if (html_snippet_to_replace && replacement_html) {
						if (documentHtml.includes(html_snippet_to_replace as string)) {
							newHtml = documentHtml.replace(
								html_snippet_to_replace as string,
								replacement_html as string
							);
						} else {
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

					if (newHtml) {
						onDocumentEdit(newHtml, messageToSend);
						setMessages((prev) => [
							...prev,
							{ role: 'system', content: `Document updated: "${messageToSend}"` },
						]);
					}
				}
			} else {
				const modelMessage: ChatMessage = { role: 'model', content: response.text };
				setMessages((prev) => [...prev, modelMessage]);
			}
		} catch (error) {
			console.error('Chat error:', error);
			const errorMessage: ChatMessage = {
				role: 'model',
				content: "Sorry, I couldn't get a response. Please try again.",
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
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

	return (
		<div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-lg overflow-hidden">
			<div className="p-3 border-b border-gray-700">
				<h3 className="text-lg font-semibold text-cyan-400">AI Assistant</h3>
			</div>

			<div className="flex-grow p-3 space-y-3 overflow-y-auto">
				{messages.length === 0 && !isLoading && (
					<div className="flex flex-col items-center justify-center text-center text-gray-500 h-[calc(100%-100px)]">
						<WandIcon className="h-10 w-10 mb-2" />
						<p className="text-sm">
							Select text in the editor to get contextual actions, or type a general
							question below.
						</p>
					</div>
				)}
				{messages.map((msg, index) => (
					<div
						key={index}
						className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
					>
						{msg.role === 'system' ? (
							<p className="text-center text-xs text-gray-500 italic py-2 w-full">
								{msg.content}
							</p>
						) : (
							<div
								className={`max-w-xs md:max-w-md lg:max-w-xs xl:max-w-sm px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-200'}`}
							>
								<p className="text-sm whitespace-pre-wrap">{msg.content}</p>
							</div>
						)}
					</div>
				))}
				{isLoading && (
					<div className="flex justify-start">
						<div className="px-3 py-2 rounded-lg bg-gray-700 text-gray-200">
							<LoaderIcon className="h-5 w-5 animate-spin" />
						</div>
					</div>
				)}
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
						variant="primary"
						disabled={isLoading || !input.trim()}
						loading={isLoading}
						onClick={() => handleSendMessage()}
					>
						Send
					</Button>
				</div>
			</div>
		</div>
	);
};
