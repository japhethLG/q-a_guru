import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEInstance } from 'tinymce';
import { WandIcon, XIcon } from './common/Icons';
import { SelectionMetadata } from '../types';

interface ContextDisplayProps {
	selectedText: SelectionMetadata | null;
	onClear: () => void;
}

export const ContextDisplay: React.FC<ContextDisplayProps> = ({
	selectedText,
	onClear,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const editorRef = useRef<TinyMCEInstance | null>(null);
	const isUpdatingContentRef = useRef(false);

	// Update editor content when selection changes
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || isUpdatingContentRef.current || !selectedText) return;

		const currentContent = editor.getContent();
		const newContent = selectedText.selectedHtml || selectedText.selectedText;

		if (currentContent !== newContent) {
			isUpdatingContentRef.current = true;
			editor.setContent(newContent, { format: 'html' });
			// Reset flag after a short delay to allow content to update
			setTimeout(() => {
				isUpdatingContentRef.current = false;
			}, 0);
		}
	}, [selectedText]);

	if (!selectedText) {
		return null;
	}

	const lineInfo =
		selectedText.startLine === selectedText.endLine
			? `Line ${selectedText.startLine}`
			: `Lines ${selectedText.startLine}-${selectedText.endLine}`;

	const contentStyle =
		'body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #d1d5db; background-color: #374151; } .mce-content-body { background-color: #374151 !important; color: #d1d5db !important; } body::-webkit-scrollbar { width: 6px; height: 6px; } body::-webkit-scrollbar-track { background: transparent; } body::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 3px; } body::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }';

	return (
		<div className="mb-2 overflow-hidden rounded-lg border border-gray-600 bg-gray-700/50 transition-all duration-300">
			<div
				className="flex cursor-pointer items-center justify-between p-2"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					<WandIcon className="h-4 w-4 text-cyan-400" />
					<span className="text-xs font-semibold text-gray-300">
						Context {lineInfo}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={(e) => {
							e.stopPropagation();
							onClear();
						}}
						className="rounded-full p-1 hover:bg-gray-600"
						title="Clear context for next message"
					>
						<XIcon className="h-3 w-3 text-gray-400" />
					</button>
					<svg
						className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? '' : 'rotate-180'}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</div>
			</div>
			{isExpanded && (
				<div className="p-3 pt-0">
					<div className="h-[300px] overflow-hidden rounded bg-gray-900/50">
						<Editor
							onInit={(evt, editor) => {
								editorRef.current = editor;
								// Set content immediately on init
								if (selectedText) {
									editor.setContent(
										selectedText.selectedHtml || selectedText.selectedText,
										{ format: 'html' }
									);
								}
							}}
							value={selectedText.selectedHtml || selectedText.selectedText}
							disabled={true}
							apiKey={`${import.meta.env.VITE_TINYMCE_API_KEY as string}`}
							init={{
								height: 300,
								menubar: false,
								toolbar: false,
								statusbar: false,
								resize: false,
								branding: false,
								content_style: contentStyle,
								skin: 'oxide-dark',
								content_css: 'dark',
								body_class: 'dark-theme',
								plugins: [],
								automatic_uploads: false,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
};
