import React, { useState, useEffect, useRef } from 'react';
import { XIcon, ChevronDownIcon } from './Icons';

type DropdownTrigger = 'click' | 'hover';

interface DropdownProps {
	trigger: DropdownTrigger;
	button: React.ReactNode;
	children: React.ReactNode;
	isOpen?: boolean; // for controlled mode
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
	header?: string;
	headerContent?: React.ReactNode;
	width?: string;
	align?: 'left' | 'right';
	maxHeight?: string;
	className?: string;
	buttonClassName?: string;
	containerClassName?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
	trigger,
	button,
	children,
	isOpen: controlledIsOpen,
	onOpenChange,
	disabled = false,
	header,
	headerContent,
	width = 'w-auto',
	align = 'right',
	maxHeight = 'max-h-96',
	className = '',
	buttonClassName = '',
	containerClassName = '',
}) => {
	const [internalIsOpen, setInternalIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Use controlled state if provided, otherwise use internal state
	// If onOpenChange is provided but isOpen is not, track state internally but report changes
	const isControlled = controlledIsOpen !== undefined;
	const isOpenState = isControlled ? controlledIsOpen : internalIsOpen;

	const handleOpenChange = (open: boolean) => {
		if (!isControlled) {
			setInternalIsOpen(open);
		}
		if (onOpenChange) {
			onOpenChange(open);
		}
	};

	// Click-outside-to-close for click-based dropdowns
	useEffect(() => {
		if (trigger === 'click' && isOpenState && !disabled) {
			const handleClickOutside = (event: MouseEvent) => {
				if (
					dropdownRef.current &&
					!dropdownRef.current.contains(event.target as Node)
				) {
					handleOpenChange(false);
				}
			};

			window.addEventListener('click', handleClickOutside);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [trigger, isOpenState, disabled]);

	const handleToggle = (e: React.MouseEvent) => {
		if (disabled) return;
		e.stopPropagation();

		if (trigger === 'click') {
			handleOpenChange(!isOpenState);
		}
	};

	const triggerClassName = trigger === 'hover' ? 'group' : '';
	const dropdownClassName =
		trigger === 'hover'
			? 'opacity-0 group-hover:opacity-100 invisible group-hover:visible'
			: '';

	const shouldShowDropdown = () => {
		if (disabled) return false;
		if (trigger === 'hover') return true; // Always render for hover, CSS controls visibility
		return isOpenState; // For click, only show when open
	};

	return (
		<div
			ref={dropdownRef}
			className={`relative ${triggerClassName} ${containerClassName}`}
			onClick={handleToggle}
		>
			<div className={buttonClassName}>{button}</div>
			{shouldShowDropdown() && (
				<div
					className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 ${width} z-30 rounded-md border border-gray-600 bg-gray-700 shadow-2xl ${maxHeight} flex flex-col overflow-hidden ${dropdownClassName} transition-opacity duration-200 ${className}`}
				>
					{(header || headerContent) && (
						<div className="flex flex-shrink-0 items-center justify-between border-b border-gray-600 p-3">
							{headerContent || (
								<h4 className="font-semibold text-gray-200">{header}</h4>
							)}
							{trigger === 'click' && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleOpenChange(false);
									}}
									className="rounded p-1 hover:bg-gray-600"
								>
									<XIcon className="h-4 w-4" />
								</button>
							)}
						</div>
					)}
					<div className="flex-1 overflow-y-auto">{children}</div>
				</div>
			)}
		</div>
	);
};
