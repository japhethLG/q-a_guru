import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from 'react';
import type { Editor as TinyMCEInstance } from 'tinymce';
import { QuestionTemplate, QuestionType } from '../types';
import { getAvailableVariables, validateTemplate } from '../services/templates';
import { Button, Select, Input, TinyMCEEditor } from './common';
import { EditIcon, ChevronDownIcon, ChevronUpIcon } from './common/Icons';

interface TemplateEditorProps {
	template?: QuestionTemplate;
	questionType: QuestionType;
	onSave: (template: Omit<QuestionTemplate, 'id' | 'isDefault'>) => void;
	onSaveRef?: (saveHandler: () => void) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
	template,
	questionType,
	onSave,
	onSaveRef,
}) => {
	const [name, setName] = useState(template?.name || '');
	const [selectedType, setSelectedType] = useState<QuestionType>(
		template?.questionType || questionType
	);
	const [templateString, setTemplateString] = useState(
		template?.templateString || ''
	);
	const [errors, setErrors] = useState<string[]>([]);
	const [expandedSection, setExpandedSection] = useState<'variables' | null>(
		'variables'
	);

	const editorRef = useRef<TinyMCEInstance | null>(null);

	const availableVariables = useMemo(
		() => getAvailableVariables(selectedType),
		[selectedType]
	);

	const insertAtCursor = useCallback((text: string) => {
		const editor = editorRef.current;
		if (editor) {
			editor.selection.setContent(text);
			editor.focus();
		} else {
			// Fallback to appending if ref not available
			setTemplateString((prev) => prev + text);
		}
	}, []);

	const insertVariable = useCallback(
		(variable: string) => {
			insertAtCursor(variable);
		},
		[insertAtCursor]
	);

	const handleSave = useCallback(() => {
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
		});
	}, [name, selectedType, templateString, onSave]);

	const handleNameChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setName(e.target.value);
			setErrors([]);
		},
		[]
	);

	const handleTypeChange = useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			setSelectedType(e.target.value as QuestionType);
			setErrors([]);
		},
		[]
	);

	const handleTemplateChange = useCallback((content: string) => {
		setTemplateString(content);
		setErrors([]);
	}, []);

	// Expose handleSave to parent via callback ref
	useEffect(() => {
		if (onSaveRef) {
			onSaveRef(handleSave);
		}
	}, [handleSave, onSaveRef]);

	return (
		<div className="space-y-6">
			{/* Header Section */}
			<div className="grid grid-cols-2 gap-4">
				<Input
					label="Template Name"
					value={name}
					onChange={handleNameChange}
					placeholder="e.g., Academic Format"
				/>
				<Select
					label="Question Type"
					value={selectedType}
					onChange={handleTypeChange}
					options={[
						{ value: 'multiple choice', label: 'Multiple Choice' },
						{ value: 'true/false', label: 'True/False' },
						{ value: 'short answer', label: 'Short Answer' },
						{ value: 'essay', label: 'Essay' },
						{ value: 'mixed', label: 'Mixed' },
					]}
				/>
			</div>

			{/* Errors */}
			{errors.length > 0 && (
				<div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
					<ul className="list-inside list-disc space-y-1 text-sm text-red-400">
						{errors.map((error, idx) => (
							<li key={idx}>{error}</li>
						))}
					</ul>
				</div>
			)}

			{/* Main Content Area */}
			<div className="space-y-4">
				<label className="block text-sm font-semibold text-white">
					Template Content
				</label>
				<div className="flex gap-4">
					{/* Help Sidebar */}
					<div className="w-72 shrink-0">
						<div className="sticky top-4 space-y-2">
							{/* Available Variables */}
							<div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50">
								<button
									onClick={() =>
										setExpandedSection(
											expandedSection === 'variables' ? null : 'variables'
										)
									}
									className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-700/50"
								>
									<h4 className="flex items-center gap-2 text-sm font-semibold text-white">
										<EditIcon className="h-4 w-4 text-cyan-400" />
										Available Variables
									</h4>
									{expandedSection === 'variables' ? (
										<ChevronUpIcon className="h-4 w-4 text-gray-400" />
									) : (
										<ChevronDownIcon className="h-4 w-4 text-gray-400" />
									)}
								</button>
								{expandedSection === 'variables' && (
									<div className="max-h-64 space-y-2 overflow-y-auto p-4">
										{availableVariables.map(({ variable, description }) => (
											<div key={variable} className="group">
												<button
													onClick={() => insertVariable(variable)}
													className="rounded bg-gray-700 px-2 py-1 font-mono text-xs text-cyan-400 transition-all hover:bg-gray-600 hover:text-cyan-300"
												>
													{variable}
												</button>
												<span className="ml-2 text-xs text-gray-400">{description}</span>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Template Editor */}
					<div className="flex-1">
						<TinyMCEEditor
							value={templateString}
							onChange={handleTemplateChange}
							onInit={(editor) => {
								editorRef.current = editor;
							}}
							height={500}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
