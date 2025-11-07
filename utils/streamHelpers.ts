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
 * Create a reflection message with combined thinking from chat and reflection
 */
export const createReflectionMessageWithThinking = (
	content: string,
	reflectionThinking: string,
	reflectionThinkingStartTime: number | undefined,
	currentMessage: ChatMessage
): ChatMessage => {
	const combinedThinking = (currentMessage.thinking || '') + reflectionThinking;

	if (combinedThinking) {
		return {
			role: 'model',
			content,
			thinking: combinedThinking,
			...(currentMessage.thinkingStartTime || reflectionThinkingStartTime
				? {
						thinkingStartTime:
							currentMessage.thinkingStartTime || reflectionThinkingStartTime,
					}
				: {}),
		};
	}

	return {
		role: 'model',
		content,
	};
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

	// Process text content
	let text: string | null = null;
	if (chunk.text) {
		if (state.isFirstChunk) {
			state.accumulatedText = chunk.text;
			state.isFirstChunk = false;
		} else {
			state.accumulatedText += chunk.text;
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

/**
 * Interface for reflection stream processing state
 */
export interface ReflectionStreamState {
	reflectionText: string;
	reflectionThinking: string;
	reflectionThinkingStartTime: number | undefined;
}

/**
 * Process a single reflection stream chunk and update state
 */
export const processReflectionStreamChunk = (
	chunk: any,
	state: ReflectionStreamState
): {
	text: string | null;
	thinking: string | null;
	thinkingStartTime: number | undefined;
	updatedState: ReflectionStreamState;
} => {
	const thinkingText = extractThinkingTokens(chunk);

	// Update thinking state
	if (thinkingText) {
		if (!state.reflectionThinkingStartTime && state.reflectionThinking === '') {
			state.reflectionThinkingStartTime = Date.now();
		}
		state.reflectionThinking += thinkingText;
	}

	// Process text content
	let text: string | null = null;
	if (chunk.text) {
		state.reflectionText += chunk.text;
		text = state.reflectionText;
	}

	return {
		text,
		thinking: thinkingText ? state.reflectionThinking : null,
		thinkingStartTime: state.reflectionThinkingStartTime,
		updatedState: state,
	};
};
