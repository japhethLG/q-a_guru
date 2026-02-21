import React, {
	useRef,
	useEffect,
	useMemo,
	useCallback,
	useState,
	DragEvent,
	ChangeEvent,
	ClipboardEvent,
} from 'react';
import {
	SelectionMetadata,
	ImageAttachment,
	DocumentAttachment,
} from '../../types';
import { Button, Modal } from '../common';
import { ModelPicker } from '../common/ModelPicker';
import {
	PlusIcon,
	SettingsIcon,
	XIcon,
	SendIcon,
	StopIcon,
	RefreshCwIcon,
} from '../common/Icons';
import { useAppContext } from '../../contexts/AppContext';
import { countTokensForMessage } from '../../services/tokenCounter';

interface ChatInputProps {
	input: string;
	onInputChange: (value: string) => void;
	inputImages: ImageAttachment[];
	onInputImagesChange: (
		images: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[])
	) => void;
	onSendMessage: (enrichedMessage?: string, images?: ImageAttachment[]) => void;
	onStopGeneration: () => void;
	isLoading: boolean;
	selectedText: SelectionMetadata | null;
	onActionButtonClick: (prompt: string) => void;
	onClearContext: () => void;
	onQuickGenerate: () => void;
	hasDocuments: boolean;
	hasEditorContent: boolean;
	// File attachment props
	files: File[];
	documentsContent?: DocumentAttachment[];
	onFilesAdd: (newFiles: File[]) => void;
	onFileRemove: (index: number) => void;
	isParsing: boolean;
	onOpenSettings: () => void;
	onResetChat: () => void;
	hasMessages: boolean;
	onContextClick?: (previewText: string) => void;
	sessionTokens: number | null;
}

const selectionActionButtons = [
	{ label: 'Improve', prompt: 'Improve the writing of the selected text.' },
	{
		label: 'Change',
		prompt: 'Change or rewrite the selected text with a different approach.',
	},
	{
		label: 'Harder',
		prompt: 'Make the selected questions harder and more challenging.',
	},
];

const getFileIcon = (fileName: string) => {
	const ext = fileName.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'pdf':
			return '📄';
		case 'docx':
		case 'doc':
			return '📝';
		case 'pptx':
		case 'ppt':
			return '📊';
		case 'txt':
			return '📃';
		default:
			return '📎';
	}
};

const getFileTypeLabel = (fileName: string) => {
	return fileName.split('.').pop()?.toUpperCase() || 'FILE';
};

const truncateFileName = (name: string, maxLen = 18) => {
	if (name.length <= maxLen) return name;
	const ext = name.split('.').pop() || '';
	const base = name.slice(0, name.length - ext.length - 1);
	return `${base.slice(0, maxLen - ext.length - 4)}...${ext}`;
};

/** Parse contentEditable HTML to build enriched message with inline contexts */
const parseContentEditableToMessage = (
	container: HTMLDivElement
): { text: string; hasContexts: boolean } => {
	let result = '';
	let hasContexts = false;

	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			result += node.textContent || '';
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement;

			// Context chip — extract the embedded metadata
			if (el.dataset.contextChip) {
				hasContexts = true;
				const selectedText = el.dataset.selectedText || '';
				const selectedHtml = el.dataset.selectedHtml || '';
				const startLine = el.dataset.startLine || '?';
				const endLine = el.dataset.endLine || '?';
				const lineInfo =
					startLine === endLine
						? `Line ${startLine}`
						: `Lines ${startLine}-${endLine}`;

				result += `\n[CONTEXT: ${lineInfo}]\n"""${selectedHtml || selectedText}"""\n`;
			} else if (el.tagName === 'BR') {
				result += '\n';
			} else if (el.tagName === 'DIV' && result.length > 0) {
				// Browsers insert <div> for new lines in contentEditable
				result += '\n';
				el.childNodes.forEach(walk);
			} else {
				el.childNodes.forEach(walk);
			}
		}
	};

	container.childNodes.forEach(walk);
	return { text: result.trim(), hasContexts };
};

/** Create a context chip DOM element */
const createContextChipElement = (
	metadata: SelectionMetadata
): HTMLSpanElement => {
	const chip = document.createElement('span');
	chip.contentEditable = 'false';
	chip.dataset.contextChip = 'true';
	chip.dataset.selectedText = metadata.selectedText;
	chip.dataset.selectedHtml = metadata.selectedHtml;
	chip.dataset.startLine = String(metadata.startLine);
	chip.dataset.endLine = String(metadata.endLine);
	if (metadata.contextBefore)
		chip.dataset.contextBefore = metadata.contextBefore;
	if (metadata.contextAfter) chip.dataset.contextAfter = metadata.contextAfter;

	const lineInfo =
		metadata.startLine === metadata.endLine
			? `L${metadata.startLine}`
			: `L${metadata.startLine}-${metadata.endLine}`;

	const preview = metadata.selectedText.substring(0, 30);
	chip.dataset.preview = preview; // Store preview for click mapping

	chip.className =
		'inline-flex items-center gap-1 rounded bg-cyan-900/40 border border-cyan-500/30 px-1.5 py-0.5 mx-0.5 text-[11px] font-medium text-cyan-300 align-baseline select-none whitespace-nowrap cursor-pointer hover:bg-cyan-800/60 transition-colors';
	chip.innerHTML = `<span style="font-size:12px">💬</span><span>${lineInfo}</span><span style="color:#9ca3af;max-width:80px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:bottom pointer-events-none">${preview}</span>`;

	return chip;
};

export const ChatInput: React.FC<ChatInputProps> = ({
	input,
	onInputChange,
	inputImages,
	onInputImagesChange,
	onSendMessage,
	onStopGeneration,
	isLoading,
	selectedText,
	onActionButtonClick,
	onClearContext,
	onQuickGenerate,
	hasDocuments,
	hasEditorContent,
	files,
	documentsContent,
	onFilesAdd,
	onFileRemove,
	isParsing,
	onOpenSettings,
	onResetChat,
	hasMessages,
	onContextClick,
	sessionTokens,
}) => {
	const editableRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = React.useState(false);
	const [isResetConfirmOpen, setIsResetConfirmOpen] = React.useState(false);
	const [hasContent, setHasContent] = React.useState(false);
	const { qaConfig, setQaConfig, setSelectedText } = useAppContext();
	const lastProcessedContextRef = useRef<SelectionMetadata | null>(null);

	// Track content changes in contentEditable
	const updateContentState = useCallback(() => {
		const el = editableRef.current;
		if (!el) return;
		const text = el.textContent?.trim() || '';
		const chips = el.querySelectorAll('[data-context-chip]');
		const contentPresent = text.length > 0 || chips.length > 0;
		setHasContent(contentPresent);
		onInputChange(text);
	}, [onInputChange]);

	// Watch for new selectedText and insert chip into contentEditable
	useEffect(() => {
		if (
			!selectedText ||
			!editableRef.current ||
			selectedText === lastProcessedContextRef.current
		)
			return;

		lastProcessedContextRef.current = selectedText;

		const chip = createContextChipElement(selectedText);
		const el = editableRef.current;

		// Insert at cursor position or append
		const selection = window.getSelection();
		if (
			selection &&
			selection.rangeCount > 0 &&
			el.contains(selection.anchorNode)
		) {
			const range = selection.getRangeAt(0);
			range.deleteContents();
			range.insertNode(chip);
			// Move cursor after chip
			range.setStartAfter(chip);
			range.setEndAfter(chip);
			selection.removeAllRanges();
			selection.addRange(range);
		} else {
			el.appendChild(chip);
		}

		// Add a space after the chip so the user can type
		const space = document.createTextNode('\u00A0');
		chip.after(space);

		// Focus the editable and place cursor after the space
		el.focus();
		const newRange = document.createRange();
		newRange.setStartAfter(space);
		newRange.setEndAfter(space);
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(newRange);
		}

		updateContentState();

		// Clear selectedText from AppContext so it doesn't re-trigger
		setSelectedText(null);
	}, [selectedText, setSelectedText, updateContentState]);

	// Context-aware quick actions
	const quickActions = useMemo(() => {
		if (isLoading) return [];
		const actions: { label: string; icon?: string; onClick: () => void }[] = [];

		if (hasDocuments && !hasEditorContent) {
			actions.push({
				label: 'Generate Q&A',
				icon: '✨',
				onClick: onQuickGenerate,
			});
		}
		if (hasDocuments && hasEditorContent) {
			actions.push({
				label: 'Add more questions',
				icon: '➕',
				onClick: () =>
					onActionButtonClick(
						'Add 5 more questions to the existing document, continuing the numbering from where it left off.'
					),
			});
			actions.push({ label: 'Regenerate', icon: '🔄', onClick: onQuickGenerate });
		}
		return actions;
	}, [
		isLoading,
		hasDocuments,
		hasEditorContent,
		onQuickGenerate,
		onActionButtonClick,
	]);

	// File handling
	const handleAttachClick = () => fileInputRef.current?.click();

	const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			const allFiles = Array.from(e.target.files);
			const imageFiles = allFiles.filter((f) => f.type.startsWith('image/'));
			const docFiles = allFiles.filter((f) => !f.type.startsWith('image/'));
			if (docFiles.length > 0) onFilesAdd(docFiles);
			if (imageFiles.length > 0) addImageFiles(imageFiles);
		}
		e.target.value = '';
	};

	/** Convert a File to an ImageAttachment (base64) and fetch accurate API tokens */
	const fileToImageAttachment = (file: File): Promise<ImageAttachment> =>
		new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = async () => {
				try {
					const result = reader.result as string;
					const base64 = result.split(',')[1];
					const imgTokenCount = await countTokensForMessage({
						role: 'user',
						content: '',
						images: [{ data: base64, mimeType: file.type }],
					});
					resolve({
						data: base64,
						mimeType: file.type,
						name: file.name,
						tokenCount: imgTokenCount,
					});
				} catch (err) {
					reject(err);
				}
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});

	/** Add image files to the attachments */
	const addImageFiles = async (imageFiles: File[]) => {
		const attachments = await Promise.all(imageFiles.map(fileToImageAttachment));
		onInputImagesChange((prev) => [...prev, ...attachments]);
	};

	const handleRemoveImage = (index: number) => {
		onInputImagesChange((prev) => prev.filter((_, i) => i !== index));
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		if (!isLoading) setIsDragging(true);
	};

	const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
		if (isLoading) return;
		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			const allFiles = Array.from(e.dataTransfer.files);
			const imageFiles = allFiles.filter((f) => f.type.startsWith('image/'));
			const docFiles = allFiles.filter((f) => !f.type.startsWith('image/'));
			if (docFiles.length > 0) onFilesAdd(docFiles);
			if (imageFiles.length > 0) addImageFiles(imageFiles);
		}
	};

	// Paste handler — intercept images from clipboard
	const handlePaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
		const items = e.clipboardData?.items;
		if (!items) return;

		const imageItems: DataTransferItem[] = [];
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				imageItems.push(items[i]);
			}
		}

		if (imageItems.length > 0) {
			e.preventDefault();
			const pastedFiles = imageItems
				.map((item) => item.getAsFile())
				.filter((f): f is File => f !== null);
			if (pastedFiles.length > 0) addImageFiles(pastedFiles);
		}
	}, []);

	// Send handler — parse contentEditable and build enriched message
	const handleSend = useCallback(() => {
		const el = editableRef.current;
		if (!el || isLoading) return;

		const { text } = parseContentEditableToMessage(el);
		if (!text && files.length === 0 && inputImages.length === 0) return;

		// Capture images before clearing
		const imagesToSend = inputImages.length > 0 ? [...inputImages] : undefined;

		// Clear the editable
		el.innerHTML = '';
		setHasContent(false);
		onInputChange('');
		lastProcessedContextRef.current = null;
		onInputImagesChange([]);

		onSendMessage(text || undefined, imagesToSend);
	}, [
		isLoading,
		files.length,
		inputImages,
		onSendMessage,
		onInputChange,
		onInputImagesChange,
	]);

	// Handle keyDown on contentEditable
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
				e.preventDefault();
				handleSend();
			}
		},
		[isLoading, handleSend]
	);

	const canSend = hasContent || files.length > 0 || inputImages.length > 0;
	const hasContextChips =
		editableRef.current?.querySelector('[data-context-chip]') !== null;

	return (
		<div className="p-3">
			{/* Dynamic Action Chips */}
			{(quickActions.length > 0 || hasContextChips) && (
				<div className="mb-3 flex flex-wrap gap-2">
					{hasContextChips
						? selectionActionButtons.map((btn) => (
								<Button
									key={btn.label}
									variant="secondary"
									size="sm"
									className="rounded-full border border-gray-600/50 bg-gray-800/80 px-4 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
									onClick={() => {
										const el = editableRef.current;
										if (!el || isLoading) return;
										const { text } = parseContentEditableToMessage(el);
										const finalPrompt = text ? `${btn.prompt}\n\n${text}` : btn.prompt;

										// Clear
										el.innerHTML = '';
										setHasContent(false);
										onInputChange('');
										lastProcessedContextRef.current = null;

										onSendMessage(finalPrompt);
									}}
									disabled={isLoading}
								>
									{btn.label}
								</Button>
							))
						: quickActions.map((action) => (
								<Button
									key={action.label}
									variant="secondary"
									size="sm"
									className="rounded-full border border-gray-600/50 bg-gray-800/80 px-4 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
									onClick={action.onClick}
									disabled={isLoading}
								>
									{action.icon && (
										<span className="mr-1.5 opacity-80">{action.icon}</span>
									)}
									{action.label}
								</Button>
							))}
				</div>
			)}

			{/* ── Gemini-style unified card ── */}
			<div
				className={`rounded-2xl border transition-colors ${
					isDragging
						? 'border-cyan-500 bg-gray-700/80'
						: 'border-gray-600/50 bg-gray-700/60'
				}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{/* File chips */}
				{files.length > 0 && (
					<div className="px-4 pt-3">
						<div className="flex flex-wrap gap-1.5">
							{files.map((file, index) => (
								<div
									key={`${file.name}-${index}`}
									className="group flex items-center gap-1.5 rounded-lg bg-gray-600/60 px-2.5 py-1.5 transition-colors hover:bg-gray-600"
									title={file.name}
								>
									<span className="text-sm leading-none">{getFileIcon(file.name)}</span>
									<div className="flex flex-col leading-tight">
										<span className="max-w-[120px] truncate text-xs font-medium text-gray-200">
											{truncateFileName(file.name)}
										</span>
										<div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
											<span>{getFileTypeLabel(file.name)}</span>
											{documentsContent?.[index]?.tokenCount !== undefined && (
												<>
													<span className="h-1 w-1 rounded-full bg-gray-600"></span>
													<span className="font-medium text-cyan-500/80">
														{documentsContent[index].tokenCount?.toLocaleString()} tokens
													</span>
												</>
											)}
										</div>
									</div>
									<Button
										variant="icon"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											onFileRemove(index);
										}}
										className="ml-0.5 p-0.5! text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-transparent! hover:text-red-400"
										title="Remove file"
									>
										<XIcon className="h-3 w-3" />
									</Button>
								</div>
							))}
							{isParsing && (
								<div className="flex items-center gap-1.5 rounded-lg bg-cyan-900/30 px-2.5 py-1.5 text-xs text-cyan-400">
									<div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
									Parsing...
								</div>
							)}
						</div>
					</div>
				)}

				{/* Image attachment previews */}
				{inputImages.length > 0 && (
					<div className="px-4 pt-3">
						<div className="flex flex-wrap gap-2">
							{inputImages.map((img, index) => (
								<div
									key={`img-${index}`}
									className="group relative h-16 shrink-0 overflow-hidden rounded-lg border border-gray-600/50 bg-gray-600/40"
								>
									<img
										src={`data:${img.mimeType};base64,${img.data}`}
										alt={img.name || 'Image attachment'}
										className="h-full object-cover"
									/>
									{img.tokenCount !== undefined && (
										<div className="absolute right-1 bottom-1 rounded-sm bg-gray-900/80 px-1 py-0.5 text-[9px] font-medium text-cyan-400 backdrop-blur-sm">
											{img.tokenCount.toLocaleString()} t
										</div>
									)}
									<Button
										variant="icon"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											handleRemoveImage(index);
										}}
										className="absolute top-0.5 right-0.5 rounded-full! bg-gray-900/70! p-0.5! text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/80! hover:text-white"
										title="Remove image"
									>
										<XIcon className="h-3 w-3" />
									</Button>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ContentEditable input with inline context chips */}
				<div className="px-4 pt-3 pb-1">
					<div
						ref={editableRef}
						contentEditable={!isLoading}
						onInput={updateContentState}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						onClick={(e) => {
							const target = e.target as HTMLElement;
							const chip = target.closest('[data-context-chip="true"]') as HTMLElement;
							if (chip && onContextClick) {
								const preview = chip.dataset.preview;
								if (preview) {
									onContextClick(preview);
								}
							}
						}}
						data-placeholder={
							hasContextChips
								? 'Type your instruction around the context...'
								: files.length > 0
									? 'Ask about your documents...'
									: 'Ask a question...'
						}
						className="chat-editable max-h-[200px] min-h-[24px] w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-gray-100 outline-none empty:before:pointer-events-none empty:before:text-gray-500 empty:before:content-[attr(data-placeholder)]"
					/>
				</div>

				{/* Bottom toolbar */}
				<div className="flex items-center gap-1 px-2 pb-2">
					{/* Left side: + and Settings */}
					<Button
						variant="icon"
						size="md"
						onClick={handleAttachClick}
						disabled={isLoading || isParsing}
						className="rounded-full hover:bg-gray-600/50! hover:text-gray-200"
						title="Attach files"
					>
						<PlusIcon className="h-5 w-5" />
					</Button>

					<Button
						variant="icon"
						size="md"
						onClick={onOpenSettings}
						className="rounded-full hover:bg-gray-600/50! hover:text-gray-200"
						title="Generation settings"
					>
						<SettingsIcon className="h-5 w-5" />
					</Button>

					{hasMessages && (
						<Button
							variant="icon"
							size="md"
							onClick={() => setIsResetConfirmOpen(true)}
							disabled={isLoading}
							className="rounded-full hover:bg-gray-600/50! hover:text-gray-200"
							title="Reset chat"
						>
							<RefreshCwIcon className="h-4.5 w-4.5" />
						</Button>
					)}

					{/* Spacer */}
					<div className="flex-1" />

					{/* Right side: Model picker + Send/Stop */}
					<div className="flex items-center gap-2">
						<div className="[&_.relative_>_div:first-child]:py-1.5 [&_>_div]:mb-0 [&_select]:py-1.5">
							<ModelPicker
								value={qaConfig.model}
								onChange={(model) => setQaConfig((c) => ({ ...c, model }))}
								label=""
								size="md"
							/>
						</div>

						{isLoading ? (
							<Button
								variant="danger"
								size="md"
								onClick={onStopGeneration}
								className="rounded-full bg-red-500/20! text-red-400! hover:bg-red-500/30!"
								title="Stop generation"
							>
								<StopIcon className="h-5 w-5" />
							</Button>
						) : (
							<Button
								variant={canSend ? 'primary' : 'icon'}
								size="md"
								onClick={handleSend}
								disabled={!canSend}
								className="w-11 rounded-full"
								title="Send message"
							>
								<SendIcon className="h-5 w-5" />
							</Button>
						)}
					</div>
				</div>

				{/* Overall Token Counter Row */}
				{sessionTokens !== null && (
					<div className="flex justify-end px-4 pb-2.5">
						<span className="text-[10px] font-medium text-gray-500">
							Context:{' '}
							<span className="cursor-default text-cyan-400/90 transition-colors hover:text-cyan-400">
								{sessionTokens.toLocaleString()} tokens
							</span>
						</span>
					</div>
				)}
			</div>

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept=".pdf,.docx,.pptx,.txt,image/*"
				onChange={handleFileInputChange}
				className="hidden"
			/>

			{/* Drag overlay */}
			{isDragging && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-cyan-500 bg-cyan-500/5">
					<span className="text-sm font-medium text-cyan-400">Drop files here</span>
				</div>
			)}

			{/* Reset confirmation modal */}
			<Modal
				isOpen={isResetConfirmOpen}
				onClose={() => setIsResetConfirmOpen(false)}
				title="Reset Chat"
				size="sm"
				footer={
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setIsResetConfirmOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								onResetChat();
								setIsResetConfirmOpen(false);
							}}
						>
							Reset
						</Button>
					</div>
				}
			>
				<p className="text-sm text-gray-300">
					Are you sure you want to reset the chat? This will clear all messages and
					cannot be undone.
				</p>
			</Modal>
		</div>
	);
};
