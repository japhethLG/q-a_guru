import React, { ChangeEvent, useRef } from 'react';
import { FileTextIcon, LoaderIcon, UploadCloudIcon, XIcon } from './Icons';
import { CollapsibleSection } from './CollapsibleSection';

interface FileUploadSectionProps {
	files: File[];
	onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
	setFiles: React.Dispatch<React.SetStateAction<File[]>>;
	setDocumentsContent: React.Dispatch<React.SetStateAction<string[]>>;
	isLoading: boolean;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
	files,
	onFileChange,
	setFiles,
	setDocumentsContent,
	isLoading,
}) => {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDropZoneClick = () => {
		fileInputRef.current?.click();
	};

	const removeFile = (index: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== index));
		setDocumentsContent((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<CollapsibleSection title="1. Upload Documents" headerClassName="mb-3">
			<div
				className="relative border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-cyan-500 transition-colors cursor-pointer"
				onClick={handleDropZoneClick}
			>
				<UploadCloudIcon className="mx-auto h-12 w-12 text-gray-500" />
				<label
					htmlFor="file-upload"
					className="mt-2 text-sm font-medium text-gray-300 cursor-pointer"
				>
					<span className="text-cyan-400">Click to upload</span> or drag and drop
					<p className="text-xs text-gray-500 mt-1">PDF, DOCX, PPTX, TXT</p>
				</label>
				<input
					ref={fileInputRef}
					id="file-upload"
					type="file"
					multiple
					className="sr-only"
					onChange={onFileChange}
					accept=".pdf,.docx,.pptx,.txt"
				/>
			</div>
			<div className="mt-4 space-y-2">
				{files.map((file, index) => (
					<div
						key={index}
						className="flex items-center justify-between bg-gray-700 p-2 rounded-md"
					>
						<div className="flex items-center space-x-2 overflow-hidden">
							<FileTextIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
							<span className="text-sm truncate">{file.name}</span>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								removeFile(index);
							}}
							className="p-1 hover:bg-red-500/20 rounded-full"
						>
							<XIcon className="h-4 w-4 text-red-400" />
						</button>
					</div>
				))}
				{isLoading && files.length > 0 && (
					<p className="text-sm text-cyan-400 flex items-center gap-2">
						<LoaderIcon className="h-4 w-4" /> Parsing files...
					</p>
				)}
			</div>
		</CollapsibleSection>
	);
};
