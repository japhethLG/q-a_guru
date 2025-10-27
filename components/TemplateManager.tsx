import React, { useState } from 'react';
import { QuestionTemplate, QuestionType } from '../types';
import { getTemplates, deleteTemplate } from '../services/templateStorage';
import { Button } from './common';
import { EditIcon, TrashIcon, CheckIcon, XIcon } from './common/Icons';

interface TemplateManagerProps {
	currentType: QuestionType;
	onSelectTemplate: (templateId: string) => void;
	selectedTemplateId?: string;
	onClose: () => void;
	onEdit: (template: QuestionTemplate | null, currentType: string) => void;
	refreshKey?: number;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
	currentType,
	onSelectTemplate,
	selectedTemplateId,
	onClose,
	onEdit,
	refreshKey,
}) => {
	const [templates, setTemplates] = React.useState(getTemplates());

	// Refresh templates when refreshKey changes
	React.useEffect(() => {
		if (refreshKey !== undefined) {
			setTemplates(getTemplates());
		}
	}, [refreshKey]);

	const handleDelete = (id: string) => {
		if (confirm('Are you sure you want to delete this template?')) {
			try {
				deleteTemplate(id);
				setTemplates(getTemplates());
			} catch (error) {
				alert(
					error instanceof Error ? error.message : 'Cannot delete default templates'
				);
			}
		}
	};

	const handleEdit = (template: QuestionTemplate) => {
		onEdit(template, currentType);
		onClose(); // Close the manager modal
	};

	const groupedTemplates = templates.reduce(
		(acc, template) => {
			if (!acc[template.questionType]) {
				acc[template.questionType] = [];
			}
			acc[template.questionType].push(template);
			return acc;
		},
		{} as Record<QuestionType, QuestionTemplate[]>
	);

	return (
		<>
			<div className="space-y-4">
				{/* Header */}
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold text-white">Manage Templates</h3>
					<Button
						variant="primary"
						size="sm"
						onClick={() => {
							const newTemplate: QuestionTemplate = {
								id: '',
								name: '',
								questionType: currentType,
								templateString: '',
								answerFormat: 'bold',
							};
							handleEdit(newTemplate);
						}}
					>
						New Template
					</Button>
				</div>

				{/* Templates by Type */}
				<div className="space-y-4">
					{Object.entries(groupedTemplates).map(
						([type, templates]: [string, QuestionTemplate[]]) => (
							<div
								key={type}
								className="overflow-hidden rounded-lg border border-gray-700"
							>
								<div className="border-b border-gray-700 bg-gray-700/50 px-4 py-2">
									<h4 className="font-medium text-white capitalize">{type}</h4>
								</div>
								<div className="divide-y divide-gray-700">
									{templates.map((template) => (
										<div
											key={template.id}
											className="flex items-center justify-between p-4 transition-colors hover:bg-gray-800"
										>
											<div className="flex items-center gap-3">
												{selectedTemplateId === template.id && (
													<CheckIcon className="h-5 w-5 text-cyan-500" />
												)}
												<div>
													<div className="font-medium text-white">
														{template.name}
														{template.isDefault && (
															<span className="ml-2 text-xs text-gray-400">(Default)</span>
														)}
													</div>
													<div className="max-w-md truncate font-mono text-xs text-gray-400">
														{template.templateString.split('\n')[0]}...
													</div>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{selectedTemplateId !== template.id && (
													<Button
														variant="secondary"
														size="sm"
														onClick={() => onSelectTemplate(template.id)}
													>
														Select
													</Button>
												)}
												<Button
													variant="icon"
													size="sm"
													onClick={() => handleEdit(template)}
												>
													<EditIcon className="h-4 w-4" />
												</Button>
												<Button
													variant="icon"
													size="sm"
													onClick={() => handleDelete(template.id)}
													disabled={template.isDefault}
												>
													<TrashIcon className="h-4 w-4" />
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						)
					)}
				</div>
			</div>
		</>
	);
};
