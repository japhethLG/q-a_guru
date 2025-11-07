import React from 'react';
import { DocumentVersion } from '../types';
import { HistoryIcon, TrashIcon } from './common/Icons';
import { CollapsibleSection, Button } from './common';

interface VersionHistoryProps {
	versions: DocumentVersion[];
	currentVersionId: string | null;
	previewVersionId: string | null;
	onRevert: (versionId: string) => void;
	onPreview: (versionId: string) => void;
	onDelete: (versionId: string) => void;
	onExitPreview: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
	versions,
	currentVersionId,
	previewVersionId,
	onRevert,
	onPreview,
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
		<CollapsibleSection
			title="Version History"
			icon={<HistoryIcon className="h-5 w-5" />}
			className="flex min-h-0 flex-1 flex-col"
			headerClassName="mb-3 flex-shrink-0"
		>
			<div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
				{versions.length > 0 ? (
					<ul className="space-y-2">
						{[...versions].reverse().map((version) => {
							const isCurrent = version.id === currentVersionId && !previewVersionId;
							const isPreviewing = version.id === previewVersionId;

							return (
								<li
									key={version.id}
									onClick={() => handleVersionClick(version)}
									className={`cursor-pointer rounded-md border-l-4 p-3 transition-all duration-200 ${
										isPreviewing
											? 'border-cyan-400 bg-gray-600 ring-2 ring-cyan-400'
											: isCurrent
												? 'border-cyan-600 bg-gray-700/80'
												: 'border-transparent bg-gray-700 hover:border-gray-500 hover:bg-gray-600/80'
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<div className="overflow-hidden">
											<p className="text-sm font-medium text-gray-200">
												{new Date(version.timestamp).toLocaleString()}
											</p>
											<p
												className="mt-1 truncate text-xs text-gray-400 italic"
												title={version.reason}
											>
												{version.reason}
											</p>
										</div>
										<div className="flex flex-shrink-0 items-center space-x-2">
											<Button
												variant="icon"
												size="sm"
												icon={<HistoryIcon className="h-4 w-4 text-cyan-400" />}
												onClick={(e) => {
													e.stopPropagation();
													handleRevertClick(version.id);
												}}
												title="Revert to this version"
												className="rounded-full hover:bg-cyan-500/20"
											/>
											<Button
												variant="icon"
												size="sm"
												icon={<TrashIcon className="h-4 w-4 text-red-400" />}
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick(version.id);
												}}
												title="Delete version"
												className="rounded-full hover:bg-red-500/20"
											/>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="py-8 text-center text-sm text-gray-500">
						Generate a document to start version history.
					</p>
				)}
			</div>
		</CollapsibleSection>
	);
};
