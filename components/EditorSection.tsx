import React, { useRef, useEffect, useState } from 'react';
import {
	DownloadFormat,
	DocumentVersion,
	SelectionMetadata,
	ScrollTarget,
} from '../types';
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
import {
	TINYMCE_PLUGINS,
	TINYMCE_TOOLBAR,
	TINYMCE_QUICKBARS_SELECTION_TOOLBAR,
	TINYMCE_QUICKBARS_INSERT_TOOLBAR,
} from '../utils/tinymceConfig';

interface EditorSectionProps {
	content: string;
	onContentChange: (newContent: string) => void;
	onTextSelect: (selectedText: SelectionMetadata | null) => void;
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
	scrollTargets?: ScrollTarget[];
	onScrollHandled?: () => void;
}

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
	scrollTargets = [],
	onScrollHandled,
}) => {
	const editorRef = useRef<TinyMCEEditorType | null>(null);
	const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

	// Handle content change
	const handleEditorChange = (newContent: string) => {
		onContentChange(newContent);
		onDirtyChange(true);
	};

	// Handle selection change
	const handleSelectionChange = (selection: SelectionMetadata | null) => {
		if (selection) {
			onTextSelect(selection);
		}
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
		<div className="flex w-full flex-1 flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg">
			<div className="flex shrink-0 items-center justify-between border-b border-gray-700 p-3">
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
				<div className="flex shrink-0 items-center justify-between bg-yellow-500 px-4 py-2 text-sm font-semibold text-black">
					<span>You are previewing a past version. The editor is read-only.</span>
					<Button
						variant="secondary"
						size="sm"
						onClick={onExitPreview}
						icon={<XIcon className="h-4 w-4" />}
						className="bg-yellow-600 font-bold text-white hover:bg-yellow-700"
					>
						Exit Preview
					</Button>
				</div>
			)}

			<div className="flex grow flex-col" style={{ minHeight: 0 }}>
				<TinyMCEEditor
					value={content}
					onChange={handleEditorChange}
					onAddToChat={handleSelectionChange}
					disabled={isPreviewing}
					onInit={(editor) => (editorRef.current = editor)}
					toolbar={TINYMCE_TOOLBAR}
					plugins={TINYMCE_PLUGINS}
					quickbarsSelectionToolbar={TINYMCE_QUICKBARS_SELECTION_TOOLBAR}
					quickbarsInsertToolbar={TINYMCE_QUICKBARS_INSERT_TOOLBAR}
					scrollTargets={scrollTargets}
					onScrollHandled={onScrollHandled}
				/>
			</div>
		</div>
	);
};
