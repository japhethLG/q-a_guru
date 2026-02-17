import React from 'react';
import { ChatConfig, SelectionMetadata, ScrollTarget } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useChat } from '../hooks/useChat';
import { ChatHeader, ChatMessageList, ChatInput } from './chat';

interface ChatSectionProps {
	documentHtml: string;
	selectedText: SelectionMetadata | null;
	onDocumentEdit: (
		newHtml: string,
		reason: string,
		scrollTo?: ScrollTarget,
		scrollTargets?: ScrollTarget[]
	) => void;
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
		setHighlightedContent,
		setSelectedText,
		transport,
	} = useAppContext();

	const {
		messages,
		input,
		isLoading,
		isStreamingText,
		setInput,
		chatConfig,
		setChatConfig,
		handleSendMessage,
		handleEditMessage,
		handleRetryMessage,
		handleRetryAIMessage,
		handleStopGeneration,
		handleResetChat,
	} = useChat({
		documentHtml,
		selectedText,
		documentsContent,
		qaConfig,
		generationConfig,
		chatConfig: { model: 'gemini-3-flash-preview' },
		transport,
		onDocumentEdit,
	});

	const handleCopyMessage = async (content: string) => {
		try {
			await navigator.clipboard.writeText(content);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	};

	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg">
			<ChatHeader
				chatConfig={chatConfig}
				onConfigChange={setChatConfig}
				onReset={handleResetChat}
				hasMessages={messages.length > 0}
				isLoading={isLoading}
			/>

			<ChatMessageList
				messages={messages}
				isStreamingText={isStreamingText}
				isLoading={isLoading}
				onHighlight={setHighlightedContent}
				onEditMessage={handleEditMessage}
				onRetryMessage={handleRetryMessage}
				onRetryAIMessage={handleRetryAIMessage}
				onCopyMessage={handleCopyMessage}
			/>

			<ChatInput
				input={input}
				onInputChange={setInput}
				onSendMessage={() => handleSendMessage()}
				onStopGeneration={handleStopGeneration}
				isLoading={isLoading}
				selectedText={selectedText}
				onActionButtonClick={(prompt) => handleSendMessage(prompt)}
				onClearContext={() => setSelectedText(null)}
			/>
		</div>
	);
};
