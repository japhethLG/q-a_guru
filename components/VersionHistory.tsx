import React from 'react';
import { DocumentVersion } from '../types';
import { HistoryIcon, SaveIcon, TrashIcon, XIcon } from './Icons';

interface VersionHistoryProps {
	versions: DocumentVersion[];
	currentVersionId: string | null;
	previewVersionId: string | null;
	onRevert: (versionId: string) => void;
	onPreview: (versionId: string) => void;
	onSave: () => void;
	onDelete: (versionId: string) => void;
	onExitPreview: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
	versions,
	currentVersionId,
	previewVersionId,
	onRevert,
	onPreview,
	onSave,
	onDelete,
	onExitPreview,
}) => {
	const handleRevertClick = (versionId: string) => {
		// Removed the confirmation prompt as requested
		onRevert(versionId);
	};

	const handleDeleteClick = (versionId: string) => {
		// Removed the confirmation prompt as requested
		onDelete(versionId);
	};

	const handleVersionClick = (version: DocumentVersion) => {
		if (version.id === currentVersionId) {
			onExitPreview();
		} else {
			onPreview(version.id);
		}
	};

	return (
		<div className="p-4 bg-gray-800 rounded-lg shadow-lg flex flex-col h-full">
			<div className="flex justify-between items-center mb-3">
				<h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
					<HistoryIcon className="h-5 w-5" />
					Version History
				</h3>
				<button
					onClick={onSave}
					className="p-2 hover:bg-gray-700 rounded-md"
					title="Save current version"
				>
					<SaveIcon className="h-5 w-5" />
				</button>
			</div>
			<div className="flex-grow overflow-y-auto pr-2 -mr-2">
				{versions.length > 0 ? (
					<ul className="space-y-2">
						{[...versions].reverse().map((version) => {
							const isCurrent = version.id === currentVersionId && !previewVersionId;
							const isPreviewing = version.id === previewVersionId;

							return (
								<li
									key={version.id}
									onClick={() => handleVersionClick(version)}
									className={`p-3 rounded-md transition-all duration-200 cursor-pointer border-l-4 ${
										isPreviewing
											? 'bg-gray-600 border-cyan-400 ring-2 ring-cyan-400'
											: isCurrent
												? 'bg-gray-700/80 border-cyan-600'
												: 'bg-gray-700 border-transparent hover:bg-gray-600/80 hover:border-gray-500'
									}`}
								>
									<div className="flex justify-between items-center gap-2">
										<div className="overflow-hidden">
											<p className="text-sm font-medium text-gray-200">
												{new Date(version.timestamp).toLocaleString()}
											</p>
											<p
												className="text-xs text-gray-400 mt-1 italic truncate"
												title={version.reason}
											>
												{version.reason}
											</p>
										</div>
										<div className="flex items-center space-x-2 flex-shrink-0">
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleRevertClick(version.id);
												}}
												className="p-1 hover:bg-cyan-500/20 rounded-full"
												title="Revert to this version"
											>
												<HistoryIcon className="h-4 w-4 text-cyan-400" />
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick(version.id);
												}}
												className="p-1 hover:bg-red-500/20 rounded-full"
												title="Delete version"
											>
												<TrashIcon className="h-4 w-4 text-red-400" />
											</button>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-center text-gray-500 text-sm py-8">
						Generate a document to start version history.
					</p>
				)}
			</div>
		</div>
	);
};
