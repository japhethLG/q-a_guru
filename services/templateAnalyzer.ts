/**
 * Structural template analyzer.
 *
 * Converts raw HTML template strings into compact structural descriptions
 * that the LLM can understand with fewer tokens than the raw HTML.
 */

interface TemplateAnalysis {
	/** Human-readable structure description */
	structureDescription: string;
	/** Variables found in the template */
	variables: string[];
	/** Whether the template includes answer choices */
	hasChoices: boolean;
	/** Whether the template includes references */
	hasReference: boolean;
	/** A single rendered example */
	sampleOutput: string;
}

/**
 * Analyze an HTML template string and produce a compact structural description.
 *
 * Instead of including the full raw HTML in the system prompt, we describe
 * the template semantically — this saves tokens and gives the LLM a clearer
 * understanding of what it needs to produce.
 */
export function analyzeTemplate(templateString: string): TemplateAnalysis {
	// Extract all variables (things in square brackets)
	const variableRegex = /\[([^\]]+)\]/g;
	const variables: string[] = [];
	let match;
	while ((match = variableRegex.exec(templateString)) !== null) {
		if (!variables.includes(match[1])) {
			variables.push(match[1]);
		}
	}

	const hasChoices = variables.some(
		(v) => /^choice\d+$/i.test(v) || v === 'letter'
	);
	const hasReference =
		variables.includes('reference') ||
		variables.includes('page') ||
		variables.includes('source');

	// Build structural description by analyzing the HTML tags
	const structureParts: string[] = [];

	// Detect question format
	if (templateString.includes('<strong>') || templateString.includes('<b>')) {
		structureParts.push('Bold numbered question');
	} else {
		structureParts.push('Numbered question');
	}

	// Detect answer format
	if (hasChoices) {
		structureParts.push('Answer choices (a-d) as list items');
		structureParts.push('Correct answer letter indicated');
	}

	if (variables.includes('answer') || variables.includes('correct_answer')) {
		if (templateString.includes('<i>') || templateString.includes('<em>')) {
			structureParts.push('Answer in italics');
		} else {
			structureParts.push('Answer paragraph');
		}
	}

	if (hasReference) {
		const refParts: string[] = [];
		if (variables.includes('reference')) refParts.push('reference');
		if (variables.includes('page')) refParts.push('page number');
		if (variables.includes('source')) refParts.push('source');
		structureParts.push(`Reference line (${refParts.join(', ')})`);
	}

	// Detect HTML wrapper patterns
	const usesDiv = templateString.includes('<div');
	const usesParagraph = templateString.includes('<p');
	const usesList =
		templateString.includes('<ol') || templateString.includes('<ul');
	const usesBreak = templateString.includes('<br');

	const wrapperNote = usesDiv
		? 'Each question wrapped in <div>'
		: usesParagraph
			? 'Content uses <p> tags'
			: 'Inline HTML';

	structureParts.push(wrapperNote);
	if (usesList) structureParts.push('Uses list elements for choices');
	if (usesBreak) structureParts.push('Uses <br> for line breaks');

	// Build a sample output by replacing variables with example values
	let sampleOutput = templateString
		.replace(/\[number\]/g, '1')
		.replace(/\[question\]/g, 'What is the capital of France?')
		.replace(/\[statement\]/g, 'France is located in Europe.')
		.replace(/\[answer\]/g, 'Paris')
		.replace(/\[correct_answer\]/g, 'True')
		.replace(/\[reference\]/g, 'World Geography, Chapter 3')
		.replace(/\[page\]/g, '42')
		.replace(/\[source\]/g, 'Geography Textbook')
		.replace(/\[choice1\]/g, 'Paris')
		.replace(/\[choice2\]/g, 'London')
		.replace(/\[choice3\]/g, 'Berlin')
		.replace(/\[choice4\]/g, 'Madrid')
		.replace(/\[letter\]/g, 'a')
		.replace(/\[keywords\]/g, 'capital, France, geography')
		.replace(/\[rubric\]/g, 'Identify the correct capital city');

	return {
		structureDescription: structureParts.join(' → '),
		variables,
		hasChoices,
		hasReference,
		sampleOutput,
	};
}

/**
 * Generate a compact prompt description of a template.
 *
 * This replaces the raw template HTML in the system prompt with a
 * structured, token-efficient description.
 */
export function getTemplatePromptDescription(
	templateString: string,
	templateName: string
): string {
	const analysis = analyzeTemplate(templateString);

	return `Template: ${templateName}
Structure: ${analysis.structureDescription}
Variables: ${analysis.variables.map((v) => `[${v}]`).join(', ')}

Example output for one question:
\`\`\`
${analysis.sampleOutput}
\`\`\`

⚠️ Follow this structure exactly — preserve all HTML tags, spacing, and line breaks.`;
}
