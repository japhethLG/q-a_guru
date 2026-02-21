import { GoogleGenAI } from '@google/genai';
import { DocumentAttachment, ChatMessage } from '../types';

// Create a static, unproxied client purely for counting tokens
// This intentionally avoids the proxy config since the proxy doesn't
// implement the countTokens endpoint.
const getClient = () => {
	const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
	if (!apiKey) {
		console.warn('VITE_GEMINI_API_KEY is not set. Token counting may fail.');
	}
	// Note: We're not using standard base URL overrides here, so it hits Google directly
	return new GoogleGenAI({ apiKey });
};

/**
 * Counts the actual tokens of the given contents using the Gemini API.
 * If the model doesn't support token counting (e.g. Anthropic model via proxy),
 * it defaults to using gemini-2.0-flash as a highly accurate proxy tokenizer.
 */
export async function countTokensAPI(
	contents: any,
	modelNameStr: string = 'gemini-2.0-flash'
): Promise<number> {
	try {
		const client = getClient();

		// Use a fast standard model if we receive an unknown or non-Gemini model format
		// like claude-3-5-sonnet.
		let targetModel = modelNameStr;
		if (!targetModel.includes('gemini') && !targetModel.includes('models/')) {
			targetModel = 'gemini-2.0-flash';
		} else {
			// clean "models/" prefix if present
			targetModel = targetModel.replace(/^models\//, '');
		}

		// Fix: countTokens signature requires `contents: any` but wrapped in object?
		// According to SDK docs, countTokens expects { model, contents }
		const result = await client.models.countTokens({
			model: targetModel,
			contents: contents,
		});

		return result.totalTokens || 0;
	} catch (err) {
		console.error('Failed to count tokens:', err);
		// Fallback to heuristic if API fails for some reason
		return fallbackEstimate(contents);
	}
}

/**
 * Convenience method for getting tokens for a simple string.
 */
export async function countTokensForText(
	text: string,
	modelName?: string
): Promise<number> {
	if (!text) return 0;
	return await countTokensAPI(text, modelName);
}

/**
 * Convenience method for getting tokens for a full ChatMessage including images.
 */
export async function countTokensForMessage(
	message: ChatMessage,
	modelName?: string
): Promise<number> {
	const parts: any[] = [];

	if (message.content?.trim()) {
		parts.push({ text: message.content });
	}

	if (message.images?.length) {
		for (const img of message.images) {
			parts.push({
				inlineData: {
					data: img.data, // assuming img.data is base64 without prefix
					mimeType: img.mimeType,
				},
			});
		}
	}

	if (parts.length === 0) return 0;

	return await countTokensAPI(
		[{ role: message.role === 'system' ? 'user' : message.role, parts }],
		modelName
	);
}

/**
 * Convenience method for a DocumentAttachment.
 * Formats it precisely how the LLM will see it.
 */
export async function countTokensForAttachment(
	doc: DocumentAttachment,
	modelName?: string
): Promise<number> {
	if (doc.type === 'native' && doc.rawBase64) {
		// Native file (PDF) formatted as inlineData
		const contents = [
			{
				parts: [
					{
						inlineData: {
							data: doc.rawBase64,
							mimeType: doc.mimeType || 'application/pdf',
						},
					},
				],
			},
		];
		return await countTokensAPI(contents, modelName);
	} else if (doc.type === 'text' && doc.parsedText) {
		// Text representation
		const textPayload = `Document Name: ${doc.fileName}\n\nContent:\n${doc.parsedText}`;
		return await countTokensAPI(textPayload, modelName);
	}
	return 0;
}

/**
 * Legacy fallback in case of network issues with the tokenizer API
 */
function fallbackEstimate(contents: any): number {
	try {
		const str = JSON.stringify(contents);
		return Math.ceil(str.length / 4);
	} catch {
		return 0;
	}
}
