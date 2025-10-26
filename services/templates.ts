import { QuestionTemplate, QuestionType, AnswerFormat } from '../types';

/**
 * Default templates for each question type
 */
export const defaultTemplates: QuestionTemplate[] = [
	{
		id: 'mc-default',
		name: 'Default Multiple Choice',
		questionType: 'multiple choice',
		templateString: `
<p><strong>[number]: [question]</strong></p>
<p>a) [choice1]</p>
<p><strong>b) [answer]</strong></p>
<p>c) [choice3]</p>
<p>d) [choice4]</p>
<p><i>Reference: [reference]</i></p>
<br>`,
		answerFormat: 'bold',
		isDefault: true,
	},
	{
		id: 'tf-default',
		name: 'Default True/False',
		questionType: 'true/false',
		templateString: `
<p><strong>[number]: [statement]</strong></p>
<p><strong>Answer: [answer]</strong></p>
<p><i>Reference: [reference]</i></p>
<br>`,
		answerFormat: 'bold',
		isDefault: true,
	},
	{
		id: 'sa-default',
		name: 'Default Short Answer',
		questionType: 'short answer',
		templateString: `
<p><strong>[number]: [question]</strong></p>
<p><strong>[answer]</strong></p>
<p><i>Reference: [reference]</i></p>
<br>`,
		answerFormat: 'bold',
		isDefault: true,
	},
	{
		id: 'essay-default',
		name: 'Default Essay',
		questionType: 'essay',
		templateString: `
<p><strong>[number]: [question]</strong></p>
<p><strong>[answer]</strong></p>
<p><i>Reference: [reference]</i></p>
<br>`,
		answerFormat: 'bold',
		isDefault: true,
	},
	{
		id: 'mixed-default',
		name: 'Default Mixed',
		questionType: 'mixed',
		templateString: `
<p><strong>[number]: [question]</strong></p>
<p><strong>[answer]</strong></p>
<p><i>Reference: [reference]</i></p>
<br>`,
		answerFormat: 'bold',
		isDefault: true,
	},
];

/**
 * Get all available variables for a question type
 */
export const getAvailableVariables = (
	questionType: QuestionType
): { variable: string; description: string }[] => {
	const commonVars = [
		{ variable: '[number]', description: 'Question number' },
		{ variable: '[question]', description: 'The question text' },
		{ variable: '[answer]', description: 'The correct answer' },
		{ variable: '[reference]', description: 'Source reference' },
		{ variable: '[page]', description: 'Page number from source' },
		{ variable: '[source]', description: 'Source document name' },
	];

	switch (questionType) {
		case 'multiple choice':
			return [
				...commonVars,
				{ variable: '[letter]', description: 'Answer letter (a, b, c, d)' },
				{ variable: '[choice1]', description: 'First answer choice' },
				{ variable: '[choice2]', description: 'Second answer choice' },
				{ variable: '[choice3]', description: 'Third answer choice' },
				{ variable: '[choice4]', description: 'Fourth answer choice' },
				{ variable: '[correct_letter]', description: 'Correct choice letter' },
			];
		case 'true/false':
			return [
				...commonVars,
				{ variable: '[statement]', description: 'The true/false statement' },
				{ variable: '[correct_answer]', description: 'True or False' },
			];
		case 'short answer':
			return [
				...commonVars,
				{ variable: '[keywords]', description: 'Key terms expected in answer' },
			];
		case 'essay':
			return [
				...commonVars,
				{ variable: '[rubric]', description: 'Grading rubric or expectations' },
			];
		default:
			return commonVars;
	}
};

/**
 * Get template help text and instructions
 */
export const getTemplateInstructions = (
	questionType: QuestionType
): {
	howToUse: string;
	example: string;
	bestPractices: string;
	formattingTips: string;
} => {
	const baseHelp = {
		howToUse:
			'Use square brackets to insert variables (e.g., [number], [question]). These will be replaced with actual content when generating Q&A.',
		example: '',
		bestPractices:
			'- Always include question numbers\n- Include references to source documents\n- Use clear formatting with newlines',
		formattingTips:
			'- Use newlines (press Enter) for line breaks\n- Use HTML tags like <b> for bold, <i> for italic\n- Keep formatting consistent across questions',
	};

	switch (questionType) {
		case 'multiple choice':
			return {
				...baseHelp,
				example: `Example:
1: What is the capital of France?
a) London
b) Berlin
c) Paris
d) Madrid
<b>c) Paris</b>
<i>Reference: Geography textbook, p. 42</i>`,
			};
		case 'true/false':
			return {
				...baseHelp,
				example: `Example:
1: The Earth is the third planet from the Sun.
<b>Answer: True</b>
<i>Reference: Science text, p. 15</i>`,
			};
		case 'short answer':
			return {
				...baseHelp,
				example: `Example:
1: What is the largest planet in our solar system?
<b>Jupiter</b>
<i>Reference: Astronomy guide, p. 28</i>`,
			};
		case 'essay':
			return {
				...baseHelp,
				example: `Example:
1: Explain the water cycle in detail.
<b>The water cycle involves evaporation from bodies of water...</b>
<i>Reference: Environmental science, ch. 3</i>`,
			};
		default:
			return baseHelp;
	}
};

/**
 * Validate template string has required variables
 */
export const validateTemplate = (templateString: string): boolean => {
	// At minimum, should have [question] or [statement] and some form of answer reference
	return (
		(templateString.includes('[question]') ||
			templateString.includes('[statement]')) &&
		(templateString.includes('[answer]') ||
			templateString.includes('[correct_answer]'))
	);
};

/**
 * Generate preview HTML from template with sample data
 */
export const previewTemplate = (
	templateString: string,
	questionType: QuestionType
): string => {
	// Sample data for preview
	const sampleData: Record<string, string> = {
		'[number]': '1',
		'[question]': 'What is the capital of France?',
		'[statement]': 'The Earth is round.',
		'[answer]': 'Paris',
		'[correct_answer]': 'True',
		'[reference]': 'Geography textbook, p. 42',
		'[page]': '42',
		'[source]': 'Geography textbook',
		'[letter]': 'c',
		'[choice1]': 'London',
		'[choice2]': 'Berlin',
		'[choice3]': 'Paris',
		'[choice4]': 'Madrid',
		'[correct_letter]': 'c',
		'[keywords]': 'capital, France',
		'[rubric]': 'Should mention location and significance',
	};

	let preview = templateString;
	for (const [variable, value] of Object.entries(sampleData)) {
		preview = preview.replaceAll(variable, value);
	}

	return preview;
};

/**
 * Generate instructions for the AI on how to format answers
 */
export const formatAnswerInstructions = (
	answerFormat: AnswerFormat,
	templateString: string
): string => {
	const answerVariable =
		templateString.match(/\[answer\]|\[correct_answer\]/)?.[0] || '[answer]';

	switch (answerFormat) {
		case 'bold':
			return `Format the answer using the ${answerVariable} variable wrapped in <strong> tags for emphasis. Example: <strong>${answerVariable}</strong>`;
		case 'highlight':
			return `Format the answer using the ${answerVariable} variable wrapped in <mark> tags for highlighting. Example: <mark>${answerVariable}</mark>`;
		case 'box':
			return `Format the answer using the ${answerVariable} variable wrapped in a bordered div for emphasis. Example: <div style="border: 2px solid #06b6d4; padding: 8px; border-radius: 4px; margin: 8px 0;">${answerVariable}</div>`;
		default:
			return '';
	}
};
