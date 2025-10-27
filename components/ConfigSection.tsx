import React, { useState } from 'react';
import { QuestionTemplate, QaConfig } from '../types';
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
import { useAppContext } from '../contexts/AppContext';

interface ConfigSectionProps {
	onGenerate: () => void;
	onStop?: () => void;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
	onGenerate,
	onStop,
}) => {
	const { qaConfig, setQaConfig, files, isParsing, isGenerating } =
		useAppContext();

	const isDisabled = files.length === 0 || isParsing || isGenerating;
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
			className="flex min-h-0 flex-1 flex-col"
			contentClassName="flex-1 flex flex-col min-h-0"
		>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex-1 space-y-4 overflow-y-auto pr-2">
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
					<div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
						<div className="mb-2 flex items-center justify-between">
							<label className="text-sm font-medium">Output Template</label>
							<Button
								variant="icon"
								size="sm"
								onClick={() => setIsTemplateModalOpen(true)}
							>
								<SettingsIcon className="h-4 w-4" />
							</Button>
						</div>
						{selectedTemplate ? (
							<div className="text-sm text-gray-300">
								<div className="font-medium">{selectedTemplate.name}</div>
								<div className="mt-1 text-xs text-gray-500">
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
						<div className="mt-1 flex space-x-2">
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
					className="mt-4 w-full"
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
