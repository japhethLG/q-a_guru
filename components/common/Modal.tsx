import React, { useEffect } from 'react';
import { XIcon } from './Icons';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	size?: ModalSize;
	footer?: React.ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
	sm: 'max-w-md',
	md: 'max-w-lg',
	lg: 'max-w-2xl',
	xl: 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	title,
	children,
	size = 'md',
	footer,
}) => {
	// Handle ESC key press
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen) {
				onClose();
			}
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [isOpen, onClose]);

	// Prevent body scroll when modal is open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			onClick={(e) => {
				// Close on backdrop click
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

			{/* Modal Content */}
			<div
				className={`relative w-full rounded-lg bg-gray-800 shadow-xl ${sizeClasses[size]} flex max-h-[90vh] flex-col`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-gray-700 p-6">
					<h2 className="text-xl font-semibold text-white">{title}</h2>
					<Button
						variant="icon"
						size="sm"
						icon={<XIcon className="h-5 w-5" />}
						onClick={onClose}
						aria-label="Close modal"
					/>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto p-6">{children}</div>

				{/* Footer */}
				{footer && <div className="border-t border-gray-700 p-6">{footer}</div>}
			</div>
		</div>
	);
};
