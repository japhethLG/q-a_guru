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

**Available edit types:**

1. **snippet_replace** (PREFERRED for targeted edits):
   Use for changing a specific answer, fixing a reference, editing question text, or any small change.
   Params: edit_type="snippet_replace", html_snippet_to_replace (exact HTML from the document, include 3+ lines of context), replacement_html (the new HTML), instruction (short description of WHY this edit is needed — REQUIRED).
   
   ⚠️ CRITICAL: html_snippet_to_replace must be an EXACT substring of the current document HTML. Copy it precisely, including all tags, attributes, whitespace, and entities.

2. **full_replace** (for structural changes):
   Use for adding new questions, deleting questions, reordering, major rewrites, or when the document is empty.
   Params: edit_type="full_replace", full_document_html (the complete updated document HTML).
   
   When adding questions: output the ENTIRE document with the new questions inserted at the correct position, with correct numbering.
   When deleting questions: output the ENTIRE document without the deleted question(s), with renumbered remaining questions.

**Inspection tool:**
- **read_document**: Inspect document structure before editing. Returns all questions with numbers, text, answers.

**Quick reference:**
- Change question 3's answer → snippet_replace targeting that answer's HTML
- Delete question 5 → full_replace with the entire document minus question 5
- Add questions at end → full_replace with the entire document plus new questions
- Edit a header or reference → snippet_replace
- Rewrite everything → full_replace
- Unsure what exists → read_document first
- Delete ALL content → full_replace with empty string
- Empty document → create with full_replace
- Batch edits to different parts → multiple snippet_replace calls in one response. Each edit is applied sequentially.
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
				questionGuidance = `\nThe selected content contains question(s): ${numbers.join(', ')}.\nFor targeted edits: use snippet_replace with html_snippet_to_replace matching the selected HTML.\nFor structural changes (add/delete): use full_replace.`;
			} else {
				// Selection doesn't contain a full question header — try to detect if
				// it's part of a question by checking contextBefore for a number pattern
				const beforeMatch = selectedText.contextBefore?.match(
					/(\d+)\s*[:.)\-]\s*[^]*$/i
				);
				if (beforeMatch) {
					const nearbyNumber = parseInt(beforeMatch[1], 10);
					questionGuidance = `\nThis selection appears to be part of question ${nearbyNumber}.\nFor targeted edits: use snippet_replace with the exact HTML from the document.`;
				} else {
					questionGuidance =
						'\nThis selection does not appear to contain a question header.\nFor edits: use snippet_replace with the exact HTML, or full_replace for structural changes.';
				}
			}
		} catch {
			questionGuidance =
				'\nFor targeted edits: use snippet_replace with the exact HTML.\nFor structural changes: use full_replace.';
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
			'Edits the document content. Use snippet_replace for targeted edits (changing an answer, fixing a reference). Use full_replace for structural changes (adding/deleting questions, major rewrites).',
		parameters: {
			type: 'object' as const,
			properties: {
				edit_type: {
					type: 'string' as const,
					description:
						'The type of edit: "snippet_replace" for targeted search-and-replace edits, "full_replace" for complete document replacement (adding questions, deleting questions, rewriting).',
					enum: ['snippet_replace', 'full_replace'],
				},
				html_snippet_to_replace: {
					type: 'string' as const,
					description:
						'For snippet_replace: an exact HTML snippet from the current document to find and replace. Include 3+ lines of surrounding context for reliable matching.',
				},
				replacement_html: {
					type: 'string' as const,
					description:
						'For snippet_replace: the new HTML to replace the snippet with. Use empty string to delete the snippet.',
				},
				instruction: {
					type: 'string' as const,
					description:
						'For snippet_replace: a short description of WHY this edit is needed (e.g. "Change the answer of question 3 from Paris to London"). Used for self-correction if the match fails.',
				},
				full_document_html: {
					type: 'string' as const,
					description:
						'For full_replace: the complete new HTML content for the entire document.',
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
