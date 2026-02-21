import React, { ChangeEvent, useState } from 'react';
import { LoaderIcon } from './common/Icons';
import { CollapsibleSection, FileInput, FilesDropdown } from './common';
import { useAppContext } from '../contexts/AppContext';

interface FileUploadSectionProps {
	onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
	onFileChange,
}) => {
	const { files, setFiles, documentsContent, setDocumentsContent, isParsing } =
		useAppContext();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const handleFilesChange = async (newFiles: File[]) => {
		if (newFiles.length < files.length) {
			// Files were removed - sync documentsContent
			setFiles(newFiles);
			setDocumentsContent((prev) => {
				return prev.filter((_, index) => {
					return newFiles.some((file) => file.name === files[index]?.name);
				});
			});
		} else if (newFiles.length > files.length) {
			// Files were added
			setFiles(newFiles);

			// Extract only the new files
			const newFilesOnly = newFiles.filter(
				(newFile) => !files.some((f) => f.name === newFile.name)
			);

			// Parse new files directly
			if (newFilesOnly.length > 0 && onFileChange) {
				// Create a synthetic FileList-like object for the new files only
				const dataTransfer = new DataTransfer();
				newFilesOnly.forEach((file) => dataTransfer.items.add(file));

				// Create a synthetic event
				const syntheticEvent = {
					target: { files: dataTransfer.files },
					currentTarget: dataTransfer,
				} as any;

				onFileChange(syntheticEvent);
			}
		} else {
			// Same number of files - just update
			setFiles(newFiles);
		}
	};

	const handleRemoveFile = (index: number, file: File) => {
		const newFiles = files.filter((_, i) => i !== index);
		handleFilesChange(newFiles);
	};

	const handleReset = () => {
		setFiles([]);
		setDocumentsContent([]);
	};

	return (
		<CollapsibleSection title="1. Upload Documents" headerClassName="mb-3">
			<FileInput
				files={files}
				onFilesChange={handleFilesChange}
				accept=".pdf,.docx,.pptx,.txt"
				multiple={true}
				disabled={isParsing}
				placeholder="Click to upload or drag and drop"
				helperText="PDF, DOCX, PPTX, TXT"
				showFileList={false}
			/>
			{files.length > 0 && (
				<div className="mt-3">
					<FilesDropdown
						files={files}
						documentsContent={documentsContent}
						onRemove={handleRemoveFile}
						onReset={handleReset}
						disabled={isParsing}
						isOpen={dropdownOpen}
						onOpenChange={setDropdownOpen}
						direction="left"
					/>
				</div>
			)}
			{isParsing && files.length > 0 && (
				<p className="mt-3 flex items-center gap-2 text-sm text-cyan-400">
					<LoaderIcon className="h-4 w-4" /> Parsing files...
				</p>
			)}
		</CollapsibleSection>
	);
};
