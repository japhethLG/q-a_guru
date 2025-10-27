import React, { useState, useEffect } from 'react';

interface NumberInputProps {
	label?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	presets?: number[];
	showSlider?: boolean;
	showInput?: boolean;
	showPresets?: boolean;
	disabled?: boolean;
	error?: boolean;
	helperText?: string;
	className?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
	label,
	value,
	onChange,
	min = 1,
	max,
	step = 1,
	presets = [5, 10, 15, 20, 25, 30],
	showSlider = false,
	showInput = false,
	showPresets = false,
	disabled = false,
	error = false,
	helperText,
	className = '',
}) => {
	const [inputValue, setInputValue] = useState<string>(value.toString());
	const [isFocused, setIsFocused] = useState(false);

	// Sync inputValue with value prop
	useEffect(() => {
		if (!isFocused) {
			setInputValue(value.toString());
		}
	}, [value, isFocused]);

	const handlePresetClick = (preset: number) => {
		const clampedValue =
			max !== undefined
				? Math.max(min, Math.min(max, preset))
				: Math.max(min, preset);
		onChange(clampedValue);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setInputValue(newValue);

		// Allow empty during typing
		if (newValue === '') {
			return;
		}

		const numValue = parseFloat(newValue);
		if (!isNaN(numValue)) {
			const clampedValue =
				max !== undefined
					? Math.max(min, Math.min(max, numValue))
					: Math.max(min, numValue);
			onChange(Math.round(clampedValue / step) * step);
		}
	};

	const handleInputBlur = () => {
		setIsFocused(false);
		// Ensure value is within bounds
		const numValue = parseFloat(inputValue) || min;
		const clampedValue =
			max !== undefined
				? Math.max(min, Math.min(max, numValue))
				: Math.max(min, numValue);
		setInputValue(clampedValue.toString());
		onChange(Math.round(clampedValue / step) * step);
	};

	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = parseFloat(e.target.value);
		onChange(newValue);
	};

	const handleIncrement = () => {
		const newValue =
			max !== undefined ? Math.min(max, value + step) : value + step;
		onChange(newValue);
	};

	const handleDecrement = () => {
		const newValue = Math.max(min, value - step);
		onChange(newValue);
	};

	// Filter presets to only show those within min/max range
	const availablePresets =
		max !== undefined
			? presets.filter((p) => p >= min && p <= max)
			: presets.filter((p) => p >= min);

	const inputOnlyClassName = `
		w-full pr-10 py-2 rounded-md text-sm
		bg-gray-700 border transition-all duration-200
		disabled:opacity-50 disabled:cursor-not-allowed
		${
			error
				? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
				: 'border-gray-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
		}
		text-gray-300 placeholder-gray-500 outline-none
		[-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
	`;

	return (
		<div className={`space-y-3 ${className}`}>
			{label && (
				<div className="flex items-center justify-between">
					<label className="text-sm font-medium text-gray-300">{label}</label>
					<span className="text-xs text-gray-500">
						{max !== undefined ? `${min} - ${max}` : `≥ ${min}`}
					</span>
				</div>
			)}

			{/* Input Only Mode */}
			{showInput && !showPresets && (
				<div className="relative">
					<input
						type="number"
						value={inputValue}
						onChange={handleInputChange}
						onFocus={() => setIsFocused(true)}
						onBlur={handleInputBlur}
						min={min}
						max={max}
						step={step}
						disabled={disabled}
						className={`${inputOnlyClassName} px-3`}
						placeholder="Enter number"
					/>
					<div className="absolute top-0 right-2 bottom-0 flex flex-col items-center justify-center">
						<button
							type="button"
							onClick={handleIncrement}
							disabled={disabled || (max !== undefined && value >= max)}
							className={`flex h-3 w-5 items-center justify-center ${disabled || (max !== undefined && value >= max) ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-gray-600'} rounded-t transition-colors duration-150`}
							tabIndex={-1}
						>
							<svg
								className="h-3 w-3 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 15l7-7 7 7"
								/>
							</svg>
						</button>
						<div className="h-px w-5 bg-gray-600"></div>
						<button
							type="button"
							onClick={handleDecrement}
							disabled={disabled || value <= min}
							className={`flex h-3 w-5 items-center justify-center ${disabled || value <= min ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-gray-600'} rounded-b transition-colors duration-150`}
							tabIndex={-1}
						>
							<svg
								className="h-3 w-3 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>
					</div>
				</div>
			)}

			{/* Preset Quick Select Buttons */}
			{showPresets && availablePresets.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{availablePresets.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => handlePresetClick(preset)}
							disabled={disabled}
							className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
								value === preset
									? 'bg-cyan-600 text-white hover:bg-cyan-700'
									: 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
							} `}
						>
							{preset}
						</button>
					))}
					{/* Custom Input Button - shown alongside presets */}
					{showInput && (
						<div className="relative min-w-[120px] flex-1">
							<input
								type="number"
								value={inputValue}
								onChange={handleInputChange}
								onFocus={() => setIsFocused(true)}
								onBlur={handleInputBlur}
								min={min}
								max={max}
								step={step}
								disabled={disabled}
								className={`w-full rounded-md border bg-gray-700 px-3 py-1.5 pr-8 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
									error
										? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
										: 'border-gray-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
								} text-gray-300 placeholder-gray-500 outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
								placeholder="Custom"
							/>
							<div className="absolute top-0 right-1.5 bottom-0 flex flex-col items-center justify-center">
								<button
									type="button"
									onClick={handleIncrement}
									disabled={disabled || (max !== undefined && value >= max)}
									className={`flex h-2.5 w-4 items-center justify-center ${disabled || (max !== undefined && value >= max) ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-gray-600'} rounded-t transition-colors duration-150`}
									tabIndex={-1}
								>
									<svg
										className="h-2.5 w-2.5 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M5 15l7-7 7 7"
										/>
									</svg>
								</button>
								<div className="h-px w-4 bg-gray-600"></div>
								<button
									type="button"
									onClick={handleDecrement}
									disabled={disabled || value <= min}
									className={`flex h-2.5 w-4 items-center justify-center ${disabled || value <= min ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-gray-600'} rounded-b transition-colors duration-150`}
									tabIndex={-1}
								>
									<svg
										className="h-2.5 w-2.5 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Range Slider */}
			{showSlider && max !== undefined && (
				<div>
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={value}
						onChange={handleSliderChange}
						disabled={disabled}
						className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-700 accent-cyan-500 transition-colors outline-none hover:accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
					/>
					<div className="mt-1 flex justify-between text-xs text-gray-500">
						<span>{min}</span>
						<span className="font-medium text-cyan-400">{value}</span>
						<span>{max}</span>
					</div>
				</div>
			)}

			{helperText && (
				<p className={`text-xs ${error ? 'text-red-400' : 'text-gray-500'}`}>
					{helperText}
				</p>
			)}
		</div>
	);
};
