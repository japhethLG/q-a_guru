/**
 * Context management utilities for chat history pruning and token estimation.
 *
 * Prevents quality degradation in long conversations by keeping only
 * the most recent turns and respecting a token budget.
 */

import { ChatMessage } from '../types';
import { countTokensForText, countTokensForMessage } from './tokenCounter';

/** Maximum number of user turns to keep in history */
const MAX_HISTORY_TURNS = 10;

/** Default fallback input token limit when model limit is unknown */
const DEFAULT_INPUT_TOKEN_LIMIT = 1_000_000;

// ---------------------------------------------------------------------------
// Dynamic Budget Functions
// ---------------------------------------------------------------------------

/** Get practical budget (80% of model limit to leave room for output + overhead) */
function getPracticalBudget(modelInputLimit?: number): number {
	const limit = modelInputLimit || DEFAULT_INPUT_TOKEN_LIMIT;
	return Math.floor(limit * 0.8);
}

/** Get max history token budget (50% of practical budget) */
function getMaxHistoryTokens(modelInputLimit?: number): number {
	return Math.floor(getPracticalBudget(modelInputLimit) * 0.5);
}

/** Get source document token budget (20% of practical budget) */
function getSourceDocBudget(modelInputLimit?: number): number {
	return Math.floor(getPracticalBudget(modelInputLimit) * 0.2);
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
export async function pruneHistory(
	messages: ChatMessage[],
	modelName: string,
	modelInputLimit?: number,
	permanentTokens?: { sourceDocs: number; documentHtml: number }
): Promise<ChatMessage[]> {
	if (messages.length === 0) return messages;

	// Calculate available history budget by subtracting permanent context
	const baseHistoryBudget = getMaxHistoryTokens(modelInputLimit);
	const permanentTotal =
		(permanentTokens?.sourceDocs || 0) + (permanentTokens?.documentHtml || 0);
	const maxHistoryTokens = Math.max(
		baseHistoryBudget - permanentTotal,
		10_000 // Floor: always allow at least 10K tokens for history
	);

	// Step 1: Turn-based limit — count user turns from the end
	let userCount = 0;
	let cutIndex = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') {
			userCount++;
			if (userCount > MAX_HISTORY_TURNS) {
				cutIndex = i + 1;
				break;
			}
		}
	}
	let pruned = cutIndex > 0 ? messages.slice(cutIndex) : [...messages];

	// Step 2: Token-based limit — drop oldest pairs until under budget
	// Populate token cache to avoid recounting
	let totalTokens = 0;
	const tokenCache: number[] = new Array(pruned.length).fill(0);

	for (let i = 0; i < pruned.length; i++) {
		const m = pruned[i];
		let tokens = await countTokensForMessage(m, modelName);
		tokenCache[i] = tokens;
		totalTokens += tokens;
	}

	while (totalTokens > maxHistoryTokens && pruned.length > 4) {
		const dropped = pruned.shift()!;
		let droppedTokens = tokenCache.shift()!;
		totalTokens -= droppedTokens;

		// Also drop the paired model response to maintain alternation
		if (pruned.length > 0 && pruned[0].role === 'model') {
			pruned.shift();
			let modelTokens = tokenCache.shift()!;
			totalTokens -= modelTokens;
		}
	}

	return pruned;
}

// ---------------------------------------------------------------------------
// Token Budget System
// ---------------------------------------------------------------------------

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
 * Total exact API context token usage and provide budgeting guidance.
 *
 * Call this before sending to the API. If `overBudget` is true, apply
 * the `recommendation` (usually pruning history or truncating docs).
 */
export async function buildContextBudget(params: {
	systemPrompt: string;
	sourceDocuments: string[];
	nativeDocTokens?: number;
	documentHtml: string;
	history: ChatMessage[];
	newMessage: string;
	modelName: string;
	modelInputLimit?: number;
}): Promise<ContextBudget> {
	const practicalBudget = getPracticalBudget(params.modelInputLimit);

	// Run API counts in parallel
	const [systemPrompt, documentHtml, newMessage] = await Promise.all([
		countTokensForText(params.systemPrompt, params.modelName),
		countTokensForText(params.documentHtml, params.modelName),
		countTokensForText(params.newMessage, params.modelName),
	]);

	const textDocTokensArr = await Promise.all(
		params.sourceDocuments.map((doc) => countTokensForText(doc, params.modelName))
	);
	const textDocTokens = textDocTokensArr.reduce((sum, count) => sum + count, 0);

	const historyTokensArr = await Promise.all(
		params.history.map((m) => countTokensForMessage(m, params.modelName))
	);
	const historyTokens = historyTokensArr.reduce((sum, count) => sum + count, 0);

	const breakdown = {
		systemPrompt,
		sourceDocuments: textDocTokens + (params.nativeDocTokens || 0),
		documentHtml,
		history: historyTokens,
		newMessage,
	};

	const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
	const overBudget = total > practicalBudget;

	let recommendation: string | null = null;
	if (overBudget) {
		const excess = total - practicalBudget;
		if (breakdown.history > excess) {
			recommendation = `Prune history (${breakdown.history} tokens) to save ~${excess} tokens`;
		} else if (breakdown.sourceDocuments > excess) {
			recommendation = `Truncate source documents (${breakdown.sourceDocuments} tokens) to stay within budget`;
		} else {
			recommendation = `Context is ${total} tokens (budget: ${practicalBudget}). Consider reducing document size or history.`;
		}
	}

	// Log budget breakdown in dev mode
	if (import.meta.env.DEV) {
		console.log(
			`[ContextBudget] Total: ${total} tokens (budget: ${practicalBudget}, model limit: ${params.modelInputLimit || 'default'})${overBudget ? ' ⚠️ OVER BUDGET' : ''}`,
			breakdown
		);
	}

	return { total, breakdown, overBudget, recommendation };
}

// ---------------------------------------------------------------------------
// Source Document Truncation
// ---------------------------------------------------------------------------

/**
 * Proportionally truncate source documents to stay within budget.
 *
 * When total source doc tokens exceed the budget, each document is
 * trimmed proportionally to its share. A truncation notice is appended.
 */
export async function truncateSourceDocuments(
	documents: string[],
	modelName: string,
	maxTokens?: number,
	modelInputLimit?: number
): Promise<string[]> {
	const budget = maxTokens ?? getSourceDocBudget(modelInputLimit);
	if (documents.length === 0) return documents;

	const tokenCounts = await Promise.all(
		documents.map((doc) => countTokensForText(doc, modelName))
	);
	const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

	if (totalTokens <= budget) return documents;

	const ratio = budget / totalTokens;

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
export async function compactHistory(
	messages: ChatMessage[],
	modelName: string,
	modelInputLimit?: number,
	permanentTokens?: { sourceDocs: number; documentHtml: number }
): Promise<ChatMessage[]> {
	if (messages.length === 0) return messages;

	const pruned = await pruneHistory(
		messages,
		modelName,
		modelInputLimit,
		permanentTokens
	);

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
