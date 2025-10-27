import React, { useRef, useEffect, useState } from 'react';
import { DownloadFormat, DocumentVersion } from '../types';
import { SaveIcon, XIcon } from './common/Icons';
import {
	Button,
	DownloadsDropdown,
	VersionsDropdown,
	TinyMCEEditor,
} from './common';
import type { Editor as TinyMCEEditorType } from 'tinymce';
import { saveAs } from 'file-saver';
import TurndownService from 'turndown';
import { htmlToDocx } from '../services/docxExport';

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

const toolbarOptions =
	'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | subscript superscript | blockquote code | alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | link image | removeformat';

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
	const editorRef = useRef<TinyMCEEditorType | null>(null);
	const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

	// Handle content change
	const handleEditorChange = (newContent: string) => {
		onContentChange(newContent);
		onDirtyChange(true);
	};

	// Handle selection change
	const handleSelectionChange = (selection: string) => {
		onTextSelect(selection);
	};

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

	const handleDownload = async (format: DownloadFormat) => {
		const editor = editorRef.current;
		if (!editor) return;

		const contentHtml = editor.getContent({ format: 'html' });
		const contentText = editor.getContent({ format: 'text' });
		const title = 'ai-document';

		switch (format) {
			case 'txt':
				const blobTxt = new Blob([contentText], {
					type: 'text/plain;charset=utf-8',
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
			case 'docx':
				try {
					const docxBlob = await htmlToDocx(contentHtml, { title });
					saveAs(docxBlob, `${title}.docx`);
				} catch (error) {
					console.error('Error generating DOCX:', error);
				}
				break;
		}
	};

	return (
		<div className="flex flex-col flex-1 w-full bg-gray-800 rounded-lg shadow-lg overflow-hidden">
			<div className="flex justify-between items-center p-3 border-b border-gray-700 shrink-0">
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
				<div className="bg-yellow-500 text-black px-4 py-2 text-sm font-semibold flex justify-between items-center shrink-0">
					<span>You are previewing a past version. The editor is read-only.</span>
					<Button
						variant="secondary"
						size="sm"
						onClick={onExitPreview}
						icon={<XIcon className="h-4 w-4" />}
						className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
					>
						Exit Preview
					</Button>
				</div>
			)}

			<div className="grow flex flex-col" style={{ minHeight: 0 }}>
				<TinyMCEEditor
					value={content}
					onChange={handleEditorChange}
					onSelectionChange={handleSelectionChange}
					disabled={isPreviewing}
					onInit={(editor) => (editorRef.current = editor)}
					toolbar={toolbarOptions}
				/>
			</div>
		</div>
	);
};
