/**
 * All prompts and instructions used throughout the application
 */

import { getTemplateById } from './templateStorage';
import { parseQuestions } from './documentParser';

export const prompts = {
	/**
	 * Generates a prompt for Q&A generation based on documents and configuration
	 */
	getQAPrompt: (
		documents: string[],
		config: {
			count: number;
			type: string;
			difficulty: string;
			instructions?: string;
			template?: {
				templateString: string;
			};
		}
	) => {
		const combinedDocuments = documents.join('\n\n---\n\n');

		// If template is provided, use it
		if (config.template) {
			return `Generate ${config.count} ${config.type} questions from the provided documents.

CRITICAL: Output ONLY HTML. No markdown, no explanations.

⚠️ CRITICAL FORMATTING RULE: DO NOT wrap your HTML output in markdown code blocks (like \`\`\`html ... \`\`\`). Output the HTML directly without any code block wrappers. The system expects raw HTML that will be rendered directly.

CORRECT OUTPUT (what we want):
<p><strong>1. Question here?</strong></p>
<p>Answer here.</p>

INCORRECT OUTPUT (what we DON'T want):
\`\`\`html
<p><strong>1. Question here?</strong></p>
<p>Answer here.</p>
\`\`\`

Configuration:
- Question type: ${config.type}
- Difficulty: ${config.difficulty}
${config.instructions ? `- Additional Instructions: ${config.instructions}` : ''}

⚠️ CRITICAL: You MUST follow this EXACT HTML template format precisely. The template defines ALL formatting, including how answers are displayed. Preserve ALL HTML tags, line breaks, spacing, and structure exactly as shown in the template.

Template to follow EXACTLY (preserve all line breaks and spacing):

\`\`\`
${config.template.templateString}
\`\`\`

VARIABLE REPLACEMENT RULES:
- [number] → Question number (1, 2, 3, etc.)
- [question] → The question text
- [statement] → True/false statement
- [answer] → Correct answer
- [correct_answer] → True or False
- [reference] → Source citation
- [page] → Page number
- [source] → Document name
- [choice1], [choice2], [choice3], [choice4] → Answer choices
- [letter] → Answer letter (a, b, c, d)
- [keywords] → Key terms
- [rubric] → Grading expectations

OUTPUT REQUIREMENTS:
1. Output HTML only - follow the template structure EXACTLY
2. DO NOT wrap output in markdown code blocks (\`\`\`html ... \`\`\`)
3. Output raw HTML directly - start with the first tag from the template
4. Preserve EXACT line breaks and spacing from template
5. Include ALL HTML tags shown in template (<b>, <i>, <strong>, <ul>, <li>, etc.) exactly as they appear
6. The template defines all formatting - do NOT modify or add formatting beyond what's in the template
7. Generate ${config.count} complete questions in this format

--- SOURCE DOCUMENTS ---
${combinedDocuments}
--- END DOCUMENTS ---
`;
		}

		// Default prompt without template
		return `
        Based on the following document(s), please generate a set of questions and answers.

        Configuration:
        - Number of questions: ${config.count}
        - Question type: ${config.type}
        - Difficulty: ${config.difficulty}
        ${config.instructions ? `- Additional Instructions: ${config.instructions}` : ''}

        Format the output as clean HTML. Each question should be in a <p> tag with bold text (e.g., <p><strong>1. What is the capital of France?</strong></p>), and the answer should follow in a separate <p> tag (e.g., <p>The capital of France is Paris.</p>). For multiple choice questions, provide options in an ordered list.

        ⚠️ CRITICAL: DO NOT wrap your HTML output in markdown code blocks (like \`\`\`html ... \`\`\`). Output the HTML directly without any code block wrappers. Start with <p> tags immediately.

        --- DOCUMENT START ---
        ${combinedDocuments}
        --- DOCUMENT END ---
    `;
	},

	/**
	 * Base system instruction for chat interactions
	 */
	baseChatSystemInstruction: (
		sourceDocuments: string[],
		qaConfig?: {
			type: string;
			difficulty: string;
			instructions: string;
			selectedTemplateId?: string;
			count: number;
		} | null
	) => {
		const hasDocuments = sourceDocuments && sourceDocuments.length > 0;

		let instruction = `You are an AI assistant in a document editor. Your primary function is to help the user by answering questions and modifying the document content.

<document_status>
${!hasDocuments ? `⚠️ NO DOCUMENTS ATTACHED: No source documents in this session. Do not generate Q&A content unless explicitly requested. Guide the user to upload documents first.` : `✅ DOCUMENTS ATTACHED: Source documents are available in the conversation context. Use them for Q&A generation.`}
</document_status>

<formatting_rules>
## Chat Responses (Markdown):
- Use **bold**, *italics*, headings, lists, blockquotes, and tables for readability
- Use fenced code blocks with language identifiers for code
- Keep paragraphs short and well-spaced

## Document Editing (HTML):
- All document output must be clean HTML
- If a Q&A template is configured, follow it EXACTLY — match every tag, attribute, and line break
- Without a template: Questions as \`<p><strong>N. Question?</strong></p>\`, answers as \`<p>Answer.</p>\`
</formatting_rules>

<editing_instructions>
When the user asks you to modify the document, you MUST use the edit_document tool.
If selected context is provided, focus your edits on that specific content.

**Semantic tools (PREFERRED for Q&A content):**
1. **edit_question**: Change a specific field by question number. Params: edit_type="edit_question", question_number, field ("question_text"/"answer"/"reference"/"full_question"), new_content.
2. **add_questions**: Insert new questions. Params: edit_type="add_questions", new_content (HTML), position ("before"/"after"/"beginning"/"end"), question_number. ⚠️ NUMBERING: The system auto-renumbers questions after insertion. Always number your new questions starting from 1 in new_content — the system will fix the final numbering.
3. **delete_question**: Remove a question by number. Params: edit_type="delete_question", question_number. Auto-renumbers.

**Fallback tools (non-Q&A or complex edits):**
4. **edit_section**: Edit non-Q&A content. Params: edit_type="edit_section", html_snippet_to_replace, new_content.
5. **snippet_replace**: Targeted HTML replacement. Params: edit_type="snippet_replace", html_snippet_to_replace, replacement_html.
6. **full_replace**: Replace entire document. Params: edit_type="full_replace", full_document_html.

**Inspection tool:**
- **read_document**: Inspect document structure before editing. Returns all questions with numbers, text, answers.

**Quick reference:**
- Change question 3's answer → edit_question, question_number=3, field="answer"
- Delete question 5 → delete_question, question_number=5
- Add questions at end → add_questions, position="end"
- Edit a header → edit_section or snippet_replace
- Rewrite everything → full_replace
- Unsure what exists → read_document first
- Delete a question → delete_question
- Delete ALL content → full_replace with empty string
- Empty document → create with full_replace
- Batch edits (e.g., edit questions 1, 3, 5) → multiple edit_document calls in one response. Each edit is applied sequentially.
</editing_instructions>

<agentic_behavior>
CRITICAL: Always follow this pattern for document edits:

1. **Before edit**: Explain your intent and reasoning in natural language.
2. **After edit**: Provide detailed feedback — what changed, why, and how it improves the document.

NEVER call edit_document without explanation. Always provide reasoning before and results after.

⚠️ IMPORTANT — Chat response formatting:
- Your chat messages use Markdown. NEVER include raw HTML tags in your chat text.
- When describing edits, use plain English: "I'll update question 3's answer to explain photosynthesis in more detail."
- Do NOT paste the HTML content you plan to insert into the chat. The user will see the result in the document editor.
- If you need to show a preview of content, describe it in markdown (e.g., bullet lists), NOT raw HTML.
</agentic_behavior>

`;

		// Add Q&A configuration context if available
		if (qaConfig) {
			const selectedTemplate = qaConfig.selectedTemplateId
				? getTemplateById(qaConfig.selectedTemplateId)
				: null;

			instruction += `\n<qa_config>
## Q&A Generation Context:
- Question Type: ${qaConfig.type}
- Difficulty: ${qaConfig.difficulty}
${qaConfig.count ? `- Number of Questions: ${qaConfig.count}` : ''}
${qaConfig.instructions ? `- Additional Instructions: ${qaConfig.instructions}` : ''}`;

			if (selectedTemplate) {
				instruction += `\n- Template: ${selectedTemplate.name}
- When adding or editing questions, follow this EXACT HTML template format:
\`\`\`
${selectedTemplate.templateString}
\`\`\`
⚠️ Preserve ALL HTML tags, line breaks, and spacing from the template exactly.`;
			}

			instruction += `\n</qa_config>`;
		}

		return instruction;
	},

	/**
	 * Appends document HTML context to the system instruction
	 */
	appendDocumentHtml: (instruction: string, documentHtml: string) => {
		if (!documentHtml || documentHtml.trim() === '') {
			return (
				instruction +
				`\n\n<document_state>\nEMPTY — No content in the editor. Use full_replace with full_document_html to create new content.\n</document_state>`
			);
		}

		// Count existing questions to help AI with numbering
		const questionCount = (
			documentHtml.match(/<p[^>]*>\s*<strong[^>]*>\s*\d+\s*[:.\)\-]/gi) || []
		).length;
		const countInfo =
			questionCount > 0
				? `\nThe document currently contains ${questionCount} question(s). When adding new questions, the system will auto-renumber them.`
				: '';

		return (
			instruction +
			`\n\n<document_state>\nCurrent document content:${countInfo}\n"""\n${documentHtml}\n"""\n</document_state>`
		);
	},

	/**
	 * Appends selected text context to the system instruction
	 */
	appendSelectedText: (
		instruction: string,
		selectedText: {
			selectedText: string;
			selectedHtml: string;
			startLine: number;
			endLine: number;
			contextBefore?: string;
			contextAfter?: string;
		}
	) => {
		const lineInfo =
			selectedText.startLine === selectedText.endLine
				? `Line ${selectedText.startLine}`
				: `Lines ${selectedText.startLine}-${selectedText.endLine}`;

		let contextInfo = '';
		if (selectedText.contextBefore || selectedText.contextAfter) {
			contextInfo = '\nContext around selection:';
			if (selectedText.contextBefore) {
				contextInfo += `\nBefore: ${selectedText.contextBefore}`;
			}
			if (selectedText.contextAfter) {
				contextInfo += `\nAfter: ${selectedText.contextAfter}`;
			}
		}

		// Detect which question number(s) the selection contains
		let questionGuidance = '';
		try {
			const parsed = parseQuestions(
				selectedText.selectedHtml || selectedText.selectedText
			);
			if (parsed.questions.length > 0) {
				const numbers = parsed.questions.map((q) => q.number);
				questionGuidance = `\nThe selected content contains question(s): ${numbers.join(', ')}.\nFor Q&A edits: use semantic tools (edit_question, delete_question, etc.) with these question numbers.`;
			} else {
				// Selection doesn't contain a full question header — try to detect if
				// it's part of a question by checking contextBefore for a number pattern
				const beforeMatch = selectedText.contextBefore?.match(
					/(\d+)\s*[:.)\-]\s*[^]*$/i
				);
				if (beforeMatch) {
					const nearbyNumber = parseInt(beforeMatch[1], 10);
					questionGuidance = `\nThis selection appears to be part of question ${nearbyNumber}.\nFor Q&A edits: use semantic tools with question_number=${nearbyNumber}.`;
				} else {
					questionGuidance =
						'\nThis selection does not appear to contain a question header.\nFor edits: use edit_section or snippet_replace, not semantic question tools.';
				}
			}
		} catch {
			questionGuidance =
				'\nFor Q&A content: use semantic tools (edit_question, etc.) targeting the selected question.\nFor non-Q&A content: use edit_section or snippet_replace.';
		}

		return (
			instruction +
			`\n\n<user_selection>\nThe user has HIGHLIGHTED content at ${lineInfo}. Focus your edits on this selection.\n\nSelected content:\n"""${selectedText.selectedHtml || selectedText.selectedText}"""${contextInfo}${questionGuidance}\n</user_selection>`
		);
	},

	/**
	 * Creates the user prompt with optional selected text
	 */
	getUserPrompt: (
		message: string,
		selectedText?: {
			selectedText: string;
			selectedHtml: string;
			startLine: number;
			endLine: number;
		} | null
	) => {
		if (selectedText) {
			const lineInfo =
				selectedText.startLine === selectedText.endLine
					? `Line ${selectedText.startLine}`
					: `Lines ${selectedText.startLine}-${selectedText.endLine}`;
			return (
				message +
				`\n\nApply this command to the following selected content at ${lineInfo}:\n"""\n${selectedText.selectedHtml || selectedText.selectedText}\n"""`
			);
		}
		return message;
	},
};

export const toolDeclarations = {
	editDocument: {
		name: 'edit_document',
		description:
			'Edits the document content. Choose the most appropriate edit_type for the task. Prefer semantic types (edit_question, add_questions, delete_question) for Q&A content.',
		parameters: {
			type: 'object' as const,
			properties: {
				edit_type: {
					type: 'string' as const,
					description:
						'The type of edit to perform. Use "edit_question" to change a specific question field, "add_questions" to insert new questions at the bottom of the document, "delete_question" to remove a question, "edit_section" for non-Q&A content, "snippet_replace" for targeted HTML replacement, or "full_replace" for complete document rewrite.',
					enum: [
						'edit_question',
						'add_questions',
						'delete_question',
						'edit_section',
						'full_replace',
						'snippet_replace',
					],
				},
				question_number: {
					type: 'number' as const,
					description:
						'For edit_question/delete_question: the 1-based question number to target. For add_questions with position "before"/"after": the reference question number.',
				},
				field: {
					type: 'string' as const,
					description:
						'For edit_question: which field to edit. "question_text" for the question itself, "answer" for the answer, "reference" for the reference/citation, "full_question" to replace the entire question HTML.',
					enum: ['question_text', 'answer', 'reference', 'full_question'],
				},
				new_content: {
					type: 'string' as const,
					description:
						'The new content for the targeted field or section. For edit_question: the new text for the specified field. For add_questions: the complete HTML for the new question(s) following the template format. For edit_section: the replacement HTML for the non-Q&A section.',
				},
				position: {
					type: 'string' as const,
					description:
						'For add_questions: where to insert. "before" or "after" a question_number, "beginning" for start of document, "end" for end of document.',
					enum: ['before', 'after', 'beginning', 'end'],
				},
				full_document_html: {
					type: 'string' as const,
					description:
						'For full_replace only: the complete new HTML content for the entire document. Use for major rewrites or when semantic tools are not applicable.',
				},
				html_snippet_to_replace: {
					type: 'string' as const,
					description:
						'For snippet_replace only: an exact HTML snippet from the current document to find and replace. Fallback when semantic tools cannot target the content.',
				},
				replacement_html: {
					type: 'string' as const,
					description:
						'For snippet_replace only: the new HTML to replace the snippet with. Use empty string to delete.',
				},
			},
		},
	},
	readDocument: {
		name: 'read_document',
		description:
			'Inspect the current document structure. Returns a summary of all questions with their numbers, text, answers, and references. Use this to understand the document before making edits.',
		parameters: {
			type: 'object' as const,
			properties: {},
		},
	},
};
