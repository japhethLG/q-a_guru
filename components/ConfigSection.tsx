import React, { useState } from 'react';
import { QaConfig, QuestionTemplate } from '../types';
import { LoaderIcon, SparklesIcon, SettingsIcon } from './common/Icons';
import {
	Button,
	CollapsibleSection,
	Select,
	Input,
	Textarea,
	NumberInput,
	Modal,
} from './common';
import { TemplateManager } from './TemplateManager';
import { TemplateEditor } from './TemplateEditor';
import {
	getTemplateById,
	getTemplates,
	addTemplate,
	updateTemplate,
} from '../services/templateStorage';

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
	const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
	const [isEditingTemplate, setIsEditingTemplate] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<{
		template: QuestionTemplate | null;
		currentType: string;
	} | null>(null);
	const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
	const saveEditorRef = React.useRef<(() => void) | null>(null);

	const handleSelectTemplate = (templateId: string) => {
		const selectedTemplate = getTemplateById(templateId);
		if (selectedTemplate) {
			setQaConfig((c) => ({
				...c,
				selectedTemplateId: templateId,
				type: selectedTemplate.questionType,
				answerFormat: selectedTemplate.answerFormat,
			}));
		}
	};

	const handleOpenEditor = (
		template: QuestionTemplate | null,
		currentType: string
	) => {
		setEditingTemplate({ template, currentType });
		setIsEditingTemplate(true);
		setIsTemplateModalOpen(false); // Close the manager modal
	};

	const handleCloseEditor = () => {
		setIsEditingTemplate(false);
		setEditingTemplate(null);
		// Reopen the manager modal with updated templates
		setTimeout(() => setIsTemplateModalOpen(true), 0);
	};

	const selectedTemplate = qaConfig.selectedTemplateId
		? getTemplateById(qaConfig.selectedTemplateId)
		: null;

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

					{/* Template Management */}
					<div className="border border-gray-700 rounded-lg p-3 bg-gray-800/50">
						<div className="flex items-center justify-between mb-2">
							<label className="text-sm font-medium">Output Template</label>
							<Button
								variant="icon"
								size="sm"
								onClick={() => setIsTemplateModalOpen(true)}
							>
								<SettingsIcon className="w-4 h-4" />
							</Button>
						</div>
						{selectedTemplate ? (
							<div className="text-sm text-gray-300">
								<div className="font-medium">{selectedTemplate.name}</div>
								<div className="text-xs text-gray-500 mt-1">
									Format: {selectedTemplate.answerFormat}
								</div>
							</div>
						) : (
							<div className="text-sm text-gray-500">Using default template</div>
						)}
					</div>

					{selectedTemplate && (
						<Select
							label="Answer Format"
							options={[
								{ value: 'bold', label: 'Bold' },
								{ value: 'highlight', label: 'Highlight' },
								{ value: 'box', label: 'Box' },
							]}
							value={qaConfig.answerFormat || 'bold'}
							onChange={(e) =>
								setQaConfig((c) => ({
									...c,
									answerFormat: e.target.value as QaConfig['answerFormat'],
								}))
							}
						/>
					)}

					<NumberInput
						label="Number of Questions"
						value={qaConfig.count}
						onChange={(value) => setQaConfig((c) => ({ ...c, count: value }))}
						min={1}
						max={100}
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

			{/* Template Management Modal */}
			<Modal
				isOpen={isTemplateModalOpen}
				onClose={() => setIsTemplateModalOpen(false)}
				title="Manage Templates"
				size="xl"
			>
				<TemplateManager
					currentType={qaConfig.type}
					onSelectTemplate={handleSelectTemplate}
					selectedTemplateId={qaConfig.selectedTemplateId}
					onClose={() => setIsTemplateModalOpen(false)}
					onEdit={handleOpenEditor}
					refreshKey={templateRefreshKey}
				/>
			</Modal>

			{/* Edit Template Modal */}
			{isEditingTemplate && editingTemplate && (
				<Modal
					isOpen={isEditingTemplate}
					onClose={handleCloseEditor}
					title={editingTemplate.template?.id ? 'Edit Template' : 'New Template'}
					size="xl"
					footer={
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={handleCloseEditor}>
								Cancel
							</Button>
							<Button variant="primary" onClick={() => saveEditorRef.current?.()}>
								Save Template
							</Button>
						</div>
					}
				>
					<TemplateEditor
						template={
							editingTemplate.template?.id ? editingTemplate.template : undefined
						}
						questionType={editingTemplate.currentType as any}
						onSave={(templateData) => {
							if (editingTemplate.template?.id) {
								updateTemplate(editingTemplate.template.id, templateData);
							} else {
								const newTemplate: QuestionTemplate = {
									...templateData,
									id: crypto.randomUUID(),
								};
								addTemplate(newTemplate);
							}
							// Refresh the template list
							setTemplateRefreshKey((k) => k + 1);
							// Close editor and reopen manager
							setIsEditingTemplate(false);
							setEditingTemplate(null);
							setTimeout(() => setIsTemplateModalOpen(true), 0);
						}}
						onSaveRef={(handler) => {
							saveEditorRef.current = handler;
						}}
					/>
				</Modal>
			)}
		</CollapsibleSection>
	);
};
