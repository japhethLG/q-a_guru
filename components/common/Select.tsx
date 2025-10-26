import React, {
	SelectHTMLAttributes,
	useState,
	useRef,
	useEffect,
} from 'react';
import { ChevronDownIcon } from './Icons';

interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
	group?: string;
}

interface SelectProps
	extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
	options: SelectOption[];
	label?: string;
	placeholder?: string;
	size?: 'sm' | 'md' | 'lg';
	error?: boolean;
	helperText?: string;
	fullWidth?: boolean;
	required?: boolean;
}

export const Select: React.FC<SelectProps> = ({
	options,
	label,
	placeholder,
	size = 'md',
	error = false,
	helperText,
	fullWidth = true,
	required = false,
	className = '',
	disabled = false,
	...props
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedLabel, setSelectedLabel] = useState('');
	const selectRef = useRef<HTMLDivElement>(null);

	// Set initial selected label
	useEffect(() => {
		const selectedOption = options.find((opt) => opt.value === props.value);
		setSelectedLabel(selectedOption ? selectedOption.label : placeholder || '');
	}, [props.value, options, placeholder]);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			window.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			window.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isOpen]);

	const sizeClasses = {
		sm: 'text-xs px-2 py-1',
		md: 'text-sm px-3 py-2',
		lg: 'text-base px-4 py-3',
	};

	const baseClasses = `bg-gray-700 border rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all duration-200 flex items-center justify-between ${
		fullWidth ? 'w-full' : ''
	}`;
	const borderClass = error
		? 'border-red-500 focus:border-red-500'
		: 'border-gray-600 focus:border-cyan-500';
	const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : '';
	const hasValue = props.value && selectedLabel !== placeholder;

	const finalClassName =
		`${baseClasses} ${borderClass} ${sizeClasses[size]} ${disabledClass} ${className}`.trim();

	const handleOptionClick = (value: string) => {
		if (props.onChange) {
			const event = { target: { value } } as React.ChangeEvent<HTMLSelectElement>;
			props.onChange(event);
		}
		setIsOpen(false);
	};

	// Group options by group property if present
	const groupedOptions: Record<string, SelectOption[]> = options.reduce(
		(acc, option) => {
			const group = option.group || 'default';
			if (!acc[group]) acc[group] = [];
			acc[group].push(option);
			return acc;
		},
		{} as Record<string, SelectOption[]>
	);

	return (
		<div className={fullWidth ? 'w-full' : ''}>
			{label && (
				<label className="block text-sm font-medium text-gray-300 mb-1">
					{label}
					{required && <span className="text-red-400 ml-1">*</span>}
				</label>
			)}
			<div ref={selectRef} className="relative">
				<div
					className={`${finalClassName} ${!disabled ? 'cursor-pointer' : ''}`}
					onClick={() => !disabled && setIsOpen(!isOpen)}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							if (!disabled) setIsOpen(!isOpen);
						}
					}}
				>
					<span
						className={`flex-1 ${!hasValue ? 'text-gray-500' : 'text-gray-300'}`}
					>
						{selectedLabel || placeholder || 'Select...'}
					</span>
					<ChevronDownIcon
						className={`h-4 w-4 text-gray-400 transition-transform ${
							isOpen ? 'rotate-180' : ''
						}`}
					/>
				</div>

				{isOpen && !disabled && (
					<div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-2xl max-h-60 overflow-auto">
						{Object.entries(groupedOptions).map(([groupName, groupOptions]) => (
							<div key={groupName}>
								{groupName !== 'default' && (
									<div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase border-b border-gray-600">
										{groupName}
									</div>
								)}
								{groupOptions.map((option) => (
									<div
										key={option.value}
										onClick={() => !option.disabled && handleOptionClick(option.value)}
										className={`px-3 py-2 cursor-pointer transition-colors ${
											option.disabled
												? 'opacity-50 cursor-not-allowed'
												: 'hover:bg-gray-600'
										} ${
											option.value === props.value
												? 'bg-cyan-600/20 text-cyan-400'
												: 'text-gray-300'
										}`}
									>
										{option.label}
									</div>
								))}
							</div>
						))}
					</div>
				)}
			</div>
			{helperText && (
				<p className={`text-xs mt-1 ${error ? 'text-red-400' : 'text-gray-500'}`}>
					{helperText}
				</p>
			)}
		</div>
	);
};
