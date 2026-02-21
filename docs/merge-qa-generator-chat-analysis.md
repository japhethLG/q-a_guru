# Merging QA Generator + Chat AI — Analysis

> **Date:** 2026-02-21
> **Status:** Proposal / Analysis
> **Scope:** Code, Logic, UX, and UI

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Overview](#2-current-architecture-overview)
3. [Overlap & Divergence Analysis](#3-overlap--divergence-analysis)
4. [Merge Strategy — Code & Logic](#4-merge-strategy--code--logic)
5. [UX/UI Redesign Proposals](#5-uxui-redesign-proposals)
6. [Recommended Approach](#6-recommended-approach)
7. [Risk & Trade-offs](#7-risk--trade-offs)
8. [Implementation Roadmap](#8-implementation-roadmap)

---

## 1. Executive Summary

The application currently has **two distinct AI-powered flows** that share significant infrastructure but are presented as separate experiences:

| Aspect             | QA Generator                                                                       | Chat AI                                                                                |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Trigger**        | "Generate Q&A" button                                                              | Chat input message                                                                     |
| **Configuration**  | Dedicated `ConfigSection` panel (template, count, difficulty, model, instructions) | Minimal — only model picker in `ChatHeader`                                            |
| **LLM Call**       | `generateQaStream()` — one-shot prompt, no tools                                   | `getChatResponseStream()` — agentic loop with tools (`edit_document`, `read_document`) |
| **Output**         | Streams raw HTML into the editor                                                   | Streams into chat bubbles + applies tool-based edits to the editor                     |
| **Context shared** | Source documents, config → prompt                                                  | Source documents, config (qaConfig), editor HTML, selected text                        |

**Key insight:** The chat AI _already has access_ to the full QA configuration (template, type, difficulty, instructions) and source documents. It can already generate Q&A content via `full_replace` tool calls. The QA Generator is essentially a **preconfigured, one-shot chat command** with a specialized prompt.

This means merging is not just possible — it's a simplification. The question is how to do it in a way that **improves** the UX rather than making it more complex.

---

## 2. Current Architecture Overview

### 2.1 Data Flow — QA Generator

```
User uploads docs → FileUploadSection (parses files)
       ↓
User configures → ConfigSection (template, count, difficulty, model, instructions)
       ↓
User clicks "Generate Q&A" → QAGenerator.handleGenerate()
       ↓
generateQaStream(documents, config, apiKey, signal, transport)
  → prompts.getQAPrompt(documents, config)
  → transport.generateContentStream(prompt)
       ↓
Streams HTML chunks → setEditorContent(accumulatedText)
       ↓
Creates initial DocumentVersion → versionHistory
```

**Key files:**

- `components/QAGenerator.tsx` — orchestrator (line 97-168: `handleGenerate`)
- `services/gemini.ts` — `generateQaStream()` (lines 28-80)
- `services/prompts.ts` — `getQAPrompt()` (lines 12-104)

### 2.2 Data Flow — Chat AI

```
User sends message → ChatInput
       ↓
useChat.sendMessageWithContext(message, contextMessages)
       ↓
getChatResponseStream(history, message, sourceDocs, documentHtml, selectedText, ...)
  → prompts.baseChatSystemInstruction(sourceDocs, qaConfig)
  → prompts.appendDocumentHtml(instruction, documentHtml)
  → prompts.appendSelectedText(instruction, selectedText)
  → transport.generateContentStream({config with tools})
       ↓
Agent loop: stream → process tool calls → apply edits → feed result back
       ↓
Updates editor via onDocumentEdit() + shows messages in chat
```

**Key files:**

- `components/ChatSection.tsx` — chat wrapper
- `hooks/useChat.ts` — agent loop (lines 136-371)
- `services/gemini.ts` — `getChatResponseStream()` (lines 174-318)
- `services/prompts.ts` — `baseChatSystemInstruction()` (lines 109-216)

### 2.3 Shared Infrastructure

Both flows share:

- **AppContext** — files, documentsContent, qaConfig, generationConfig, editorContent, transport, providerConfig
- **LLM Transport** — `llmTransport.ts` abstraction (SDK / proxy)
- **Template system** — `templateStorage.ts`, `templates.ts`
- **Source document parsing** — `parser.ts`
- **Editor** — TinyMCE in `EditorSection.tsx`
- **Version history** — DocumentVersion tracking in QAGenerator
- **Model picker** — shared `ModelPicker` component

---

## 3. Overlap & Divergence Analysis

### 3.1 What is duplicated

| Concern                 | QA Generator                                | Chat AI                                                     | Can merge?                 |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| Model selection         | `qaConfig.model` in ConfigSection           | `chatConfig.model` in ChatHeader                            | ✅ Use single model config |
| LLM transport creation  | Shared via AppContext                       | Shared via AppContext                                       | ✅ Already shared          |
| Source document context | Embedded in `getQAPrompt()`                 | Injected in `baseChatSystemInstruction()` + inline contents | ✅ Already shared          |
| QA config access        | `qaConfig` directly in `handleGenerate`     | `qaConfig` passed through `useChat` → system instruction    | ✅ Already shared          |
| Template resolution     | `getTemplateById()` in `generateQaStream()` | `getTemplateById()` in `baseChatSystemInstruction()`        | ✅ Same logic              |
| Streaming orchestration | Manual async iterator in `handleGenerate`   | `processStream()` + agent loop in `useChat`                 | ⚠️ Different complexity    |
| Abort handling          | `abortControllerRef` in QAGenerator         | `abortControllerRef` in useChat                             | ✅ Same pattern            |
| Version management      | `handleDocumentEdit()` in QAGenerator       | `onDocumentEdit` callback from useChat                      | ✅ Same callback           |

### 3.2 What is genuinely different

| Concern                | QA Generator                                                                      | Chat AI                                                                         |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Prompt engineering** | `getQAPrompt()` — specialized, template-aware prompt focused solely on generation | `baseChatSystemInstruction()` — general-purpose agent prompt with editing tools |
| **Tool usage**         | None — raw text generation                                                        | `edit_document` + `read_document` tools                                         |
| **Streaming target**   | Directly into editor content                                                      | Into chat message bubbles                                                       |
| **Conversation state** | None — stateless one-shot                                                         | Full message history with retry/edit                                            |
| **Output format**      | Raw HTML for the editor                                                           | Markdown for chat + HTML via tools for editor                                   |
| **Error handling**     | Simple try/catch with alert                                                       | Classified errors with auto-retry                                               |

### 3.3 Critical observation

The `baseChatSystemInstruction()` already contains all the Q&A context:

```
<qa_config>
## Q&A Generation Context:
- Question Type: ${qaConfig.type}
- Difficulty: ${qaConfig.difficulty}
- Number of Questions: ${qaConfig.count}
- Additional Instructions: ${qaConfig.instructions}
- Template: ${selectedTemplate.name} [with full template string]
</qa_config>
```

This means the chat AI can already generate Q&A if the user simply types: _"Generate 10 multiple choice questions from the uploaded documents."_ The only thing the dedicated generator adds is:

1. A **specialized one-shot prompt** (`getQAPrompt`) that is more focused
2. **Direct streaming into the editor** instead of through tool calls
3. A **one-click button UX** instead of typing a message

---

## 4. Merge Strategy — Code & Logic

### 4.1 Option A: Chat-First Architecture (Recommended)

**Concept:** The chat is the single AI interface. QA generation becomes a **pre-built chat command** triggered by UI action buttons.

#### How it works:

1. **Remove `generateQaStream()`** — replace with a chat message
2. **The "Generate Q&A" button sends a pre-built prompt** to the chat (like the existing `actionButtons` in `ChatInput.tsx`)
3. **The chat's agent loop handles everything** — it uses `full_replace` to write the generated Q&A into the editor
4. **The system prompt already has all config context** — no changes needed to `prompts.ts`

#### Code changes:

```
// Instead of:
QAGenerator.handleGenerate() → generateQaStream() → stream to editor

// Becomes:
ConfigSection "Generate" button → handleSendMessage(generationPrompt)
  → chat agent uses edit_document(full_replace) → updates editor
```

**Benefits:**

- Eliminates ~80 lines in `handleGenerate()` + ~50 lines in `generateQaStream()`
- Single streaming infrastructure (`useChat` agent loop)
- Generation becomes a chat message the user can see, edit, retry
- Generation results are part of the conversation history
- User can immediately follow up: "Make question 3 harder" after generation

**Risks:**

- Slightly more tokens (tool call overhead vs direct generation)
- Generation is slightly slower due to tool-call round-trips
- Less predictable output format (agent might explain before generating)

#### Mitigation:

Enhance the generation prompt to be explicit:

```
"Generate {count} {type} questions at {difficulty} difficulty from the uploaded documents.
Use the edit_document tool with full_replace to write the result directly into the editor.
Follow the configured template exactly. Do not include explanations in your response —
only the tool call."
```

### 4.2 Option B: Hybrid — Unified Engine, Dual UI Mode

**Concept:** Keep the dedicated generation button, but route it through the same `useChat` infrastructure internally. The UI shows a "generation mode" banner in the chat during initial generation.

#### How it works:

1. **Keep `ConfigSection` and the "Generate Q&A" button**
2. **Clicking "Generate" sends a system-injected message to the chat** (not a user message)
3. **The chat handles streaming** — but instead of showing the generation as a chat back-and-forth, it shows a `GenerationProgress` component
4. **After generation completes**, the chat becomes available for follow-up

#### Code changes:

- `useChat` gets a new `handleGenerateQA(config)` method
- Internally it calls `handleSendMessage()` with a specialized prompt
- The message is marked with a `type: 'generation'` flag in `ChatMessage`
- Chat UI renders generation messages differently (progress bar, not bubbles)

**Benefits:**

- Preserves the simple "click button to generate" UX
- Single code path for LLM interactions
- Generation results appear in chat history

**Risks:**

- More complex message types
- Need to handle the generation message display differently

### 4.3 Option C: Direct Merge with Smart Default Prompt

**Concept:** Completely remove the separate generation flow. The chat gets a "quick action" bar that auto-fills generation prompts based on the current configuration.

#### How it works:

1. **Move config controls into a "Generation Settings" modal** accessible from the chat header
2. **Add a prominent "Generate Q&A" quick-action button** above the chat input (always visible when docs are uploaded)
3. **Button auto-generates and sends a prompt** like: "Generate 10 medium multiple choice questions using the configured template"
4. **Everything flows through the standard chat**

---

## 5. UX/UI Redesign Proposals

### 5.1 Current UX Issues

1. **Disconnected flows:** The user configures Q&A in the left panel, generates, then uses a _completely separate_ chat to iterate. The mental model is broken — "I configured everything on the left, why do I need to reconfigure on the right?"

2. **Duplicate model pickers:** `ConfigSection` has a model picker for generation, `ChatHeader` has a separate one for chat. Users must set both.

3. **No visibility into generation context:** The chat doesn't show what was generated or why. If the user asks "change question 3," the chat has no memory of the generation step.

4. **Left panel becomes dead weight:** After generation, the config panel (left sidebar) serves no purpose. The user's focus shifts entirely to editor + chat.

5. **No iterative generation:** To generate more questions, the user must go back to the left panel and hit "Generate" again, which replaces everything. There's no "add 5 more questions" flow.

### 5.2 Proposed UX: "Chat-Driven Workspace"

#### Layout: Two-Panel (instead of Three-Panel)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header (compact — app title, provider settings)                    │
├──────────────────────────────────┬──────────────────────────────────┤
│                                  │                                  │
│    Document Editor               │    AI Chat                       │
│    (TinyMCE — 2/3 width)        │    (1/3 width)                   │
│                                  │                                  │
│                                  │  [⚙️ Settings] [📎 3 files] [⟳] │
│                                  │                                  │
│                                  │  [Chat messages...]              │
│                                  │                                  │
│                                  │  ┌─ Quick Actions ───────────┐  │
│                                  │  │ ✨ Generate Q&A            │  │
│                                  │  │ 📎 Upload docs             │  │
│                                  │  └───────────────────────────┘  │
│                                  │                                  │
│                                  │  [Chat input + Send]             │
│                                  │                                  │
├──────────────────────────────────┴──────────────────────────────────┤
│  Status Bar (file count, question count, version info)              │
└─────────────────────────────────────────────────────────────────────┘
```

Clicking ⚙️ opens the **Generation Settings Modal**:

```
┌──────────── Generation Settings ───────────────┐
│                                          [✕]   │
│                                                 │
│  LLM Provider:    [Google Gemini (Direct) ▼]   │
│  API Key:         [••••••••••••••••]            │
│  Model:           [gemini-3-flash ▼]            │
│                                                 │
│  ── Q&A Configuration ──────────────────────── │
│  Template:        [Board Exam Q&A ▼]    [⚙️]   │
│  Questions:       [10]                          │
│  Difficulty:      [Easy] [●Med] [Hard]          │
│  Instructions:    [Focus on chapter 3...]       │
│                                                 │
│  ── Attached Documents ─────────────────────── │
│  📄 chapter1.pdf (12 pages)            [✕]     │
│  📄 notes.docx (4 pages)               [✕]     │
│  📄 slides.pptx (20 slides)            [✕]     │
│  [+ Add files]                                  │
│                                                 │
│              [Close]   [✨ Generate Q&A]        │
└─────────────────────────────────────────────────┘
```

#### Key UX Improvements:

**A. Config as a Modal (not a drawer)**

Move the QA configuration into a **modal dialog** triggered by a ⚙️ button in the chat header. This:

- Eliminates the 3-column layout → more space for editor
- Keeps the chat panel 100% dedicated to conversation — no drawer eating vertical space
- Config is a "set it and forget it" interaction — open modal, configure, close
- **Reuses the existing `Modal` component** already used for template management — zero new infrastructure
- Groups ALL settings in one place: LLM provider, model, template, count, difficulty, instructions, AND file uploads
- Natural "Generate" button inside the modal footer — configure and launch in one flow

The chat header becomes compact:

```
┌────────────── AI Chat ─────────────────┐
│ [⚙️ Settings] [📄 3 files]       [⟳] │
│                                         │
│ ─── Chat Messages ──────────────────── │
│ ...                                     │
└─────────────────────────────────────────┘
```

The ⚙️ button shows a badge/indicator when config differs from last generation, nudging the user to review before regenerating.

**B. Smart Quick Actions — Context-Aware**

Replace the static "Generate Q&A" button with dynamic quick-action chips that adapt to state:

| State                     | Quick Actions                                                          |
| ------------------------- | ---------------------------------------------------------------------- |
| No docs uploaded          | `📎 Upload documents`                                                  |
| Docs uploaded, no content | `✨ Generate Q&A` • `📋 Summarize docs`                                |
| Content in editor         | `➕ Add 5 more questions` • `🔄 Regenerate all` • `📊 Analyze quality` |
| Text selected             | `✏️ Improve` • `🔀 Change` • `💪 Harder` • `🤔 Explain`                |

**C. Generation as a Visible Chat Event**

When the user clicks "Generate Q&A," it appears as a chat message:

```
┌──────────────────────────────────────┐
│ 🧑 You                              │
│ Generate 10 medium-difficulty        │
│ multiple choice questions using      │
│ the "Board Exam" template            │
├──────────────────────────────────────┤
│ 🤖 AI                               │
│ I'll generate 10 multiple choice     │
│ questions at medium difficulty...    │
│                                      │
│ ✅ Document updated with 10 questions│
│                                      │
│ Would you like me to adjust any of   │
│ the questions?                       │
└──────────────────────────────────────┘
```

**Benefits:**

- Full traceability: the user sees exactly what was requested
- Retry/edit works: click "retry" on the generation message to regenerate
- Follow-up is natural: "Make questions 3 and 7 harder" in the next message
- Config changes are reflected: changing the template and regenerating shows as a new conversation turn

**D. File Upload Inside Chat**

Move file upload into the chat panel as a drag-and-drop zone OR a dedicated "attach" button on the chat input. Files appear as "context cards" in the chat:

```
┌──────────────────────────────────────┐
│ 📎 Attached: 3 documents             │
│  ├ chapter1.pdf (12 pages)           │
│  ├ notes.docx (4 pages)             │
│  └ slides.pptx (20 slides)          │
│                  [Remove all] [Add ▼]│
└──────────────────────────────────────┘
```

**E. Single Model Picker**

One model picker in the chat settings drawer. Applies to both generation and chat interactions. The current dual-picker confusion is eliminated.

### 5.3 Proposed UX: Progressive Complexity

For users who want the "simple mode" experience:

1. **Upload docs** (drag-and-drop in the chat panel)
2. **Click "✨ Generate Q&A"** (uses default settings)
3. **Content appears in editor** with a chat message explaining what was generated
4. **Type follow-ups** in the chat to iterate

For power users:

1. **Expand "⚙️ Generation Settings"** to customize template, count, difficulty
2. **Type custom prompts** like "Generate 20 essay questions focusing on chapter 3"
3. **Use text selection** to target specific sections for edits

---

## 6. Recommended Approach

**Option A (Chat-First) + UX Proposal 5.2** is the recommended path.

### Why:

1. **Simplest code:** Eliminates `generateQaStream()`, simplifies `QAGenerator.tsx`
2. **Best UX:** Generation becomes part of the conversation, enabling natural iteration
3. **Single mental model:** Users learn one interaction pattern (chat with AI)
4. **Most extensible:** Future features (batch generation, style transfer, difficulty analysis) are just new chat commands
5. **Already 80% built:** The chat system prompt already has all the config context

### What to preserve:

- **Template system** — stays as-is, used in the system prompt
- **ConfigSection controls** — relocated into chat panel as a settings drawer
- **Version history** — unchanged, tool edits still create versions
- **File upload** — relocated into chat panel header area
- **Editor** — unchanged

### What to remove:

- `generateQaStream()` function in `gemini.ts`
- `getQAPrompt()` function in `prompts.ts` (replaced by a structured message builder)
- `handleGenerate()` logic in `QAGenerator.tsx`
- Separate `isGenerating` state (subsumed by chat's `isLoading`)
- `generationConfig` state in AppContext (chat always uses current `qaConfig`)
- Duplicate model picker in ConfigSection

### What to add:

- **Quick-action button system** in `ChatInput.tsx` (context-aware)
- **Generation prompt builder** — constructs an optimized message from current `qaConfig`
- **Config modal** — all settings (provider, model, template, count, difficulty, instructions, files) in a single modal
- **File attachment area** in the chat panel
- **Generation message type** — special rendering for generation events in chat

---

## 7. Risk & Trade-offs

### 7.1 Generation Quality

**Risk:** The agentic chat path might produce slightly different output than the specialized `getQAPrompt()`.

**Mitigation:** Craft the generation prompt to be as explicit as the current `getQAPrompt()`. The system instruction already includes template details, so the main concern is ensuring the chat doesn't add unnecessary explanations before generating.

### 7.2 Token Efficiency

**Risk:** Chat path includes system instruction overhead (editing instructions, tool declarations) even for simple generation.

**Mitigation:**

- Context caching already handles the system instruction efficiently
- The tool overhead is ~500 tokens — negligible for a generation call
- Could add a `mode: 'generation'` flag that strips editing instructions from the system prompt for pure generation calls

### 7.3 Streaming UX

**Risk:** Currently, generation streams directly into the editor with live preview. Chat-based generation would first stream into a chat bubble, then apply the result via tool call, causing a delay.

**Mitigation:**

- For the `full_replace` tool call, apply it immediately as it arrives (progressive rendering)
- Show a "Generating..." indicator in the editor during the process
- Consider a hybrid: stream the HTML directly to the editor while ALSO showing a summary in chat

### 7.4 Learning Curve

**Risk:** Users accustomed to the current "configure → click → generate" flow might find the chat-driven approach less intuitive initially.

**Mitigation:**

- The quick-action button provides the same one-click experience
- The config modal is one click away via the ⚙️ button in the chat header
- A first-time onboarding tooltip explains the unified approach

---

## 8. Implementation Roadmap

### Phase 1: Code Unification (Backend-First)

1. **Create `buildGenerationPrompt(qaConfig)`** — constructs a chat message from current config
2. **Add `handleQuickGenerate()` to `useChat`** — sends the generation prompt as a user message
3. **Enhance `baseChatSystemInstruction()`** — add explicit guidance for generation-mode requests
4. **Remove `generateQaStream()`** and `getQAPrompt()` after validation
5. **Remove `generationConfig` from AppContext** — always use live `qaConfig`

### Phase 2: UI Consolidation

1. **Refactor `ConfigSection` into a `ConfigModal`** — all settings in a single modal dialog (reuse existing `Modal` component)
2. **Move `FileUploadSection` into config modal** — attach documents from within the settings
3. **Simplify layout** — 2-column (editor + chat) instead of 3-column
4. **Add `QuickActions` component** — context-aware action buttons above chat input
5. **Unify model picker** — single picker in config modal, remove from `ChatHeader`
6. **Update `ChatHeader`** — add ⚙️ settings button, file count indicator, compact layout

### Phase 3: UX Polish

1. **Generation message rendering** — special chat bubble style for generation events
2. **Progressive streaming** — editor shows content as it's being generated via tool calls
3. **Smart quick actions** — adapt based on editor state, file state, selection
4. **Onboarding** — first-time user guidance
5. **Keyboard shortcuts** — `Ctrl+G` to trigger quick generate

### Phase 4: Advanced Features (Optional)

1. **Batch generation** — "Generate 50 questions in batches of 10"
2. **Quality analysis** — "Review all questions for accuracy and difficulty consistency"
3. **Template suggestions** — "Suggest a better template for these questions"
4. **Multi-document comparison** — "Generate questions that require synthesizing info from multiple sources"

---

## Appendix: File Impact Summary

| File                               | Impact                                                             | Action          |
| ---------------------------------- | ------------------------------------------------------------------ | --------------- |
| `services/gemini.ts`               | Remove `generateQaStream()` (~50 lines)                            | Delete function |
| `services/prompts.ts`              | Remove `getQAPrompt()` (~90 lines), add `buildGenerationMessage()` | Replace         |
| `components/QAGenerator.tsx`       | Major refactor — remove generate logic, simplify to layout only    | Refactor        |
| `components/ConfigSection.tsx`     | Refactor into `ConfigModal` (reuse existing `Modal` component)     | Refactor        |
| `components/ChatSection.tsx`       | Add config modal trigger, file indicators, quick actions           | Extend          |
| `components/chat/ChatInput.tsx`    | Add quick action buttons system                                    | Extend          |
| `components/chat/ChatHeader.tsx`   | Replace model picker with ⚙️ settings button + file count badge    | Refactor        |
| `components/FileUploadSection.tsx` | Relocate into chat panel                                           | Move            |
| `contexts/AppContext.tsx`          | Remove `generationConfig`, `isGenerating`                          | Simplify        |
| `hooks/useChat.ts`                 | Add `handleQuickGenerate()` method                                 | Extend          |
| `types.ts`                         | Remove or merge `ChatConfig` into `QaConfig`                       | Simplify        |
