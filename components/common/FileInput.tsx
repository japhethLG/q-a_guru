import React, { useRef, DragEvent, ChangeEvent } from 'react';
import { UploadCloudIcon } from './Icons';
import { FileList } from './FileList';

interface FileInputProps {
	files: File[];
	onFilesChange: (files: File[]) => void;
	accept?: string;
	multiple?: boolean;
	disabled?: boolean;
	placeholder?: string;
	helperText?: string;
	className?: string;
	showFileList?: boolean;
	maxFiles?: number;
	onError?: (error: string) => void;
	listVariant?: 'compact' | 'detailed' | 'cards';
}

export const FileInput: React.FC<FileInputProps> = ({
	files,
	onFilesChange,
	accept = '.pdf,.docx,.pptx,.txt',
	multiple = true,
	disabled = false,
	placeholder = 'Click to upload or drag and drop',
	helperText = 'PDF, DOCX, PPTX, TXT',
	className = '',
	showFileList = true,
	maxFiles,
	onError,
	listVariant = 'compact',
}) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = React.useState(false);

	const handleDropZoneClick = () => {
		if (!disabled) {
			fileInputRef.current?.click();
		}
	};

	const handleFileAdd = (newFiles: FileList | File[]) => {
		const fileArray = Array.from(newFiles);

		if (maxFiles && files.length + fileArray.length > maxFiles) {
			const message = `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed`;
			if (onError) {
				onError(message);
			} else {
				alert(message);
			}
			return;
		}

		const allFiles = [...files, ...fileArray];
		onFilesChange(allFiles);
	};

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			handleFileAdd(e.target.files);
		}
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		if (!disabled) {
			setIsDragging(true);
		}
	};

	const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);

		if (disabled) return;

		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			handleFileAdd(e.dataTransfer.files);
		}
	};

	const handleRemove = (index: number, file: File) => {
		const newFiles = files.filter((_, i) => i !== index);
		onFilesChange(newFiles);
	};

	return (
		<div className={`w-full ${className}`}>
			<div
				onClick={handleDropZoneClick}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
					disabled
						? 'cursor-not-allowed border-gray-700 opacity-50'
						: isDragging
							? 'border-cyan-500 bg-cyan-500/10'
							: 'cursor-pointer border-gray-600 hover:border-cyan-500'
				} `}
			>
				<UploadCloudIcon className="mx-auto h-12 w-12 text-gray-500" />
				<label className="mt-2 cursor-pointer text-sm font-medium text-gray-300">
					<span className="text-cyan-400">{placeholder}</span>
					{helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
				</label>
				<input
					ref={fileInputRef}
					type="file"
					multiple={multiple}
					accept={accept}
					disabled={disabled}
					onChange={handleInputChange}
					className="sr-only"
				/>
			</div>

			{showFileList && files.length > 0 && (
				<div className="mt-4">
					<FileList
						files={files}
						onRemove={handleRemove}
						disabled={disabled}
						variant={listVariant}
					/>
				</div>
			)}

			{maxFiles && (
				<p className="mt-2 text-xs text-gray-500">
					{files.length} / {maxFiles} files
				</p>
			)}
		</div>
	);
};
