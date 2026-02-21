import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../../types';
import { WandIcon } from '../common/Icons';
import { ChatMessageBubble } from './ChatMessageBubble';

interface ChatMessageListProps {
	messages: ChatMessage[];
	isStreamingText: boolean;
	isLoading: boolean;
	onHighlight?: (content: string | null) => void;
	onEditMessage?: (index: number, newContent: string) => void;
	onRetryMessage?: (index: number) => void;
	onRetryAIMessage?: (index: number) => void;
	onCopyMessage?: (content: string) => void;
	onContextClick?: (previewText: string) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
	messages,
	isStreamingText,
	isLoading,
	onHighlight,
	onEditMessage,
	onRetryMessage,
	onRetryAIMessage,
	onCopyMessage,
	onContextClick,
}) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	if (messages.length === 0 && !isLoading) {
		return (
			<div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
				<WandIcon className="mb-2 h-10 w-10" />
				<p className="text-sm">
					Select text in the editor to get contextual actions, or type a general
					question below.
				</p>
			</div>
		);
	}

	return (
		<div className="grow space-y-6 overflow-x-hidden overflow-y-auto p-3">
			{messages.map((msg, index) => {
				const isLastMessage = index === messages.length - 1;
				const isStreamingState = isLastMessage && isStreamingText;

				return (
					<div
						key={index}
						className={`flex ${
							msg.role === 'user' ? 'justify-end' : 'justify-start'
						} animate-[slideIn_0.3s_ease-out]`}
					>
						<ChatMessageBubble
							message={msg}
							isStreaming={isStreamingState}
							onHighlight={onHighlight}
							messageIndex={index}
							onEdit={
								onEditMessage && msg.role === 'user'
									? (newContent) => onEditMessage(index, newContent)
									: undefined
							}
							onRetry={
								msg.role === 'user' && onRetryMessage
									? () => onRetryMessage(index)
									: msg.role === 'model' && onRetryAIMessage
										? () => onRetryAIMessage(index)
										: undefined
							}
							onCopy={onCopyMessage ? () => onCopyMessage(msg.content) : undefined}
							onContextClick={onContextClick}
						/>
					</div>
				);
			})}
			<div ref={messagesEndRef} />
		</div>
	);
};
