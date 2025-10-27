import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from 'react';
import type { Editor as TinyMCEInstance } from 'tinymce';
import { QuestionTemplate, QuestionType, AnswerFormat } from '../types';
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
	const [answerFormat, setAnswerFormat] = useState<AnswerFormat>(
		template?.answerFormat || 'bold'
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
			answerFormat,
		});
	}, [name, selectedType, templateString, answerFormat, onSave]);

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

	const handleAnswerFormatChange = useCallback((format: AnswerFormat) => {
		setAnswerFormat(format);
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
				<div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
					<ul className="list-disc list-inside text-sm text-red-400 space-y-1">
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
						<div className="space-y-2 sticky top-4">
							{/* Available Variables */}
							<div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
								<button
									onClick={() =>
										setExpandedSection(
											expandedSection === 'variables' ? null : 'variables'
										)
									}
									className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
								>
									<h4 className="text-sm font-semibold text-white flex items-center gap-2">
										<EditIcon className="w-4 h-4 text-cyan-400" />
										Available Variables
									</h4>
									{expandedSection === 'variables' ? (
										<ChevronUpIcon className="w-4 h-4 text-gray-400" />
									) : (
										<ChevronDownIcon className="w-4 h-4 text-gray-400" />
									)}
								</button>
								{expandedSection === 'variables' && (
									<div className="p-4 space-y-2 max-h-64 overflow-y-auto">
										{availableVariables.map(({ variable, description }) => (
											<div key={variable} className="group">
												<button
													onClick={() => insertVariable(variable)}
													className="text-cyan-400 hover:text-cyan-300 font-mono bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs transition-all"
												>
													{variable}
												</button>
												<span className="text-gray-400 ml-2 text-xs">{description}</span>
											</div>
										))}
									</div>
								)}
							</div>
							{/* Answer Format Selector */}
							<div className="mt-4">
								<label className="block text-sm font-semibold text-white mb-2">
									Answer Format
								</label>
								<div className="flex gap-2">
									{(['bold', 'highlight', 'box'] as AnswerFormat[]).map((format) => (
										<Button
											key={format}
											onClick={() => handleAnswerFormatChange(format)}
											variant={answerFormat === format ? 'primary' : 'secondary'}
										>
											{format.charAt(0).toUpperCase() + format.slice(1)}
										</Button>
									))}
								</div>
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
