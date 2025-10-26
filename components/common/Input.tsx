import React, { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	size?: 'sm' | 'md' | 'lg';
	error?: boolean;
	helperText?: string;
	fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
	label,
	size = 'md',
	error = false,
	helperText,
	fullWidth = true,
	className = '',
	disabled = false,
	...props
}) => {
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

	const finalClassName =
		`${baseClasses} ${borderClass} ${sizeClasses[size]} ${disabledClass} ${className}`.trim();

	return (
		<div className={fullWidth ? 'w-full' : ''}>
			{label && (
				<label className="block text-sm font-medium text-gray-300 mb-1">
					{label}
				</label>
			)}
			<input className={finalClassName} disabled={disabled} {...props} />
			{helperText && (
				<p className={`text-xs mt-1 ${error ? 'text-red-400' : 'text-gray-500'}`}>
					{helperText}
				</p>
			)}
		</div>
	);
};
