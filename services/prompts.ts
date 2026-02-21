/**
 * All prompts and instructions used throughout the application
 */

import { getTemplateById } from './templateStorage';
import { QaConfig } from '../types';

export const prompts = {
	/**
	 * Builds a chat message that instructs the AI to generate Q&A via the edit_document tool.
	 * Used by the quick-generate flow (replaces the old one-shot getQAPrompt).
	 */
	buildGenerationPrompt: (config: QaConfig, templateString?: string) => {
		let prompt = `Generate ${config.count} ${config.type} questions at ${config.difficulty} difficulty from the uploaded source documents.`;
		prompt += `\nUse the edit_document tool with edit_type="full_replace" to write the Q&A directly into the document editor.`;
		prompt += `\nOutput ONLY clean HTML — no markdown, no code blocks.`;
		if (templateString) {
			prompt += `\nFollow the configured Q&A template format EXACTLY. Preserve ALL HTML tags, line breaks, and spacing from the template.`;
		}
		if (config.instructions) {
			prompt += `\nAdditional instructions: ${config.instructions}`;
		}
		prompt += `\nAfter the tool call, briefly confirm what was generated (count, type, difficulty).`;
		return prompt;
	},

	/**
	 * Base system instruction for chat interactions
	 */
	baseChatSystemInstruction: (
		hasDocuments: boolean,
		qaConfig?: {
			type: string;
			difficulty: string;
			instructions: string;
			selectedTemplateId?: string;
			count: number;
		} | null
	) => {
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

<generation_mode>
When the user asks you to generate a set of Q&A questions (e.g., "Generate 10 questions"):
1. Use edit_document with edit_type="full_replace" to write ALL questions into the document
2. Follow the configured template format EXACTLY if one is provided in <qa_config>
3. Output raw HTML directly — no markdown code blocks
4. After the tool call, briefly confirm what was generated (count, type, difficulty)
</generation_mode>

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
