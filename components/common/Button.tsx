import React from 'react';
import { LoaderIcon } from './Icons';

type ButtonVariant = 'primary' | 'secondary' | 'icon' | 'danger';
type ButtonSize = 'sm' | 'md' | 'base' | 'lg';
type IconPosition = 'left' | 'right';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	icon?: React.ReactNode;
	iconPosition?: IconPosition;
	children?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
	primary: 'bg-cyan-600 hover:bg-cyan-700 text-white',
	secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
	icon: 'bg-transparent hover:bg-gray-700 text-gray-400',
	danger: 'bg-red-600 hover:bg-red-700 text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: 'px-2 py-1 text-xs',
	md: 'px-3 py-2 text-sm',
	base: 'px-4 py-2 text-base',
	lg: 'px-4 py-2 text-lg',
};

export const Button: React.FC<ButtonProps> = ({
	variant = 'primary',
	size = 'md',
	loading = false,
	disabled = false,
	icon,
	iconPosition = 'left',
	children,
	className = '',
	...props
}) => {
	const baseClasses =
		'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

	const variantClass = variantClasses[variant];
	const sizeClass = sizeClasses[size];

	// For icon variant, adjust size classes
	const adjustedSizeClass =
		variant === 'icon' ? (size === 'sm' ? 'p-1' : 'p-2') : sizeClass;

	const finalClassName =
		`${baseClasses} ${variantClass} ${adjustedSizeClass} ${className}`.trim();

	return (
		<button disabled={disabled || loading} className={finalClassName} {...props}>
			{loading ? (
				<LoaderIcon className="size-4" />
			) : (
				<>
					{icon && iconPosition === 'left' && icon}
					{children}
					{icon && iconPosition === 'right' && icon}
				</>
			)}
		</button>
	);
};
