import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	GenerateContentResponse,
} from '@google/genai';
import { QaConfig, ChatConfig, ChatMessage } from '../types';

/**
 * Generates questions and answers based on provided documents and configuration.
 * Returns an async generator that yields streaming responses.
 */
export const generateQaStream = async function* (
	documents: string[],
	config: QaConfig,
	apiKey?: string,
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
	const combinedDocuments = documents.join('\n\n---\n\n');

	const prompt = `
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

	try {
		// Use generateContentStream for streaming responses
		const response = ai.models.generateContentStream({
			// Use model from config
			model: config.model,
			contents: prompt,
		});

		for await (const chunk of await response) {
			if (signal?.aborted) {
				break;
			}
			yield chunk;
		}
	} catch (error) {
		// Check if it was an abort error
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.error('Error generating Q&A:', error);
		throw error;
	}
};

/**
 * Analyzes an image with a user-provided prompt.
 */
export const analyzeImage = async (
	base64ImageData: string,
	mimeType: string,
	prompt: string,
	apiKey?: string
): Promise<string> => {
	try {
		const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
		const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

		const imagePart = {
			inlineData: {
				data: base64ImageData,
				mimeType: mimeType,
			},
		};

		const textPart = {
			text: prompt,
		};

		// Per guidelines, use generateContent for multimodal input.
		const response = await ai.models.generateContent({
			// 'gemini-2.5-flash' is a suitable model for multimodal chat.
			model: 'gemini-2.5-flash',
			contents: { parts: [imagePart, textPart] },
		});

		// Per guidelines, extract text output via the .text property.
		return response.text;
	} catch (error) {
		console.error('Error analyzing image:', error);
		return 'An error occurred during analysis. Please check the console for details.';
	}
};

const editDocumentTool: FunctionDeclaration = {
	name: 'edit_document',
	description:
		'Edits the document content. Use this tool when the user asks to make changes, rewrite, summarize, or modify the document.',
	parameters: {
		type: Type.OBJECT,
		properties: {
			full_document_html: {
				type: Type.STRING,
				description:
					'The complete new HTML content for the entire document. Use this for major rewrites or when the user has selected a large portion of text (multi-paragraph selections).',
			},
			html_snippet_to_replace: {
				type: Type.STRING,
				description:
					'An exact HTML snippet from the current document that needs to be replaced. Use this for targeted, small edits. CRITICAL: Copy the exact HTML from the document including all tags, spacing, and structure. If you cannot find the exact match, use full_document_html instead.',
			},
			replacement_html: {
				type: Type.STRING,
				description:
					'The new HTML snippet that will replace the `html_snippet_to_replace`. Must match the exact same HTML structure. Must be provided if `html_snippet_to_replace` is used.',
			},
		},
	},
};

/**
 * Handles a tool result reflection call where AI summarizes changes made.
 */
export const getReflectionStream = async function* (
	history: ChatMessage[],
	toolResult: string,
	apiKey?: string,
	model:
		| 'gemini-2.5-pro'
		| 'gemini-2.5-flash'
		| 'gemini-2.5-flash-lite' = 'gemini-2.5-pro',
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

	const systemInstruction = `You are continuing a conversation where you just executed a document editing tool. 

Your response is a DIRECT CONTINUATION of your previous message to the user. Do NOT start with phrases like "You got it!" or "I've updated it for you" - those are redundant.

Instead, jump directly into describing what changed, as if you're continuing your explanation. For example:

BAD: "You got it! I've updated the list. Here's what changed: ..."
GOOD: "I've added five more general knowledge questions to the end of the list, bringing the total to fifteen questions."

Focus on:
- What specifically was changed
- Brief, natural continuation of your explanation
- Use markdown formatting for clarity

Remember: This is a continuation, not a new conversation. Do NOT repeat what you already said.`;

	const geminiHistory = history
		.filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
		.map((message) => ({
			role: message.role,
			parts: [{ text: message.content }],
		}));

	const contents = [
		...geminiHistory,
		{
			role: 'user',
			parts: [
				{
					text: `Tool execution completed.\n\n${toolResult}\n\nProvide a brief summary of what was changed.`,
				},
			],
		},
	];

	try {
		const response = ai.models.generateContentStream({
			model: model,
			contents: contents,
			config: {
				systemInstruction: systemInstruction,
			},
		});

		for await (const chunk of await response) {
			if (signal?.aborted) {
				break;
			}
			yield chunk;
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.error('Error in reflection:', error);
		throw error;
	}
};

/**
 * Handles chat interactions, providing context and tools to the AI.
 * Returns an async generator that yields streaming responses.
 */
export const getChatResponseStream = async function* (
	history: ChatMessage[],
	newMessage: string,
	sourceDocuments: string[],
	documentHtml?: string,
	selectedText?: string,
	apiKey?: string,
	model:
		| 'gemini-2.5-pro'
		| 'gemini-2.5-flash'
		| 'gemini-2.5-flash-lite' = 'gemini-2.5-pro',
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

	let systemInstruction = `You are an AI assistant in a document editor. Your primary function is to help the user by answering questions and modifying the document content.

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

Context:
The user has provided the following source documents. Base your knowledge and answers on this content.
--- SOURCE DOCUMENTS START ---
${sourceDocuments.join('\n\n---\n\n')}
--- SOURCE DOCUMENTS END ---
`;

	if (documentHtml) {
		systemInstruction += `\n\nThis is the current state of the document in the editor. Use this as the primary reference for finding the 'html_snippet_to_replace'.\n"""\n${documentHtml}\n"""`;
	}

	if (selectedText) {
		systemInstruction += `\n\n## USER SELECTION (IMPORTANT):
The user has HIGHLIGHTED the following content. Since you have the selected context, you MUST use 'full_document_html' to provide the complete updated document. Do NOT use 'html_snippet_to_replace' - it often fails with highlighted content.

Selected content to edit:
"""${selectedText}"""

When using edit_document tool:
- ALWAYS use 'full_document_html' with the complete updated document HTML
- Do NOT use 'html_snippet_to_replace' when selectedText is provided
- Make sure your 'full_document_html' includes the updated version of the selected content above`;
	}

	const geminiHistory = history
		.filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
		.map((message) => ({
			role: message.role,
			parts: [{ text: message.content }],
		}));

	let userPrompt = newMessage;
	if (selectedText) {
		userPrompt += `\n\nApply this command to the following selected HTML snippet:\n"""\n${selectedText}\n"""`;
	}

	const contents = [
		...geminiHistory,
		{ role: 'user', parts: [{ text: userPrompt }] },
	];

	try {
		const response = ai.models.generateContentStream({
			model: model,
			contents: contents,
			config: {
				systemInstruction: systemInstruction,
				tools: [{ functionDeclarations: [editDocumentTool] }],
				thinkingConfig: {
					thinkingBudget: -1, // Enable dynamic thinking (auto-adjusts based on complexity)
					includeThoughts: true, // Include the model's thought process in response
				},
			},
		});

		for await (const chunk of await response) {
			if (signal?.aborted) {
				break;
			}
			yield chunk;
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.error('Error in chat:', error);
		// Re-throw to be handled by the UI component
		throw error;
	}
};
