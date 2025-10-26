import React, { useRef, useEffect, useState } from 'react';
import { DownloadFormat, DocumentVersion } from '../types';
import { SaveIcon, XIcon } from './common/Icons';
import { Button, DownloadsDropdown, VersionsDropdown } from './common';

declare const Quill: any;
import * as quillToWord from 'quill-to-word';
import { saveAs } from 'file-saver';
import TurndownService from 'turndown';
import html2pdf from 'html2pdf.js';
import mammoth from 'mammoth';

interface EditorSectionProps {
	content: string;
	onContentChange: (newContent: string) => void;
	onTextSelect: (selectedText: string) => void;
	onDirtyChange: (isDirty: boolean) => void;
	isPreviewing: boolean;
	onExitPreview: () => void;
	onSave?: () => void;
	isEditorDirty?: boolean;
	versions: DocumentVersion[];
	currentVersionId: string | null;
	previewVersionId: string | null;
	onPreview: (versionId: string) => void;
	onRevert: (versionId: string) => void;
	onDelete: (versionId: string) => void;
	highlightedContent?: string | null;
}

const toolbarOptions = [
	[{ header: [1, 2, 3, 4, 5, 6, false] }],
	[{ font: [] }],
	['bold', 'italic', 'underline', 'strike'],
	[{ color: [] }, { background: [] }],
	[{ script: 'sub' }, { script: 'super' }],
	['blockquote', 'code-block'],
	[{ list: 'ordered' }, { list: 'bullet' }],
	[{ indent: '-1' }, { indent: '+1' }],
	[{ direction: 'rtl' }],
	[{ align: [] }],
	['link', 'image', 'video'],
	['clean'],
];

export const EditorSection: React.FC<EditorSectionProps> = ({
	content,
	onContentChange,
	onTextSelect,
	onDirtyChange,
	isPreviewing,
	onExitPreview,
	onSave,
	isEditorDirty = false,
	versions,
	currentVersionId,
	previewVersionId,
	onPreview,
	onRevert,
	onDelete,
	highlightedContent,
}) => {
	const editorRef = useRef<HTMLDivElement>(null);
	const quillInstanceRef = useRef<any>(null);
	const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

	useEffect(() => {
		if (editorRef.current && !quillInstanceRef.current) {
			const quill = new Quill(editorRef.current, {
				modules: { toolbar: toolbarOptions },
				theme: 'snow',
				placeholder: 'Generated Q&A will appear here...',
			});
			quillInstanceRef.current = quill;

			// Ensure the Quill container has proper overflow handling
			const container = editorRef.current.querySelector(
				'.ql-container'
			) as HTMLElement;
			if (container) {
				container.style.flex = '1';
				container.style.overflow = 'auto';
				container.style.minHeight = '0';
			}

			quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
				if (source === 'user') {
					onContentChange(quill.root.innerHTML);
					onDirtyChange(true);
				}
			});

			quill.on('selection-change', (range: any, oldRange: any, source: string) => {
				if (range) {
					if (range.length > 0) {
						// Use the DOM selection API which properly handles multi-line selections
						const selection = window.getSelection();
						if (selection && selection.rangeCount > 0) {
							const domRange = selection.getRangeAt(0);
							const container = document.createElement('div');
							container.appendChild(domRange.cloneContents());
							const selectedHtml = container.innerHTML;

							// Only use this if we got HTML content
							if (selectedHtml.trim()) {
								onTextSelect(selectedHtml);
							} else {
								// Fallback to plain text
								const selectedText = quill.getText(range.index, range.length);
								onTextSelect(selectedText);
							}
						}
					} else {
						onTextSelect('');
					}
				}
				// If range is null, do nothing, preserving context on focus loss
			});
		}
	}, []);

	useEffect(() => {
		const quill = quillInstanceRef.current;
		if (quill) {
			// Only update if the content is actually different to avoid cursor jumps and infinite loops
			if (quill.root.innerHTML !== content) {
				// FIX: Clear the editor's current content before pasting the new content.
				// This ensures the content is REPLACED, not merged, fixing the revert bug.
				quill.deleteText(0, quill.getLength());
				quill.clipboard.dangerouslyPasteHTML(0, content);
				quill.setSelection(quill.getLength(), 0); // Move cursor to end
				onDirtyChange(false);
			}
			// Handle read-only state for preview mode
			quill.enable(!isPreviewing);
		}
	}, [content, isPreviewing, onDirtyChange]);

	// Handle Ctrl+S / Cmd+S keyboard shortcut
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 's') {
				event.preventDefault();
				// Only save if there are changes and save handler exists
				if (isEditorDirty && onSave) {
					onSave();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [isEditorDirty, onSave]);

	// Handle highlighting content when hovering over code blocks
	useEffect(() => {
		const quill = quillInstanceRef.current;
		if (!quill || !highlightedContent) {
			// Clear any existing highlights when highlightedContent is null
			const editorElement = editorRef.current?.querySelector(
				'.ql-editor'
			) as HTMLElement;
			if (editorElement) {
				editorElement.style.backgroundColor = '';
			}
			return;
		}

		const editorElement = editorRef.current?.querySelector(
			'.ql-editor'
		) as HTMLElement;
		if (!editorElement) return;

		// Simple visual feedback - pulse the editor background
		editorElement.style.backgroundColor = 'rgba(34, 211, 238, 0.1)';
		editorElement.style.transition = 'background-color 0.3s ease-in-out';

		return () => {
			editorElement.style.backgroundColor = '';
		};
	}, [highlightedContent]);

	const handleDownload = async (format: DownloadFormat) => {
		const quill = quillInstanceRef.current;
		if (!quill) return;

		const contentHtml = quill.root.innerHTML;
		const contentText = quill.getText();
		const title = 'ai-document';

		switch (format) {
			case 'txt':
				const blobTxt = new Blob([contentText], {
					type: 'text/plain;charset=utf-t',
				});
				saveAs(blobTxt, `${title}.txt`);
				break;
			case 'md':
				const turndownService = new TurndownService();
				const markdown = turndownService.turndown(contentHtml);
				const blobMd = new Blob([markdown], {
					type: 'text/markdown;charset=utf-8',
				});
				saveAs(blobMd, `${title}.md`);
				break;
			case 'pdf':
				// Parse HTML and set default text to black while preserving user colors
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = contentHtml;

				// Set default text color to black for elements without explicit color
				const allElements = tempDiv.querySelectorAll('*');
				allElements.forEach((el: Element) => {
					const htmlEl = el as HTMLElement;
					const currentStyle = htmlEl.getAttribute('style') || '';

					// Only modify if there's no color style already set by user
					if (!currentStyle.includes('color:')) {
						htmlEl.style.color = '#000000';
					}
				});

				const opt = {
					margin: [0.75, 0.75, 0.75, 0.75] as [number, number, number, number],
					filename: `${title}.pdf`,
					image: { type: 'jpeg' as const, quality: 0.98 },
					html2canvas: {
						scale: 2,
						backgroundColor: '#ffffff',
						useCORS: true,
						logging: false,
					},
					jsPDF: {
						unit: 'in' as const,
						format: 'letter' as const,
						orientation: 'portrait' as const,
					},
				};

				html2pdf().set(opt).from(tempDiv.innerHTML).save();
				break;
			case 'docx':
				// Use quill-to-word to convert Quill Delta to DOCX
				try {
					const delta = quill.getContents();
					const docxBlob = await quillToWord.generateWord(delta, {
						exportAs: 'blob',
					});
					saveAs(docxBlob, `${title}.docx`);
				} catch (error) {
					console.error('Error generating DOCX:', error);
				}
				break;
		}
	};

	return (
		<div className="flex flex-col flex-1 w-full bg-gray-800 rounded-lg shadow-lg overflow-hidden">
			<div className="flex justify-between items-center p-3 border-b border-gray-700 flex-shrink-0">
				<h3 className="text-lg font-semibold text-cyan-400">Document Editor</h3>
				<div className="flex items-center gap-2">
					<VersionsDropdown
						versions={versions}
						currentVersionId={currentVersionId}
						previewVersionId={previewVersionId}
						onPreview={onPreview}
						onRevert={onRevert}
						onDelete={onDelete}
						onExitPreview={onExitPreview}
						onOpenChange={setIsVersionDropdownOpen}
						isOpen={isVersionDropdownOpen}
					/>

					{onSave && (
						<Button
							variant="icon"
							disabled={!isEditorDirty}
							onClick={onSave}
							title={isEditorDirty ? 'Save current version' : 'No changes to save'}
						>
							<SaveIcon className="h-5 w-5" />
						</Button>
					)}

					<DownloadsDropdown onDownload={handleDownload} />
				</div>
			</div>

			{isPreviewing && (
				<div className="bg-yellow-500 text-black px-4 py-2 text-sm font-semibold flex justify-between items-center flex-shrink-0">
					<span>You are previewing a past version. The editor is read-only.</span>
					<button
						onClick={onExitPreview}
						className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded-md flex items-center gap-1"
					>
						<XIcon className="h-4 w-4" />
						Exit Preview
					</button>
				</div>
			)}

			<div
				ref={editorRef}
				className="flex-grow flex flex-col"
				style={{ minHeight: 0 }}
			>
				{/* Quill will attach here */}
			</div>
		</div>
	);
};
