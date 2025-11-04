import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../../types';
import { ChatMessageContent, Button, Textarea } from '../common';
import { LoaderIcon, CopyIcon, EditIcon, RefreshCwIcon } from '../common/Icons';

interface ChatMessageBubbleProps {
	message: ChatMessage;
	isStreaming: boolean;
	onHighlight?: (content: string | null) => void;
	onEdit?: (newContent: string) => void;
	onRetry?: () => void;
	onCopy?: () => void;
	messageIndex?: number;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
	message,
	isStreaming,
	onHighlight,
	onEdit,
	onRetry,
	onCopy,
	messageIndex,
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState(message.content);
	const [copied, setCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus and resize textarea when entering edit mode
	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	}, [isEditing]);

	// Auto-resize textarea as content changes
	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	}, [editContent, isEditing]);

	if (message.role === 'system') {
		return (
			<p className="w-full py-2 text-center text-xs text-gray-500 italic">
				{message.content}
			</p>
		);
	}

	const isUser = message.role === 'user';
	const isAI = message.role === 'model';

	const handleCopy = async () => {
		if (onCopy) {
			onCopy();
		} else {
			try {
				await navigator.clipboard.writeText(message.content);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			} catch (err) {
				console.error('Failed to copy:', err);
			}
		}
	};

	const handleEdit = () => {
		setIsEditing(true);
		setEditContent(message.content);
	};

	const handleCancel = () => {
		setIsEditing(false);
		setEditContent(message.content);
	};

	const handleSend = () => {
		if (editContent.trim() && onEdit) {
			onEdit(editContent.trim());
			setIsEditing(false);
		}
	};

	const handleRetry = () => {
		if (onRetry) {
			onRetry();
		}
	};

	if (isEditing && isUser) {
		return (
			<div className="max-w-[95%] rounded-lg border border-gray-600 bg-gray-700 p-4 shadow-md">
				<Textarea
					ref={textareaRef}
					value={editContent}
					onChange={(e) => setEditContent(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						} else if (e.key === 'Escape') {
							handleCancel();
						}
					}}
					placeholder="Edit your message..."
					rows={1}
					size="md"
					className="mb-2 max-h-[200px] overflow-y-auto"
				/>
				<div className="flex items-center justify-end gap-2">
					<Button variant="secondary" size="sm" onClick={handleCancel}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						onClick={handleSend}
						disabled={!editContent.trim()}
					>
						Send
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`relative max-w-[95%] rounded-lg px-4 py-3 shadow-md ${
				isUser
					? 'bg-linear-to-br from-cyan-600 to-cyan-700 text-right text-white'
					: 'border border-gray-600 bg-gray-700 text-left text-gray-200'
			}`}
			onMouseEnter={() => (isUser || isAI) && setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Action buttons for user messages */}
			{isUser && isHovered && !isEditing && (
				<div className="absolute right-0 -bottom-5 z-10 flex gap-1 rounded-lg border border-gray-600 bg-gray-800 p-1 shadow-lg">
					<Button
						variant="icon"
						size="sm"
						onClick={handleCopy}
						title={copied ? 'Copied!' : 'Copy message'}
						icon={<CopyIcon className="h-3.5 w-3.5" />}
					/>
					{onEdit && (
						<Button
							variant="icon"
							size="sm"
							onClick={handleEdit}
							title="Edit message"
							icon={<EditIcon className="h-3.5 w-3.5" />}
						/>
					)}
				</div>
			)}

			{/* Action buttons for AI messages */}
			{isAI && isHovered && (
				<div className="absolute -bottom-5 left-0 z-10 flex gap-1 rounded-lg border border-gray-600 bg-gray-800 p-1 shadow-lg">
					<Button
						variant="icon"
						size="sm"
						onClick={handleCopy}
						title={copied ? 'Copied!' : 'Copy message'}
						icon={<CopyIcon className="h-3.5 w-3.5" />}
					/>
					{onRetry && (
						<Button
							variant="icon"
							size="sm"
							onClick={handleRetry}
							title="Retry message"
							icon={<RefreshCwIcon className="h-3.5 w-3.5" />}
						/>
					)}
				</div>
			)}

			{/* Show thinking indicator on top if this is streaming */}
			{isStreaming && (
				<div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
					<LoaderIcon className="h-4 w-4 animate-spin text-cyan-400" />
					<span>Thinking...</span>
				</div>
			)}
			<div className="wrap-break-words overflow-hidden">
				<ChatMessageContent
					content={message.content}
					className={`text-sm ${
						isUser
							? '[&_code]:bg-cyan-800/50 [&_code]:text-white [&_strong]:text-white'
							: '[&_strong]:text-cyan-300'
					}`}
					onHighlight={onHighlight}
				/>
			</div>
		</div>
	);
};
