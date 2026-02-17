/**
 * Context management utilities for chat history pruning and token estimation.
 *
 * Prevents quality degradation in long conversations by keeping only
 * the most recent turns and respecting a token budget.
 */

import { ChatMessage } from '../types';

/** Maximum number of user turns to keep in history */
const MAX_HISTORY_TURNS = 10;

/** Maximum total tokens for history (rough estimate) */
const MAX_HISTORY_TOKENS = 50_000;

/** Rough chars-per-token estimate for English text */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens in a string.
 * Uses a simple chars/4 heuristic — accurate enough for budgeting.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Prune conversation history to stay within turn and token limits.
 *
 * Strategy:
 * 1. Keep only the last MAX_HISTORY_TURNS user messages and their responses.
 * 2. If still over token budget, drop the oldest user+model pairs.
 *
 * Messages are returned in their original order. The UI still shows ALL
 * messages — this only affects what gets sent to the API.
 */
export function pruneHistory(messages: ChatMessage[]): ChatMessage[] {
	if (messages.length === 0) return messages;

	// Step 1: Turn-based limit — count user turns from the end
	let userCount = 0;
	let cutIndex = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') {
			userCount++;
			if (userCount > MAX_HISTORY_TURNS) {
				cutIndex = i + 1; // keep from this index onward
				break;
			}
		}
	}
	let pruned = cutIndex > 0 ? messages.slice(cutIndex) : [...messages];

	// Step 2: Token-based limit — drop oldest pairs until under budget
	let totalTokens = pruned.reduce(
		(sum, m) => sum + estimateTokens(m.content),
		0
	);

	while (totalTokens > MAX_HISTORY_TOKENS && pruned.length > 4) {
		const dropped = pruned.shift()!;
		totalTokens -= estimateTokens(dropped.content);

		// Also drop the paired model response to maintain alternation
		if (pruned.length > 0 && pruned[0].role === 'model') {
			totalTokens -= estimateTokens(pruned[0].content);
			pruned.shift();
		}
	}

	return pruned;
}

// ---------------------------------------------------------------------------
// Token Budget System
// ---------------------------------------------------------------------------

/** Practical token budget — stays well within Gemini's 1M limit */
const PRACTICAL_TOKEN_BUDGET = 100_000;

export interface ContextBudget {
	total: number;
	breakdown: {
		systemPrompt: number;
		sourceDocuments: number;
		documentHtml: number;
		history: number;
		newMessage: number;
	};
	overBudget: boolean;
	recommendation: string | null;
}

/**
 * Estimate total context token usage and provide budgeting guidance.
 *
 * Call this before sending to the API. If `overBudget` is true, apply
 * the `recommendation` (usually pruning history or truncating docs).
 */
export function buildContextBudget(params: {
	systemPrompt: string;
	sourceDocuments: string[];
	documentHtml: string;
	history: ChatMessage[];
	newMessage: string;
}): ContextBudget {
	const breakdown = {
		systemPrompt: estimateTokens(params.systemPrompt),
		sourceDocuments: params.sourceDocuments.reduce(
			(sum, doc) => sum + estimateTokens(doc),
			0
		),
		documentHtml: estimateTokens(params.documentHtml),
		history: params.history.reduce(
			(sum, m) => sum + estimateTokens(m.content),
			0
		),
		newMessage: estimateTokens(params.newMessage),
	};

	const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
	const overBudget = total > PRACTICAL_TOKEN_BUDGET;

	let recommendation: string | null = null;
	if (overBudget) {
		const excess = total - PRACTICAL_TOKEN_BUDGET;
		if (breakdown.history > excess) {
			recommendation = `Prune history (${breakdown.history} tokens) to save ~${excess} tokens`;
		} else if (breakdown.sourceDocuments > excess) {
			recommendation = `Truncate source documents (${breakdown.sourceDocuments} tokens) to stay within budget`;
		} else {
			recommendation = `Context is ${total} tokens (budget: ${PRACTICAL_TOKEN_BUDGET}). Consider reducing document size or history.`;
		}
	}

	// Log budget breakdown in dev mode
	if (import.meta.env.DEV) {
		console.log(
			`[ContextBudget] Total: ${total} tokens${overBudget ? ' ⚠️ OVER BUDGET' : ''}`,
			breakdown
		);
	}

	return { total, breakdown, overBudget, recommendation };
}

// ---------------------------------------------------------------------------
// Source Document Truncation
// ---------------------------------------------------------------------------

/** Maximum token budget for source documents (20% of practical budget) */
const SOURCE_DOC_BUDGET = Math.floor(PRACTICAL_TOKEN_BUDGET * 0.2);

/**
 * Proportionally truncate source documents to stay within budget.
 *
 * When total source doc tokens exceed the budget, each document is
 * trimmed proportionally to its share. A truncation notice is appended.
 */
export function truncateSourceDocuments(
	documents: string[],
	maxTokens: number = SOURCE_DOC_BUDGET
): string[] {
	if (documents.length === 0) return documents;

	const totalTokens = documents.reduce(
		(sum, doc) => sum + estimateTokens(doc),
		0
	);

	if (totalTokens <= maxTokens) return documents;

	const ratio = maxTokens / totalTokens;

	return documents.map((doc) => {
		const maxChars = Math.floor(doc.length * ratio);
		if (doc.length <= maxChars) return doc;
		return (
			doc.slice(0, maxChars) + '\n\n[… Document truncated to fit context window]'
		);
	});
}

// ---------------------------------------------------------------------------
// Conversation Compaction
// ---------------------------------------------------------------------------

/**
 * Extract a brief summary of dropped messages for context preservation.
 *
 * When pruneHistory drops old turns, this generates a one-line summary
 * of the dropped content so the AI retains some awareness of what was
 * discussed earlier without the full token cost.
 */
function summarizeDroppedMessages(dropped: ChatMessage[]): string {
	if (dropped.length === 0) return '';

	// Extract unique key topics from user messages
	const userMessages = dropped
		.filter((m) => m.role === 'user')
		.map((m) => m.content.trim());

	if (userMessages.length === 0) return '';

	// Take first 100 chars of each user message as a topic indicator
	const topics = userMessages
		.map((msg) => {
			const firstLine = msg.split('\n')[0];
			return firstLine.length > 100
				? firstLine.substring(0, 100) + '…'
				: firstLine;
		})
		.slice(0, 5); // Max 5 topics

	return `[Earlier in this conversation, the user discussed: ${topics.join('; ')}]`;
}

/**
 * Prune history with compaction: drops old turns but inserts a summary
 * of what was discussed, so the AI retains some context.
 *
 * Returns the pruned array with a compaction summary prepended if
 * messages were dropped.
 */
export function compactHistory(messages: ChatMessage[]): ChatMessage[] {
	if (messages.length === 0) return messages;

	const pruned = pruneHistory(messages);

	// If nothing was dropped, no compaction needed
	if (pruned.length === messages.length) return pruned;

	// Identify what was dropped
	const droppedCount = messages.length - pruned.length;
	const dropped = messages.slice(0, droppedCount);
	const summary = summarizeDroppedMessages(dropped);

	if (!summary) return pruned;

	// Prepend compaction summary as a system-like user message
	return [
		{ role: 'user', content: summary },
		{
			role: 'model',
			content: 'Understood, I have context from the earlier discussion.',
		},
		...pruned,
	];
}
