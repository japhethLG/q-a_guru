/**
 * Tool execution logic for the chat agent loop.
 *
 * Extracted from useChat.ts to isolate tool-call handling.
 * Bridges the stream processor's output with the gemini service's
 * processFunctionCalls, and formats tool-result messages for
 * feeding back into the LLM.
 */

import {
	processFunctionCalls,
	ProcessFunctionCallsResult,
} from '../services/gemini';
import { StreamResult } from './useStreamProcessor';
import { LLMTransport } from '../services/llmTransport';

/** Maximum number of tool-call iterations per user message */
export const MAX_AGENT_TURNS = 5;

/**
 * Process function calls from a stream result.
 *
 * Bridges the StreamResult (from useStreamProcessor) into the
 * processFunctionCalls service, mapping the collected function calls
 * and accumulated text.
 */
export async function handleFunctionCalls(
	streamResult: StreamResult,
	documentHtml: string,
	transport?: LLMTransport
): Promise<ProcessFunctionCallsResult> {
	return processFunctionCalls({
		functionCalls: streamResult.collectedFunctionCalls,
		documentHtml,
		accumulatedText: streamResult.accumulatedText,
		transport,
	});
}

/**
 * Build a tool-result message to feed back to the LLM for the next
 * iteration of the agent loop.
 *
 * Includes the tool response (if any), success/failure status, and
 * a step counter so the model knows how many turns remain.
 */
export function buildToolResultMessage(
	result: ProcessFunctionCallsResult,
	iteration: number,
	maxTurns: number
): string {
	const parts: string[] = [];

	if (result.toolResponse) {
		parts.push(`[Tool Result]\n${result.toolResponse}`);
	}

	if (result.success && result.newHtml !== undefined) {
		parts.push(`[Edit Result] ✅ Edit applied successfully: ${result.message}`);
	} else if (!result.success) {
		parts.push(`[Edit Result] ❌ Edit failed: ${result.message}`);
		parts.push(
			'Please review the error and try again with corrected parameters.'
		);
	}

	parts.push(`(Agent step ${iteration}/${maxTurns})`);

	return parts.join('\n\n');
}
