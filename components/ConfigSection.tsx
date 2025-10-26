import React from 'react';
import { QaConfig } from '../types';
import { LoaderIcon, SparklesIcon } from './common/Icons';
import {
	Button,
	CollapsibleSection,
	Select,
	Input,
	Textarea,
	NumberInput,
} from './common';

interface ConfigSectionProps {
	qaConfig: QaConfig;
	setQaConfig: React.Dispatch<React.SetStateAction<QaConfig>>;
	onGenerate: () => void;
	onStop?: () => void;
	isGenerating: boolean;
	isDisabled: boolean;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
	qaConfig,
	setQaConfig,
	onGenerate,
	onStop,
	isGenerating,
	isDisabled,
}) => {
	return (
		<CollapsibleSection
			title="2. Configure Q&A"
			className="flex-1 min-h-0 flex flex-col"
			contentClassName="flex-1 flex flex-col min-h-0"
		>
			<div className="flex-1 flex flex-col min-h-0">
				<div className="space-y-4 overflow-y-auto flex-1 pr-2">
					<Input
						label="API Key (Optional)"
						type="password"
						value={qaConfig.apiKey || ''}
						onChange={(e) => setQaConfig((c) => ({ ...c, apiKey: e.target.value }))}
						placeholder="Leave empty to use environment variable"
					/>
					<Select
						label="Model"
						options={[
							{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
							{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
							{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
						]}
						value={qaConfig.model}
						onChange={(e) =>
							setQaConfig((c) => ({
								...c,
								model: e.target.value as QaConfig['model'],
							}))
						}
					/>
					<Select
						label="Question Type"
						options={[
							{ value: 'mixed', label: 'Mixed' },
							{ value: 'multiple choice', label: 'Multiple Choice' },
							{ value: 'true/false', label: 'True/False' },
							{ value: 'short answer', label: 'Short Answer' },
							{ value: 'essay', label: 'Essay' },
						]}
						value={qaConfig.type}
						onChange={(e) =>
							setQaConfig((c) => ({ ...c, type: e.target.value as QaConfig['type'] }))
						}
					/>
					<NumberInput
						label="Number of Questions"
						value={qaConfig.count}
						onChange={(value) => setQaConfig((c) => ({ ...c, count: value }))}
						min={1}
						step={1}
						showInput={true}
					/>
					<div>
						<label className="text-sm font-medium">Difficulty</label>
						<div className="flex space-x-2 mt-1">
							{(['easy', 'medium', 'hard'] as const).map((d) => (
								<Button
									key={d}
									onClick={() => setQaConfig((c) => ({ ...c, difficulty: d }))}
									variant={qaConfig.difficulty === d ? 'primary' : 'secondary'}
									className="flex-1"
								>
									{d}
								</Button>
							))}
						</div>
					</div>
					<Textarea
						label="Additional Instructions"
						value={qaConfig.instructions}
						onChange={(e) =>
							setQaConfig((c) => ({ ...c, instructions: e.target.value }))
						}
						rows={3}
						placeholder="e.g., Focus on dates and names..."
					/>
				</div>
				<Button
					variant={isGenerating && onStop ? 'danger' : 'primary'}
					disabled={isGenerating && onStop ? false : isDisabled}
					loading={isGenerating && !onStop}
					onClick={isGenerating && onStop ? onStop : onGenerate}
					icon={
						isGenerating && onStop ? null : isGenerating ? (
							<LoaderIcon className="h-5 w-5" />
						) : (
							<SparklesIcon className="h-5 w-5" />
						)
					}
					className="w-full mt-4"
				>
					{isGenerating && onStop
						? 'Stop Generation'
						: isGenerating
							? 'Generating...'
							: 'Generate Q&A'}
				</Button>
			</div>
		</CollapsibleSection>
	);
};
