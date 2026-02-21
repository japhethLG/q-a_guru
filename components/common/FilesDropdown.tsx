import React from 'react';
import { FileTextIcon, XIcon, ChevronDownIcon, TrashIcon } from './Icons';
import { Button, Dropdown } from './';
import { DocumentAttachment } from '../../types';

interface FilesDropdownProps {
	files: File[];
	documentsContent?: DocumentAttachment[];
	onRemove?: (index: number, file: File) => void;
	onReset?: () => void;
	disabled?: boolean;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	direction?: 'left' | 'right';
	className?: string;
}

export const FilesDropdown: React.FC<FilesDropdownProps> = ({
	files,
	documentsContent,
	onRemove,
	onReset,
	disabled = false,
	isOpen,
	onOpenChange,
	direction = 'right',
	className = '',
}) => {
	const handleRemoveClick = (index: number, file: File, e: React.MouseEvent) => {
		e.stopPropagation();
		onRemove?.(index, file);
		// Don't close the dropdown
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const getFileIcon = (fileName: string) => {
		const extension = fileName.split('.').pop()?.toLowerCase();
		switch (extension) {
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
			case 'jpg':
			case 'jpeg':
			case 'png':
			case 'gif':
				return '🖼️';
			default:
				return '📎';
		}
	};

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			{files.length > 0 && (
				<span className="text-sm text-gray-400">
					{files.length} file{files.length > 1 ? 's' : ''}
				</span>
			)}
			<Dropdown
				trigger="click"
				disabled={files.length === 0 || disabled}
				width="w-80"
				maxHeight="max-h-96"
				align={direction}
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				headerContent={
					<div className="flex w-full items-center justify-between">
						<h4 className="font-semibold text-gray-200">Uploaded Files</h4>
						{onReset && files.length > 0 && !disabled && (
							<Button
								variant="icon"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									if (window.confirm('Are you sure you want to remove all files?')) {
										onReset();
									}
								}}
								className="hover:bg-red-500/20"
								title="Remove all files"
							>
								<TrashIcon className="h-4 w-4 text-red-400" />
							</Button>
						)}
					</div>
				}
				button={
					<Button
						variant="icon"
						disabled={files.length === 0 || disabled}
						icon={<FileTextIcon className="h-5 w-5" />}
						title={
							files.length === 0 ? 'Uploaded Files (No files yet)' : 'Uploaded Files'
						}
					>
						<ChevronDownIcon
							className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
						/>
					</Button>
				}
			>
				{files.length > 0 ? (
					<ul className="space-y-1 p-2">
						{files.map((file, index) => (
							<li
								key={`${file.name}-${index}`}
								className="rounded-md border border-transparent bg-gray-700 p-2 transition-all duration-200 hover:border-gray-500 hover:bg-gray-600/80"
							>
								<div className="flex items-start gap-3">
									<div className="mt-0.5 flex-shrink-0 text-xl">
										{getFileIcon(file.name)}
									</div>
									<div className="min-w-0 flex-1">
										<p
											className="truncate text-sm font-medium text-gray-200"
											title={file.name}
										>
											{file.name}
										</p>
										<p className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
											<span>{formatFileSize(file.size)}</span>
											{documentsContent?.find((d) => d.fileName === file.name)
												?.tokenCount !== undefined && (
												<span className="inline-flex items-center rounded-sm bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 ring-1 ring-gray-600 ring-inset">
													{documentsContent
														.find((d) => d.fileName === file.name)!
														.tokenCount!.toLocaleString()}{' '}
													tokens
												</span>
											)}
										</p>
									</div>
									{onRemove && !disabled && (
										<Button
											variant="icon"
											size="base"
											onClick={(e) => handleRemoveClick(index, file, e)}
											className="flex-shrink-0 hover:bg-red-500/20"
											title="Remove"
										>
											<XIcon className="size-4 text-red-400" />
										</Button>
									)}
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="py-4 text-center text-xs text-gray-500">
						No files uploaded yet
					</p>
				)}
			</Dropdown>
		</div>
	);
};
