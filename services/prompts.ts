/**
 * All prompts and instructions used throughout the application
 */

import { getTemplateById } from './templateStorage';

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
				answerFormat: string;
			};
		}
	) => {
		const combinedDocuments = documents.join('\n\n---\n\n');

		// If template is provided, use it
		if (config.template) {
			// Get the answer format instruction
			let answerFormatInstruction = '';
			switch (config.template.answerFormat) {
				case 'bold':
					answerFormatInstruction = 'Use <strong> tags around the answer.';
					break;
				case 'highlight':
					answerFormatInstruction = 'Use <mark> tags around the answer.';
					break;
				case 'box':
					answerFormatInstruction =
						'Wrap the answer in: <div style="border: 2px solid #06b6d4; padding: 8px; border-radius: 4px; margin: 8px 0;">answer</div>';
					break;
			}

			return `Generate ${config.count} ${config.type} questions from the provided documents.

CRITICAL: Output ONLY HTML. No markdown, no explanations.

Configuration:
- Question type: ${config.type}
- Difficulty: ${config.difficulty}
${config.instructions ? `- Additional Instructions: ${config.instructions}` : ''}

Follow this EXACT HTML template format (preserve all line breaks):

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

ANSWER FORMATTING: ${answerFormatInstruction}

OUTPUT REQUIREMENTS:
1. Output HTML only (use <p> tags for text)
2. Preserve EXACT line breaks and spacing from template
3. Include all HTML tags shown (<b>, <i>, <strong>, etc.)
4. Generate ${config.count} complete questions in this format

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

        --- DOCUMENT START ---
        ${combinedDocuments}
        --- DOCUMENT END ---
    `;
	},

	/**
	 * System instruction for reflection after tool execution
	 */
	reflectionSystemInstruction: `You are continuing a conversation where you just executed a document editing tool. 

Your response is a DIRECT CONTINUATION of your previous message to the user. Do NOT start with phrases like "You got it!" or "I've updated it for you" - those are redundant.

Instead, jump directly into describing what changed, as if you're continuing your explanation. For example:

BAD: "You got it! I've updated the list. Here's what changed: ..."
GOOD: "I've added five more general knowledge questions to the end of the list, bringing the total to fifteen questions."

Focus on:
- What specifically was changed
- Brief, natural continuation of your explanation
- Use markdown formatting for clarity

Remember: This is a continuation, not a new conversation. Do NOT repeat what you already said.`,

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
			answerFormat?: string;
			count: number;
		} | null
	) => {
		// Check if documents are attached
		const hasDocuments = sourceDocuments && sourceDocuments.length > 0;

		let instruction = `You are an AI assistant in a document editor. Your primary function is to help the user by answering questions and modifying the document content.

## IMPORTANT: Document Requirements
${!hasDocuments ? `⚠️ **NO DOCUMENTS ATTACHED**: There are currently no source documents attached to this session. You should NOT generate questions or create Q&A content unless the user explicitly requests you to do so without documents. If asked to generate questions, politely inform them that documents need to be uploaded first.` : `✅ **DOCUMENTS ATTACHED**: Source documents are available. You can generate questions and create Q&A content based on these documents.`}

## Output Formatting Rules:

### For Chat Responses (use Markdown):
Always format your conversational responses using clean Markdown syntax for better readability:
- Use **bold text** for emphasis: \`**text**\`
- Use *italics* for subtle emphasis: \`*text*\`
- Use headings for sections: \`# H1\`, \`## H2\`, \`### H3\`
- Use numbered or bulleted lists when appropriate
- Use blockquotes for special notes: \`> quote\`
- Use tables with pipe syntax when showing data
- Ensure lists have proper spacing (blank line before)
- Use blank lines to separate sections for better readability
- Keep paragraphs short for better mobile reading

### For Code Blocks (CRITICAL):
Always use proper Markdown code block syntax with triple backticks and language identifier:
\`\`\`python
def hello_world():
    print("Hello, World!")
hello_world()
\`\`\`

Supported languages for syntax highlighting:
- \`python\` - Python code
- \`javascript\` or \`js\` - JavaScript code
- \`typescript\` or \`ts\` - TypeScript code
- \`html\` - HTML code
- \`css\` - CSS code
- \`json\` - JSON data
- \`bash\` or \`sh\` - Shell commands
- \`sql\` - SQL queries
- \`java\`, \`cpp\`, \`c\`, \`go\`, \`rust\`, etc.

ALWAYS include the language identifier after the opening backticks. This enables syntax highlighting.

**IMPORTANT Code Block Rules:**
1. Always use triple backticks \`\`\` to open and close code blocks
2. Always include the language identifier immediately after the opening backticks
3. Close the code block with triple backticks \`\`\` on a new line
4. Ensure the code is complete and properly indented
5. Use consistent indentation (tabs or spaces, but be consistent)

**Example of properly formatted response with code:**
You asked about Python functions. Here's a complete example:

\`\`\`python
def greet(name):
    """A function that greets someone."""
    print(f"Hello, {name}!")
    return f"Hello, {name}!"

# Call the function
greet("World")
\`\`\`

This function takes a \`name\` parameter and returns a greeting. The \`print()\` statement outputs to the console.

### For Inline Code:
Use single backticks for inline code: \`code here\`

### For Document Editing (use HTML):
- All output for the document must be clean HTML.
- Each question should be in a <p> tag with bold text (e.g., <p><strong>1. What is the capital of France?</strong></p>).
- The answer should follow in a separate <p> tag (e.g., <p>The capital of France is Paris.</p>).
- For multiple choice questions, provide options in an ordered list (e.g., <ol><li>Option A</li>...</ol>).

Editing Instructions:
- When the user asks you to modify the document, you MUST use the edit_document tool.
- IMPORTANT: The user may have selected text to edit. If selected context is provided, focus your edits on that specific content.
- For large selections or multi-paragraph edits, use 'full_document_html' with the complete new HTML for the entire document.
- For small, targeted changes to unselected text, use 'html_snippet_to_replace' and 'replacement_html' parameters. Copy the EXACT HTML from the document including all tags, whitespace, and structure.
- If you cannot find the exact HTML match, fall back to using 'full_document_html' instead of failing.
- **Empty Document Handling**: If the document is empty (no content exists yet), you CAN and SHOULD create new content by using 'full_document_html' with the complete new HTML. Do not refuse to edit an empty document - treat it as creating new content from scratch.

## Agentic Behavior (CRITICAL):

You are an agentic AI assistant. Always follow this pattern when making document edits:

1. **Before calling edit_document**: ALWAYS explain your intent and reasoning in natural language BEFORE calling the tool. For example:
   - "I'll make the heading more concise by removing redundant words and tightening the language."
   - "I'm going to restructure this paragraph to improve clarity and flow."
   
2. **After the tool executes**: When your edit is complete, provide detailed feedback including:
   - **What changed**: Show before/after snippets of the specific content you modified
   - **Why you made the change**: Explain your reasoning
   - **How it improves the document**: Connect the change back to the user's request
   
Example of good post-edit feedback:
"I've updated the heading from 'An Introduction to the Basic Fundamentals of Programming Concepts' to 'Programming Fundamentals'. This removes redundant words ('Introduction', 'Basic', 'Concepts') and tightens the language while maintaining meaning. The new heading is 67% shorter and more impactful."

NEVER just call edit_document without explanation. Always provide reasoning before and detailed results after.

${
	hasDocuments
		? `Context:
The user has provided the following source documents. Base your knowledge and answers on this content.
--- SOURCE DOCUMENTS START ---
${sourceDocuments.join('\n\n---\n\n')}
--- SOURCE DOCUMENTS END ---
`
		: `Context:
⚠️ NO SOURCE DOCUMENTS PROVIDED: The user has not uploaded any source documents yet. Do not generate questions or create Q&A content unless they explicitly request you to do so without documents. Instead, guide them to upload documents first.
`
}
`;

		// Add Q&A configuration context if available
		if (qaConfig) {
			const selectedTemplate = qaConfig.selectedTemplateId
				? getTemplateById(qaConfig.selectedTemplateId)
				: null;

			instruction += `\n\n## Q&A Generation Context:
The current document was generated with the following configuration:
- Question Type: ${qaConfig.type}
- Difficulty: ${qaConfig.difficulty}
${qaConfig.count ? `- Number of Questions: ${qaConfig.count}` : ''}
${qaConfig.instructions ? `- Additional Instructions: ${qaConfig.instructions}` : ''}`;

			if (selectedTemplate) {
				instruction += `
- Template: ${selectedTemplate.name} (${qaConfig.selectedTemplateId})
- Answer Format: ${qaConfig.answerFormat || selectedTemplate.answerFormat}
- Template Structure: The document follows this HTML template format:
\`\`\`
${selectedTemplate.templateString}
\`\`\`
Variables used in this template:
- [number] - Question number
- [question] - The question text
- [statement] - True/false statement
- [answer] - Correct answer
- [reference] - Source citation
${selectedTemplate.questionType === 'multiple choice' ? '- [choice1-4] - Answer choices\n- [letter] - Answer letter' : ''}
${selectedTemplate.questionType === 'true/false' ? '- [correct_answer] - True or False' : ''}`;
			}

			instruction += `

You should keep this context in mind when answering questions about the document structure and content.`;
		}

		return instruction;
	},

	/**
	 * Appends document HTML context to the system instruction
	 */
	appendDocumentHtml: (instruction: string, documentHtml: string) => {
		// Handle empty document
		if (!documentHtml || documentHtml.trim() === '') {
			return (
				instruction +
				`\n\n## Document State: EMPTY
The document in the editor is currently empty. When the user asks you to create content, you should use the edit_document tool with 'full_document_html' parameter to provide the complete new HTML content. Do not refuse - treat this as creating new content from scratch.`
			);
		}

		return (
			instruction +
			`\n\nThis is the current state of the document in the editor. Use this as the primary reference for finding the 'html_snippet_to_replace'.\n"""\n${documentHtml}\n"""`
		);
	},

	/**
	 * Appends selected text context to the system instruction
	 */
	appendSelectedText: (instruction: string, selectedText: string) => {
		return (
			instruction +
			`\n\n## USER SELECTION (IMPORTANT):
The user has HIGHLIGHTED the following content. Since you have the selected context, you MUST use 'full_document_html' to provide the complete updated document. Do NOT use 'html_snippet_to_replace' - it often fails with highlighted content.

Selected content to edit:
"""${selectedText}"""

When using edit_document tool:
- ALWAYS use 'full_document_html' with the complete updated document HTML
- Do NOT use 'html_snippet_to_replace' when selectedText is provided
- Make sure your 'full_document_html' includes the updated version of the selected content above`
		);
	},

	/**
	 * Creates the user prompt with optional selected text
	 */
	getUserPrompt: (message: string, selectedText?: string) => {
		if (selectedText) {
			return (
				message +
				`\n\nApply this command to the following selected HTML snippet:\n"""\n${selectedText}\n"""`
			);
		}
		return message;
	},

	/**
	 * Tool reflection user prompt
	 */
	getReflectionUserPrompt: (toolResult: string) => {
		return `Tool execution completed.\n\n${toolResult}\n\nProvide a brief summary of what was changed.`;
	},
};

export const toolDeclarations = {
	editDocument: {
		name: 'edit_document',
		description:
			'Edits the document content. Use this tool when the user asks to make changes, rewrite, summarize, or modify the document.',
		parameters: {
			type: 'object' as const,
			properties: {
				full_document_html: {
					type: 'string' as const,
					description:
						'The complete new HTML content for the entire document. Use this for major rewrites or when the user has selected a large portion of text (multi-paragraph selections).',
				},
				html_snippet_to_replace: {
					type: 'string' as const,
					description:
						'An exact HTML snippet from the current document that needs to be replaced. Use this for targeted, small edits. CRITICAL: Copy the exact HTML from the document including all tags, spacing, and structure. If you cannot find the exact match, use full_document_html instead.',
				},
				replacement_html: {
					type: 'string' as const,
					description:
						'The new HTML snippet that will replace the `html_snippet_to_replace`. Must match the exact same HTML structure. Must be provided if `html_snippet_to_replace` is used.',
				},
			},
		},
	},
};
