import React from 'react';
import { FileTextIcon, XIcon, ChevronDownIcon, TrashIcon } from './Icons';
import { Button, Dropdown } from './';

interface FilesDropdownProps {
	files: File[];
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
					<div className="flex items-center justify-between w-full">
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
								className="p-2 rounded-md bg-gray-700 border border-transparent hover:bg-gray-600/80 hover:border-gray-500 transition-all duration-200"
							>
								<div className="flex items-start gap-3">
									<div className="text-xl flex-shrink-0 mt-0.5">
										{getFileIcon(file.name)}
									</div>
									<div className="flex-1 min-w-0">
										<p
											className="text-sm font-medium text-gray-200 truncate"
											title={file.name}
										>
											{file.name}
										</p>
										<p className="text-xs text-gray-400 mt-0.5">
											{formatFileSize(file.size)}
										</p>
									</div>
									{onRemove && !disabled && (
										<Button
											variant="icon"
											size="base"
											onClick={(e) => handleRemoveClick(index, file, e)}
											className="hover:bg-red-500/20 flex-shrink-0"
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
					<p className="text-center text-gray-500 text-xs py-4">
						No files uploaded yet
					</p>
				)}
			</Dropdown>
		</div>
	);
};
