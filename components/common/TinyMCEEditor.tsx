import React, { useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEInstance } from 'tinymce';
import { SelectionMetadata, ScrollTarget } from '../../types';

interface TinyMCEEditorProps {
	value: string;
	onChange?: (content: string) => void;
	onSelectionChange?: (selection: SelectionMetadata | null) => void;
	disabled?: boolean;
	onInit?: (editor: TinyMCEInstance) => void;
	height?: string | number;
	plugins?: string[];
	toolbar?: string;
	contentStyle?: string;
	resize?: boolean;
	branding?: boolean;
	statusbar?: boolean;
	quickbarsSelectionToolbar?: string;
	quickbarsInsertToolbar?: string;
	scrollTargets?: ScrollTarget[];
	onScrollHandled?: () => void;
}

export const TinyMCEEditor: React.FC<TinyMCEEditorProps> = ({
	value,
	onChange,
	onSelectionChange,
	disabled = false,
	onInit,
	height = '100%',
	plugins = [
		'advlist',
		'autolink',
		'lists',
		'link',
		'image',
		'charmap',
		'preview',
		'anchor',
		'searchreplace',
		'visualblocks',
		'code',
		'fullscreen',
		'insertdatetime',
		'media',
		'table',
		'help',
		'wordcount',
	],
	toolbar = 'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | subscript superscript | blockquote code | alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | link image | removeformat',
	contentStyle = 'body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #d1d5db; background-color: #374151; } .mce-content-body { background-color: #374151 !important; color: #d1d5db !important; } .flash-highlight { animation: flash-bg 2s ease-out; } @keyframes flash-bg { 0% { background-color: rgba(34, 211, 238, 0.4); } 100% { background-color: transparent; } } body::-webkit-scrollbar { width: 6px; height: 6px; } body::-webkit-scrollbar-track { background: transparent; } body::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 3px; } body::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }',
	resize = true,
	branding = false,
	statusbar = false,
	quickbarsSelectionToolbar,
	quickbarsInsertToolbar,
	scrollTargets = [],
	onScrollHandled,
}) => {
	const editorRef = useRef<TinyMCEInstance | null>(null);
	const isUpdatingContentRef = useRef(false);

	const handleEditorChange = useCallback(
		(content: string) => {
			if (!isUpdatingContentRef.current && onChange) {
				onChange(content);
			}
		},
		[onChange]
	);

	const handleSelectionChange = useCallback(() => {
		const editor = editorRef.current;
		if (!editor || !onSelectionChange) return;

		try {
			const selectedHtml = editor.selection.getContent({ format: 'html' });
			const selectedText = editor.selection.getContent({ format: 'text' });

			// If no selection, pass null
			if (!selectedText || !selectedText.trim()) {
				onSelectionChange(null);
				return;
			}

			// Get the full document content as plain text for line number calculation
			const fullContent = editor.getContent({ format: 'text' });

			// Get selection range
			const range = editor.selection.getRng();
			if (!range) {
				onSelectionChange(null);
				return;
			}

			// Calculate start and end offsets in plain text
			// For HTML content, we need to approximate the position
			// We'll use the selected text position in the full content
			const selectedTextNormalized = selectedText.trim();
			const startIndex = fullContent.indexOf(selectedTextNormalized);

			// If we can't find exact match, try to find approximate position
			let startOffset = startIndex;
			let endOffset = startIndex + selectedTextNormalized.length;

			if (startIndex === -1) {
				// Fallback: count characters before selection using range
				// Get content before selection from the editor
				const body = editor.getBody();
				const rangeClone = range.cloneRange();
				rangeClone.setStart(body, 0);
				rangeClone.setEnd(range.startContainer, range.startOffset);
				const beforeContent = rangeClone.toString();
				startOffset = beforeContent.length;
				endOffset = startOffset + selectedTextNormalized.length;
			}

			// Calculate line numbers
			const textBeforeStart = fullContent.substring(0, startOffset);
			const startLine = textBeforeStart.split('\n').length;
			const selectedLines = selectedTextNormalized.split('\n');
			const endLine = startLine + selectedLines.length - 1;

			// Get surrounding context (100 chars before and after)
			const contextBefore = fullContent.substring(
				Math.max(0, startOffset - 100),
				startOffset
			);
			const contextAfter = fullContent.substring(
				endOffset,
				Math.min(fullContent.length, endOffset + 100)
			);

			const metadata: SelectionMetadata = {
				selectedText: selectedTextNormalized,
				selectedHtml: selectedHtml || selectedTextNormalized,
				startLine,
				endLine,
				startOffset,
				endOffset,
				contextBefore: contextBefore || undefined,
				contextAfter: contextAfter || undefined,
			};

			onSelectionChange(metadata);
		} catch (error) {
			console.error('Error capturing selection metadata:', error);
			// Fallback to simple text selection
			const selectedText = editor.selection.getContent({ format: 'text' });
			if (selectedText && selectedText.trim()) {
				const selectedHtml = editor.selection.getContent({ format: 'html' });
				const fullContent = editor.getContent({ format: 'text' });
				const startIndex = fullContent.indexOf(selectedText.trim());
				const startLine =
					startIndex >= 0
						? fullContent.substring(0, startIndex).split('\n').length
						: 1;

				const metadata: SelectionMetadata = {
					selectedText: selectedText.trim(),
					selectedHtml: selectedHtml || selectedText.trim(),
					startLine,
					endLine: startLine,
					startOffset: startIndex >= 0 ? startIndex : 0,
					endOffset: startIndex >= 0 ? startIndex + selectedText.trim().length : 0,
				};
				onSelectionChange(metadata);
			} else {
				onSelectionChange(null);
			}
		}
	}, [onSelectionChange]);

	// Update editor content when value prop changes
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || isUpdatingContentRef.current) return;

		const currentContent = editor.getContent();
		if (currentContent !== value) {
			isUpdatingContentRef.current = true;
			editor.setContent(value, { format: 'html' });
			// Reset flag after a short delay to allow content to update
			setTimeout(() => {
				isUpdatingContentRef.current = false;
			}, 0);
		}
	}, [value]);

	// Handle sequential scrolling to specific content
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || scrollTargets.length === 0) return;

		let isCancelled = false;

		const processTargets = async () => {
			for (let i = 0; i < scrollTargets.length; i++) {
				if (isCancelled) break;

				const target = scrollTargets[i];
				let targetElement: HTMLElement | null = null;

				try {
					const body = editor.getBody();

					if (target.type === 'question') {
						const strongs = body.querySelectorAll('p strong');
						for (const strong of Array.from(strongs)) {
							const text = strong.textContent || '';
							const prefixRegex = new RegExp(`^\\s*${target.number}\\s*[:.)\\-]`);
							if (prefixRegex.test(text)) {
								targetElement = (
									strong.parentElement?.tagName === 'P' ? strong.parentElement : strong
								) as HTMLElement;
								break;
							}
						}
					} else if (target.type === 'text') {
						const temp = document.createElement('div');
						temp.innerHTML = target.text;
						const plainText = (temp.textContent || target.text).trim();
						const searchStr = plainText.substring(0, 50);

						if (searchStr) {
							const walker = document.createTreeWalker(
								body,
								NodeFilter.SHOW_TEXT,
								null
							);
							let node;
							while ((node = walker.nextNode())) {
								if (node.textContent?.includes(searchStr)) {
									targetElement = node.parentElement;
									break;
								}
							}
						}
					} else if (target.type === 'top') {
						targetElement = body;
					}

					if (targetElement) {
						// Scroll to element
						targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

						// Add flash effect
						targetElement.classList.remove('flash-highlight');
						// Force reflow
						void targetElement.offsetWidth;
						targetElement.classList.add('flash-highlight');

						// Wait before next scroll (if any)
						if (scrollTargets.length > 1) {
							await new Promise((resolve) => setTimeout(resolve, 800));
						}
					}
				} catch (err) {
					console.warn('[TinyMCEEditor] Step scroll failed:', err);
				}
			}

			if (!isCancelled) {
				onScrollHandled?.();
			}
		};

		// Initial delay to ensure content is fully processed by TinyMCE
		const timer = setTimeout(processTargets, 300);

		return () => {
			isCancelled = true;
			clearTimeout(timer);
		};
	}, [scrollTargets, onScrollHandled]);

	return (
		<Editor
			onInit={(evt, editor) => {
				editorRef.current = editor;
				if (onInit) {
					onInit(editor);
				}
			}}
			value={value}
			onEditorChange={handleEditorChange}
			onSelectionChange={handleSelectionChange}
			disabled={disabled}
			apiKey={`${import.meta.env.VITE_TINYMCE_API_KEY as string}`}
			init={{
				height,
				menubar: false,
				plugins,
				toolbar,
				content_style: contentStyle,
				skin: 'oxide-dark',
				content_css: 'dark',
				body_class: 'dark-theme',
				automatic_uploads: false,
				resize,
				branding,
				statusbar,
				...(quickbarsSelectionToolbar && {
					quickbars_selection_toolbar: quickbarsSelectionToolbar,
				}),
				...(quickbarsInsertToolbar && {
					quickbars_insert_toolbar: quickbarsInsertToolbar,
				}),
			}}
		/>
	);
};
