import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	GenerateContentResponse,
} from '@google/genai';
import { QaConfig, ChatMessage } from '../types';

// Per guidelines, initialize with a named apiKey parameter.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * Generates questions and answers based on provided documents and configuration.
 */
export const generateQa = async (
	documents: string[],
	config: QaConfig
): Promise<string> => {
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
		// Per guidelines, use generateContent for text answers.
		const response = await ai.models.generateContent({
			// Per guidelines, use 'gemini-2.5-flash' for Basic Text Tasks.
			model: 'gemini-2.5-flash',
			contents: prompt,
		});
		// Per guidelines, extract text output via the .text property.
		return response.text;
	} catch (error) {
		console.error('Error generating Q&A:', error);
		return '<p><strong>Error:</strong> Failed to generate Q&A. Please check the console for details.</p>';
	}
};

/**
 * Analyzes an image with a user-provided prompt.
 */
export const analyzeImage = async (
	base64ImageData: string,
	mimeType: string,
	prompt: string
): Promise<string> => {
	try {
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
					'The complete new HTML content for the entire document. Use this for major rewrites or when multiple sections are changed.',
			},
			html_snippet_to_replace: {
				type: Type.STRING,
				description:
					'An exact HTML snippet from the current document that needs to be replaced. Use this for targeted, small edits.',
			},
			replacement_html: {
				type: Type.STRING,
				description:
					'The new HTML snippet that will replace the `html_snippet_to_replace`. Must be provided if `html_snippet_to_replace` is used.',
			},
		},
	},
};

/**
 * Handles chat interactions, providing context and tools to the AI.
 */
export const getChatResponse = async (
	history: ChatMessage[],
	newMessage: string,
	sourceDocuments: string[],
	documentHtml?: string,
	selectedText?: string
): Promise<GenerateContentResponse> => {
	let systemInstruction = `You are an AI assistant in a document editor. Your primary function is to help the user by answering questions and modifying the document content.

Formatting Rules:
- All output for the document must be clean HTML.
- Each question should be in a <p> tag with bold text (e.g., <p><strong>1. What is the capital of France?</strong></p>).
- The answer should follow in a separate <p> tag (e.g., <p>The capital of France is Paris.</p>).
- For multiple choice questions, provide options in an ordered list (e.g., <ol><li>Option A</li>...</ol>).

Editing Instructions:
- When the user asks you to modify the document, you MUST use the edit_document tool.
- For small, targeted changes (e.g., correcting a sentence), use the 'html_snippet_to_replace' and 'replacement_html' parameters. Find the exact HTML snippet to replace in the current document context.
- For large-scale changes (e.g., regenerating the whole document), use the 'full_document_html' parameter with the complete, new HTML for the document.
- Prioritize partial replacement for efficiency unless a full rewrite is necessary.

Context:
The user has provided the following source documents. Base your knowledge and answers on this content.
--- SOURCE DOCUMENTS START ---
${sourceDocuments.join('\n\n---\n\n')}
--- SOURCE DOCUMENTS END ---
`;

	if (documentHtml) {
		systemInstruction += `\n\nThis is the current state of the document in the editor. Use this as the primary reference for finding the 'html_snippet_to_replace'.\n"""\n${documentHtml}\n"""`;
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
		const response = await ai.models.generateContent({
			model: 'gemini-2.5-pro',
			contents: contents,
			config: {
				systemInstruction: systemInstruction,
				tools: [{ functionDeclarations: [editDocumentTool] }],
			},
		});
		return response;
	} catch (error) {
		console.error('Error in chat:', error);
		// Re-throw to be handled by the UI component
		throw error;
	}
};
