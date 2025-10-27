import React, { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	label?: string;
	size?: 'sm' | 'md' | 'lg';
	error?: boolean;
	helperText?: string;
	fullWidth?: boolean;
	resizable?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
	(
		{
			label,
			size = 'md',
			error = false,
			helperText,
			fullWidth = true,
			resizable = true,
			className = '',
			disabled = false,
			...props
		},
		ref
	) => {
		const sizeClasses = {
			sm: 'text-xs px-2 py-1',
			md: 'text-sm px-3 py-2',
			lg: 'text-base px-4 py-3',
		};

		const baseClasses = `bg-gray-700 border rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all duration-200 ${
			fullWidth ? 'w-full' : ''
		}`;
		const borderClass = error
			? 'border-red-500 focus:border-red-500'
			: 'border-gray-600 focus:border-cyan-500';
		const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : '';
		const resizeClass = 'resize-none';

		const hasFlex = className.includes('flex-1');
		const wrapperClassName = hasFlex
			? 'flex-1 flex flex-col min-h-0'
			: fullWidth
				? 'w-full'
				: '';

		const finalClassName =
			`${baseClasses} ${borderClass} ${sizeClasses[size]} ${disabledClass} ${resizeClass} ${hasFlex ? 'flex-1' : ''} ${className}`.trim();

		return (
			<div className={wrapperClassName}>
				{label && (
					<label className="mb-1 block text-sm font-medium text-gray-300">
						{label}
					</label>
				)}
				<textarea
					ref={ref}
					className={finalClassName}
					disabled={disabled}
					{...props}
				/>
				{helperText && (
					<p className={`mt-1 text-xs ${error ? 'text-red-400' : 'text-gray-500'}`}>
						{helperText}
					</p>
				)}
			</div>
		);
	}
);

Textarea.displayName = 'Textarea';
