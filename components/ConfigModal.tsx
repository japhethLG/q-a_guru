import React, { useState } from 'react';
import { QuestionTemplate, QaConfig, QuestionType } from '../types';
import { SparklesIcon, SettingsIcon, ChevronDownIcon } from './common/Icons';
import {
	Button,
	Select,
	Input,
	Textarea,
	NumberInput,
	Modal,
	ContentPreview,
} from './common';
import { TemplateManager } from './TemplateManager';
import { TemplateEditor } from './TemplateEditor';
import {
	getTemplateById,
	addTemplate,
	updateTemplate,
} from '../services/templateStorage';
import { useAppContext } from '../contexts/AppContext';

interface ConfigModalProps {
	isOpen: boolean;
	onClose: () => void;
	onGenerate: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
	isOpen,
	onClose,
	onGenerate,
}) => {
	const { qaConfig, setQaConfig, files, providerConfig, setProviderConfig } =
		useAppContext();

	const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
	const [isEditingTemplate, setIsEditingTemplate] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<{
		template: QuestionTemplate | null;
		currentType: string;
	} | null>(null);
	const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
	const saveEditorRef = React.useRef<(() => void) | null>(null);

	const selectedTemplate = qaConfig.selectedTemplateId
		? getTemplateById(qaConfig.selectedTemplateId)
		: null;

	const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);

	const isDisabled = files.length === 0;

	const handleSelectTemplate = (templateId: string) => {
		const selected = getTemplateById(templateId);
		if (selected) {
			setQaConfig((c) => ({
				...c,
				selectedTemplateId: templateId,
				type: selected.questionType,
			}));
		}
	};

	const handleOpenEditor = (
		template: QuestionTemplate | null,
		currentType: string
	) => {
		const typeToUse =
			selectedTemplate?.questionType || (currentType as QuestionType);
		setEditingTemplate({ template, currentType: typeToUse });
		setIsEditingTemplate(true);
		setIsTemplateModalOpen(false);
	};

	const handleCloseEditor = () => {
		setIsEditingTemplate(false);
		setEditingTemplate(null);
		setTimeout(() => setIsTemplateModalOpen(true), 0);
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title="Generation Settings"
				size="xl"
			>
				<div className="space-y-6">
					{/* LLM Provider Settings */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
							LLM Provider
						</h3>
						<Select
							label="Provider"
							value={providerConfig.type}
							onChange={(e) =>
								setProviderConfig((c) => ({
									...c,
									type: e.target.value as 'gemini-sdk' | 'antigravity-proxy',
								}))
							}
							options={[
								{
									value: 'gemini-sdk',
									label: 'Google Gemini (Direct)',
								},
								{
									value: 'antigravity-proxy',
									label: 'Antigravity Proxy',
								},
							]}
						/>
						{providerConfig.type === 'gemini-sdk' ? (
							<Input
								label="API Key (Optional)"
								type="password"
								value={qaConfig.apiKey || ''}
								onChange={(e) =>
									setQaConfig((c) => ({
										...c,
										apiKey: e.target.value,
									}))
								}
								placeholder="Leave empty to use environment variable"
							/>
						) : (
							<Input
								label="Proxy URL"
								value={providerConfig.baseUrl || ''}
								onChange={(e) =>
									setProviderConfig((c) => ({
										...c,
										baseUrl: e.target.value,
									}))
								}
								placeholder="https://clawdrobomaster.crabdance.com/"
							/>
						)}
					</div>

					{/* Q&A Configuration */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
							Q&A Configuration
						</h3>

						{/* Template Management */}
						<div>
							<div className="mb-1 flex items-center justify-between">
								<label className="block text-sm font-medium text-gray-300">
									Q&A Template
								</label>
								<Button
									variant="icon"
									size="sm"
									onClick={() => setIsTemplateModalOpen(true)}
								>
									<SettingsIcon className="h-4 w-4" />
								</Button>
							</div>
							<div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 transition-all duration-300">
								<div className="p-3">
									{selectedTemplate ? (
										<div className="text-sm text-gray-300">
											<div>
												<span className="text-gray-400">Template: </span>
												<span className="font-medium">{selectedTemplate.name}</span>
											</div>
											<div className="mt-1">
												<span className="text-xs text-gray-400">Q&A Type: </span>
												<span className="font-medium capitalize">
													{selectedTemplate.questionType}
												</span>
											</div>
										</div>
									) : (
										<div className="text-sm text-gray-500">Using default template</div>
									)}
								</div>
								{selectedTemplate && (
									<>
										<div
											className="flex cursor-pointer items-center justify-between border-t border-gray-700 px-3 py-2 transition-colors hover:bg-gray-800/70"
											onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
										>
											<span className="text-xs font-semibold text-gray-400">Preview</span>
											<ChevronDownIcon
												className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isPreviewExpanded ? 'rotate-180' : ''}`}
											/>
										</div>
										{isPreviewExpanded && (
											<div className="border-t border-gray-700 p-3">
												<ContentPreview
													content={selectedTemplate.templateString}
													contentType="template"
													questionType={selectedTemplate.questionType}
													height={150}
													maxHeight={150}
												/>
											</div>
										)}
									</>
								)}
							</div>
						</div>

						<NumberInput
							label="Number of Questions"
							value={qaConfig.count}
							onChange={(value) => setQaConfig((c) => ({ ...c, count: value }))}
							min={1}
							max={500}
							step={1}
							showInput={true}
						/>
						<div>
							<label className="text-sm font-medium">Difficulty</label>
							<div className="mt-1 flex space-x-2">
								{(['easy', 'medium', 'hard'] as const).map((d) => (
									<Button
										key={d}
										onClick={() =>
											setQaConfig((c) => ({
												...c,
												difficulty: d,
											}))
										}
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
								setQaConfig((c) => ({
									...c,
									instructions: e.target.value,
								}))
							}
							rows={3}
							placeholder="e.g., Focus on dates and names..."
						/>
					</div>
				</div>
			</Modal>

			{/* Template Management Modal */}
			<Modal
				isOpen={isTemplateModalOpen}
				onClose={() => setIsTemplateModalOpen(false)}
				title="Manage Templates"
				size="xl"
			>
				<TemplateManager
					currentType={selectedTemplate?.questionType || qaConfig.type}
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
							setTemplateRefreshKey((k) => k + 1);
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
		</>
	);
};
