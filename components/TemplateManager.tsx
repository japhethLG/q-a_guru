import React, { useState } from 'react';
import { QuestionTemplate, QuestionType } from '../types';
import {
	getTemplates,
	saveTemplates,
	deleteTemplate,
	addTemplate,
	updateTemplate,
} from '../services/templateStorage';
import { Button, Modal } from './common';
import { EditIcon, TrashIcon, CheckIcon, XIcon } from './common/Icons';
import { TemplateEditor } from './TemplateEditor';

interface TemplateManagerProps {
	currentType: QuestionType;
	onSelectTemplate: (templateId: string) => void;
	selectedTemplateId?: string;
	onClose: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
	currentType,
	onSelectTemplate,
	selectedTemplateId,
	onClose,
}) => {
	const [templates, setTemplates] = React.useState(getTemplates());
	const [isEditing, setIsEditing] = useState(false);
	const [editingTemplate, setEditingTemplate] =
		useState<QuestionTemplate | null>(null);

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
		setEditingTemplate(template);
		setIsEditing(true);
	};

	const handleCloseEditor = () => {
		setIsEditing(false);
		setEditingTemplate(null);
		setTemplates(getTemplates());
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
							setEditingTemplate({
								id: '',
								name: '',
								questionType: currentType,
								templateString: '',
								answerFormat: 'bold',
							});
							setIsEditing(true);
						}}
					>
						New Template
					</Button>
				</div>

				{/* Templates by Type */}
				<div className="space-y-4">
					{Object.entries(groupedTemplates).map(([type, templates]) => (
						<div
							key={type}
							className="border border-gray-700 rounded-lg overflow-hidden"
						>
							<div className="bg-gray-700/50 px-4 py-2 border-b border-gray-700">
								<h4 className="font-medium text-white capitalize">{type}</h4>
							</div>
							<div className="divide-y divide-gray-700">
								{templates.map((template) => (
									<div
										key={template.id}
										className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
									>
										<div className="flex items-center gap-3">
											{selectedTemplateId === template.id && (
												<CheckIcon className="w-5 h-5 text-cyan-500" />
											)}
											<div>
												<div className="font-medium text-white">
													{template.name}
													{template.isDefault && (
														<span className="text-xs text-gray-400 ml-2">(Default)</span>
													)}
												</div>
												<div className="text-xs text-gray-400 font-mono truncate max-w-md">
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
												<EditIcon className="w-4 h-4" />
											</Button>
											<Button
												variant="icon"
												size="sm"
												onClick={() => handleDelete(template.id)}
												disabled={template.isDefault}
											>
												<TrashIcon className="w-4 h-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Edit/New Template Modal */}
			{isEditing && editingTemplate && (
				<Modal
					isOpen={isEditing}
					onClose={handleCloseEditor}
					title={editingTemplate.id ? 'Edit Template' : 'New Template'}
					size="xl"
					footer={
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={handleCloseEditor}>
								Cancel
							</Button>
						</div>
					}
				>
					<TemplateEditor
						template={editingTemplate.id ? editingTemplate : undefined}
						questionType={currentType}
						onSave={(templateData) => {
							if (editingTemplate.id) {
								updateTemplate(editingTemplate.id, templateData);
							} else {
								const newTemplate: QuestionTemplate = {
									...templateData,
									id: crypto.randomUUID(),
								};
								addTemplate(newTemplate);
							}
							setTemplates(getTemplates());
							handleCloseEditor();
						}}
						onCancel={handleCloseEditor}
					/>
				</Modal>
			)}
		</>
	);
};
