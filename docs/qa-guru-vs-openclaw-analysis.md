# QA Guru AI Agent Architecture Analysis

## Benchmarked Against OpenClaw

**Date**: February 10, 2026  
**Scope**: AI agent architecture, context management, prompt engineering, document editing reliability  
**Focus**: Chat mode editing failures, template breakage, HTML snippet matching

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Comparison Overview](#2-architecture-comparison-overview)
3. [Critical Issue #1: HTML Snippet Matching is Fragile](#3-critical-issue-1-html-snippet-matching-is-fragile)
4. [Critical Issue #2: No Context Window Management](#4-critical-issue-2-no-context-window-management)
5. [Critical Issue #3: System Prompt is Overloaded and Redundant](#5-critical-issue-3-system-prompt-is-overloaded-and-redundant)
6. [Critical Issue #4: No Proper Tool Result / Function Call Loop](#6-critical-issue-4-no-proper-tool-result--function-call-loop)
7. [Critical Issue #5: Reflection Call is Wasteful](#7-critical-issue-5-reflection-call-is-wasteful)
8. [Issue #6: No History Pruning or Compaction](#8-issue-6-no-history-pruning-or-compaction)
9. [Issue #7: Document HTML in System Prompt Every Turn](#9-issue-7-document-html-in-system-prompt-every-turn)
10. [Issue #8: Template Context is Static, Not Structural](#10-issue-8-template-context-is-static-not-structural)
11. [Detailed Code-Level Recommendations](#11-detailed-code-level-recommendations)
12. [Prioritized Implementation Roadmap](#12-prioritized-implementation-roadmap)

---

## 1. Executive Summary

QA Guru's AI chat agent has several fundamental architectural gaps when compared to production-grade agent systems like OpenClaw. The core problems fall into three categories:

| Category | QA Guru | OpenClaw | Impact |
|----------|---------|----------|--------|
| **Document Editing** | Fragile exact/fuzzy HTML matching | Precise file editing with multiple strategies + retry | Edits fail or corrupt documents |
| **Context Management** | No token budgeting, full document in system prompt every turn | Token estimation, adaptive chunking, compaction, pruning | Context overflow on large docs, wasted tokens |
| **Agent Loop** | Single-shot tool call, no retry, separate reflection call | Multi-attempt loop with fallback, error recovery, context overflow handling | AI gives up after first failure |

**The #1 root cause of editing failures**: The AI generates an HTML snippet that doesn't exactly match the document (even a single whitespace difference causes failure), the fuzzy fallback is too primitive, and there is **no retry mechanism** -- the agent simply fails and tells the user.

---

## 2. Architecture Comparison Overview

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
    │               Return error to user ✗ (no retry)
    │
    ▼
If edit succeeded ──► Make SEPARATE API call for "reflection"
    │
    ▼
Done
```

### OpenClaw's Flow

```
User Message
    │
    ▼
Estimate tokens ──► Prune/compact history if needed
    │
    ▼
Build modular system prompt (mode-dependent sections)
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
    ├── On context overflow ──► Auto-compact + retry
    ├── On auth failure ──► Rotate API profile + retry
    ├── On rate limit ──► Fallback thinking level + retry
    └── On tool result too large ──► Truncate + retry
```

**Key difference**: OpenClaw has a resilient multi-attempt loop. QA Guru has a single-shot fire-and-forget approach.

---

## 3. Critical Issue #1: HTML Snippet Matching is Fragile

### The Problem

QA Guru's `edit_document` tool asks the LLM to output an *exact* HTML snippet from the document, then tries to find and replace it. This is fundamentally unreliable because:

1. **LLMs don't reproduce HTML verbatim.** They normalize whitespace, reorder attributes, change entity encoding, or subtly rephrase.
2. **The fuzzy fallback is too simplistic.** It just collapses whitespace and tries a regex -- it doesn't handle tag reordering, attribute changes, or entity differences.
3. **Only the first occurrence is replaced.** If there are duplicate structures (common in Q&A docs with repeated templates), it may replace the wrong one.

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
    // ⚠️ Only looks at first 50 chars for anchoring
    const anchor = normalizedSnippet.substring(0, 50);
    const startIndex = normalizedDoc.indexOf(anchor);
    // ⚠️ Regex approach is brittle with complex HTML
    const relaxed = new RegExp(escaped, 'i');
    const match = documentHtml.match(relaxed);
    // ...
}
```

### What OpenClaw Does Instead

OpenClaw doesn't ask the LLM to reproduce content verbatim. Its `edit` tool uses **line-based addressing** with old/new content pairs:

```
Tool: edit
Parameters:
  - file: path
  - old_string: "exact text to find" (plain text, not HTML)
  - new_string: "replacement text"
```

When the edit tool fails, the agent **retries with a different strategy** (e.g., using `apply_patch` for multi-location edits, or `write` for full-file replacement).

### Recommended Fix for QA Guru

**Option A: DOM-based editing (recommended)**

Instead of string matching against raw HTML, parse the document HTML into a DOM tree and operate on nodes:

```typescript
// Proposed: services/domEditor.ts

interface EditOperation {
    // For targeted edits — find by text content + structural context
    type: 'targeted';
    searchText: string;           // Plain text to find (not HTML)
    searchContext?: string;        // Surrounding text for disambiguation
    questionNumber?: number;       // Q&A-specific: which question to target
    replacementHtml: string;
}

interface FullReplaceOperation {
    type: 'full_replace';
    newHtml: string;
}

type DocumentEdit = EditOperation | FullReplaceOperation;

export function applyEditToDom(
    documentHtml: string,
    edit: DocumentEdit
): { html: string; success: boolean; matchInfo?: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(documentHtml, 'text/html');

    if (edit.type === 'full_replace') {
        return { html: edit.newHtml, success: true };
    }

    // Find the target node by text content
    const walker = document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        null
    );

    const candidates: { node: Node; score: number }[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || '';
        if (text.includes(edit.searchText)) {
            // Score based on context match
            let score = 1;
            if (edit.searchContext) {
                const parent = node.parentElement;
                const parentText = parent?.textContent || '';
                if (parentText.includes(edit.searchContext)) {
                    score += 2;
                }
            }
            if (edit.questionNumber) {
                // Check if this is near question N
                const parent = node.parentElement;
                const siblingText = parent?.previousElementSibling?.textContent || '';
                if (siblingText.includes(`${edit.questionNumber}.`) ||
                    siblingText.includes(`${edit.questionNumber})`)) {
                    score += 5; // Strong signal
                }
            }
            candidates.push({ node, score });
        }
    }

    if (candidates.length === 0) {
        return { html: documentHtml, success: false, matchInfo: 'No matching text found' };
    }

    // Pick best candidate
    candidates.sort((a, b) => b.score - a.score);
    const bestMatch = candidates[0];

    // Replace the parent element's innerHTML
    const targetElement = bestMatch.node.parentElement!;
    const temp = document.createElement('div');
    temp.innerHTML = edit.replacementHtml;
    targetElement.replaceWith(...Array.from(temp.childNodes));

    return {
        html: doc.body.innerHTML,
        success: true,
        matchInfo: `Matched at score ${bestMatch.score}, ${candidates.length} candidates`
    };
}
```

**Option B: Redesign the tool declaration to use question-level addressing**

Since QA Guru is specifically a Q&A document editor, the tool should speak the domain language:

```typescript
// Proposed: Better tool declaration for Q&A context
const editDocumentTool: FunctionDeclaration = {
    name: 'edit_document',
    description: 'Edit the Q&A document.',
    parameters: {
        type: 'OBJECT',
        properties: {
            edit_type: {
                type: 'STRING',
                enum: ['edit_question', 'add_questions', 'delete_question',
                       'reorder', 'edit_section', 'full_replace'],
                description: 'The type of edit to perform'
            },
            question_number: {
                type: 'NUMBER',
                description: 'For edit_question/delete_question: which question number (1-based)'
            },
            field: {
                type: 'STRING',
                enum: ['question_text', 'answer', 'choices', 'reference', 'full_question'],
                description: 'For edit_question: which field of the question to edit'
            },
            new_content: {
                type: 'STRING',
                description: 'The new HTML content for the targeted field or section'
            },
            full_document_html: {
                type: 'STRING',
                description: 'For full_replace only: the complete new document HTML'
            },
            position: {
                type: 'STRING',
                enum: ['before', 'after', 'beginning', 'end'],
                description: 'For add_questions: where to insert relative to question_number'
            }
        }
    }
};
```

This approach makes the AI think in terms of "edit question 3's answer" rather than "find this exact HTML blob and replace it." It dramatically reduces the chance of matching failures.

---

## 4. Critical Issue #2: No Context Window Management

### The Problem

QA Guru sends **everything** to the LLM every turn:
- Full system prompt (~300+ lines)
- Full source documents (could be thousands of tokens)
- Full document HTML (grows with every edit)
- **All** conversation history (no limit)
- Q&A config + template string
- Selection metadata

There is **zero** token estimation, budgeting, or overflow protection.

### Current Code

```typescript
// hooks/useChat.ts — sendMessageWithContext
const responseStream = getChatResponseStream(
    contextMessages,       // ALL previous messages
    messageToSend,
    documentsContent,      // ALL source documents
    documentHtml,          // FULL current document
    selectedText,
    qaConfig.apiKey,
    chatConfig.model,
    generationConfig || qaConfig,
    abortControllerRef.current.signal
);
```

```typescript
// services/gemini.ts — getChatResponseStream
let systemInstruction = prompts.baseChatSystemInstruction(
    sourceDocuments,       // Embedded in system prompt
    qaConfig
);
if (documentHtml) {
    systemInstruction = prompts.appendDocumentHtml(  // Appended to system prompt
        systemInstruction,
        documentHtml
    );
}
// ... then ALL history is sent as contents
const contents = [
    ...geminiHistory,      // ALL messages
    { role: 'user', parts: [{ text: userPrompt }] },
];
```

### What OpenClaw Does

OpenClaw has a multi-layered context management system:

**Layer 1: Token Estimation**

```typescript
// OpenClaw: src/agents/compaction.ts
export function estimateMessagesTokens(messages: AgentMessage[]): number {
    return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
}
```

**Layer 2: History Pruning (before sending)**

```typescript
// OpenClaw: src/agents/compaction.ts
export function pruneHistoryForContextShare(params: {
    messages: AgentMessage[];
    maxContextTokens: number;
    maxHistoryShare?: number;  // Default 50%
}) {
    const budgetTokens = Math.floor(params.maxContextTokens * maxHistoryShare);
    while (estimateMessagesTokens(keptMessages) > budgetTokens) {
        // Drop oldest chunks, repair orphaned tool results
        const [dropped, ...rest] = splitMessagesByTokenShare(keptMessages, parts);
        keptMessages = repairToolUseResultPairing(rest.flat()).messages;
    }
}
```

**Layer 3: Compaction (summarize old messages)**

```typescript
// OpenClaw: src/agents/compaction.ts
export async function summarizeInStages(params) {
    // Split messages into parts by token share
    const splits = splitMessagesByTokenShare(messages, parts);
    // Summarize each part independently
    const partialSummaries = await Promise.all(
        splits.map(chunk => summarizeWithFallback({...params, messages: chunk}))
    );
    // Merge partial summaries into one
    return summarizeWithFallback({
        messages: summaryMessages,
        customInstructions: "Merge these partial summaries..."
    });
}
```

**Layer 4: Tool Result Truncation**

```typescript
// OpenClaw: pi-embedded-runner/tool-result-truncation.ts
const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3;  // No single result > 30% of context

export function truncateToolResultText(text: string, maxChars: number): string {
    // Break at newline boundary to avoid cutting mid-line
    let cutPoint = keepChars;
    const lastNewline = text.lastIndexOf("\n", keepChars);
    if (lastNewline > keepChars * 0.8) cutPoint = lastNewline;
    return text.slice(0, cutPoint) + TRUNCATION_SUFFIX;
}
```

### Recommended Fix for QA Guru

Implement a lightweight token budget system:

```typescript
// Proposed: services/contextManager.ts

const CHARS_PER_TOKEN = 4; // Rough estimate for English text
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    'gemini-2.5-pro': 1_000_000,
    'gemini-2.5-flash': 1_000_000,
    'gemini-2.5-flash-lite': 500_000,
};

interface ContextBudget {
    systemPrompt: number;      // ~20% for base instructions
    sourceDocuments: number;   // ~20% for reference docs
    documentHtml: number;      // ~20% for current document
    history: number;           // ~30% for conversation
    currentTurn: number;       // ~10% for new message + response room
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function calculateBudget(model: string): ContextBudget {
    const total = MODEL_CONTEXT_LIMITS[model] || 500_000;
    return {
        systemPrompt: Math.floor(total * 0.20),
        sourceDocuments: Math.floor(total * 0.20),
        documentHtml: Math.floor(total * 0.20),
        history: Math.floor(total * 0.30),
        currentTurn: Math.floor(total * 0.10),
    };
}

export function pruneHistory(
    messages: ChatMessage[],
    maxTokens: number
): ChatMessage[] {
    let totalTokens = messages.reduce(
        (sum, m) => sum + estimateTokens(m.content), 0
    );

    // Keep most recent messages, drop oldest
    const pruned = [...messages];
    while (totalTokens > maxTokens && pruned.length > 2) {
        const dropped = pruned.shift()!;
        totalTokens -= estimateTokens(dropped.content);
    }

    return pruned;
}

export function truncateSourceDocuments(
    documents: string[],
    maxTokens: number
): string[] {
    const totalTokens = documents.reduce(
        (sum, d) => sum + estimateTokens(d), 0
    );

    if (totalTokens <= maxTokens) return documents;

    // Proportionally truncate each document
    const ratio = maxTokens / totalTokens;
    return documents.map(doc => {
        const maxChars = Math.floor(doc.length * ratio);
        if (doc.length <= maxChars) return doc;
        return doc.slice(0, maxChars) +
            '\n\n[Document truncated to fit context window]';
    });
}
```

---

## 5. Critical Issue #3: System Prompt is Overloaded and Redundant

### The Problem

QA Guru's `baseChatSystemInstruction` is a single monolithic ~295-line string that includes:

1. Document requirements section
2. Markdown formatting tutorial (18 lines of code block examples)
3. Code block syntax highlighting guide (language list)
4. Document editing instructions
5. Agentic behavior patterns
6. Source documents (full text!)
7. Q&A config context
8. Template string
9. Document HTML
10. Selection metadata

**Problems with this approach:**

- **Redundant information**: The code block formatting guide and language list are ~50 lines that have nothing to do with Q&A editing. The LLM already knows Markdown.
- **Source documents in system prompt**: These should be in the conversation, not system prompt. Putting them in system prompt means they're sent every turn even when the user is just chatting.
- **Template embedded as raw string**: The template should be structured metadata, not a raw blob the LLM has to parse.
- **Competing instructions**: "Use Markdown for chat" and "Use HTML for editing" creates confusion about when to use which format.

### What OpenClaw Does

OpenClaw's system prompt is **modular** -- each section is a separate function that conditionally includes content:

```typescript
// OpenClaw: src/agents/system-prompt.ts
export function buildAgentSystemPrompt(params) {
    const lines = [
        "You are a personal assistant running inside OpenClaw.",
        "",
        "## Tooling",          // Only lists available tools
        toolLines.join("\n"),
        "",
        "## Tool Call Style",   // Brief, value-dense
        "Default: do not narrate routine, low-risk tool calls.",
        "",
        ...safetySection,       // Constitutional AI principles
        ...skillsSection,       // Only if skills exist
        ...memorySection,       // Only if memory tools available
        ...messagingSection,    // Only if messaging configured
    ];

    // Context files are separate, injected cleanly
    if (contextFiles.length > 0) {
        lines.push("# Project Context");
        for (const file of contextFiles) {
            lines.push(`## ${file.path}`, "", file.content, "");
        }
    }

    return lines.filter(Boolean).join("\n");
}
```

Key patterns:
- **Conditional sections**: Only include what's relevant
- **Separation of concerns**: Tool definitions, safety, memory, messaging are all separate
- **Concise instructions**: "Don't narrate routine tool calls" vs. QA Guru's multi-paragraph explanations
- **Context files separate from instructions**: Not embedded in the instruction text

### Recommended Fix for QA Guru

Restructure the system prompt into modular, focused sections:

```typescript
// Proposed: services/prompts.ts (refactored)

function buildCoreIdentity(): string {
    return `You are an AI assistant in a Q&A document editor.
Your primary role: help users create, edit, and improve question-and-answer documents.`;
}

function buildEditingInstructions(): string {
    return `## Document Editing

When editing the document, use the edit_document tool. Choose the right method:

- **Targeted edit** (edit_question): For changing specific questions, answers, or fields.
  Provide the question number and which field to change.
- **Full replace** (full_replace): For major restructuring, adding many questions, or
  when targeted edit doesn't apply.

Before editing: briefly explain your intent.
After editing: summarize what changed and why.`;
}

function buildTemplateContext(template: Template | null): string {
    if (!template) return '';
    return `## Active Template: ${template.name}
Type: ${template.questionType}
All edits must preserve this template structure.
Template variables: ${template.variables.join(', ')}`;
    // NOTE: Don't include full template string unless the AI is generating new questions
}

function buildDocumentState(documentHtml: string): string {
    if (!documentHtml?.trim()) {
        return `## Document State: EMPTY
The document is empty. Use full_replace to create initial content.`;
    }
    // Only include document HTML when needed for editing, not for general chat
    return `## Current Document
${documentHtml}`;
}

function buildSelectionContext(selection: SelectionMetadata | null): string {
    if (!selection) return '';
    return `## User Selection (Lines ${selection.startLine}-${selection.endLine})
Selected: "${selection.selectedText}"`;
    // Minimal, focused context
}

// DON'T include source documents in system prompt!
// Pass them as a separate user message at conversation start instead.
export function buildChatSystemPrompt(params: {
    hasDocuments: boolean;
    qaConfig?: QaConfig | null;
    documentHtml?: string;
    selection?: SelectionMetadata | null;
}): string {
    const sections = [
        buildCoreIdentity(),
        buildEditingInstructions(),
        buildTemplateContext(params.qaConfig?.template || null),
        params.documentHtml ? buildDocumentState(params.documentHtml) : '',
        buildSelectionContext(params.selection || null),
    ].filter(Boolean);

    return sections.join('\n\n');
}
```

---

## 6. Critical Issue #4: No Proper Tool Result / Function Call Loop

### The Problem

QA Guru processes function calls **after the entire stream completes**, and if the edit fails, it simply returns an error message to the user. There is no way for the AI to:

1. See the error and try a different approach
2. Use `full_document_html` as a fallback when snippet matching fails
3. Make multiple sequential edits in one turn

```typescript
// hooks/useChat.ts — current flow
const result = processFunctionCalls({
    functionCalls: (fullResponse as any).functionCalls,
    documentHtml,
    messages: updatedMessages,
    userMessage: messageToSend,
    accumulatedText,
});

if (result.errorMessage) {
    // ⚠️ Just shows error. AI never sees this. No retry.
    setMessages((prev) => [
        ...prev,
        { role: 'model', content: result.errorMessage as string },
    ]);
    setIsLoading(false);
    return;
}
```

### What OpenClaw Does

OpenClaw uses a proper **agent loop** with tool result feedback:

```typescript
// OpenClaw: pi-embedded-runner/run.ts (simplified)
async function runEmbeddedPiAgent(params) {
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    while (attempts < MAX_ATTEMPTS) {
        try {
            const result = await runEmbeddedAttempt(attemptParams);
            return result;
        } catch (error) {
            attempts++;

            if (isContextOverflowError(error)) {
                // Auto-compact and retry
                await compactSession(session);
                continue;
            }
            if (isAuthAssistantError(error)) {
                // Rotate API profile and retry
                rotateApiProfile();
                continue;
            }
            if (isRateLimitAssistantError(error)) {
                // Reduce thinking level and retry
                fallbackThinkingLevel();
                continue;
            }
            // ... more recovery strategies
        }
    }
}
```

Inside each attempt, the LLM can call tools and **receive the results back** to decide what to do next. This is the standard agentic pattern.

### Recommended Fix for QA Guru

Implement a tool result feedback loop:

```typescript
// Proposed: hooks/useChat.ts (refactored sendMessageWithContext)

const MAX_TOOL_RETRIES = 2;

const sendMessageWithContext = async (
    messageToSend: string,
    contextMessages: ChatMessage[]
) => {
    let currentMessages = [...contextMessages];
    let currentUserMessage = messageToSend;
    let toolRetries = 0;

    while (true) {
        // Send to LLM
        const responseStream = getChatResponseStream(
            currentMessages,
            currentUserMessage,
            documentsContent,
            documentHtml,
            selectedText,
            qaConfig.apiKey,
            chatConfig.model,
            generationConfig,
            abortControllerRef.current.signal
        );

        const { fullResponse, accumulatedText } = await processChatStream(responseStream);
        if (!fullResponse) break;

        const functionCalls = (fullResponse as any).functionCalls;

        // No function call — normal response, we're done
        if (!functionCalls || functionCalls.length === 0) {
            break;
        }

        // Process the function call
        const result = processFunctionCalls({
            functionCalls,
            documentHtml,
            messages: currentMessages,
            userMessage: currentUserMessage,
            accumulatedText,
        });

        if (result.newHtml !== undefined) {
            // Edit succeeded
            onDocumentEdit(result.newHtml, currentUserMessage);
            // Feed success back to LLM for natural continuation
            currentMessages = [
                ...currentMessages,
                { role: 'user', content: currentUserMessage },
                { role: 'model', content: accumulatedText || 'Edit applied.' },
                { role: 'user', content: 'Tool result: edit_document succeeded. Summarize the change briefly.' },
            ];
            currentUserMessage = ''; // LLM will respond naturally
            break; // Success — done
        }

        if (result.errorMessage && toolRetries < MAX_TOOL_RETRIES) {
            // Edit FAILED — feed error back to LLM to retry
            toolRetries++;
            currentMessages = [
                ...currentMessages,
                { role: 'user', content: currentUserMessage },
                { role: 'model', content: accumulatedText },
                {
                    role: 'user',
                    content: `Tool error: The html_snippet_to_replace was not found in the document. ` +
                        `Please try again using either: (1) the exact HTML from the document, ` +
                        `or (2) use full_document_html to replace the entire document. ` +
                        `Attempt ${toolRetries}/${MAX_TOOL_RETRIES}.`
                },
            ];
            currentUserMessage = ''; // The error context is the message
            continue; // Retry
        }

        // Max retries exceeded or no handler
        break;
    }
};
```

This single change would dramatically improve editing reliability. Instead of failing silently, the AI gets feedback and can try alternative strategies.

---

## 7. Critical Issue #5: Reflection Call is Wasteful

### The Problem

After every successful edit, QA Guru makes a **separate API call** to a "reflection" endpoint that:
1. Sends the entire conversation history again
2. Asks the AI to "summarize what changed"
3. Streams another response

This doubles the API cost and latency for every edit operation, and the information it produces (a summary of what changed) should have been part of the original response.

```typescript
// services/gemini.ts — getReflectionStream
export const getReflectionStream = async function* (
    history: ChatMessage[],     // Full history AGAIN
    toolResult: string,
    apiKey?: string,
    model = 'gemini-2.5-pro',  // Expensive model
    signal?: AbortSignal
) {
    // This is a full new API call with the same context
    const response = ai.models.generateContentStream({
        model: model,
        contents: contents,     // ALL history + tool result
        config: {
            systemInstruction: systemInstruction,
            thinkingConfig: { thinkingBudget: -1, includeThoughts: true },
        },
    });
};
```

### What OpenClaw Does

OpenClaw does **not** have a separate reflection call. The agent loop naturally handles this:

1. Tool executes and returns result
2. Result is fed back to the LLM in the same conversation
3. LLM responds naturally with any necessary explanation

The tool call and explanation happen in a single interaction, not two separate API calls.

### Recommended Fix

Remove the separate reflection call. Instead, use the tool retry loop from Issue #4, where success feeds back into the conversation and the LLM naturally explains what happened:

```typescript
// After successful edit, instead of a separate reflection call:
if (result.newHtml !== undefined) {
    onDocumentEdit(result.newHtml, currentUserMessage);

    // The accumulatedText from the original response already contains
    // the AI's explanation (because the system prompt says "explain before editing")
    // Just use it directly as the response message.

    const finalMessage = accumulatedText
        ? `${accumulatedText}\n\n*Document updated successfully.*`
        : '*Document updated successfully.*';

    setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'model', content: finalMessage };
        return updated;
    });
}
```

**Estimated savings**: 50% reduction in API calls during editing operations.

---

## 8. Issue #6: No History Pruning or Compaction

### The Problem

Every message ever sent is included in every subsequent API call. After 10+ turns of editing a large document, the context can become enormous.

```typescript
// hooks/useChat.ts
const sendMessageWithContext = async (
    messageToSend: string,
    contextMessages: ChatMessage[]  // ALL messages, no limit
) => {
    // ...
    const responseStream = getChatResponseStream(
        contextMessages,  // Sent directly with no pruning
        // ...
    );
};
```

### What OpenClaw Does

Multiple layers of history management:

1. **DM history limits**: Configurable max turns per channel
2. **Pruning**: Drops oldest chunks when history exceeds budget
3. **Compaction**: Summarizes dropped messages so context isn't lost
4. **Adaptive chunking**: Adjusts based on average message size

```typescript
// OpenClaw: src/agents/compaction.ts
export function computeAdaptiveChunkRatio(
    messages: AgentMessage[],
    contextWindow: number
): number {
    const totalTokens = estimateMessagesTokens(messages);
    const avgTokens = totalTokens / messages.length;
    const safeAvgTokens = avgTokens * SAFETY_MARGIN;  // 20% buffer
    const avgRatio = safeAvgTokens / contextWindow;

    if (avgRatio > 0.1) {
        const reduction = Math.min(
            avgRatio * 2,
            BASE_CHUNK_RATIO - MIN_CHUNK_RATIO
        );
        return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
    }
    return BASE_CHUNK_RATIO;
}
```

### Recommended Fix

Implement a simple sliding window with optional summary:

```typescript
// Proposed: services/historyManager.ts

const MAX_HISTORY_MESSAGES = 20; // Keep last 20 messages
const MAX_HISTORY_TOKENS = 50_000; // Or 50K tokens, whichever is smaller

export function pruneHistory(messages: ChatMessage[]): ChatMessage[] {
    let pruned = [...messages];

    // Step 1: Hard limit on message count
    if (pruned.length > MAX_HISTORY_MESSAGES) {
        pruned = pruned.slice(-MAX_HISTORY_MESSAGES);
    }

    // Step 2: Token limit
    let totalTokens = pruned.reduce(
        (sum, m) => sum + estimateTokens(m.content), 0
    );

    while (totalTokens > MAX_HISTORY_TOKENS && pruned.length > 4) {
        const dropped = pruned.shift()!;
        totalTokens -= estimateTokens(dropped.content);
        // Also drop the corresponding response
        if (pruned.length > 0 && pruned[0].role === 'model') {
            totalTokens -= estimateTokens(pruned[0].content);
            pruned.shift();
        }
    }

    return pruned;
}
```

---

## 9. Issue #7: Document HTML in System Prompt Every Turn

### The Problem

The full document HTML is embedded in the system prompt every single turn. This means:

1. For a 50-question document, the system prompt could be 20K+ tokens
2. It's rebuilt from scratch every turn (no caching)
3. The document + source documents + template all compete for system prompt space

```typescript
// services/prompts.ts
appendDocumentHtml: (instruction: string, documentHtml: string) => {
    return (
        instruction +
        `\n\nThis is the current state of the document in the editor.
Use this as the primary reference for finding the 'html_snippet_to_replace'.
"""\n${documentHtml}\n"""`
    );
},
```

### Recommended Fix

Move the document HTML out of the system prompt and into the conversation as a "context" message:

```typescript
// Proposed: Instead of embedding in system prompt, send as first message

function buildContextMessages(params: {
    documentHtml: string;
    sourceDocuments: string[];
}): ChatMessage[] {
    const context: ChatMessage[] = [];

    // Source documents as first context message (sent once, referenced later)
    if (params.sourceDocuments.length > 0) {
        context.push({
            role: 'user',
            content: `[CONTEXT] Source documents for Q&A generation:\n${params.sourceDocuments.join('\n---\n')}`,
        });
        context.push({
            role: 'model',
            content: 'I have the source documents loaded. I can reference them for generating or editing questions.',
        });
    }

    return context;
}

// The document HTML should be sent as a fresh context injection only when editing:
function injectDocumentForEdit(documentHtml: string): string {
    return `[CURRENT DOCUMENT STATE]\n${documentHtml}\n[END DOCUMENT]`;
}

// In getChatResponseStream, only inject document when the user is requesting an edit,
// not for every general chat message.
```

**Why this matters**: Gemini supports prompt caching. Content in the system prompt gets regenerated every call. Content in earlier conversation messages can potentially be cached across turns.

---

## 10. Issue #8: Template Context is Static, Not Structural

### The Problem

The template is included as a raw string in the system prompt:

```typescript
instruction += `
- Template Structure: The document follows this EXACT HTML template format:
\`\`\`
${selectedTemplate.templateString}
\`\`\`
Variables used in this template:
- [number] - Question number
- [question] - The question text
...`;
```

When the AI edits the document, it needs to understand the template structure to avoid breaking it. But a raw template string is hard for the AI to reason about structurally.

### Recommended Fix

Parse the template into a structured description:

```typescript
// Proposed: services/templateAnalyzer.ts

interface TemplateStructure {
    questionWrapper: string;      // e.g., "<p><strong>[number]. [question]</strong></p>"
    answerWrapper: string;        // e.g., "<p><b>Answer:</b> [answer]</p>"
    choiceFormat?: string;        // e.g., "<li>[choiceN]</li>" (for MC)
    referenceFormat?: string;     // e.g., "<p><i>Reference: [reference], p.[page]</i></p>"
    separator?: string;           // e.g., "<hr>" or "<br>"
    requiredTags: string[];       // ["<strong>", "<b>", "<p>", "<li>"]
}

export function analyzeTemplate(templateString: string): TemplateStructure {
    // Parse the template HTML to identify structural patterns
    // Return a machine-friendly description
}

// Use in system prompt:
function buildTemplateInstruction(template: Template): string {
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

## 11. Detailed Code-Level Recommendations

### 11.1 Replace `htmlReplace.ts` with DOM-based editing

**Why**: The current string-matching approach is the #1 cause of edit failures.

**Files to change**:
- Replace `services/htmlReplace.ts` with `services/domEditor.ts`
- Update `services/gemini.ts` → `processFunctionCalls()`
- Update tool declaration in `services/prompts.ts`

### 11.2 Add `services/contextManager.ts`

**Why**: Zero context management causes context overflow and wasted tokens.

**New file** implementing:
- `estimateTokens(text: string): number`
- `calculateBudget(model: string): ContextBudget`
- `pruneHistory(messages, maxTokens): ChatMessage[]`
- `truncateSourceDocuments(docs, maxTokens): string[]`
- `shouldInjectDocument(lastMessage): boolean` (only inject doc for edit-related messages)

### 11.3 Refactor `services/prompts.ts` into modular sections

**Why**: Monolithic prompt causes token waste and competing instructions.

- Split `baseChatSystemInstruction` into 5-6 small functions
- Remove the code block formatting tutorial (the LLM knows Markdown)
- Remove the language list (saves ~20 lines / ~200 tokens per turn)
- Move source documents out of system prompt
- Make template context structural, not raw

### 11.4 Add retry loop in `hooks/useChat.ts`

**Why**: Single-shot tool execution with no feedback is the #2 cause of edit failures.

- Implement `MAX_TOOL_RETRIES = 2`
- Feed tool errors back to the LLM
- Let the LLM choose an alternative strategy

### 11.5 Remove `getReflectionStream`

**Why**: Doubles API cost for every edit with minimal value.

- Remove `services/gemini.ts` → `getReflectionStream()`
- Remove `processReflectionStream()` from `hooks/useChat.ts`
- Use the original response text + success indicator instead
- Remove `utils/streamHelpers.ts` → reflection-related functions

### 11.6 Add error boundaries and graceful degradation

**Why**: Currently, any error in the stream processing crashes the chat.

```typescript
// Proposed: Add to useChat.ts
try {
    const result = processFunctionCalls({...});
    // ... handle result
} catch (error) {
    // Graceful fallback: show what the AI said, note the edit failed
    const fallbackMessage = accumulatedText
        ? `${accumulatedText}\n\n*Note: The edit could not be applied. You can try again or make the change manually in the editor.*`
        : '*The edit could not be applied. Please try again with different instructions.*';

    setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'model', content: fallbackMessage };
        return updated;
    });
}
```

---

## 12. Prioritized Implementation Roadmap

### Phase 1: Fix Critical Edit Failures (1-2 days)

| # | Task | Impact | Effort |
|---|------|--------|--------|
| 1 | Add tool retry loop with error feedback | Fixes ~60% of edit failures | Medium |
| 2 | Improve tool declaration (question-level addressing) | Reduces snippet matching need | Medium |
| 3 | Add DOM-based fallback for snippet matching | Handles remaining edge cases | Medium |

### Phase 2: Optimize Token Usage (1 day)

| # | Task | Impact | Effort |
|---|------|--------|--------|
| 4 | Remove reflection call | 50% fewer API calls during edits | Low |
| 5 | Add history pruning (sliding window) | Prevents context overflow | Low |
| 6 | Remove unnecessary prompt sections (code block tutorial, etc.) | Saves ~500 tokens/turn | Low |

### Phase 3: Structural Improvements (2-3 days)

| # | Task | Impact | Effort |
|---|------|--------|--------|
| 7 | Modularize system prompt | Cleaner, more maintainable | Medium |
| 8 | Move source docs out of system prompt | Better token allocation | Medium |
| 9 | Add token estimation and budget system | Prevents overflow for large docs | Medium |
| 10 | Make template context structural | Better template preservation | Low |

### Phase 4: Advanced (Optional, 3-5 days)

| # | Task | Impact | Effort |
|---|------|--------|--------|
| 11 | Conversation compaction (summarize old turns) | Enables very long sessions | High |
| 12 | Gemini context caching integration | Cost reduction for repeated content | Medium |
| 13 | Multi-step edit support (sequential tool calls) | Complex edits in one turn | High |

---

## Summary of Key Patterns from OpenClaw

| Pattern | OpenClaw Implementation | QA Guru Gap |
|---------|------------------------|-------------|
| **Retry with feedback** | Multi-attempt loop, error classification, automatic recovery | No retry, no feedback |
| **Token budgeting** | `estimateTokens()`, `pruneHistory()`, `computeAdaptiveChunkRatio()` | No token awareness |
| **Context compaction** | `summarizeInStages()`, `summarizeWithFallback()` | Unbounded history growth |
| **Modular prompts** | Section-per-function, conditional inclusion, mode-based | Single monolithic string |
| **Tool result management** | Truncation, pairing repair, orphan cleanup | No management |
| **Error recovery** | Context overflow → compact, auth failure → rotate, rate limit → fallback | Fail and show error |
| **Separation of concerns** | Instructions vs. context files vs. tool definitions | Everything in system prompt |

---

*Analysis generated by comparing QA Guru (`q-a_guru/`) against OpenClaw (`openclaw/`) codebases.*
