import { ChatMessage } from '../types';

/**
 * Extract thinking tokens from a response chunk
 */
export const extractThinkingTokens = (chunk: any): string => {
	if (chunk.thinking) {
		return chunk.thinking;
	}

	if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
		const thinkingParts = chunk.candidates[0].content.parts
			.filter((part: any) => part.thought === true && part.text)
			.map((part: any) => part.text)
			.join('');
		return thinkingParts;
	}

	return '';
};

/**
 * Create a message object with thinking metadata
 */
export const createMessageWithThinking = (
	content: string,
	accumulatedThinking: string,
	thinkingStartTime: number | undefined,
	existingMessage?: ChatMessage
): ChatMessage => {
	const baseMessage: ChatMessage = {
		role: 'model',
		content,
	};

	if (accumulatedThinking) {
		return {
			...baseMessage,
			thinking: accumulatedThinking,
			...(thinkingStartTime && { thinkingStartTime }),
		};
	}

	// Preserve existing thinking if no new thinking
	if (existingMessage?.thinking) {
		return {
			...baseMessage,
			thinking: existingMessage.thinking,
			...(existingMessage.thinkingStartTime && {
				thinkingStartTime: existingMessage.thinkingStartTime,
			}),
		};
	}

	return baseMessage;
};

/**
 * Interface for chat stream processing state
 */
export interface ChatStreamState {
	accumulatedText: string;
	accumulatedThinking: string;
	thinkingStartTime: number | undefined;
	isFirstChunk: boolean;
}

/**
 * Manually extract text from a response chunk's parts,
 * avoiding the SDK's `.text` getter which logs warnings when
 * non-text parts (e.g., functionCall, thoughtSignature) are present.
 */
const extractTextFromChunk = (chunk: any): string | undefined => {
	// Try candidates[0].content.parts directly
	const parts = chunk?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) {
		return undefined;
	}

	let text = '';
	let hasTextPart = false;

	for (const part of parts) {
		// Skip thinking/thought parts
		if (typeof part.thought === 'boolean' && part.thought) {
			continue;
		}
		// Only accumulate actual text parts
		if (typeof part.text === 'string') {
			hasTextPart = true;
			text += part.text;
		}
	}

	return hasTextPart ? text : undefined;
};

/**
 * Process a single chat stream chunk and update state
 */
export const processChatStreamChunk = (
	chunk: any,
	state: ChatStreamState
): {
	text: string | null;
	thinking: string | null;
	thinkingStartTime: number | undefined;
	updatedState: ChatStreamState;
} => {
	const thinkingText = extractThinkingTokens(chunk);

	// Update thinking state
	if (thinkingText) {
		if (!state.thinkingStartTime && state.accumulatedThinking === '') {
			state.thinkingStartTime = Date.now();
		}
		state.accumulatedThinking += thinkingText;
	}

	// Process text content — use manual extraction to avoid SDK warning
	let text: string | null = null;
	const chunkText = extractTextFromChunk(chunk);
	if (chunkText !== undefined) {
		if (state.isFirstChunk) {
			state.accumulatedText = chunkText;
			state.isFirstChunk = false;
		} else {
			state.accumulatedText += chunkText;
		}
		text = state.accumulatedText;
	}

	return {
		text,
		thinking: thinkingText ? state.accumulatedThinking : null,
		thinkingStartTime: state.thinkingStartTime,
		updatedState: state,
	};
};
