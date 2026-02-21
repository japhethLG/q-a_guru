import React from 'react';
import { Select } from './Select';
import { useGeminiModels } from '../../hooks/useGeminiModels';

interface ModelPickerProps {
	value: string;
	onChange: (model: string) => void;
	label?: string;
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	dropdownDirection?: 'down' | 'up';
}

/**
 * Shared model picker that dynamically fetches available Gemini models.
 * Used by both the editor (ConfigSection) and chat (ChatHeader) sections.
 */
export const ModelPicker: React.FC<ModelPickerProps> = ({
	value,
	onChange,
	label = 'Model',
	size = 'md',
	disabled = false,
	dropdownDirection = 'up',
}) => {
	const { models, isLoading } = useGeminiModels();

	return (
		<Select
			label={label}
			size={size}
			options={models}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled || isLoading}
			helperText={isLoading ? 'Loading models…' : undefined}
			dropdownDirection={dropdownDirection}
		/>
	);
};
