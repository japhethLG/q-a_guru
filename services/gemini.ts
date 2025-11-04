import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	GenerateContentResponse,
} from '@google/genai';
import { QaConfig, ChatConfig, ChatMessage } from '../types';
import { prompts, toolDeclarations } from './prompts';
import { tryReplaceExact, tryReplaceFuzzy } from './htmlReplace';
import { getTemplateById } from './templateStorage';

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

	// Get template if selected
	const selectedTemplate = config.selectedTemplateId
		? getTemplateById(config.selectedTemplateId)
		: null;

	// Build config with template
	const promptConfig = {
		count: config.count,
		type: config.type,
		difficulty: config.difficulty,
		instructions: config.instructions,
		...(selectedTemplate && {
			template: {
				templateString: selectedTemplate.templateString,
				answerFormat: config.answerFormat || selectedTemplate.answerFormat,
			},
		}),
	};

	const prompt = prompts.getQAPrompt(documents, promptConfig);

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
	name: toolDeclarations.editDocument.name,
	description: toolDeclarations.editDocument.description,
	parameters: {
		type: Type.OBJECT,
		properties: {
			full_document_html: {
				type: Type.STRING,
				description:
					toolDeclarations.editDocument.parameters.properties.full_document_html
						.description,
			},
			html_snippet_to_replace: {
				type: Type.STRING,
				description:
					toolDeclarations.editDocument.parameters.properties.html_snippet_to_replace
						.description,
			},
			replacement_html: {
				type: Type.STRING,
				description:
					toolDeclarations.editDocument.parameters.properties.replacement_html
						.description,
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

	const systemInstruction = prompts.reflectionSystemInstruction;

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
					text: prompts.getReflectionUserPrompt(toolResult),
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
	qaConfig?: QaConfig | null,
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

	let systemInstruction = prompts.baseChatSystemInstruction(
		sourceDocuments,
		qaConfig
	);

	if (documentHtml) {
		systemInstruction = prompts.appendDocumentHtml(
			systemInstruction,
			documentHtml
		);
	}

	if (selectedText) {
		systemInstruction = prompts.appendSelectedText(
			systemInstruction,
			selectedText
		);
	}

	const geminiHistory = history
		.filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
		.map((message) => ({
			role: message.role,
			parts: [{ text: message.content }],
		}));

	const userPrompt = prompts.getUserPrompt(newMessage, selectedText);

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

export type ProcessFunctionCallsResult = {
	newHtml?: string;
	toolUsageMessage?: string;
	reflection?: {
		history: ChatMessage[];
		toolResultMessage: string;
	} | null;
	errorMessage?: string;
};

export function processFunctionCalls(params: {
	functionCalls: any[] | undefined;
	documentHtml: string;
	messages: ChatMessage[];
	userMessage: string;
	accumulatedText: string;
}): ProcessFunctionCallsResult {
	const { functionCalls, documentHtml, messages, userMessage, accumulatedText } =
		params;

	if (!functionCalls || functionCalls.length === 0) {
		return { reflection: null };
	}

	const editCall = functionCalls.find((fc) => fc.name === 'edit_document');
	if (!editCall || !editCall.args) {
		return { reflection: null };
	}

	const { full_document_html, html_snippet_to_replace, replacement_html } =
		editCall.args as Record<string, unknown>;

	let newHtml = '';

	if (typeof full_document_html === 'string' && full_document_html) {
		newHtml = full_document_html;
	} else if (
		typeof html_snippet_to_replace === 'string' &&
		html_snippet_to_replace &&
		typeof replacement_html === 'string' &&
		replacement_html
	) {
		// Try exact replacement first
		newHtml =
			tryReplaceExact(documentHtml, html_snippet_to_replace, replacement_html) ||
			tryReplaceFuzzy(documentHtml, html_snippet_to_replace, replacement_html) ||
			'';
		if (!newHtml) {
			return {
				reflection: null,
				errorMessage:
					"I tried to make an edit, but couldn't find the exact text to change. Try highlighting it first or ask me to update the full document.",
			};
		}
	} else {
		return { reflection: null };
	}

	const toolUsageMessage = accumulatedText
		? `${accumulatedText}\n\n**Tool used: edit_document**\n\n`
		: '**Tool used: edit_document**\n\n';

	const conversationHistory: ChatMessage[] = [
		...messages,
		{ role: 'user', content: userMessage },
		{ role: 'model', content: accumulatedText || 'Executed edit_document tool' },
	];

	let changeDescription = '';
	if (full_document_html) {
		changeDescription = 'Full document was updated with new content.';
	} else if (html_snippet_to_replace && replacement_html) {
		changeDescription = 'Partial content replacement was made to the document.';
	}

	const toolResultMessage = `The edit_document tool was executed successfully. ${changeDescription}`;

	return {
		newHtml,
		toolUsageMessage,
		reflection: { history: conversationHistory, toolResultMessage },
	};
}
