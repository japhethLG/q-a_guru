import React, { useRef, ChangeEvent, useEffect } from 'react';
import { DocumentVersion } from '../types';
import { parseFile } from '../services/parser';
import { generateQaStream } from '../services/gemini';
import { FileUploadSection } from './FileUploadSection';
import { ConfigSection } from './ConfigSection';
import { EditorSection } from './EditorSection';
import { ChatSection } from './ChatSection';
import { useAppContext } from '../contexts/AppContext';

export const QAGenerator: React.FC = () => {
	const {
		files,
		setFiles,
		documentsContent,
		setDocumentsContent,
		qaConfig,
		setQaConfig,
		setGenerationConfig,
		editorContent,
		setEditorContent,
		isParsing,
		setIsParsing,
		isGenerating,
		setIsGenerating,
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
		setHighlightedContent,
	} = useAppContext();

	const abortControllerRef = useRef<AbortController | null>(null);

	const normalizeText = (text: string) => {
		return text
			.replace(/\s+/g, ' ') // Collapse all whitespace to single spaces
			.trim() // Remove leading/trailing whitespace
			.toLowerCase(); // Case-insensitive comparison
	};

	const convertToPlainText = (html: string) => {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;
		return tempDiv.textContent || '';
	};

	useEffect(() => {
		// Only validate when editor content changes, not when text is first selected
		if (selectedText && editorContent) {
			const editorPlainText = normalizeText(convertToPlainText(editorContent));
			const selectedPlainText = normalizeText(convertToPlainText(selectedText));

			if (!editorPlainText.includes(selectedPlainText)) {
				setSelectedText('');
			}
		}
	}, [editorContent]); // Only depend on editorContent, not selectedText

	const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files || []) as File[];
		if (selectedFiles.length === 0) return;

		// Don't update files here - FileUploadSection manages that
		// Just parse the new files and update documentsContent
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
			// Also need to remove the files that failed to parse
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

		// Capture current config as generation config
		setGenerationConfig(qaConfig);

		setIsGenerating(true);
		setEditorContent('');

		// Create new AbortController for this generation
		abortControllerRef.current = new AbortController();

		try {
			const responseStream = generateQaStream(
				documentsContent,
				qaConfig,
				qaConfig.apiKey,
				abortControllerRef.current.signal
			);

			// Accumulate streaming text
			let accumulatedText = '';

			for await (const chunk of await responseStream) {
				// Check if aborted
				if (abortControllerRef.current?.signal.aborted) {
					break;
				}

				if (chunk.text) {
					accumulatedText += chunk.text;
					setEditorContent(accumulatedText);
				}
			}

			// Only create version if not aborted
			if (!abortControllerRef.current?.signal.aborted && accumulatedText) {
				const initialVersion: DocumentVersion = {
					id: crypto.randomUUID(),
					timestamp: Date.now(),
					content: accumulatedText,
					reason: 'Initial generation',
				};
				setVersionHistory([initialVersion]);
				setCurrentVersionId(initialVersion.id);
				setIsEditorDirty(false);
				setPreviewVersionId(null);
			}
		} catch (error) {
			// Check if it was an abort error
			if (error instanceof Error && error.name === 'AbortError') {
				console.log('Generation aborted by user');
			} else {
				console.error('Error generating Q&A:', error);
				setEditorContent(
					'<p><strong>Error:</strong> Failed to generate Q&A. Please check the console for details.</p>'
				);
			}
		} finally {
			setIsGenerating(false);
			abortControllerRef.current = null;
		}
	};

	const handleStopGeneration = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
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
		<div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-12">
			<div className="flex min-h-0 flex-col gap-6 xl:col-span-3">
				<FileUploadSection onFileChange={handleFileChange} />
				<ConfigSection onGenerate={handleGenerate} onStop={handleStopGeneration} />
			</div>

			<div className="grid h-full grid-cols-1 grid-rows-2 gap-6 overflow-hidden lg:grid-cols-3 lg:grid-rows-1 xl:col-span-9">
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
					/>
				</div>
				<div className="flex min-h-0 overflow-hidden lg:col-span-1">
					<ChatSection
						documentHtml={editorContent}
						selectedText={selectedText}
						onDocumentEdit={handleDocumentEdit}
					/>
				</div>
			</div>
		</div>
	);
};
