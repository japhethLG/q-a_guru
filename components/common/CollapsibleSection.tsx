import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './Icons';

interface CollapsibleSectionProps {
	title: string;
	children: React.ReactNode;
	initialCollapsed?: boolean;
	icon?: React.ReactNode;
	className?: string;
	headerClassName?: string;
	contentClassName?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
	title,
	children,
	initialCollapsed = false,
	icon,
	className = '',
	headerClassName = '',
	contentClassName = '',
}) => {
	const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

	// When using flex-1, we need to apply it conditionally based on collapsed state
	// to allow the parent to properly collapse
	const baseClasses = 'p-4 bg-gray-800 rounded-lg shadow-lg';
	const flexClassName = className.includes('flex-1')
		? isCollapsed
			? className
					.replace(/\bflex-1\b/, '')
					.replace(/\s+/g, ' ')
					.trim()
			: className
		: className;
	const finalClassName = `${baseClasses} ${flexClassName}`
		.replace(/\s+/g, ' ')
		.trim();

	// Apply default mb-4 unless headerClassName already specifies margin
	const defaultHeaderMargin = headerClassName.includes('mb-') ? '' : 'mb-4';

	return (
		<div className={finalClassName}>
			<div
				className={`flex justify-between items-center ${defaultHeaderMargin} ${headerClassName}`}
			>
				<h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
					{icon}
					{title}
				</h3>
				<button
					onClick={(e) => {
						e.stopPropagation();
						setIsCollapsed(!isCollapsed);
					}}
					className="p-1 hover:bg-gray-700 rounded-md transition-colors"
					title={isCollapsed ? 'Expand' : 'Collapse'}
				>
					{isCollapsed ? (
						<ChevronDownIcon className="h-5 w-5 text-gray-400" />
					) : (
						<ChevronUpIcon className="h-5 w-5 text-gray-400" />
					)}
				</button>
			</div>
			{!isCollapsed && <div className={contentClassName || ''}>{children}</div>}
		</div>
	);
};
