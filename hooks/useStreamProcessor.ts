/**
 * Stream processor for Gemini chat responses.
 *
 * Extracted from useChat.ts to isolate stream processing logic.
 * Handles chunk accumulation, function call collection, and
 * real-time message updates via callbacks.
 */

import {
	ChatStreamState,
	processChatStreamChunk,
	createMessageWithThinking,
} from '../utils/streamHelpers';
import { ChatMessage } from '../types';

export interface StreamResult {
	fullResponse: any;
	collectedFunctionCalls: any[];
	accumulatedText: string;
	accumulatedThinking: string;
	thinkingStartTime: number | undefined;
}

/**
 * Process a Gemini chat stream, accumulating text/thinking and function calls.
 *
 * @param responseStream - The async generator from getChatResponseStream
 * @param abortSignal - The abort signal to check for cancellation
 * @param onUpdate - Callback to update the UI with progressive text/thinking
 */
/**
 * Extract function calls from a response chunk using multiple strategies.
 * The SDK getter can sometimes fail with newer thinking models,
 * so we also manually parse candidates[0].content.parts as a fallback.
 */
function extractFunctionCalls(chunk: any): any[] {
	// Strategy 1: Use the SDK getter (works on proper GenerateContentResponse instances)
	try {
		const sdkCalls = chunk.functionCalls;
		if (sdkCalls && sdkCalls.length > 0) {
			return sdkCalls;
		}
	} catch {
		// Getter may throw in edge cases
	}

	// Strategy 2: Manually parse candidates[0].content.parts for functionCall parts
	try {
		const parts = chunk?.candidates?.[0]?.content?.parts;
		if (Array.isArray(parts)) {
			const manualCalls = parts
				.filter((part: any) => part.functionCall)
				.map((part: any) => part.functionCall)
				.filter((fc: any) => fc !== undefined && fc !== null);
			if (manualCalls.length > 0) {
				console.log(
					'[useStreamProcessor] Function calls found via fallback parts parsing:',
					manualCalls.map((fc: any) => fc.name)
				);
				return manualCalls;
			}
		}
	} catch {
		// Parts may not exist
	}

	return [];
}

export async function processStream(
	responseStream: AsyncGenerator<any, void, unknown>,
	abortSignal: AbortSignal | null,
	onUpdate: (
		text: string | null,
		thinking: string,
		thinkingStartTime: number | undefined
	) => void
): Promise<StreamResult> {
	let fullResponse = null;
	const collectedFunctionCalls: any[] = [];
	const streamState: ChatStreamState = {
		accumulatedText: '',
		accumulatedThinking: '',
		thinkingStartTime: undefined,
		isFirstChunk: true,
	};

	for await (const chunk of await responseStream) {
		if (abortSignal?.aborted) {
			break;
		}

		fullResponse = chunk;

		// Capture function calls from ANY chunk using robust extraction
		const chunkFunctionCalls = extractFunctionCalls(chunk);
		if (chunkFunctionCalls.length > 0) {
			collectedFunctionCalls.push(...chunkFunctionCalls);
		}

		const { text, thinking } = processChatStreamChunk(chunk, streamState);

		// Update state reference
		// processChatStreamChunk mutates streamState in-place via updatedState

		onUpdate(
			text,
			streamState.accumulatedThinking,
			streamState.thinkingStartTime
		);
	}

	// Final safety net: if no function calls were collected during streaming,
	// try extracting from the last response one more time
	if (collectedFunctionCalls.length === 0 && fullResponse) {
		const finalCalls = extractFunctionCalls(fullResponse);
		if (finalCalls.length > 0) {
			console.log(
				'[useStreamProcessor] Function calls recovered from final response:',
				finalCalls.map((fc: any) => fc.name)
			);
			collectedFunctionCalls.push(...finalCalls);
		}
	}

	if (collectedFunctionCalls.length > 0) {
		console.log(
			'[useStreamProcessor] Total function calls collected:',
			collectedFunctionCalls.map(
				(fc: any) => `${fc.name}(${JSON.stringify(fc.args).substring(0, 100)})`
			)
		);
	}

	return {
		fullResponse,
		collectedFunctionCalls,
		accumulatedText: streamState.accumulatedText,
		accumulatedThinking: streamState.accumulatedThinking,
		thinkingStartTime: streamState.thinkingStartTime,
	};
}

/**
 * Create a message update handler for the stream processor.
 *
 * This creates the onUpdate callback that integrates with React state
 * via a setMessages function and the createMessageWithThinking helper.
 */
export function createStreamUpdateHandler(
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) {
	return (
		text: string | null,
		thinking: string,
		thinkingStartTime: number | undefined
	) => {
		if (text !== null) {
			setMessages((prev) => {
				const updated = [...prev];
				const lastMessage = updated[updated.length - 1];
				updated[updated.length - 1] = createMessageWithThinking(
					text,
					thinking,
					thinkingStartTime,
					lastMessage
				);
				return updated;
			});
		} else if (thinking) {
			setMessages((prev) => {
				const updated = [...prev];
				if (updated.length > 0 && updated[updated.length - 1].role === 'model') {
					const lastMessage = updated[updated.length - 1];
					updated[updated.length - 1] = {
						...lastMessage,
						...(thinking && {
							thinking,
							...(thinkingStartTime && { thinkingStartTime }),
						}),
					};
				}
				return updated;
			});
		}
	};
}
