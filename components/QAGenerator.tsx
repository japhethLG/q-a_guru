import React, { useEffect } from 'react';
import { DocumentVersion, ScrollTarget } from '../types';
import { EditorSection } from './EditorSection';
import { ChatSection } from './ChatSection';
import { useAppContext } from '../contexts/AppContext';

export const QAGenerator: React.FC = () => {
	const {
		editorContent,
		setEditorContent,
		selectedText,
		setSelectedText,
		isEditorDirty,
		setIsEditorDirty,
		versionHistory,
		setVersionHistory,
		currentVersionId,
		setCurrentVersionId,
		previewVersionId,
		setPreviewVersionId,
		highlightedContent,
	} = useAppContext();
	const [pendingScrolls, setPendingScrolls] = React.useState<ScrollTarget[]>([]);

	const normalizeText = (text: string) => {
		return text.replace(/\s+/g, ' ').trim().toLowerCase();
	};

	const convertToPlainText = (html: string) => {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;
		return tempDiv.textContent || '';
	};

	useEffect(() => {
		if (selectedText && editorContent) {
			const editorPlainText = normalizeText(convertToPlainText(editorContent));
			const selectedPlainText = normalizeText(
				convertToPlainText(selectedText.selectedText || selectedText.selectedHtml)
			);

			if (!editorPlainText.includes(selectedPlainText)) {
				setSelectedText(null);
			}
		}
	}, [editorContent]);

	const handleDocumentEdit = (
		newHtml: string,
		reason: string,
		scrollTo?: ScrollTarget,
		scrollTargets?: ScrollTarget[]
	) => {
		const newVersion: DocumentVersion = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			content: newHtml,
			reason: reason,
		};
		setVersionHistory((prev) => [...prev, newVersion]);
		setCurrentVersionId(newVersion.id);
		setEditorContent(newHtml);
		setIsEditorDirty(false);
		setPreviewVersionId(null);

		if (scrollTargets && scrollTargets.length > 0) {
			setPendingScrolls(scrollTargets);
		} else if (scrollTo) {
			setPendingScrolls([scrollTo]);
		}
	};

	const handleSaveVersion = () => {
		const latestVersion = versionHistory.find((v) => v.id === currentVersionId);
		if (
			isEditorDirty &&
			(!latestVersion || editorContent !== latestVersion.content)
		) {
			handleDocumentEdit(editorContent, 'Manual save');
		} else {
			alert('No changes to save.');
		}
	};

	const handleDeleteVersion = (versionIdToDelete: string) => {
		const newHistory = versionHistory.filter((v) => v.id !== versionIdToDelete);

		if (newHistory.length === 0) {
			setVersionHistory([]);
			setEditorContent('');
			setCurrentVersionId(null);
		} else {
			const deletedIndex = versionHistory.findIndex(
				(v) => v.id === versionIdToDelete
			);
			const newVersionIndex = Math.max(0, deletedIndex - 1);
			const versionToRevertTo = newHistory[newVersionIndex] || newHistory[0];

			setVersionHistory(newHistory);
			setEditorContent(versionToRevertTo.content);
			setCurrentVersionId(versionToRevertTo.id);
		}
		setIsEditorDirty(false);
		setPreviewVersionId(null);
	};

	const handleRevert = (versionId: string) => {
		const versionToRestore = versionHistory.find((v) => v.id === versionId);
		if (versionToRestore) {
			const versionIndex = versionHistory.findIndex((v) => v.id === versionId);
			const newHistory = versionHistory.slice(0, versionIndex + 1);

			setVersionHistory(newHistory);
			setEditorContent(versionToRestore.content);
			setCurrentVersionId(versionToRestore.id);
			setIsEditorDirty(false);
			setPreviewVersionId(null);
		}
	};

	const handlePreview = (versionId: string) => {
		setPreviewVersionId(versionId);
	};

	const handleExitPreview = () => {
		if (versionHistory.length > 0) {
			const latestVersion = versionHistory[versionHistory.length - 1];
			setEditorContent(latestVersion.content);
			setCurrentVersionId(latestVersion.id);
		}
		setPreviewVersionId(null);
		setIsEditorDirty(false);
	};

	const contentToDisplay = previewVersionId
		? (versionHistory.find((v) => v.id === previewVersionId)?.content ?? '')
		: editorContent;

	return (
		<div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-3">
			<div className="flex min-h-0 overflow-hidden lg:col-span-2">
				<EditorSection
					content={contentToDisplay}
					onContentChange={setEditorContent}
					onTextSelect={setSelectedText}
					onDirtyChange={setIsEditorDirty}
					isPreviewing={!!previewVersionId}
					onExitPreview={handleExitPreview}
					onSave={handleSaveVersion}
					isEditorDirty={isEditorDirty}
					versions={versionHistory}
					currentVersionId={currentVersionId}
					previewVersionId={previewVersionId}
					onPreview={handlePreview}
					onRevert={handleRevert}
					onDelete={handleDeleteVersion}
					highlightedContent={highlightedContent}
					scrollTargets={pendingScrolls}
					onScrollHandled={() => setPendingScrolls([])}
				/>
			</div>
			<div className="flex min-h-0 overflow-hidden lg:col-span-1">
				<ChatSection
					documentHtml={editorContent}
					selectedText={selectedText}
					onDocumentEdit={handleDocumentEdit}
					onContextClick={(previewText) =>
						setPendingScrolls([{ type: 'text', text: previewText }])
					}
				/>
			</div>
		</div>
	);
};
