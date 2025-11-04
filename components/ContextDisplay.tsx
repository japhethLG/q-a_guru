import React, { useState } from 'react';
import { WandIcon, XIcon, ChevronDownIcon } from './common/Icons';
import { Button, ContentPreview } from './common';
import { SelectionMetadata } from '../types';

interface ContextDisplayProps {
	selectedText: SelectionMetadata | null;
	onClear: () => void;
}

export const ContextDisplay: React.FC<ContextDisplayProps> = ({
	selectedText,
	onClear,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);

	if (!selectedText) {
		return null;
	}

	const lineInfo =
		selectedText.startLine === selectedText.endLine
			? `Line ${selectedText.startLine}`
			: `Lines ${selectedText.startLine}-${selectedText.endLine}`;

	return (
		<div className="mb-2 overflow-hidden rounded-lg border border-gray-600 bg-gray-700/50 transition-all duration-300">
			<div
				className="flex cursor-pointer items-center justify-between p-2"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					<WandIcon className="h-4 w-4 text-cyan-400" />
					<span className="text-xs font-semibold text-gray-300">
						Context {lineInfo}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="icon"
						size="sm"
						onClick={(e) => {
							e.stopPropagation();
							onClear();
						}}
						title="Clear context for next message"
						icon={<XIcon className="h-3 w-3" />}
						className="rounded-full"
					/>
					<ChevronDownIcon
						className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? '' : 'rotate-180'}`}
					/>
				</div>
			</div>
			{isExpanded && (
				<div className="p-3 pt-0">
					<ContentPreview
						content={selectedText.selectedHtml || selectedText.selectedText}
						contentType="html"
						height={300}
					/>
				</div>
			)}
		</div>
	);
};
