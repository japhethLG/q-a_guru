import React, { useRef, useEffect } from 'react';
import { SelectionMetadata } from '../../types';
import { Button, Textarea } from '../common';
import { ContextDisplay } from '../ContextDisplay';

interface ChatInputProps {
	input: string;
	onInputChange: (value: string) => void;
	onSendMessage: () => void;
	onStopGeneration: () => void;
	isLoading: boolean;
	selectedText: SelectionMetadata | null;
	onActionButtonClick: (prompt: string) => void;
	onClearContext: () => void;
}

const actionButtons = [
	{ label: 'Improve', prompt: 'Improve the writing of the selected text.' },
	{
		label: 'Fix Grammar',
		prompt: 'Fix spelling & grammar for the selected text.',
	},
	{ label: 'Summarize', prompt: 'Summarize the selected text.' },
];

export const ChatInput: React.FC<ChatInputProps> = ({
	input,
	onInputChange,
	onSendMessage,
	onStopGeneration,
	isLoading,
	selectedText,
	onActionButtonClick,
	onClearContext,
}) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, [input]);

	return (
		<div className="border-t border-gray-700 bg-gray-800/80 p-3 backdrop-blur-sm">
			<ContextDisplay selectedText={selectedText} onClear={onClearContext} />
			{selectedText && (
				<div className="mb-2 grid grid-cols-3 gap-2">
					{actionButtons.map((btn) => (
						<Button
							key={btn.label}
							variant="secondary"
							size="sm"
							onClick={() => onActionButtonClick(btn.prompt)}
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
					onChange={(e) => onInputChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
							e.preventDefault();
							onSendMessage();
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
					onClick={isLoading ? onStopGeneration : onSendMessage}
					className="h-full"
				>
					{isLoading ? 'Stop' : 'Send'}
				</Button>
			</div>
		</div>
	);
};

