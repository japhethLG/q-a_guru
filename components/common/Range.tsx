import React, { InputHTMLAttributes } from 'react';

interface RangeProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
	label?: string;
	showValue?: boolean;
	size?: 'sm' | 'md' | 'lg';
	error?: boolean;
	helperText?: string;
	fullWidth?: boolean;
}

export const Range: React.FC<RangeProps> = ({
	label,
	showValue = true,
	size = 'md',
	error = false,
	helperText,
	fullWidth = true,
	className = '',
	disabled = false,
	...props
}) => {
	const sizeClasses = {
		sm: 'h-1',
		md: 'h-2',
		lg: 'h-3',
	};

	const baseClasses = `bg-gray-700 rounded-lg appearance-none cursor-pointer outline-none transition-all duration-200 ${
		fullWidth ? 'w-full' : ''
	}`;

	const sliderClasses = `
		${baseClasses} 
		${sizeClasses[size]} 
		accent-cyan-500 
		disabled:opacity-50 
		disabled:cursor-not-allowed
	`;

	const trackStyle = `
		::-webkit-slider-runnable-track {
			height: ${size === 'sm' ? '4px' : size === 'md' ? '8px' : '12px'};
			background: ${error ? '#ef4444' : '#374151'};
			border-radius: 9999px;
		}
		::-webkit-slider-thumb {
			appearance: none;
			height: ${size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px'};
			width: ${size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px'};
			background: ${error ? '#ef4444' : '#06b6d4'};
			border-radius: 50%;
			cursor: pointer;
			margin-top: -${size === 'sm' ? '6px' : size === 'md' ? '6px' : '6px'};
			transition: all 0.2s;
		}
		::-webkit-slider-thumb:hover {
			background: ${error ? '#dc2626' : '#0891b2'};
			transform: scale(1.1);
		}
		::-moz-range-track {
			height: ${size === 'sm' ? '4px' : size === 'md' ? '8px' : '12px'};
			background: ${error ? '#ef4444' : '#374151'};
			border-radius: 9999px;
		}
		::-moz-range-thumb {
			height: ${size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px'};
			width: ${size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px'};
			background: ${error ? '#ef4444' : '#06b6d4'};
			border-radius: 50%;
			cursor: pointer;
			border: none;
			transition: all 0.2s;
		}
		::-moz-range-thumb:hover {
			background: ${error ? '#dc2626' : '#0891b2'};
			transform: scale(1.1);
		}
	`;

	return (
		<div className={fullWidth ? 'w-full' : ''}>
			{label && (
				<div className="flex items-center justify-between mb-1">
					<label className="block text-sm font-medium text-gray-300">
						{label}
						{showValue && props.value !== undefined && (
							<span className="ml-2 text-cyan-400">{props.value}</span>
						)}
					</label>
				</div>
			)}
			<div className="relative">
				<style>{trackStyle}</style>
				<input
					type="range"
					className={`${sliderClasses} ${className}`}
					disabled={disabled}
					{...props}
				/>
			</div>
			{helperText && (
				<p className={`text-xs mt-1 ${error ? 'text-red-400' : 'text-gray-500'}`}>
					{helperText}
				</p>
			)}
		</div>
	);
};
