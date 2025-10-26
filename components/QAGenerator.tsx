import React, { useState, ChangeEvent, useEffect } from 'react';
import { QaConfig, DocumentVersion } from '../types';
import { parseFile } from '../services/parser';
import { generateQa } from '../services/gemini';
import { FileUploadSection } from './FileUploadSection';
import { ConfigSection } from './ConfigSection';
import { EditorSection } from './EditorSection';
import { ChatSection } from './ChatSection';
import { VersionHistory } from './VersionHistory';

export const QAGenerator: React.FC = () => {
	const [files, setFiles] = useState<File[]>([]);
	const [documentsContent, setDocumentsContent] = useState<string[]>([]);
	const [qaConfig, setQaConfig] = useState<QaConfig>({
		count: 5,
		type: 'mixed',
		difficulty: 'medium',
		instructions: '',
	});
	const [editorContent, setEditorContent] = useState<string>('');
	const [isParsing, setIsParsing] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [selectedText, setSelectedText] = useState('');
	const [isEditorDirty, setIsEditorDirty] = useState(false);

	const [versionHistory, setVersionHistory] = useState<DocumentVersion[]>([]);
	const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
	const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

	const convertToPlainText = (html: string) => {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;
		return tempDiv.textContent || '';
	};

	useEffect(() => {
		if (selectedText) {
			const editorPlainText = convertToPlainText(editorContent);
			const selectedPlainText = convertToPlainText(selectedText);

			if (!editorPlainText.includes(selectedPlainText)) {
				setSelectedText('');
			}
		}
	}, [editorContent, selectedText]);

	const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files || []);
		if (selectedFiles.length === 0) return;

		setFiles((prev) => [...prev, ...selectedFiles]);
		setIsParsing(true);

		try {
			const parsedContents = await Promise.all(
				selectedFiles.map((file) => parseFile(file))
			);
			setDocumentsContent((prev) => [...prev, ...parsedContents]);
		} catch (error) {
			console.error('Error parsing files:', error);
			alert(
				'There was an error parsing one or more files. Please check the console.'
			);
			setFiles((prev) => prev.filter((f) => !selectedFiles.includes(f)));
		} finally {
			setIsParsing(false);
		}
	};

	const handleGenerate = async () => {
		if (documentsContent.length === 0) {
			alert('Please upload at least one document.');
			return;
		}
		setIsGenerating(true);
		setEditorContent('');
		const resultHtml = await generateQa(documentsContent, qaConfig);

		const initialVersion: DocumentVersion = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			content: resultHtml,
			reason: 'Initial generation',
		};
		setVersionHistory([initialVersion]);
		setCurrentVersionId(initialVersion.id);
		setEditorContent(resultHtml);
		setIsEditorDirty(false);
		setPreviewVersionId(null);
		setIsGenerating(false);
	};

	const handleDocumentEdit = (newHtml: string, reason: string) => {
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
		setPreviewVersionId(null);
	};

	const contentToDisplay = previewVersionId
		? (versionHistory.find((v) => v.id === previewVersionId)?.content ?? '')
		: editorContent;

	return (
		<div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full">
			<div className="xl:col-span-3 flex flex-col gap-6">
				<FileUploadSection
					files={files}
					onFileChange={handleFileChange}
					setFiles={setFiles}
					setDocumentsContent={setDocumentsContent}
					isLoading={isParsing}
				/>
				<ConfigSection
					qaConfig={qaConfig}
					setQaConfig={setQaConfig}
					onGenerate={handleGenerate}
					isGenerating={isGenerating}
					isDisabled={files.length === 0 || isParsing || isGenerating}
				/>
				<VersionHistory
					versions={versionHistory}
					currentVersionId={currentVersionId}
					previewVersionId={previewVersionId}
					onPreview={handlePreview}
					onRevert={handleRevert}
					onSave={handleSaveVersion}
					onDelete={handleDeleteVersion}
					onExitPreview={handleExitPreview}
				/>
			</div>

			<div className="xl:col-span-9 grid grid-cols-1 grid-rows-2 lg:grid-rows-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
				<div className="lg:col-span-2 min-h-0 flex overflow-hidden">
					<EditorSection
						content={contentToDisplay}
						onContentChange={setEditorContent}
						onTextSelect={setSelectedText}
						onDirtyChange={setIsEditorDirty}
						isPreviewing={!!previewVersionId}
						onExitPreview={handleExitPreview}
					/>
				</div>
				<div className="lg:col-span-1 min-h-0 flex overflow-hidden">
					<ChatSection
						documentsContent={documentsContent}
						documentHtml={editorContent}
						selectedText={selectedText}
						onDocumentEdit={handleDocumentEdit}
					/>
				</div>
			</div>
		</div>
	);
};
