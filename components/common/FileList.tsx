import React from 'react';
import { FileTextIcon, XIcon, CheckIcon, AlertTriangleIcon } from './Icons';
import { Button } from './Button';

export interface FileListItem {
	name: string;
	size?: number;
	type?: string;
	status?: 'uploaded' | 'uploading' | 'error';
	progress?: number;
	error?: string;
}

interface FileListProps {
	files: File[] | FileListItem[];
	onRemove?: (index: number, file: File | FileListItem) => void;
	onReupload?: (index: number, file: File | FileListItem) => void;
	disabled?: boolean;
	variant?: 'compact' | 'detailed' | 'cards';
	maxDisplay?: number;
	showRemove?: boolean;
	className?: string;
}

export const FileList: React.FC<FileListProps> = ({
	files,
	onRemove,
	onReupload,
	disabled = false,
	variant = 'compact',
	maxDisplay,
	showRemove = true,
	className = '',
}) => {
	const displayedFiles = maxDisplay ? files.slice(0, maxDisplay) : files;
	const hiddenCount =
		maxDisplay && files.length > maxDisplay ? files.length - maxDisplay : 0;

	const formatFileSize = (bytes?: number): string => {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const getFileIcon = (file: File | FileListItem) => {
		const name = file instanceof File ? file.name : file.name;
		const extension = name.split('.').pop()?.toLowerCase();

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

	const getStatusBadge = (file: File | FileListItem) => {
		if (file instanceof File || !('status' in file)) return null;

		if ('error' in file && file.error) {
			return (
				<div className="flex items-center gap-1 text-red-400 text-xs">
					<AlertTriangleIcon className="h-3 w-3" />
					<span className="truncate">{file.error}</span>
				</div>
			);
		}

		switch (file.status) {
			case 'uploaded':
				return (
					<div className="flex items-center gap-1 text-green-400 text-xs">
						<CheckIcon className="h-3 w-3" />
						<span>Uploaded</span>
					</div>
				);
			case 'uploading':
				return (
					<div className="flex items-center gap-1 text-cyan-400 text-xs">
						<div className="animate-spin h-3 w-3 border-2 border-cyan-400 border-t-transparent rounded-full" />
						<span>Uploading...</span>
					</div>
				);
			case 'error':
				return (
					<div className="flex items-center gap-1 text-red-400 text-xs">
						<AlertTriangleIcon className="h-3 w-3" />
						<span>Error</span>
					</div>
				);
			default:
				return null;
		}
	};

	if (variant === 'cards') {
		return (
			<div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
				{displayedFiles.map((file, index) => {
					const fileSize = file instanceof File ? file.size : file.size;
					const fileName = file instanceof File ? file.name : file.name;
					const statusBadge = getStatusBadge(file);

					return (
						<div
							key={index}
							className="relative bg-gray-700 rounded-lg p-3 border border-gray-600 hover:border-gray-500 transition-colors"
						>
							<div className="flex items-start gap-3">
								<div className="text-2xl flex-shrink-0">{getFileIcon(file)}</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1 min-w-0">
											<p
												className="text-sm font-medium text-gray-200 truncate"
												title={fileName}
											>
												{fileName}
											</p>
											{fileSize && (
												<p className="text-xs text-gray-400 mt-0.5">
													{formatFileSize(fileSize)}
												</p>
											)}
										</div>
										{showRemove && !disabled && onRemove && (
											<Button
												variant="icon"
												size="sm"
												onClick={(e) => {
													e.stopPropagation();
													onRemove(index, file);
												}}
												className="hover:bg-red-500/20 flex-shrink-0"
											>
												<XIcon className="h-4 w-4 text-red-400" />
											</Button>
										)}
									</div>
									{statusBadge && <div className="mt-2">{statusBadge}</div>}
								</div>
							</div>
						</div>
					);
				})}
				{hiddenCount > 0 && (
					<div className="col-span-full text-center text-xs text-gray-500 py-2">
						+{hiddenCount} more file{hiddenCount > 1 ? 's' : ''}
					</div>
				)}
			</div>
		);
	}

	if (variant === 'detailed') {
		return (
			<div className={`space-y-2 ${className}`}>
				{displayedFiles.map((file, index) => {
					const fileSize = file instanceof File ? file.size : file.size;
					const fileName = file instanceof File ? file.name : file.name;
					const statusBadge = getStatusBadge(file);

					return (
						<div
							key={index}
							className="flex items-center gap-3 bg-gray-700 p-3 rounded-md border border-gray-600 hover:border-gray-500 transition-colors"
						>
							<div className="text-xl flex-shrink-0">{getFileIcon(file)}</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<p
										className="text-sm font-medium text-gray-200 truncate"
										title={fileName}
									>
										{fileName}
									</p>
									{fileSize && (
										<p className="text-xs text-gray-400 flex-shrink-0">
											{formatFileSize(fileSize)}
										</p>
									)}
								</div>
								{statusBadge && <div className="mt-1">{statusBadge}</div>}
							</div>
							{showRemove && !disabled && onRemove && (
								<Button
									variant="icon"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										onRemove(index, file);
									}}
									className="hover:bg-red-500/20 flex-shrink-0"
								>
									<XIcon className="h-4 w-4 text-red-400" />
								</Button>
							)}
						</div>
					);
				})}
				{hiddenCount > 0 && (
					<div className="text-center text-xs text-gray-500 py-2">
						+{hiddenCount} more file{hiddenCount > 1 ? 's' : ''}
					</div>
				)}
			</div>
		);
	}

	// Default 'compact' variant
	return (
		<div className={`space-y-2 ${className}`}>
			{displayedFiles.map((file, index) => {
				const fileSize = file instanceof File ? file.size : file.size;
				const fileName = file instanceof File ? file.name : file.name;
				const statusBadge = getStatusBadge(file);

				return (
					<div
						key={index}
						className="flex items-center justify-between bg-gray-700 p-2 rounded-md hover:bg-gray-650 transition-colors"
					>
						<div className="flex items-center space-x-2 overflow-hidden flex-1 min-w-0">
							<span className="text-lg flex-shrink-0">{getFileIcon(file)}</span>
							<FileTextIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm text-gray-200 truncate" title={fileName}>
									{fileName}
								</p>
								{fileSize && (
									<p className="text-xs text-gray-500">{formatFileSize(fileSize)}</p>
								)}
							</div>
							{statusBadge && <div className="flex-shrink-0">{statusBadge}</div>}
						</div>
						{showRemove && !disabled && onRemove && (
							<Button
								variant="icon"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									onRemove(index, file);
								}}
								className="hover:bg-red-500/20 ml-2 flex-shrink-0"
							>
								<XIcon className="h-4 w-4 text-red-400" />
							</Button>
						)}
					</div>
				);
			})}
			{hiddenCount > 0 && (
				<div className="text-center text-xs text-gray-500 py-2">
					+{hiddenCount} more file{hiddenCount > 1 ? 's' : ''}
				</div>
			)}
		</div>
	);
};
