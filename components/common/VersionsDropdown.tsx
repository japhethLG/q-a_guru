import React from 'react';
import { DocumentVersion } from '../../types';
import { HistoryIcon, TrashIcon, ChevronDownIcon } from './Icons';
import { Button, Dropdown } from './';

interface VersionsDropdownProps {
	versions: DocumentVersion[];
	currentVersionId: string | null;
	previewVersionId: string | null;
	onPreview: (versionId: string) => void;
	onRevert: (versionId: string) => void;
	onDelete: (versionId: string) => void;
	onExitPreview: () => void;
	onOpenChange: (isOpen: boolean) => void;
	isOpen: boolean;
}

export const VersionsDropdown: React.FC<VersionsDropdownProps> = ({
	versions,
	currentVersionId,
	previewVersionId,
	onPreview,
	onRevert,
	onDelete,
	onExitPreview,
	onOpenChange,
	isOpen,
}) => {
	const handleVersionClick = (version: DocumentVersion) => {
		if (version.id === currentVersionId) {
			onExitPreview();
		} else {
			onPreview(version.id);
		}
	};

	const handleRevertClick = (versionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		onRevert(versionId);
		onOpenChange(false);
	};

	const handleDeleteClick = (versionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		onDelete(versionId);
	};

	return (
		<div className="flex items-center gap-2">
			{versions.length > 0 && (
				<span className="text-sm text-gray-400">V{versions.length}</span>
			)}
			<Dropdown
				trigger="click"
				disabled={versions.length === 0}
				header="Version History"
				width="w-80"
				maxHeight="max-h-96"
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				button={
					<Button
						variant="icon"
						disabled={versions.length === 0}
						icon={<HistoryIcon className="h-5 w-5" />}
						title={
							versions.length === 0
								? 'Version History (No versions yet)'
								: 'Version History'
						}
					>
						<ChevronDownIcon
							className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
						/>
					</Button>
				}
			>
				{versions.length > 0 ? (
					<ul className="space-y-1 p-2">
						{[...versions].reverse().map((version) => {
							const isCurrent = version.id === currentVersionId && !previewVersionId;
							const isPreviewing = version.id === previewVersionId;

							return (
								<li
									key={version.id}
									onClick={() => handleVersionClick(version)}
									className={`p-2 rounded-md transition-all duration-200 cursor-pointer border-l-4 ${
										isPreviewing
											? 'bg-gray-600 border-cyan-400'
											: isCurrent
												? 'bg-gray-700/80 border-cyan-600'
												: 'bg-gray-700 border-transparent hover:bg-gray-600/80 hover:border-gray-500'
									}`}
								>
									<div className="flex justify-between items-center gap-2">
										<div className="overflow-hidden flex-1">
											<p className="text-xs font-medium text-gray-200">
												{new Date(version.timestamp).toLocaleString()}
											</p>
											<p className="text-xs text-gray-400 truncate" title={version.reason}>
												{version.reason}
											</p>
										</div>
										<div className="flex items-center space-x-1 flex-shrink-0">
											<Button
												variant="icon"
												size="base"
												onClick={(e) => handleRevertClick(version.id, e)}
												className="hover:bg-cyan-500/20"
												title="Revert"
											>
												<HistoryIcon className="size-4 text-cyan-400" />
											</Button>
											<Button
												variant="icon"
												size="base"
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick(version.id, e);
												}}
												className="hover:bg-red-500/20"
												title="Delete"
											>
												<TrashIcon className="size-4 text-red-400" />
											</Button>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-center text-gray-500 text-xs py-4">No versions yet</p>
				)}
			</Dropdown>
		</div>
	);
};
