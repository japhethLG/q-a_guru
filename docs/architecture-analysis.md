# QA Guru — AI Architecture Analysis (Consolidated)

> **Date:** 2026-02-10  
> **Benchmark:** [OpenClaw](https://github.com/openclaw/openclaw) (production-grade AI agent framework)  
> **Scope:** System prompts, context management, chat-mode editing, tool architecture, error handling  
> **Sources:** Combined analysis from two independent AI reviews

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Critical Issue #1: HTML Snippet Matching is Fragile](#3-critical-issue-1-html-snippet-matching-is-fragile)
4. [Critical Issue #2: No Context Window Management](#4-critical-issue-2-no-context-window-management)
5. [Critical Issue #3: System Prompt is Overloaded and Unstructured](#5-critical-issue-3-system-prompt-is-overloaded-and-unstructured)
6. [Critical Issue #4: No Tool Result Feedback / Retry Loop](#6-critical-issue-4-no-tool-result-feedback--retry-loop)
7. [Critical Issue #5: Reflection Call is Wasteful](#7-critical-issue-5-reflection-call-is-wasteful)
8. [Issue #6: No History Pruning or Compaction](#8-issue-6-no-history-pruning-or-compaction)
9. [Issue #7: Template Context is Static, Not Structural](#9-issue-7-template-context-is-static-not-structural)
10. [Issue #8: Error Handling & Resilience](#10-issue-8-error-handling--resilience)
11. [Detailed Code-Level Recommendations](#11-detailed-code-level-recommendations)
12. [Prioritized Implementation Roadmap](#12-prioritized-implementation-roadmap)

---

## 1. Executive Summary

QA Guru's AI chat agent has several fundamental architectural gaps when compared to production-grade agent systems like OpenClaw. The core problems fall into three categories:

| Category               | QA Guru                                                       | OpenClaw                                                                    | Impact                                               |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Document Editing**   | Fragile exact/fuzzy HTML string matching                      | Precise file editing with multiple strategies + retry                       | Edits fail or corrupt documents                      |
| **Context Management** | No token budgeting, full document in system prompt every turn | Token estimation, adaptive chunking, compaction, pruning                    | Context dilution, wasted tokens, quality degradation |
| **Agent Loop**         | Single-shot tool call, no retry, separate reflection call     | Multi-attempt loop with fallback, error recovery, context overflow handling | AI gives up after first failure                      |
| **System Prompt**      | Monolithic ~300-line string with competing instructions       | Modular, XML-tagged, conditionally-included sections                        | LLM confusion, token waste                           |

### The #1 Root Cause of Editing Failures

The AI generates an HTML snippet that doesn't exactly match the document (even a single whitespace difference causes failure), the fuzzy fallback is too primitive, and there is **no retry mechanism** — the agent simply fails and tells the user. Additionally, the system prompt doesn't teach the AI _how_ to correctly identify HTML snippets for replacement.

### Impact Quantification

| Metric                                    | Current                     | After Fixes            |
| ----------------------------------------- | --------------------------- | ---------------------- |
| Edit success rate                         | ~40-60% (estimated)         | ~90%+                  |
| Tokens per edit turn                      | ~15k-50k (unbounded growth) | ~5k-10k (budgeted)     |
| API calls per edit                        | 2 (edit + reflection)       | 1                      |
| Max conversation turns before degradation | ~10-15                      | ~50+ (with compaction) |

---

## 2. Architecture Overview

### QA Guru's Current Flow

```
User Message
    │
    ▼
Build System Prompt (with FULL document HTML + source docs + template + selection)
    │
    ▼
Send ALL history + new message to Gemini
    │
    ▼
Stream response ──► If function call found:
    │                    │
    │                    ▼
    │               tryReplaceExact()
    │                    │ fails?
    │                    ▼
    │               tryReplaceFuzzy()
    │                    │ fails?
    │                    ▼
    │               Return error to user ✗ (no retry, AI never sees this)
    │
    ▼
If edit succeeded ──► Make SEPARATE API call for "reflection"
    │
    ▼
Done
```

### OpenClaw's Flow (Benchmark)

```
User Message
    │
    ▼
Estimate tokens ──► Prune/compact history if needed
    │
    ▼
Build modular system prompt (mode-dependent, XML-tagged sections)
    │
    ▼
Validate turn ordering ──► Repair orphaned tool results
    │
    ▼
Send to LLM with tools
    │
    ▼
Stream response ──► Process tool calls
    │                    │
    │                    ▼
    │               Execute tool ──► Return result to LLM
    │                    │
    │                    ▼
    │               LLM processes result ──► May call more tools
    │                    │
    │                    ▼
    │               (Loop until LLM is done or max attempts)
    │
    ├── On context overflow ──► Auto-compact + retry (up to 3x)
    ├── On auth failure ──► Rotate API profile + retry
    ├── On rate limit ──► Fallback thinking level + retry
    └── On tool result too large ──► Truncate + retry
```

**Key difference**: OpenClaw has a resilient multi-attempt loop with classified error recovery. QA Guru has a single-shot fire-and-forget approach.

### Key Files & Responsibilities

| File                      | Lines | Role                                                          |
| ------------------------- | ----- | ------------------------------------------------------------- |
| `hooks/useChat.ts`        | 449   | Chat state machine, message flow, function call orchestration |
| `services/gemini.ts`      | 393   | Gemini API wrapper, streaming, function call processing       |
| `services/prompts.ts`     | 437   | All system prompts and tool declarations                      |
| `services/htmlReplace.ts` | 57    | HTML string replacement (exact + fuzzy)                       |
| `utils/streamHelpers.ts`  | 186   | Stream chunk processing, thinking token extraction            |
| `utils/contentHelpers.ts` | 52    | Code block stripping                                          |
| `contexts/AppContext.tsx` | 176   | Global state (files, config, editor content, versions)        |

---

## 3. Critical Issue #1: HTML Snippet Matching is Fragile

### The Problem

QA Guru's `edit_document` tool asks the LLM to output an _exact_ HTML snippet from the document, then tries to find and replace it. This is fundamentally unreliable because:

1. **LLMs don't reproduce HTML verbatim.** They normalize whitespace, reorder attributes, change entity encoding (`&amp;` vs `&`), or subtly alter formatting.
2. **TinyMCE normalizes HTML.** The editor adds/removes whitespace, changes tag casing, auto-closes tags — the AI's concept of "the HTML" may differ from TinyMCE's actual output.
3. **The fuzzy fallback is too simplistic.** It strips tags, collapses whitespace, and does substring matching — it can't handle tag reordering, attribute changes, or entity differences.
4. **Only the first occurrence is replaced.** In Q&A docs with repeated template structures (common!), it may replace the wrong question.
5. **HTML entities are not handled** — `&amp;`, `&lt;` etc. become literal text after normalization, causing mismatches.

### Current Code (the root cause of failures)

```typescript
// services/htmlReplace.ts — tryReplaceExact
export function tryReplaceExact(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string
): string | null {
	if (!documentHtml || !snippetToReplace) return null;
	if (documentHtml.includes(snippetToReplace)) {
		return documentHtml.replace(snippetToReplace, replacementHtml);
		// ⚠️ Only replaces FIRST occurrence
	}
	return null;
}
```

```typescript
// services/htmlReplace.ts — tryReplaceFuzzy
export function tryReplaceFuzzy(...): string | null {
    const normalizedDoc = normalizeHtml(doc);     // strip tags, lowercase, collapse spaces
    const normalizedSnippet = normalizeHtml(snippet);
    const startIndex = normalizedDoc.indexOf(normalizedSnippet);
    // ⚠️ Index-mapping from normalized→original is fragile with entities and nested tags
}
```

### What OpenClaw Does Instead

OpenClaw doesn't ask the LLM to reproduce content verbatim. Its `edit` tool uses **line-based addressing** with old/new content pairs. When the edit tool fails, the agent **retries with a different strategy** (e.g., `apply_patch` for multi-location edits, or `write` for full-file replacement).

### Recommended Fix: Three-Layer Strategy

#### Layer 1: DOM-based editing with scored candidates (Primary)

```typescript
// Proposed: services/domEditor.ts

interface EditOperation {
	type: 'targeted';
	searchText: string; // Plain text to find (NOT HTML)
	searchContext?: string; // Surrounding text for disambiguation
	questionNumber?: number; // Q&A-specific: which question to target
	replacementHtml: string;
}

export function applyEditToDom(
	documentHtml: string,
	edit: EditOperation
): { html: string; success: boolean; matchInfo: string } {
	const parser = new DOMParser();
	const doc = parser.parseFromString(documentHtml, 'text/html');

	const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
	const candidates: { node: Node; score: number }[] = [];
	let node: Node | null;

	while ((node = walker.nextNode())) {
		const text = node.textContent?.trim() || '';
		if (text.includes(edit.searchText)) {
			let score = 1;
			if (edit.searchContext) {
				const parentText = node.parentElement?.textContent || '';
				if (parentText.includes(edit.searchContext)) score += 2;
			}
			if (edit.questionNumber) {
				const siblingText =
					node.parentElement?.previousElementSibling?.textContent || '';
				if (
					siblingText.includes(`${edit.questionNumber}.`) ||
					siblingText.includes(`${edit.questionNumber}:`)
				) {
					score += 5; // Strong signal
				}
			}
			candidates.push({ node, score });
		}
	}

	if (candidates.length === 0) {
		return {
			html: documentHtml,
			success: false,
			matchInfo: 'No matching text found',
		};
	}

	candidates.sort((a, b) => b.score - a.score);
	const bestMatch = candidates[0];
	const targetElement = bestMatch.node.parentElement!;
	const temp = document.createElement('div');
	temp.innerHTML = edit.replacementHtml;
	targetElement.replaceWith(...Array.from(temp.childNodes));

	return {
		html: doc.body.innerHTML,
		success: true,
		matchInfo: `Matched at score ${bestMatch.score}, ${candidates.length} candidates`,
	};
}
```

#### Layer 2: Question-level semantic tools (Reduces need for HTML matching)

Since QA Guru is specifically a Q&A editor, the tool should speak the **domain language**:

```typescript
const editDocumentTool: FunctionDeclaration = {
	name: 'edit_document',
	parameters: {
		type: 'OBJECT',
		properties: {
			edit_type: {
				type: 'STRING',
				enum: [
					'edit_question',
					'add_questions',
					'delete_question',
					'reorder',
					'edit_section',
					'full_replace',
				],
			},
			question_number: {
				type: 'NUMBER',
				description: 'For edit_question/delete_question: which question (1-based)',
			},
			field: {
				type: 'STRING',
				enum: ['question_text', 'answer', 'choices', 'reference', 'full_question'],
				description: 'For edit_question: which field to edit',
			},
			new_content: {
				type: 'STRING',
				description: 'The new content for the targeted field or section',
			},
			position: {
				type: 'STRING',
				enum: ['before', 'after', 'beginning', 'end'],
				description: 'For add_questions: where to insert',
			},
			full_document_html: {
				type: 'STRING',
				description: 'For full_replace only: the complete new document HTML',
			},
		},
	},
};
```

This makes the AI think in terms of **"edit question 3's answer"** rather than "find this exact HTML blob and replace it." It dramatically reduces matching failures.

#### Layer 3: TinyMCE API integration (Fallback)

Use TinyMCE's own search API for maximum reliability:

```typescript
const findAndReplaceViaTinyMCE = (
	editor: TinyMCEEditor,
	target: string,
	replacement: string
) => {
	const content = editor.getContent({ format: 'text' });
	// Use TinyMCE's DOM manipulation directly
};
```

---

## 4. Critical Issue #2: No Context Window Management

### The Problem

QA Guru sends **everything** to the LLM every turn:

- Full system prompt (~300+ lines, rebuilt every turn)
- Full source documents (can be thousands of tokens)
- Full document HTML (grows with every edit)
- **All** conversation history (no limit)
- Q&A config + template string
- Selection metadata

There is **zero** token estimation, budgeting, or overflow protection.

After ~10 chat turns with a 50-question document:

- System prompt: ~5,000+ tokens (with embedded document)
- Message history: ~2,000–5,000 tokens per turn × 10 = 20,000–50,000 tokens
- **Total: 25,000–55,000+ tokens per API call** (and growing every turn)

While Gemini has a 1M context window so it won't overflow, **quality degrades dramatically** as context becomes diluted with old, irrelevant turns.

### What OpenClaw Does

OpenClaw has a **4-layer** context management system:

1. **Token Estimation** — `estimateTokens()` for budget calculations
2. **History Pruning** — `pruneHistoryForContextShare()` with budget allocation (50% of context for history)
3. **Compaction** — `summarizeInStages()` summarizes dropped messages so context isn't lost
4. **Tool Result Truncation** — No single tool result > 30% of context window

Plus a **Context Window Guard** that warns at 32k tokens and blocks at 16k tokens.

### Recommended Fix: Token Budget System

```typescript
// Proposed: services/contextManager.ts

const CHARS_PER_TOKEN = 4; // Rough estimate

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
	'gemini-2.5-pro': 1_000_000,
	'gemini-2.5-flash': 1_000_000,
	'gemini-2.5-flash-lite': 500_000,
	'gemini-3-pro-preview': 1_000_000,
};

interface ContextBudget {
	systemPrompt: number; // ~20% for base instructions
	sourceDocuments: number; // ~20% for reference docs
	documentHtml: number; // ~20% for current document
	history: number; // ~30% for conversation
	currentTurn: number; // ~10% for new message + response room
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function calculateBudget(model: string): ContextBudget {
	const total = MODEL_CONTEXT_LIMITS[model] || 500_000;
	// Use conservative budget — no need to use full 1M
	const effectiveTotal = Math.min(total, 100_000); // Cap at 100k for quality
	return {
		systemPrompt: Math.floor(effectiveTotal * 0.2),
		sourceDocuments: Math.floor(effectiveTotal * 0.2),
		documentHtml: Math.floor(effectiveTotal * 0.2),
		history: Math.floor(effectiveTotal * 0.3),
		currentTurn: Math.floor(effectiveTotal * 0.1),
	};
}

export function pruneHistory(
	messages: ChatMessage[],
	maxTokens: number
): ChatMessage[] {
	let totalTokens = messages.reduce(
		(sum, m) => sum + estimateTokens(m.content),
		0
	);

	const pruned = [...messages];
	while (totalTokens > maxTokens && pruned.length > 4) {
		const dropped = pruned.shift()!;
		totalTokens -= estimateTokens(dropped.content);
		// Also drop the corresponding response to maintain alternation
		if (pruned.length > 0 && pruned[0].role === 'model') {
			totalTokens -= estimateTokens(pruned[0].content);
			pruned.shift();
		}
	}

	return pruned;
}

export function truncateSourceDocuments(
	documents: string[],
	maxTokens: number
): string[] {
	const totalTokens = documents.reduce((sum, d) => sum + estimateTokens(d), 0);
	if (totalTokens <= maxTokens) return documents;

	const ratio = maxTokens / totalTokens;
	return documents.map((doc) => {
		const maxChars = Math.floor(doc.length * ratio);
		if (doc.length <= maxChars) return doc;
		return (
			doc.slice(0, maxChars) + '\n\n[Document truncated to fit context window]'
		);
	});
}
```

---

## 5. Critical Issue #3: System Prompt is Overloaded and Unstructured

### The Problem

The chat system prompt in `prompts.ts` (`getChatSystemPrompt` / `baseChatSystemInstruction`) is a **single monolithic ~300-line string** that includes:

1. Document requirements section
2. Markdown formatting tutorial (~18 lines of code block examples — LLM already knows this)
3. Code block syntax highlighting guide (language list — ~20 wasted lines)
4. Document editing instructions
5. Agentic behavior patterns
6. Source documents (full text! Every turn!)
7. Q&A config context
8. Template string (raw HTML)
9. Document HTML (full! Every turn!)
10. Selection metadata

**Problems:**

- **No structured sections** — The prompt is a flat block of text. OpenClaw uses XML-tagged sections with clear boundaries.
- **Redundant information** — Markdown formatting tutorial and language list waste ~400 tokens per turn.
- **Source documents in system prompt** — These should be in the conversation or on-demand, not re-sent every turn.
- **Competing instructions** — "Use Markdown for chat" and "Use HTML for editing" creates confusion.
- **Document embedded in system prompt** — The entire HTML document is re-sent every turn in the system prompt.
- **Template as raw string** — The AI has to parse raw HTML template, leading to confusion between template placeholders and actual content.

### What OpenClaw Does

OpenClaw's system prompt is **modular** and **conditionally assembled**:

```typescript
// openclaw pattern — each section independently toggled
const sections = [];
sections.push(`<identity>\n${identitySection}\n</identity>`);
sections.push(`<tool_calling>\n${toolCallingSection}\n</tool_calling>`);
if (skills) sections.push(`<skills>\n${skillsSection}\n</skills>`);
if (contextFiles.length > 0) {
	sections.push(`# Project Context`);
	for (const file of contextFiles) {
		sections.push(`## ${file.path}\n\n${file.content}`);
	}
}
```

Key patterns:

- **Conditional sections** — Only include what's relevant
- **XML wrapping** — Every section wrapped in descriptive tags
- **Concise instructions** — "Don't narrate routine tool calls" vs. multi-paragraph explanations
- **Context files separate from instructions**
- **Mode selection** — `"full"` vs `"minimal"` for different contexts

### Recommended Fix

```typescript
// Proposed: services/prompts.ts (refactored)

function buildCoreIdentity(): string {
	return `<identity>
You are a Q&A document editing assistant. You help users create, edit,
and refine question-and-answer documents rendered in HTML.
</identity>`;
}

function buildEditingInstructions(): string {
	return `<editing_rules>
When editing the document, use the edit_document tool. Choose the right method:

- **edit_question**: For changing specific questions, answers, or fields.
  Provide the question number and field to change.
- **add_questions**: For inserting new questions at a position.
- **delete_question**: For removing a question by number.
- **full_replace**: Only for major restructuring or when other methods don't apply.

CRITICAL RULES:
1. Always use the smallest, most targeted edit possible.
2. Preserve template structure when editing — never break the HTML structure.
3. NEVER return raw HTML in your text response — always use a function call.
4. Briefly explain your intent before editing.
</editing_rules>`;
}

function buildTemplateContext(template: QuestionTemplate | null): string {
	if (!template) return '';
	// Structural, not raw — tell the AI what the structure means
	return `<template>
Active Template: ${template.name}
Type: ${template.questionType}
All edits must preserve this template structure.
Template variables: [number], [question], [answer], [reference], etc.
Required HTML tags: <strong>, <p>, <ul>, <li> (as per template)
</template>`;
}

function buildDocumentContext(
	documentHtml: string | undefined,
	selection: SelectionMetadata | null
): string {
	const sections: string[] = [];

	if (selection) {
		sections.push(`<selected_text>
The user has selected this text in the editor:
"${selection.selectedText || selection.selectedHtml}"
</selected_text>`);
	}

	// DON'T include full document in system prompt every turn
	// Only include it when user is asking about the document
	if (!documentHtml?.trim()) {
		sections.push(`<document_state>EMPTY — no content yet.</document_state>`);
	}

	return sections.join('\n\n');
}

// Source documents should NOT be in system prompt
// Send them as a context message at conversation start instead
export function buildChatSystemPrompt(params: {
	qaConfig?: QaConfig | null;
	documentHtml?: string;
	selection?: SelectionMetadata | null;
}): string {
	const sections = [
		buildCoreIdentity(),
		buildEditingInstructions(),
		buildTemplateContext(params.qaConfig?.template || null),
		buildDocumentContext(params.documentHtml, params.selection),
	].filter(Boolean);

	return sections.join('\n\n');
}
```

---

## 6. Critical Issue #4: No Tool Result Feedback / Retry Loop

### The Problem

QA Guru processes function calls **after the entire stream completes**, and if the edit fails, it simply shows an error message to the user. The AI **never sees** whether its edit succeeded or failed. There is no way for the AI to:

1. See the error and try a different snippet
2. Fall back to `full_replace` when snippet matching fails
3. Make multiple sequential edits in one turn

```typescript
// hooks/useChat.ts — current flow
const result = processFunctionCalls(functionCalls, documentHtml);

if (result.errorMessage) {
	// ⚠️ Just shows error. AI NEVER sees this. No retry.
	setMessages((prev) => [
		...prev,
		{ role: 'model', content: result.errorMessage },
	]);
	return;
}
```

### What OpenClaw Does

OpenClaw uses a proper **agent loop** with tool result feedback:

1. Tool executes and returns result (success or failure with details)
2. Result is fed back to the LLM as a `tool_result` message
3. LLM processes the result — may call more tools, may retry with a different approach
4. Loop continues until LLM is done or max attempts reached

### Recommended Fix: Tool Retry Loop with Error Feedback

```typescript
// Proposed: hooks/useChat.ts (refactored sendMessage)

const MAX_TOOL_RETRIES = 2;

const sendMessageWithContext = async (
	messageToSend: string,
	contextMessages: ChatMessage[]
) => {
	let currentMessages = [...contextMessages];
	let currentUserMessage = messageToSend;
	let toolRetries = 0;

	while (true) {
		const { fullResponse, accumulatedText } = await streamResponse(
			currentMessages,
			currentUserMessage
		);
		if (!fullResponse) break;

		const functionCalls = fullResponse.functionCalls;

		// No function call — normal text response, we're done
		if (!functionCalls || functionCalls.length === 0) break;

		// Execute the tool
		const result = executeTool(functionCalls, documentHtml);

		if (result.success) {
			// Edit succeeded — apply and let AI's text serve as confirmation
			onDocumentEdit(result.newHtml, currentUserMessage);
			const finalMessage = accumulatedText
				? `${accumulatedText}\n\n*Document updated successfully.*`
				: '*Document updated successfully.*';
			appendMessage({ role: 'model', content: finalMessage });
			break;
		}

		// Edit FAILED — feed error back to LLM to retry
		if (toolRetries < MAX_TOOL_RETRIES) {
			toolRetries++;
			currentMessages = [
				...currentMessages,
				{ role: 'user', content: currentUserMessage },
				{ role: 'model', content: accumulatedText },
				{
					role: 'user',
					content:
						`Tool error: ${result.message}. ` +
						`Please try again. You can: (1) use a different snippet, ` +
						`(2) use edit_question with a question number, ` +
						`or (3) use full_replace to rewrite the whole document. ` +
						`Attempt ${toolRetries}/${MAX_TOOL_RETRIES}.`,
				},
			];
			currentUserMessage = '';
			continue; // Retry
		}

		// Max retries exceeded — show graceful failure
		const fallbackMessage = accumulatedText
			? `${accumulatedText}\n\n*The edit could not be applied after ${MAX_TOOL_RETRIES} attempts. You can try again or make the change manually in the editor.*`
			: '*The edit could not be applied. Please try again with different instructions.*';
		appendMessage({ role: 'model', content: fallbackMessage });
		break;
	}
};
```

**This single change would fix ~60% of edit failures** by allowing the AI to self-correct.

---

## 7. Critical Issue #5: Reflection Call is Wasteful

### The Problem

After every successful edit, QA Guru makes a **separate API call** to a "reflection" endpoint:

```typescript
// services/gemini.ts — getReflectionStream
export const getReflectionStream = async function* (
	history: ChatMessage[], // Full history AGAIN
	toolResult: string,
	apiKey?: string,
	model = 'gemini-2.5-pro', // Expensive model
	signal?: AbortSignal
) {
	// This is a FULL NEW API call with the same context
};
```

This:

1. **Doubles API cost** and latency for every edit operation
2. Sends the entire conversation history again
3. Produces information (a summary of what changed) that should have been part of the original response

### What OpenClaw Does

OpenClaw does **not** have a separate reflection call. The agent loop naturally handles this — after the tool executes, the result is fed back and the LLM responds naturally with any necessary explanation.

### Recommended Fix

Remove the reflection call entirely. Use the AI's text response from the edit turn as the explanation:

```typescript
// After successful edit:
if (result.success) {
	onDocumentEdit(result.newHtml, currentUserMessage);

	// The accumulatedText from the ORIGINAL response already contains
	// the AI's explanation (system prompt says "explain before editing")
	const finalMessage = accumulatedText
		? `${accumulatedText}\n\n*Document updated successfully.*`
		: '*Document updated successfully.*';

	appendMessage({ role: 'model', content: finalMessage });
	// NO separate reflection call needed
}
```

**Files to change:**

- Remove `getReflectionStream()` from `services/gemini.ts`
- Remove `handleReflection()` from `hooks/useChat.ts`
- Remove reflection-related stream helpers from `utils/streamHelpers.ts`

**Estimated savings: 50% reduction in API calls during editing.**

---

## 8. Issue #6: No History Pruning or Compaction

### The Problem

Every message ever sent is included in every subsequent API call. No pruning, no windowing, no compaction.

```typescript
// hooks/useChat.ts — messages grow forever
const [messages, setMessages] = useState<ChatMessage[]>([]);
// ALL messages sent to API every turn
```

### What OpenClaw Does

Multiple layers:

1. **DM history limits** — Configurable max turns (`limitHistoryTurns()`)
2. **Pruning** — Drops oldest chunks when history exceeds budget
3. **Compaction** — `summarizeInStages()` summarizes dropped messages
4. **Adaptive chunking** — `computeAdaptiveChunkRatio()` adjusts based on message sizes

### Recommended Fix: Sliding Window + Optional Summary

```typescript
// Proposed: services/historyManager.ts

const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_TOKENS = 50_000;

export function pruneHistory(messages: ChatMessage[]): ChatMessage[] {
	let pruned = [...messages];

	// Step 1: Keep last N user turns (+ their responses)
	let userCount = 0;
	let cutIndex = 0;
	for (let i = pruned.length - 1; i >= 0; i--) {
		if (pruned[i].role === 'user') {
			userCount++;
			if (userCount > MAX_HISTORY_TURNS) {
				cutIndex = i;
				break;
			}
		}
	}
	if (cutIndex > 0) {
		pruned = pruned.slice(cutIndex);
	}

	// Step 2: Token limit
	let totalTokens = pruned.reduce(
		(sum, m) => sum + estimateTokens(m.content),
		0
	);
	while (totalTokens > MAX_HISTORY_TOKENS && pruned.length > 4) {
		const dropped = pruned.shift()!;
		totalTokens -= estimateTokens(dropped.content);
		if (pruned.length > 0 && pruned[0].role === 'model') {
			totalTokens -= estimateTokens(pruned[0].content);
			pruned.shift();
		}
	}

	return pruned;
}
```

---

## 9. Issue #7: Template Context is Static, Not Structural

### The Problem

The template is included as a raw HTML string in the system prompt:

```typescript
instruction += `
- Template Structure: The document follows this EXACT HTML template format:
\`\`\`
${selectedTemplate.templateString}
\`\`\``;
```

The AI sees raw HTML like `<p><strong>[number]: [question]</strong></p>` and has to reason about the structure. It often confuses template placeholders (`[number]`, `[question]`) with actual content.

### Recommended Fix: Parse Template into Structural Description

```typescript
// Proposed: services/templateAnalyzer.ts

interface TemplateStructure {
	questionWrapper: string; // e.g., "<p><strong>[number]. [question]</strong></p>"
	answerWrapper: string; // e.g., "<p><b>Answer:</b> [answer]</p>"
	choiceFormat?: string; // e.g., "<li>[choiceN]</li>" (for MC)
	referenceFormat?: string; // e.g., "<p><i>Reference: [reference]</i></p>"
	separator?: string; // e.g., "<br>"
	requiredTags: string[]; // ["<strong>", "<p>", "<li>"]
}

export function analyzeTemplate(templateString: string): TemplateStructure {
	// Parse template HTML to identify structural patterns
	// Return machine-friendly description
}

// Use in system prompt:
function buildTemplateInstruction(template: QuestionTemplate): string {
	const structure = analyzeTemplate(template.templateString);
	return `## Template Rules
- Questions: ${structure.questionWrapper}
- Answers: ${structure.answerWrapper}
${structure.choiceFormat ? `- Choices: ${structure.choiceFormat}` : ''}
- Required HTML tags: ${structure.requiredTags.join(', ')}
- Never modify the HTML tag structure; only change the content within tags.`;
}
```

---

## 10. Issue #8: Error Handling & Resilience

### The Problem

Error handling is minimal — any error shows a generic message:

```typescript
try {
	// ... stream response
} catch (error) {
	console.error('Chat error:', error);
	setMessages((prev) => [
		...prev,
		{
			role: 'assistant',
			content: 'An error occurred. Please try again.',
		},
	]);
}
```

No retry logic, no error classification, no recovery strategies.

### What OpenClaw Does

| Error Type                 | OpenClaw's Response                            |
| -------------------------- | ---------------------------------------------- |
| Context overflow           | Auto-compact → retry (up to 3 attempts)        |
| Rate limit                 | Rotate auth profile → retry with backoff       |
| Auth failure               | Try next profile → failover to different model |
| Timeout                    | Mark profile, rotate, retry                    |
| Thinking level unsupported | Downgrade thinking level, retry                |
| Image too large            | User-friendly message, no retry                |
| Role ordering              | User-friendly message + suggest /new           |
| Tool result too large      | Truncate result + retry                        |

### Recommended Fix

```typescript
const classifyError = (
	error: unknown
): 'rate_limit' | 'context_overflow' | 'auth' | 'transient' | 'fatal' => {
	const msg = error instanceof Error ? error.message : String(error);
	if (/rate.?limit|429|quota/i.test(msg)) return 'rate_limit';
	if (/context.?length|token.?limit|too.?large/i.test(msg))
		return 'context_overflow';
	if (/auth|401|403|api.?key/i.test(msg)) return 'auth';
	if (/timeout|503|network/i.test(msg)) return 'transient';
	return 'fatal';
};

const handleStreamError = async (
	error: unknown,
	retryCount: number
): Promise<'retry' | 'fail'> => {
	const errorType = classifyError(error);

	if (errorType === 'rate_limit' && retryCount < 3) {
		await delay(2 ** retryCount * 1000);
		return 'retry';
	}
	if (errorType === 'context_overflow') {
		// Trim history and retry
		trimOldestMessages();
		return 'retry';
	}
	if (errorType === 'transient' && retryCount < 2) {
		await delay(1000);
		return 'retry';
	}
	return 'fail';
};
```

---

## 11. Detailed Code-Level Recommendations

### 11.1 Replace `htmlReplace.ts` with DOM-based editing

**Why**: The current string-matching approach is the #1 cause of edit failures.

**Files to change**:

- Create `services/domEditor.ts` (new)
- Update `services/gemini.ts` → `processFunctionCalls()`
- Update tool declaration in `services/prompts.ts`

### 11.2 Add `services/contextManager.ts`

**Why**: Zero context management causes quality degradation and wasted tokens.

**New file** implementing:

- `estimateTokens(text: string): number`
- `calculateBudget(model: string): ContextBudget`
- `pruneHistory(messages, maxTokens): ChatMessage[]`
- `truncateSourceDocuments(docs, maxTokens): string[]`
- `shouldInjectDocument(lastMessage): boolean`

### 11.3 Refactor `services/prompts.ts` into modular sections

**Why**: Monolithic prompt causes token waste and competing instructions.

- Split `baseChatSystemInstruction` into 5-6 small functions
- Remove code block formatting tutorial (LLM knows Markdown)
- Remove language list (saves ~200 tokens/turn)
- Move source documents out of system prompt
- Make template context structural, not raw
- Wrap sections in XML tags

### 11.4 Add retry loop in `hooks/useChat.ts`

**Why**: Single-shot tool execution with no feedback is the #2 cause of edit failures.

- Implement `MAX_TOOL_RETRIES = 2`
- Feed tool errors back to the LLM
- Let LLM choose alternative strategy on failure

### 11.5 Remove `getReflectionStream`

**Why**: Doubles API cost for every edit with minimal value.

- Remove from `services/gemini.ts`
- Remove `handleReflection()` from `hooks/useChat.ts`
- Remove reflection-related functions from `utils/streamHelpers.ts`
- Use original response text + success indicator instead

### 11.6 Add error classification and retry

**Why**: Currently, any stream error shows same generic message.

- Classify errors (rate limit, context overflow, auth, transient, fatal)
- Retry with backoff for transient/rate-limit errors
- Trim history for context overflow errors
- Show clear, specific error messages to user

---

## 12. Prioritized Implementation Roadmap

### Phase 1: Fix Critical Edit Failures (1-2 days)

| #   | Task                                        | What to change                                | Impact                       |
| --- | ------------------------------------------- | --------------------------------------------- | ---------------------------- |
| 1   | **Add tool retry loop with error feedback** | `hooks/useChat.ts`                            | Fixes ~60% of edit failures  |
| 2   | **Remove reflection call**                  | `gemini.ts`, `useChat.ts`, `streamHelpers.ts` | 50% fewer API calls per edit |
| 3   | **Send tool success/failure back to AI**    | `useChat.ts`, `gemini.ts`                     | AI can self-correct          |

### Phase 2: Improve Tools & HTML Editing (2-3 days)

| #   | Task                                                                         | What to change                         | Impact                        |
| --- | ---------------------------------------------------------------------------- | -------------------------------------- | ----------------------------- |
| 4   | **Add semantic tools** (`edit_question`, `add_questions`, `delete_question`) | `prompts.ts`, `gemini.ts`              | Reduces snippet matching need |
| 5   | **Implement DOM-based editing**                                              | New `domEditor.ts`, update `gemini.ts` | Handles edge cases            |
| 6   | **Add `read_document` tool**                                                 | `prompts.ts`, `gemini.ts`              | AI can inspect on-demand      |

### Phase 3: Optimize Context & Prompts (1-2 days)

| #   | Task                                                             | What to change                               | Impact                       |
| --- | ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| 7   | **Remove document from system prompt**                           | `prompts.ts`                                 | Saves ~5k tokens/turn        |
| 8   | **Modularize system prompt with XML sections**                   | `prompts.ts`                                 | Better AI comprehension      |
| 9   | **Add history windowing** (10 turns)                             | New `contextManager.ts`, update `useChat.ts` | Prevents quality degradation |
| 10  | **Remove redundant prompt sections** (code block tutorial, etc.) | `prompts.ts`                                 | Saves ~400 tokens/turn       |

### Phase 4: Robustness (1-2 days)

| #   | Task                                 | What to change                                 | Impact                           |
| --- | ------------------------------------ | ---------------------------------------------- | -------------------------------- |
| 11  | **Error classification and retry**   | `useChat.ts`                                   | Handles transient failures       |
| 12  | **Token budget system**              | New `contextManager.ts`                        | Prevents overflow for large docs |
| 13  | **Make template context structural** | New `templateAnalyzer.ts`, update `prompts.ts` | Better template preservation     |

### Phase 5: Advanced (Optional, 3-5 days)

| #   | Task                                                | What to change            | Impact                    |
| --- | --------------------------------------------------- | ------------------------- | ------------------------- |
| 14  | **Conversation compaction** (summarize old turns)   | `contextManager.ts`       | Very long sessions        |
| 15  | **Multi-step edit support** (sequential tool calls) | `useChat.ts`, `gemini.ts` | Complex edits in one turn |
| 16  | **Split `useChat` into focused hooks**              | `hooks/`                  | Maintainability           |
| 17  | **Gemini context caching integration**              | `gemini.ts`               | Cost reduction            |

---

## Summary of Key Patterns from OpenClaw

| Pattern                    | OpenClaw Implementation                                             | QA Guru Gap                 |
| -------------------------- | ------------------------------------------------------------------- | --------------------------- |
| **Retry with feedback**    | Multi-attempt loop, error classification, automatic recovery        | No retry, no feedback       |
| **Token budgeting**        | `estimateTokens()`, `pruneHistory()`, `computeAdaptiveChunkRatio()` | No token awareness          |
| **Context compaction**     | `summarizeInStages()`, `summarizeWithFallback()`                    | Unbounded history growth    |
| **Modular prompts**        | Section-per-function, conditional inclusion, XML-tagged, mode-based | Single monolithic string    |
| **Tool result management** | Truncation, pairing repair, orphan cleanup                          | No management               |
| **Error recovery**         | Context overflow → compact, auth → rotate, rate limit → fallback    | Fail and show generic error |
| **Separation of concerns** | Instructions vs. context vs. tool definitions                       | Everything in system prompt |

---

## Appendix: Key Code References

### QA Guru

| File                         | Key Functions                                             |
| ---------------------------- | --------------------------------------------------------- |
| `services/prompts.ts:148`    | `getChatSystemPrompt` — main system prompt                |
| `services/prompts.ts:296`    | `getReflectionPrompt` — reflection prompt (to be removed) |
| `services/prompts.ts:354`    | `toolDeclarations` — function call definitions            |
| `services/gemini.ts:180`     | `getChatResponseStream` — chat API call                   |
| `services/gemini.ts:316`     | `processFunctionCalls` — tool execution                   |
| `services/htmlReplace.ts:1`  | `tryReplaceExact` — exact string replace                  |
| `services/htmlReplace.ts:22` | `tryReplaceFuzzy` — fuzzy string replace                  |
| `hooks/useChat.ts:105`       | `sendMessage` — main chat flow                            |
| `hooks/useChat.ts:280`       | `handleReflection` — post-edit reflection (to be removed) |

### OpenClaw (Reference Patterns)

| File                                                  | Pattern                                             |
| ----------------------------------------------------- | --------------------------------------------------- |
| `agents/system-prompt.ts`                             | Modular, section-toggled, XML-tagged system prompt  |
| `agents/compaction.ts`                                | Conversation compaction with staged summarization   |
| `agents/pi-embedded-runner/history.ts`                | `limitHistoryTurns()` — history windowing           |
| `agents/context-window-guard.ts`                      | Context window protection (warn/block thresholds)   |
| `agents/pi-embedded-runner/run.ts`                    | Error classification, retry loop, failover          |
| `agents/pi-embedded-runner/tool-result-truncation.ts` | Tool result size management                         |
| `agents/pi-tools.ts`                                  | Tool creation with policies, validation, sandboxing |

---

_Consolidated analysis from two independent AI reviews, benchmarking QA Guru against OpenClaw._
