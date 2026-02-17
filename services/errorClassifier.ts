/**
 * Error classification for Gemini API errors.
 * Provides user-friendly messages and retry guidance.
 */

export type ErrorType =
	| 'rate_limit'
	| 'context_overflow'
	| 'auth'
	| 'network'
	| 'transient'
	| 'unknown';

export interface ClassifiedError {
	type: ErrorType;
	userMessage: string;
	retryable: boolean;
	retryDelayMs?: number;
}

/**
 * Classify an error from the Gemini API into an actionable category.
 * Inspects error message, name, and HTTP status patterns.
 */
export function classifyError(error: unknown): ClassifiedError {
	const message = error instanceof Error ? error.message : String(error);
	const lowerMessage = message.toLowerCase();

	// Rate limit — HTTP 429 / RESOURCE_EXHAUSTED
	if (
		lowerMessage.includes('429') ||
		lowerMessage.includes('resource_exhausted') ||
		lowerMessage.includes('rate limit') ||
		lowerMessage.includes('quota')
	) {
		return {
			type: 'rate_limit',
			userMessage: '⏳ Rate limit reached. Retrying in a few seconds…',
			retryable: true,
			retryDelayMs: 5_000,
		};
	}

	// Context overflow — token/context limit exceeded
	if (
		lowerMessage.includes('exceeds the maximum') ||
		lowerMessage.includes('context length') ||
		lowerMessage.includes('too many tokens') ||
		lowerMessage.includes('token limit') ||
		lowerMessage.includes('request too large') ||
		(lowerMessage.includes('invalid_argument') &&
			lowerMessage.includes('content'))
	) {
		return {
			type: 'context_overflow',
			userMessage:
				'📏 Context too large. Pruning conversation history and retrying…',
			retryable: true,
			retryDelayMs: 0,
		};
	}

	// Auth / API key — HTTP 401/403 / PERMISSION_DENIED
	if (
		lowerMessage.includes('401') ||
		lowerMessage.includes('403') ||
		lowerMessage.includes('permission_denied') ||
		lowerMessage.includes('unauthorized') ||
		lowerMessage.includes('api key') ||
		lowerMessage.includes('authentication')
	) {
		return {
			type: 'auth',
			userMessage: '🔑 API key issue. Please check your API key in settings.',
			retryable: false,
		};
	}

	// Network errors
	if (
		lowerMessage.includes('failed to fetch') ||
		lowerMessage.includes('network') ||
		lowerMessage.includes('econnrefused') ||
		lowerMessage.includes('enotfound') ||
		lowerMessage.includes('timeout') ||
		(error instanceof TypeError && lowerMessage.includes('fetch'))
	) {
		return {
			type: 'network',
			userMessage:
				'🌐 Network error. Please check your internet connection and try again.',
			retryable: true,
			retryDelayMs: 2_000,
		};
	}

	// Transient server errors — HTTP 500/502/503
	if (
		lowerMessage.includes('500') ||
		lowerMessage.includes('502') ||
		lowerMessage.includes('503') ||
		lowerMessage.includes('internal') ||
		lowerMessage.includes('unavailable') ||
		lowerMessage.includes('overloaded')
	) {
		return {
			type: 'transient',
			userMessage: '⚙️ Server error. Retrying…',
			retryable: true,
			retryDelayMs: 3_000,
		};
	}

	// Unknown fallback
	return {
		type: 'unknown',
		userMessage: '❌ An unexpected error occurred. Please try again.',
		retryable: false,
	};
}

/** Simple delay helper for retry backoff */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
