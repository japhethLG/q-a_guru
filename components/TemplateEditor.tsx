import React, { useState, useEffect } from 'react';
import { QuestionTemplate, QuestionType, AnswerFormat } from '../types';
import {
	getAvailableVariables,
	validateTemplate,
	previewTemplate,
} from '../services/templates';
import { Button, Select, Input, Textarea } from './common';
import { EditIcon } from './common/Icons';

interface TemplateEditorProps {
	template?: QuestionTemplate;
	questionType: QuestionType;
	onSave: (template: Omit<QuestionTemplate, 'id' | 'isDefault'>) => void;
	onCancel: () => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
	template,
	questionType,
	onSave,
	onCancel,
}) => {
	const [name, setName] = useState(template?.name || '');
	const [selectedType, setSelectedType] = useState<QuestionType>(
		template?.questionType || questionType
	);
	const [templateString, setTemplateString] = useState(
		template?.templateString || ''
	);
	const [answerFormat, setAnswerFormat] = useState<AnswerFormat>(
		template?.answerFormat || 'bold'
	);
	const [errors, setErrors] = useState<string[]>([]);

	const availableVariables = getAvailableVariables(selectedType);

	const insertVariable = (variable: string) => {
		setTemplateString((prev) => prev + variable);
	};

	const handleSave = () => {
		const newErrors: string[] = [];

		if (!name.trim()) {
			newErrors.push('Template name is required');
		}

		if (!templateString.trim()) {
			newErrors.push('Template content is required');
		}

		if (!validateTemplate(templateString)) {
			newErrors.push(
				'Template must include at least [question] or [statement] and an answer variable'
			);
		}

		if (newErrors.length > 0) {
			setErrors(newErrors);
			return;
		}

		onSave({
			name: name.trim(),
			questionType: selectedType,
			templateString: templateString.trim(),
			answerFormat,
		});
	};

	return (
		<div className="space-y-4">
			{/* Name Input */}
			<Input
				label="Template Name"
				value={name}
				onChange={(e) => {
					setName(e.target.value);
					setErrors([]);
				}}
				placeholder="e.g., Academic Format"
			/>

			{/* Question Type Selector */}
			<Select
				label="Question Type"
				value={selectedType}
				onChange={(e) => {
					setSelectedType(e.target.value as QuestionType);
					setErrors([]);
				}}
				options={[
					{ value: 'multiple choice', label: 'Multiple Choice' },
					{ value: 'true/false', label: 'True/False' },
					{ value: 'short answer', label: 'Short Answer' },
					{ value: 'essay', label: 'Essay' },
					{ value: 'mixed', label: 'Mixed' },
				]}
			/>

			{/* Errors */}
			{errors.length > 0 && (
				<div className="bg-red-500/10 border border-red-500/50 rounded p-3">
					<ul className="list-disc list-inside text-sm text-red-400 space-y-1">
						{errors.map((error, idx) => (
							<li key={idx}>{error}</li>
						))}
					</ul>
				</div>
			)}

			{/* Template Content */}
			<div>
				<label className="block text-sm font-medium mb-2">Template Content</label>
				<div className="flex gap-4">
					{/* Help Sidebar */}
					<div className="w-80 flex-shrink-0">
						<div className="bg-gray-700/50 rounded-lg p-4 space-y-4 max-h-[600px] overflow-y-auto">
							<div>
								<h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
									<EditIcon className="w-4 h-4" />
									Available Variables
								</h4>
								<div className="space-y-2 max-h-60 overflow-y-auto mb-4">
									{availableVariables.map(({ variable, description }) => (
										<div key={variable} className="text-xs">
											<button
												onClick={() => insertVariable(variable)}
												className="text-cyan-400 hover:text-cyan-300 font-mono bg-gray-800 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
											>
												{variable}
											</button>
											<span className="text-gray-400 ml-2">{description}</span>
										</div>
									))}
								</div>
							</div>

							{/* Formatting Help */}
							<div className="border-t border-gray-600 pt-4">
								<h4 className="text-sm font-semibold text-white mb-2">
									Formatting Instructions
								</h4>
								<div className="space-y-3 text-xs text-gray-400">
									<div>
										<div className="text-cyan-400 font-medium mb-1">New Line (↵)</div>
										<div className="text-gray-500">
											Press <kbd className="bg-gray-800 px-1 rounded">Enter</kbd> in the
											textarea to create a new line
										</div>
									</div>
									<div>
										<div className="text-cyan-400 font-medium mb-1">Tab (⇥)</div>
										<div className="text-gray-500">
											Press <kbd className="bg-gray-800 px-1 rounded">Tab</kbd> key for
											indentation (4 spaces)
										</div>
									</div>
									<div>
										<div className="text-cyan-400 font-medium mb-1">Spaces</div>
										<div className="text-gray-500">
											Regular spaces for spacing between elements
										</div>
									</div>
									<div>
										<div className="text-cyan-400 font-medium mb-1">HTML Tags</div>
										<div className="text-gray-500 space-y-1">
											Use <code className="bg-gray-800 px-1 rounded">{'<p>'}</code> for
											paragraphs (wraps content)
											<br />
											Use <code className="bg-gray-800 px-1 rounded">
												{'<strong>'}
											</code> or <code className="bg-gray-800 px-1 rounded">{'<b>'}</code>{' '}
											for bold
											<br />
											Use <code className="bg-gray-800 px-1 rounded">{'<i>'}</code> for
											italic
											<br />
											Use <code className="bg-gray-800 px-1 rounded">{'<br>'}</code> for
											line break
										</div>
									</div>
								</div>
							</div>

							{/* Quick Actions */}
							<div className="border-t border-gray-600 pt-4">
								<h4 className="text-sm font-semibold text-white mb-2">Quick Insert</h4>
								<div className="space-y-2">
									<Button
										variant="secondary"
										size="sm"
										className="w-full text-xs"
										onClick={() => setTemplateString((prev) => prev + '\n')}
									>
										Insert New Line
									</Button>
									<Button
										variant="secondary"
										size="sm"
										className="w-full text-xs"
										onClick={() => setTemplateString((prev) => prev + '\t')}
									>
										Insert Tab
									</Button>
								</div>
							</div>
						</div>
					</div>

					{/* Template Textarea */}
					<div className="flex-1">
						<Textarea
							value={templateString}
							onChange={(e) => {
								setTemplateString(e.target.value);
								setErrors([]);
							}}
							placeholder="Enter your template here. Use variables like [number], [question], [answer], etc."
							rows={12}
							className="font-mono text-sm"
						/>
					</div>
				</div>
			</div>

			{/* Answer Format Selector */}
			<div>
				<label className="block text-sm font-medium mb-2">Answer Format</label>
				<div className="flex gap-2">
					{(['bold', 'highlight', 'box'] as AnswerFormat[]).map((format) => (
						<Button
							key={format}
							onClick={() => setAnswerFormat(format)}
							variant={answerFormat === format ? 'primary' : 'secondary'}
						>
							{format.charAt(0).toUpperCase() + format.slice(1)}
						</Button>
					))}
				</div>
			</div>

			{/* Preview */}
			<div>
				<label className="block text-sm font-medium mb-2">Preview</label>
				<div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-60 overflow-y-auto">
					<div
						className="text-sm text-gray-300 prose prose-invert max-w-none"
						dangerouslySetInnerHTML={{
							__html: previewTemplate(templateString, selectedType),
						}}
					/>
				</div>
			</div>

			{/* Actions */}
			<div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
				<Button variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
				<Button variant="primary" onClick={handleSave}>
					Save Template
				</Button>
			</div>
		</div>
	);
};
