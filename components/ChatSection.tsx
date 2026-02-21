import React, { useState } from 'react';
import {
	ChatConfig,
	ImageAttachment,
	SelectionMetadata,
	ScrollTarget,
} from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useChat } from '../hooks/useChat';
import { ChatMessageList, ChatInput } from './chat';
import { ConfigModal } from './ConfigModal';
import { parseFileToAttachment } from '../services/parser';

interface ChatSectionProps {
	documentHtml: string;
	selectedText: SelectionMetadata | null;
	onDocumentEdit: (
		newHtml: string,
		reason: string,
		scrollTo?: ScrollTarget,
		scrollTargets?: ScrollTarget[]
	) => void;
	onContextClick?: (previewText: string) => void;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
	documentHtml,
	selectedText,
	onDocumentEdit,
	onContextClick,
}) => {
	const {
		documentsContent,
		setDocumentsContent,
		qaConfig,
		files,
		setFiles,
		isParsing,
		setIsParsing,
		setHighlightedContent,
		setSelectedText,
		transport,
	} = useAppContext();

	const [isConfigOpen, setIsConfigOpen] = useState(false);

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
		handleQuickGenerate,
		sessionTokens,
		inputImages,
		setInputImages,
	} = useChat({
		documentHtml,
		selectedText,
		documentsContent,
		qaConfig,
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

	// File handling — add new files and parse them
	const handleFilesAdd = async (newFiles: File[]) => {
		// Add to file list immediately
		setFiles((prev) => [...prev, ...newFiles]);

		// Parse in background
		setIsParsing(true);
		try {
			const parsedContents = await Promise.all(
				newFiles.map((file) => parseFileToAttachment(file))
			);
			setDocumentsContent((prev) => [...prev, ...parsedContents]);
		} catch (error) {
			console.error('Error parsing files:', error);
			alert('There was an error parsing one or more files.');
			// Remove files that failed to parse
			setFiles((prev) => prev.filter((f) => !newFiles.includes(f)));
		} finally {
			setIsParsing(false);
		}
	};

	const handleFileRemove = (index: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== index));
		setDocumentsContent((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg">
			<ChatMessageList
				messages={messages}
				isStreamingText={isStreamingText}
				isLoading={isLoading}
				onHighlight={setHighlightedContent}
				onEditMessage={handleEditMessage}
				onRetryMessage={handleRetryMessage}
				onRetryAIMessage={handleRetryAIMessage}
				onCopyMessage={handleCopyMessage}
				onContextClick={onContextClick}
			/>

			<ChatInput
				input={input}
				onInputChange={setInput}
				inputImages={inputImages}
				onInputImagesChange={setInputImages}
				onSendMessage={(enrichedMessage, images) =>
					handleSendMessage(enrichedMessage, images)
				}
				onStopGeneration={handleStopGeneration}
				isLoading={isLoading}
				selectedText={selectedText}
				onActionButtonClick={(prompt) => handleSendMessage(prompt)}
				onClearContext={() => setSelectedText(null)}
				onQuickGenerate={handleQuickGenerate}
				hasDocuments={files.length > 0}
				hasEditorContent={!!documentHtml.trim()}
				files={files}
				documentsContent={documentsContent}
				onFilesAdd={handleFilesAdd}
				onFileRemove={handleFileRemove}
				isParsing={isParsing}
				onOpenSettings={() => setIsConfigOpen(true)}
				onResetChat={handleResetChat}
				hasMessages={messages.length > 0}
				onContextClick={onContextClick}
				sessionTokens={sessionTokens}
			/>

			<ConfigModal
				isOpen={isConfigOpen}
				onClose={() => setIsConfigOpen(false)}
				onGenerate={handleQuickGenerate}
			/>
		</div>
	);
};
