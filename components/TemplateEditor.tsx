import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from 'react';
import { QuestionTemplate, QuestionType, AnswerFormat } from '../types';
import {
	getAvailableVariables,
	validateTemplate,
	previewTemplate,
} from '../services/templates';
import { Button, Select, Input, Textarea } from './common';
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
	const [expandedSection, setExpandedSection] = useState<
		'variables' | 'formatting' | 'quickInsert' | null
	>('variables');

	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const availableVariables = useMemo(
		() => getAvailableVariables(selectedType),
		[selectedType]
	);

	const insertAtCursor = useCallback(
		(text: string) => {
			const textarea = textareaRef.current;
			if (textarea) {
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const newValue =
					templateString.substring(0, start) + text + templateString.substring(end);

				setTemplateString(newValue);

				// Restore cursor position after the inserted text
				setTimeout(() => {
					textarea.focus();
					textarea.setSelectionRange(start + text.length, start + text.length);
				}, 0);
			} else {
				// Fallback to appending if ref not available
				setTemplateString((prev) => prev + text);
			}
		},
		[templateString]
	);

	const insertVariable = useCallback(
		(variable: string) => {
			insertAtCursor(variable);
		},
		[insertAtCursor]
	);

	const previewHtml = useMemo(
		() => previewTemplate(templateString, selectedType),
		[templateString, selectedType]
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

	const handleTemplateChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setTemplateString(e.target.value);
			setErrors([]);
		},
		[]
	);

	const handleAnswerFormatChange = useCallback((format: AnswerFormat) => {
		setAnswerFormat(format);
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			// Handle Tab key to insert tab character instead of losing focus
			if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
				e.preventDefault();
				if (e.shiftKey) {
					// Shift+Tab inserts spaces (common for code indentation)
					insertAtCursor('    ');
				} else {
					// Tab inserts a tab character
					insertAtCursor('\t');
				}
			}
		},
		[insertAtCursor]
	);

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
					<div className="w-72 flex-shrink-0">
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

							{/* Formatting Help */}
							<div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
								<button
									onClick={() =>
										setExpandedSection(
											expandedSection === 'formatting' ? null : 'formatting'
										)
									}
									className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
								>
									<h4 className="text-sm font-semibold text-white">Formatting Help</h4>
									{expandedSection === 'formatting' ? (
										<ChevronUpIcon className="w-4 h-4 text-gray-400" />
									) : (
										<ChevronDownIcon className="w-4 h-4 text-gray-400" />
									)}
								</button>
								{expandedSection === 'formatting' && (
									<div className="p-4 space-y-3 text-xs text-gray-400 max-h-64 overflow-y-auto">
										<div>
											<div className="text-cyan-400 font-medium mb-1">Text Formatting</div>
											<div className="text-gray-500 space-y-0.5">
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">
														{'<strong>'}
													</code>{' '}
													or{' '}
													<code className="bg-gray-700 px-1 rounded text-xs">{'<b>'}</code> -
													bold text
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<em>'}</code>{' '}
													or{' '}
													<code className="bg-gray-700 px-1 rounded text-xs">{'<i>'}</code> -
													italic text
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<u>'}</code> -
													underline text
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">
														{'<small>'}
													</code>{' '}
													- smaller text
												</span>
											</div>
										</div>
										<div>
											<div className="text-cyan-400 font-medium mb-1">Structure</div>
											<div className="text-gray-500 space-y-0.5">
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<p>'}</code> -
													paragraph
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<br>'}</code>{' '}
													- line break
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<div>'}</code>{' '}
													- container
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">
														{'<span>'}
													</code>{' '}
													- inline container
												</span>
											</div>
										</div>
										<div>
											<div className="text-cyan-400 font-medium mb-1">Lists</div>
											<div className="text-gray-500 space-y-0.5">
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<ul>'}</code>{' '}
													- unordered list
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<ol>'}</code>{' '}
													- ordered list
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<li>'}</code>{' '}
													- list item
												</span>
											</div>
										</div>
										<div>
											<div className="text-cyan-400 font-medium mb-1">Special</div>
											<div className="text-gray-500 space-y-0.5">
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<hr>'}</code>{' '}
													- horizontal rule
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">
														{'<code>'}
													</code>{' '}
													- code text
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<sub>'}</code>{' '}
													- subscript
												</span>
												<span className="block">
													<code className="bg-gray-700 px-1 rounded text-xs">{'<sup>'}</code>{' '}
													- superscript
												</span>
											</div>
										</div>
										<div>
											<div className="text-cyan-400 font-medium mb-1">Keyboard</div>
											<div className="text-gray-500 space-y-0.5">
												<div>
													Press{' '}
													<kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">
														Enter
													</kbd>{' '}
													for new line
												</div>
												<div>
													Press{' '}
													<kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">
														Tab
													</kbd>{' '}
													for indent
												</div>
											</div>
										</div>
									</div>
								)}
							</div>

							{/* Quick Actions */}
							<div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
								<button
									onClick={() =>
										setExpandedSection(
											expandedSection === 'quickInsert' ? null : 'quickInsert'
										)
									}
									className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
								>
									<h4 className="text-sm font-semibold text-white">Quick Insert</h4>
									{expandedSection === 'quickInsert' ? (
										<ChevronUpIcon className="w-4 h-4 text-gray-400" />
									) : (
										<ChevronDownIcon className="w-4 h-4 text-gray-400" />
									)}
								</button>
								{expandedSection === 'quickInsert' && (
									<div className="p-4 space-y-2">
										<Button
											variant="secondary"
											size="sm"
											className="w-full"
											onClick={() => insertAtCursor('\n')}
										>
											Insert New Line
										</Button>
										<Button
											variant="secondary"
											size="sm"
											className="w-full"
											onClick={() => insertAtCursor('\t')}
										>
											Insert Tab
										</Button>
									</div>
								)}
							</div>
							{/* Answer Format Selector */}
							<div>
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

					{/* Template Textarea with Preview */}
					<div className="flex-1 space-y-4">
						{/* Textarea */}
						<Textarea
							ref={textareaRef}
							value={templateString}
							onChange={handleTemplateChange}
							onKeyDown={handleKeyDown}
							placeholder="Enter your template here. Use variables like [number], [question], [answer], etc."
							rows={12}
							className="font-mono text-sm"
						/>

						{/* Preview */}
						<div>
							<label className="block text-sm font-semibold text-white mb-2">
								Preview
							</label>
							<div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
								<div
									className="text-sm text-gray-300 prose prose-invert max-w-none"
									dangerouslySetInnerHTML={{
										__html: previewHtml,
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
