/**
 * Parses Q&A HTML documents into structured question objects.
 * Enables semantic editing operations (edit by question number, add/delete questions).
 */

export interface ParsedQuestion {
	number: number;
	questionText: string; // plain text of the question
	answerText: string; // plain text of the answer
	choices?: string[]; // MC choices (plain text)
	reference?: string; // reference text
	fullHtml: string; // the raw HTML block for this question
	startIndex: number; // char offset in the source documentHtml
	endIndex: number; // char offset end (exclusive)
}

export interface ParseResult {
	questions: ParsedQuestion[];
	preamble: string; // any HTML before the first question
	postamble: string; // any HTML after the last question
}

/**
 * Parse a Q&A HTML document into structured questions.
 *
 * Strategy: Detect question boundaries by looking for the pattern:
 *   <p><strong>N: ...</strong></p>  or  <p><strong>N. ...</strong></p>
 * Everything between two question headers belongs to the earlier question.
 */
export function parseQuestions(html: string): ParseResult {
	if (!html || !html.trim()) {
		return { questions: [], preamble: '', postamble: '' };
	}

	// Match question header pattern: <p><strong>N: ... or N. ...
	// Flexible: allows whitespace, optional <br>, different separators
	const questionHeaderRegex =
		/<p[^>]*>\s*<strong[^>]*>\s*(\d+)\s*[:.)\-]\s*(.*?)\s*<\/strong>\s*<\/p>/gi;

	const matches: {
		index: number;
		endIndex: number;
		number: number;
		questionText: string;
	}[] = [];
	let match: RegExpExecArray | null;

	while ((match = questionHeaderRegex.exec(html)) !== null) {
		matches.push({
			index: match.index,
			endIndex: match.index + match[0].length,
			number: parseInt(match[1], 10),
			questionText: stripHtmlTags(match[2]).trim(),
		});
	}

	if (matches.length === 0) {
		return { questions: [], preamble: html, postamble: '' };
	}

	const preamble = html.substring(0, matches[0].index);
	const questions: ParsedQuestion[] = [];

	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].index;
		const end =
			i + 1 < matches.length
				? matches[i + 1].index
				: findQuestionEnd(html, matches[i].endIndex);

		const fullHtml = html.substring(start, end);
		const bodyHtml = html.substring(matches[i].endIndex, end);

		const answerText = extractAnswer(bodyHtml);
		const choices = extractChoices(bodyHtml);
		const reference = extractReference(bodyHtml);

		questions.push({
			number: matches[i].number,
			questionText: matches[i].questionText,
			answerText,
			choices: choices.length > 0 ? choices : undefined,
			reference: reference || undefined,
			fullHtml: fullHtml.trim(),
			startIndex: start,
			endIndex: end,
		});
	}

	const lastQuestion = questions[questions.length - 1];
	const postamble = html.substring(lastQuestion.endIndex);

	return { questions, preamble, postamble };
}

/**
 * Find where a question block ends (look for trailing <br> or whitespace).
 * If the question is the last one, we grab everything to the end.
 */
function findQuestionEnd(html: string, afterHeader: number): number {
	// Look for a trailing <br> separator after the question body
	// The question body ends at the last meaningful content before the next question or EOF
	return html.length;
}

/**
 * Extract the answer text from the body of a question block.
 * Looks for <strong> or <b> text in the body, or "Answer: ..." pattern.
 */
function extractAnswer(bodyHtml: string): string {
	// Pattern 1: <p><strong>Answer: X</strong></p> (T/F, short answer)
	const answerLabelMatch = bodyHtml.match(
		/<p[^>]*>\s*<(?:strong|b)[^>]*>\s*(?:Answer:\s*)?(.+?)\s*<\/(?:strong|b)>\s*<\/p>/i
	);
	if (answerLabelMatch) {
		return stripHtmlTags(answerLabelMatch[1]).trim();
	}

	// Pattern 2: Bold item in a list (MC — the correct answer is bolded)
	const boldListItem = bodyHtml.match(
		/<li[^>]*>\s*<(?:strong|b)[^>]*>(.+?)<\/(?:strong|b)>\s*<\/li>/i
	);
	if (boldListItem) {
		return stripHtmlTags(boldListItem[1]).trim();
	}

	// Pattern 3: Standalone <p><strong>...</strong></p> not containing "Reference"
	const standaloneBold = bodyHtml.match(
		/<p[^>]*>\s*<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>\s*<\/p>/i
	);
	if (standaloneBold && !standaloneBold[1].toLowerCase().includes('reference')) {
		return stripHtmlTags(standaloneBold[1]).trim();
	}

	return '';
}

/**
 * Extract choices from a list (MC questions).
 * Returns plain text array of all <li> items.
 */
function extractChoices(bodyHtml: string): string[] {
	const choices: string[] = [];
	const listItemRegex = /<li[^>]*>(.*?)<\/li>/gi;
	let m: RegExpExecArray | null;
	while ((m = listItemRegex.exec(bodyHtml)) !== null) {
		choices.push(stripHtmlTags(m[1]).trim());
	}
	return choices;
}

/**
 * Extract reference text from <i> or <em> tags containing "Reference".
 */
function extractReference(bodyHtml: string): string {
	const refMatch = bodyHtml.match(
		/<(?:i|em)[^>]*>\s*(?:Reference:\s*)(.+?)\s*<\/(?:i|em)>/i
	);
	if (refMatch) {
		return stripHtmlTags(refMatch[1]).trim();
	}
	return '';
}

/**
 * Strip all HTML tags from a string, returning plain text.
 */
function stripHtmlTags(html: string): string {
	return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Rebuild the document HTML after modifying questions.
 * Replaces each question's original HTML with updated content
 * while preserving preamble, postamble, and inter-question spacing.
 */
export function rebuildDocument(
	originalHtml: string,
	originalParse: ParseResult,
	updatedQuestions: ParsedQuestion[]
): string {
	if (originalParse.questions.length === 0) {
		// No questions were parsed — can't rebuild, return original
		return originalHtml;
	}

	// Build from parts: preamble + questions + postamble
	const parts: string[] = [];

	if (originalParse.preamble.trim()) {
		parts.push(originalParse.preamble);
	}

	for (const q of updatedQuestions) {
		parts.push(q.fullHtml);
	}

	if (originalParse.postamble.trim()) {
		parts.push(originalParse.postamble);
	}

	return parts.join('\n');
}

/**
 * Update a specific field of a parsed question.
 * Returns a new ParsedQuestion with the field updated in fullHtml.
 */
export function updateQuestionField(
	question: ParsedQuestion,
	field: string,
	newContent: string
): ParsedQuestion {
	let updatedHtml = question.fullHtml;

	switch (field) {
		case 'question_text': {
			// Replace the question text in the <p><strong>N: OLD_TEXT</strong></p> header
			const headerRegex = new RegExp(
				`(<p[^>]*>\\s*<strong[^>]*>\\s*${question.number}\\s*[:.\\)\\-]\\s*)${escapeRegExp(question.questionText)}(\\s*<\\/strong>\\s*<\\/p>)`,
				'i'
			);
			updatedHtml = updatedHtml.replace(headerRegex, `$1${newContent}$2`);
			return { ...question, questionText: newContent, fullHtml: updatedHtml };
		}

		case 'answer': {
			// Replace the answer text — strategy depends on structure
			if (question.answerText) {
				// Try to replace the answer text wherever it appears in bold
				const answerRegex = new RegExp(
					`(<(?:strong|b)[^>]*>\\s*(?:Answer:\\s*)?)${escapeRegExp(question.answerText)}(\\s*<\\/(?:strong|b)>)`,
					'i'
				);
				updatedHtml = updatedHtml.replace(answerRegex, `$1${newContent}$2`);
			}
			return { ...question, answerText: newContent, fullHtml: updatedHtml };
		}

		case 'reference': {
			if (question.reference) {
				const refRegex = new RegExp(
					`(<(?:i|em)[^>]*>\\s*(?:Reference:\\s*))${escapeRegExp(question.reference)}(\\s*<\\/(?:i|em)>)`,
					'i'
				);
				updatedHtml = updatedHtml.replace(refRegex, `$1${newContent}$2`);
			}
			return { ...question, reference: newContent, fullHtml: updatedHtml };
		}

		case 'full_question': {
			// Replace the entire question HTML with the provided content
			return { ...question, fullHtml: newContent };
		}

		default:
			return question;
	}
}

/**
 * Renumber questions sequentially starting from 1.
 */
export function renumberQuestions(
	questions: ParsedQuestion[]
): ParsedQuestion[] {
	return questions.map((q, i) => {
		const newNumber = i + 1;
		if (q.number === newNumber) return q;

		// Update the number in the fullHtml
		const headerRegex = new RegExp(
			`(<p[^>]*>\\s*<strong[^>]*>\\s*)${q.number}(\\s*[:.\\)\\-])`,
			'i'
		);
		const updatedHtml = q.fullHtml.replace(headerRegex, `$1${newNumber}$2`);

		return { ...q, number: newNumber, fullHtml: updatedHtml };
	});
}

/**
 * Generate a text summary of the document for the read_document tool.
 */
export function summarizeDocument(parseResult: ParseResult): string {
	const { questions } = parseResult;

	if (questions.length === 0) {
		return 'The document contains no parseable questions.';
	}

	const lines: string[] = [
		`Document contains ${questions.length} question(s):\n`,
	];

	for (const q of questions) {
		const questionPreview =
			q.questionText.length > 80
				? q.questionText.substring(0, 77) + '...'
				: q.questionText;
		const answerPreview =
			q.answerText.length > 60
				? q.answerText.substring(0, 57) + '...'
				: q.answerText;

		let line = `  ${q.number}. ${questionPreview}`;
		if (answerPreview) line += `\n     Answer: ${answerPreview}`;
		if (q.choices)
			line += `\n     [Multiple choice: ${q.choices.length} options]`;
		if (q.reference) line += `\n     Ref: ${q.reference}`;
		lines.push(line);
	}

	return lines.join('\n');
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
