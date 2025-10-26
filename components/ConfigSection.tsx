import React from 'react';
import { QaConfig } from '../types';
import { LoaderIcon, SparklesIcon } from './Icons';
import { CollapsibleSection } from './CollapsibleSection';

interface ConfigSectionProps {
	qaConfig: QaConfig;
	setQaConfig: React.Dispatch<React.SetStateAction<QaConfig>>;
	onGenerate: () => void;
	isGenerating: boolean;
	isDisabled: boolean;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
	qaConfig,
	setQaConfig,
	onGenerate,
	isGenerating,
	isDisabled,
}) => {
	return (
		<CollapsibleSection title="2. Configure Q&A">
			<div className="space-y-4">
				<div>
					<label className="text-sm font-medium">API Key (Optional)</label>
					<input
						type="password"
						value={qaConfig.apiKey || ''}
						onChange={(e) => setQaConfig((c) => ({ ...c, apiKey: e.target.value }))}
						className="w-full mt-1 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
						placeholder="Leave empty to use environment variable"
					/>
				</div>
				<div>
					<label className="text-sm font-medium">Question Type</label>
					<select
						value={qaConfig.type}
						onChange={(e) =>
							setQaConfig((c) => ({ ...c, type: e.target.value as QaConfig['type'] }))
						}
						className="w-full mt-1 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
					>
						<option>mixed</option>
						<option>multiple choice</option>
						<option>true/false</option>
						<option>short answer</option>
						<option>essay</option>
					</select>
				</div>
				<div>
					<label className="text-sm font-medium">
						Number of Questions: {qaConfig.count}
					</label>
					<input
						type="range"
						min="1"
						max="20"
						value={qaConfig.count}
						onChange={(e) => setQaConfig((c) => ({ ...c, count: +e.target.value }))}
						className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
					/>
				</div>
				<div>
					<label className="text-sm font-medium">Difficulty</label>
					<div className="flex space-x-2 mt-1">
						{(['easy', 'medium', 'hard'] as const).map((d) => (
							<button
								key={d}
								onClick={() => setQaConfig((c) => ({ ...c, difficulty: d }))}
								className={`flex-1 py-1 text-sm rounded-md transition ${qaConfig.difficulty === d ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
							>
								{d}
							</button>
						))}
					</div>
				</div>
				<div>
					<label className="text-sm font-medium">Additional Instructions</label>
					<textarea
						value={qaConfig.instructions}
						onChange={(e) =>
							setQaConfig((c) => ({ ...c, instructions: e.target.value }))
						}
						className="w-full mt-1 h-20 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
						placeholder="e.g., Focus on dates and names..."
					></textarea>
				</div>
				<button
					onClick={onGenerate}
					disabled={isDisabled}
					className="w-full flex justify-center items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-all duration-200"
				>
					{isGenerating ? (
						<LoaderIcon className="h-5 w-5" />
					) : (
						<SparklesIcon className="h-5 w-5" />
					)}
					{isGenerating ? 'Generating...' : 'Generate Q&A'}
				</button>
			</div>
		</CollapsibleSection>
	);
};
