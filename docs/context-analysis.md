# Context Pipeline & File Handling — Analysis & Implementation Guide

> **Last updated:** 2026-02-22  
> **Status:** Analysis complete, implementation pending  
> **Scope:** q-a_guru chat application — context management, file handling, token budgets

---

## Executive Summary

The chat application currently parses uploaded files (PDF, DOCX, PPTX, TXT) into **plain text** before sending them to the LLM. This approach loses all formatting, tables, embedded images, charts, and layout information. Gemini models natively understand PDFs (including visual elements), so we should **convert all supported file types to PDF** and hand them off directly to the LLM as binary `inlineData`.

Additionally, the context budget system uses **hard-coded token limits** (100K practical budget) despite all current Gemini models supporting **1M tokens**. Source documents and the editor's HTML content — which are the foundation for Q&A generation — should be treated as **permanent context** that is never pruned.

### Key Recommendations

| #   | Issue                                            | Recommendation                                                                  | Priority  |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- | --------- |
| 1   | Files parsed to lossy plain text                 | **Convert all files to PDF → send native binary to LLM**                        | 🔴 High   |
| 2   | No OCR / embedded image support                  | Solved by #1 — Gemini natively reads images inside PDFs                         | 🔴 High   |
| 3   | Hard-coded 100K token budget (model supports 1M) | **Read `inputTokenLimit` from SDK `models.list()` → scale budgets dynamically** | 🟡 Medium |
| 4   | Source docs can be pruned from context           | **Reserve permanent context slots for source docs + editor HTML**               | 🟡 Medium |
| 5   | Large docs may overflow context                  | **Add page-range selector UI for oversized documents**                          | 🟢 Future |
| 6   | No video file support                            | **Add video upload via Gemini Files API**                                       | 🟢 Future |
| 7   | Images not counted in token budget               | **Include image token estimates in `buildContextBudget()`**                     | 🟡 Medium |

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Part 1: Current Context Pipeline](#part-1-current-context-pipeline)
  - [Layer 1 — System Instruction](#layer-1--system-instruction-promptsts)
  - [Layer 2 — Source Documents](#layer-2--source-documents-uploaded-files)
  - [Layer 3 — Chat History](#layer-3--chat-history-contextmanagerts)
  - [Layer 4 — Context Budget](#layer-4--context-budget-check-buildcontextbudget)
  - [Layer 5 — Final Contents Array](#layer-5--final-contents-array-geminits)
  - [Layer 6 — Transport Layer](#layer-6--transport-layer-llmtransportts)
  - [Issues Found](#issues-found-in-context-pipeline)
- [Part 2: Current File Handling](#part-2-current-file-handling)
  - [Upload → Parse Pipeline](#upload--parse-pipeline)
  - [Source Documents in the LLM Request](#source-documents-in-the-llm-request)
  - [Token Budget for Source Documents](#token-budget-for-source-documents)
  - [Embedded Image Extraction (OCR)](#embedded-image-extraction-ocr)
  - [Issues Found](#issues-found-in-file-handling)
- [Part 3: Model Token Limits](#part-3-model-token-limits)
  - [Current State — No Model Awareness](#current-state-no-model-specific-token-awareness)
  - [What the API Exposes](#what-the-api-exposes)
  - [Issues Found](#consequences)
- [Part 4: Native File Support — Implementation Plan](#part-4-native-file-support--implementation-plan)
  - [What Gemini Supports Natively](#what-gemini-models-support-natively)
  - [Strategy: Convert All Files to PDF → Send Native](#strategy-convert-all-files-to-pdf--send-native-binary)
  - [Video Support](#video-support-via-files-api)
  - [Implementation Steps](#implementation-steps)
- [Part 5: Context Permanence](#part-5-context-permanence--source-docs--editor-content)
  - [The Problem](#the-problem)
  - [Page-Range Selector](#proposed-user-controlled-pagerange-selection)
  - [Priority Hierarchy](#priority-of-context-proposed-hierarchy)
- [Sources](#sources)

---

## Part 1: Current Context Pipeline

The context flows through **6 layers** before reaching the LLM. Each layer adds or transforms information.

### Layer 1 — System Instruction (`prompts.ts`)

Built in two parts:

| Part                                   | Content                                                                                          | Cacheable?                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Base** (`baseChatSystemInstruction`) | Role definition, formatting rules, editing instructions, agentic behavior, Q&A config + template | ✅ Yes — cached via `geminiCache.ts` |
| **Dynamic suffix**                     | Document HTML state via `appendDocumentHtml` + user selection via `appendSelectedText`           | ❌ No — changes every turn           |

The base instruction is ~3–4K tokens of static instructions. The dynamic suffix embeds the **entire document HTML** inline via `<document_state>` tags every turn.

**Files:** `services/prompts.ts` (system prompt construction), `services/geminiCache.ts` (caching layer)

### Layer 2 — Source Documents (uploaded files)

| Mode                        | How they're sent                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------- |
| **Cached** (SDK only)       | Cached separately as a `user→model` pair in `geminiCache.ts`, not re-sent each turn |
| **Uncached** (SDK or proxy) | Sent inline at the start of `contents[]` as a `user→model` pair                     |

Source docs are truncated proportionally via `truncateSourceDocuments()` if they exceed 20K tokens (20% of the 100K practical budget).

**Files:** `services/contextManager.ts` (truncation logic), `services/gemini.ts` (lines ~191-212, inline source doc injection)

### Layer 3 — Chat History (`contextManager.ts`)

Pruned via `compactHistory()` before sending:

| Strategy        | Limit              | Details                                                          |
| --------------- | ------------------ | ---------------------------------------------------------------- |
| **Turn-based**  | Last 10 user turns | Drops oldest user+model pairs                                    |
| **Token-based** | 50K tokens total   | `estimateTokens()` via `chars / 4` heuristic, drops oldest pairs |
| **Compaction**  | N/A                | Prepends a one-line summary of dropped topics                    |

**Files:** `services/contextManager.ts` (all pruning and budget logic)

### Layer 4 — Context Budget Check (`buildContextBudget()`)

**Informational only** — logs a breakdown but doesn't block the request:

```
[ContextBudget] Total: 42000 tokens
  systemPrompt: 3500, sourceDocuments: 15000,
  documentHtml: 8000, history: 12000, newMessage: 500
```

The `PRACTICAL_TOKEN_BUDGET` is hard-coded to **100,000 tokens**.

**Files:** `services/contextManager.ts` (lines ~78-145)

### Layer 5 — Final Contents Array (`gemini.ts`)

```
contents = [
  ...sourceDocContext,   // source docs (user/model pair) — skipped if cached
  ...geminiHistory,      // pruned chat history with inlineData for images
  { role: 'user', parts: userParts }  // current message (text + images)
]
```

**Files:** `services/gemini.ts` (`getChatResponseStream` function, lines ~130-230)

### Layer 6 — Transport Layer (`llmTransport.ts`)

| Transport                       | Behavior                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **SDK** (`gemini-sdk`)          | Passes directly to `ai.models.generateContentStream()` — SDK handles all part types                    |
| **Proxy** (`antigravity-proxy`) | `normalizeContents()` passes through array content unchanged → proxy receives `inlineData` parts as-is |

**Files:** `services/llmTransport.ts` (transport abstraction, `createSDKTransport`, `createProxyTransport`)

### Issues Found in Context Pipeline

1. **Document HTML in system instruction every turn** — The entire document HTML is embedded in the dynamic suffix of the system instruction on every API call. For large documents this can be 50K+ tokens, and it's **never cached**.

2. **No image awareness in token budgets** — `pruneHistory`, `compactHistory`, and `buildContextBudget` all estimate tokens from `m.content` text only. Images (base64 `inlineData`) in history are invisible to the budget system.

3. **Duplicate selected text** — When the user has a selection, it appears in **three places**: the system instruction (`appendSelectedText`), the user prompt (`getUserPrompt`), and the context chip in the contentEditable.

4. **No model-specific token awareness** — See [Part 3](#part-3-model-token-limits).

---

## Part 2: Current File Handling

### Upload → Parse Pipeline

```
User drops/picks file → ChatSection.handleFilesAdd()
  → parser.parseFile(file) — based on extension:
      .txt  → FileReader.readAsText()
      .docx → mammoth.extractRawText()        (plain text, no formatting)
      .pptx → JSZip → extract <a:t> XML tags  (fragile regex parsing)
      .pdf  → pdfjs-dist.getTextContent()      (plain text per page)
  → string added to documentsContent[] in AppContext
```

**Files:** `services/parser.ts` (all file parsing logic)

**Key problems:**

- All formats are converted to **plain text strings** — no metadata, no structure
- DOCX loses all formatting (mammoth `extractRawText` mode)
- PPTX parsing is fragile — uses regex on raw XML `<a:t>` tags
- Images inside documents (e.g., embedded in a PPTX or PDF) are **silently discarded**
- File objects (`File[]`) and parsed content (`string[]`) are stored separately in AppContext at matching indices

### Source Documents in the LLM Request

Source documents enter the context via two paths:

**Path A — Cached mode (SDK transport with caching support):**

```
geminiCache.ts → getOrCreateCache() caches:
  - systemInstruction (base only)
  - sourceDocuments as { role:'user', parts:[{text: "<source_documents>..."}] }
  - tools (edit_document, read_document)
  TTL: 1 hour, fingerprinted by (model + systemInstruction + docs + apiKey)
```

Once cached, source docs are **not re-sent** on each turn — only the cache reference (`cacheName`) is passed. The cache is invalidated when any fingerprint component changes.

**Path B — Uncached mode (proxy transport, or caching failure):**

```
gemini.ts → getChatResponseStream()
  → truncateSourceDocuments(sourceDocuments)  // trim if over 20K tokens
  → prepended to contents[] as inline user→model pair
```

### Token Budget for Source Documents

```
PRACTICAL_TOKEN_BUDGET  = 100,000 tokens
SOURCE_DOC_BUDGET       =  20,000 tokens  (20% of practical)
```

When total source doc tokens exceed 20K, `truncateSourceDocuments()` trims each doc **proportionally** to its share of the total, appending `[… Document truncated to fit context window]`.

### Embedded Image Extraction (OCR)

Our current parsers **cannot extract text from images** inside any supported file type:

| Parser   | Library                         | Embedded images                                                         | OCR capability |
| -------- | ------------------------------- | ----------------------------------------------------------------------- | -------------- |
| **PDF**  | `pdfjs-dist.getTextContent()`   | ❌ Ignored — only extracts text-layer objects, not pixel data           | ❌ None        |
| **DOCX** | `mammoth.extractRawText()`      | ❌ Ignored — `extractRawText` mode strips everything non-text           | ❌ None        |
| **PPTX** | `JSZip` → regex on `<a:t>` tags | ❌ Ignored — only reads XML text nodes, skips `<a:blipFill>` image refs | ❌ None        |

If a PDF has scanned pages (image-only pages with no text layer), `pdfjs-dist` returns an **empty string** for those pages. Charts, diagrams, and figures in all formats are silently lost.

### Issues Found in File Handling

1. **Lossy parsing** — All file types reduced to plain text, losing formatting, tables, images, layout
2. **No OCR** — Text in images (scanned PDFs, diagrams) is completely invisible
3. **20K token budget is too low** — Only 2% of the real 1M context window is allocated to source docs
4. **No truncation feedback** — Users are never told their documents were truncated
5. **Docs re-sent every turn in uncached mode** — Full source docs sent on every proxy API call

---

## Part 3: Model Token Limits

### Current State: No Model-Specific Token Awareness

| Component                | What it does                                      | Model awareness?                  |
| ------------------------ | ------------------------------------------------- | --------------------------------- |
| `PRACTICAL_TOKEN_BUDGET` | Hard-coded to 100K                                | ❌ Same for all models            |
| `MAX_HISTORY_TOKENS`     | Hard-coded to 50K                                 | ❌ Same for all models            |
| `SOURCE_DOC_BUDGET`      | Hard-coded to 20K                                 | ❌ Same for all models            |
| `useGeminiModels`        | Fetches model list, uses `name` and `displayName` | ❌ Doesn't read `inputTokenLimit` |
| `ModelPicker`            | Shows dropdown of model names                     | ❌ No token limit display         |
| Proxy `listModels`       | Returns `{ name, displayName, description }`      | ❌ No token limit field           |

**Files:** `hooks/useGeminiModels.ts` (model fetching), `components/common/ModelPicker.tsx` (UI), `services/contextManager.ts` (budget constants)

### What the API Exposes

The **official Gemini REST API `Model` resource** returns this schema ([source](https://ai.google.dev/api/models#Model)):

```json
{
	"name": "string",
	"baseModelId": "string",
	"version": "string",
	"displayName": "string",
	"description": "string",
	"inputTokenLimit": "integer", // ← AVAILABLE but we ignore it
	"outputTokenLimit": "integer", // ← AVAILABLE but we ignore it
	"supportedGenerationMethods": ["string"],
	"thinking": "boolean",
	"temperature": "number",
	"maxTemperature": "number",
	"topP": "number",
	"topK": "integer"
}
```

**Important:** There is **NO `supportedMimeTypes` field**. The API does not expose which file types a model supports. This information is only available in Google's prose documentation per model family. See [Part 4](#strategy-skip-dynamic-mime-type-detection) for how we handle this.

The **antigravity-proxy's `/v1/models`** endpoint returns even less — just `{ id, object, created, owned_by }`. No token limits, no capabilities.

**Files:** `antigravity-proxy/src/server.js` (lines ~397-425, `/v1/models` endpoint)

### Consequences

1. **Wasting 90% of available context** — The `PRACTICAL_TOKEN_BUDGET` of 100K is 10× smaller than what every current Gemini model supports (1M).
2. **History is over-pruned** — 50K history limit and 10-turn cap cause conversations to lose context unnecessarily.
3. **No dynamic scaling** — A model with a smaller window might exceed our 100K budget; models with larger windows don't benefit.

### How to Fix (Implementation Guide)

**Step 1:** In `useGeminiModels.ts`, capture `inputTokenLimit` and `outputTokenLimit` from the SDK's `models.list()` response. The model objects already contain these fields — we just never read them.

```typescript
// In useGeminiModels.ts, inside the model iteration loop:
result.push({
	value: name,
	label: prettifyName(name, model.displayName || undefined),
	group: inferGroup(name),
	inputTokenLimit: model.inputTokenLimit, // ADD THIS
	outputTokenLimit: model.outputTokenLimit, // ADD THIS
});
```

**Step 2:** Pass the selected model's `inputTokenLimit` to `contextManager.ts` functions. Replace the hard-coded constants:

```typescript
// Replace:
const PRACTICAL_TOKEN_BUDGET = 100_000;
// With:
function getPracticalBudget(modelInputLimit: number): number {
	return Math.floor(modelInputLimit * 0.8); // 80% of model limit, keep 20% buffer
}
```

**Step 3:** For the proxy transport, either:

- Add `inputTokenLimit` to the proxy's `/v1/models` response, OR
- Maintain a client-side fallback: default to 1M for `gemini-3*` models

---

## Part 4: Native File Support — Implementation Plan

### What Gemini Models Support Natively

Gemini models can process several file types **natively** — meaning you send the raw file bytes (base64-encoded as `inlineData` or via the Files API) and the model understands the content directly, including layout, formatting, images, tables, etc.

#### Supported MIME Types ([source](https://ai.google.dev/gemini-api/docs/file-input-methods))

| Category   | MIME Types                                                                                   | Method                                                |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Images** | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/bmp`, `image/heic`              | `inlineData` (base64) — ✅ **already implemented**    |
| **PDF**    | `application/pdf`                                                                            | `inlineData` (base64) for <20MB, Files API for larger |
| **Text**   | `text/plain`, `text/html`, `text/css`, `text/csv`, `text/xml`, `text/rtf`, `text/javascript` | `inlineData` (base64) or Files API                    |
| **Audio**  | `audio/mpeg`, `audio/wav`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`              | Files API (upload + poll for processing)              |
| **Video**  | `video/mp4`, `video/mpeg`, `video/mov`, `video/avi`, `video/flv`, `video/wmv`, `video/3gpp`  | Files API (upload + poll for processing)              |
| **Code**   | Python, Java, C++, Go, Rust, etc.                                                            | `inlineData` or Files API                             |
| **JSON**   | `application/json`                                                                           | `inlineData` or Files API                             |

**Size limits:**

- `inlineData` (base64): recommended for files <20MB
- Files API: up to 100MB (50MB for PDFs), files expire after 48 hours

#### Two Ways to Send Files to Gemini

**1. Inline Data (base64)** — small files, no server-side upload ([source](https://ai.google.dev/gemini-api/docs/document-processing)):

```javascript
// PDF sent natively — Gemini sees layout, tables, images, formatting
const pdfPart = {
	inlineData: {
		data: base64EncodedPdfBytes, // raw PDF bytes, NOT parsed text
		mimeType: 'application/pdf',
	},
};
```

**2. Files API** — large files, videos, audio ([source](https://github.com/googleapis/js-genai/blob/main/codegen_instructions.md)):

```javascript
import { createPartFromUri, GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: 'KEY' });

// Upload
const file = await ai.files.upload({
	file: pdfBlob,
	config: { displayName: 'document.pdf' },
});

// Poll until processed
let getFile = await ai.files.get({ name: file.name });
while (getFile.state === 'PROCESSING') {
	await new Promise((r) => setTimeout(r, 5000));
	getFile = await ai.files.get({ name: file.name });
}

// Use in generation
const filePart = createPartFromUri(file.uri, file.mimeType);
```

### Strategy: Convert All Files to PDF → Send Native Binary

Instead of parsing files to text, **convert everything to PDF** and send the raw bytes to Gemini:

| Input Type | Conversion                                                                                    | Why                                    |
| ---------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| **PDF**    | ✅ Already a PDF — no conversion needed                                                       | Send raw bytes directly                |
| **DOCX**   | Convert to PDF client-side (e.g., via `docx-preview` library or server-side with LibreOffice) | Preserves formatting, tables, images   |
| **PPTX**   | Convert to PDF client-side or server-side                                                     | Preserves slide layout, images, charts |
| **TXT**    | Send as `text/plain` inlineData (no PDF conversion needed)                                    | Plain text is natively supported       |
| **Images** | Send as `image/*` inlineData (no conversion needed)                                           | Already implemented                    |
| **Video**  | Upload via Files API → send URI reference                                                     | New capability                         |

**Why native PDF is better than text extraction:**

| Aspect                        | Current (text extraction)    | Native PDF handoff                 |
| ----------------------------- | ---------------------------- | ---------------------------------- |
| Tables                        | ❌ Lost entirely             | ✅ Model sees visual table layout  |
| Formatting                    | ❌ Lost entirely             | ✅ Headers, bold, italic preserved |
| Embedded images               | ❌ Silently discarded        | ✅ Model "sees" all images         |
| Charts/diagrams               | ❌ Silently discarded        | ✅ Model understands visual charts |
| Scanned pages (no text layer) | ❌ Empty string              | ✅ Model reads text via vision     |
| Multi-column layouts          | ❌ Text garbled/merged       | ✅ Model understands layout        |
| Token cost                    | ~250 tokens/page (text only) | ~258 tokens/page (full visual)     |

Token cost is nearly identical — but native handoff preserves **vastly** more information.

### Strategy: Skip Dynamic MIME Type Detection

The Gemini API **does not expose** a `supportedMimeTypes` field on the `Model` resource ([source](https://ai.google.dev/api/models#Model)). There is no way to dynamically query which file types a model supports at runtime.

Since all current Gemini 2.5+ and 3.x models share the same multimodal capabilities, and our strategy converts everything to PDF anyway, dynamic detection is unnecessary. If this changes in the future (e.g., Google adds a `supportedMimeTypes` field to the Model API), it can be added then.

### Video Support (via Files API)

Videos cannot be sent as `inlineData` — they must be uploaded via the **Files API** and referenced by URI.

**Implementation approach:**

1. User drops/picks a video file (`.mp4`, `.mov`, etc.)
2. Client uploads via `ai.files.upload({ file: videoBlob, config: { mimeType } })`
3. Poll `ai.files.get()` until `state === 'ACTIVE'` (video processing can take 30-60s)
4. Store the `file.uri` and `file.mimeType` on the message
5. In `getChatResponseStream`, add a `fileData` part: `{ fileData: { fileUri, mimeType } }`

**Limitations:**

- Files API only works with the **SDK transport** (direct Gemini API access), not through the proxy
- Uploaded files expire after **48 hours**
- Max file size: **100MB**
- Processing time: videos may take 30-60 seconds before they're ready

**Files API is available in the browser** via `@google/genai` — the `ai.files.upload()` method accepts `Blob` objects in browser environments ([source](https://github.com/googleapis/js-genai/blob/main/docs/classes/files.Files.html)).

### Implementation Steps

#### Phase 1: Native PDF Handoff (High Priority)

1. **Modify `parser.ts`** — For PDF files, store the raw `ArrayBuffer` instead of extracting text. Add a `fileToBase64` conversion.

2. **Update `AppContext`** — Change `documentsContent: string[]` to a richer type:

   ```typescript
   interface DocumentAttachment {
   	file: File;
   	type: 'native' | 'text'; // native = send raw bytes; text = send parsed text
   	rawBase64?: string; // base64 of original file (for native mode)
   	mimeType: string; // e.g. 'application/pdf'
   	parsedText?: string; // fallback parsed text (for text mode)
   	totalPages?: number; // detected page count
   	estimatedTokens?: number; // approximate token count
   }
   ```

3. **Update `gemini.ts`** — In `getChatResponseStream`, build source doc parts as `inlineData` with the original PDF bytes instead of text:

   ```typescript
   // Before (current):
   { role: 'user', parts: [{ text: `<source_documents>...\n${docText}` }] }

   // After (native):
   { role: 'user', parts: [
     { inlineData: { data: doc.rawBase64, mimeType: 'application/pdf' } },
     { text: 'Use this document as a reference source.' }
   ]}
   ```

4. **Update `geminiCache.ts`** — Cache entries need to include binary content parts, not just text.

5. **Update `contextManager.ts`** — Token estimation for native PDFs: use ~258 tokens/page instead of `chars/4`.

#### Phase 2: DOCX/PPTX → PDF Conversion (Medium Priority)

1. **Choose a conversion approach:**
   - **Client-side:** Use a library like `docx-preview` (DOCX→HTML→PDF via browser print) or `pptx2pdf` — limited fidelity
   - **Server-side:** Add an endpoint to the proxy that uses LibreOffice/Pandoc for conversion — best fidelity
   - **Hybrid:** Try client-side first, fall back to manual text parsing if conversion fails

2. **Update `parser.ts`** — Add conversion logic that produces a PDF `Blob` from DOCX/PPTX files

#### Phase 3: Video Support (Future)

1. **Add video upload UI** — Extend `ChatInput.tsx` to accept video MIME types
2. **Implement Files API integration** — Upload via `ai.files.upload()`, poll for processing
3. **Add video message type** — Extend `ChatMessage` to hold `fileData` references
4. **Update `gemini.ts`** — Add `fileData` parts to the contents array

#### Phase 4: Dynamic Token Budgets (Medium Priority)

1. **Capture model token limits** — Update `useGeminiModels.ts` to read `inputTokenLimit`
2. **Scale budgets** — Replace hard-coded constants in `contextManager.ts`
3. **Display in UI** — Show context usage indicator in the chat interface

---

## Part 5: Context Permanence — Source Docs & Editor Content

### The Problem

Source documents and the editor content are the **foundation** of what the LLM generates. They should **never be forgotten** or pruned from context. Currently:

| Context Type         | How it's sent                                   | Can it be forgotten?                                                                                      |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Source documents** | In `contents[]` (first turn entries) or cached  | ⚠️ Yes — if cache expires (1h TTL) or proxy mode re-sends them, they risk being displaced by long history |
| **Editor HTML**      | In system instruction dynamic suffix every turn | ✅ Always present — but this is expensive (full HTML every turn, never cached)                            |
| **Chat history**     | In `contents[]` after source docs               | ⚠️ Yes — intentionally pruned by `compactHistory()`                                                       |

### Issue 1: Source Docs Compete with History for Context Space

When the conversation gets long, `compactHistory()` prunes old turns. But source documents sit in the same `contents[]` array. If source docs are large (say 50K tokens) and history is also large (50K tokens), the total may approach the budget limit — and the budget system doesn't know which component to protect.

**The fix:** Source documents and editor content should be treated as **permanent context** with a reserved allocation that history pruning never touches:

```
Available for history = modelLimit - sourceDocTokens - editorHtmlTokens - systemPromptTokens - buffer
```

**Files to change:** `services/contextManager.ts` — update `pruneHistory` and `buildContextBudget` to subtract source doc and editor tokens from the budget _before_ calculating the history allowance.

### Issue 2: Large Source Documents May Not Fit

A single textbook PDF can be 500K+ tokens. Even with native PDF support (~258 tokens/page), a 2000-page document would be 516K tokens — over half the 1M context window.

### Issue 3: Context Placement — System Prompt vs Contents

The Gemini API provides two distinct locations for context, each with a different **semantic role** for the model:

| Placement               | Semantic Role                                                      | Caching                                 | Best For                                                                      |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------- |
| **`systemInstruction`** | "Who you are and how you behave" — **persistent behavioral rules** | ✅ Cacheable when static                | Role definitions, formatting rules, tool instructions, behavioral constraints |
| **`contents[]`**        | "What you're working with" — **conversational data and material**  | ✅ Cacheable as first-turn content pair | Reference documents, working data, user-provided material                     |

#### Current Placement

| Context              | Location                                                        | Code Reference                                                |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| **Source documents** | `contents[]` as first `user→model` pair                         | `gemini.ts` lines 203-224                                     |
| **Editor HTML**      | `systemInstruction` dynamic suffix (via `appendDocumentHtml`)   | `prompts.ts` lines 151-172, used in `gemini.ts` lines 142-143 |
| **Selected text**    | `systemInstruction` dynamic suffix AND user prompt (duplicated) | `prompts.ts` lines 174-236 + 238-261                          |

#### Analysis: Source Documents ✅ Correct Placement

Source documents are in `contents[]` — **this is correct**. They are reference material the model should "read," not behavioral instructions. Benefits:

- Cacheable as a `user→model` content pair via `geminiCache.ts`
- Keeps the system prompt lean
- Matches Gemini best practice: send documents as `inlineData` or text parts in `contents`
- Properly separated from instructions

**Verdict: Keep source documents in `contents[]`.**

#### Analysis: Editor HTML ⚠️ Wrong Placement — Should Move to `contents[]`

The editor HTML is currently embedded in the system instruction suffix. This is problematic:

**Why it's bad in `systemInstruction`:**

1. **Breaks cacheability** — The dynamic suffix forces the _entire_ system instruction to change every turn. The base instruction (~4K tokens) is cacheable, but appending the editor HTML (potentially 50K+ tokens) makes the whole instruction uncacheable.
2. **Semantic mismatch** — The editor HTML is _working data_, not _behavioral instructions_. The system prompt should define _how_ the model behaves, not _what_ it's working on.
3. **Inflates system prompt** — System instructions balloon from ~4K tokens to 50K+ tokens on every turn, all uncached.
4. **Budget opacity** — The token budget system (`buildContextBudget`) counts `documentHtml` separately, but in practice it's baked into `systemPrompt` — so the budget breakdown is misleading.

**Why it should move to `contents[]`:**

1. **The base system instruction becomes fully cacheable** — Only the static behavioral rules (~4K tokens) remain in `systemInstruction`, which can be cached along with tools and source docs.
2. **Correct semantic role** — The document is material the model works _with_, not instructions on how to behave. It belongs in the conversational context.
3. **Budget accuracy** — `buildContextBudget` can properly account for and manage document HTML as a separate context component.
4. **Pruning control** — When document HTML is in `contents[]`, the budget system can see its actual token cost and reserve space for it, rather than it silently inflating the system prompt.

**Recommended placement in `contents[]`:**

```
contents = [
  // 🔒 Source docs — permanent, cacheable (first-turn pair)
  { role: 'user', parts: [{ text: '<source_documents>...</source_documents>' }] },
  { role: 'model', parts: [{ text: 'I have received the source documents.' }] },

  // 🔓 Chat history — prunable
  ...geminiHistory,

  // 🔒 Document state — injected fresh every turn (just before the user message)
  { role: 'user', parts: [{ text: '<document_state>...[editor HTML]...</document_state>' }] },
  { role: 'model', parts: [{ text: 'I see the current document state.' }] },

  // Current user message
  { role: 'user', parts: userParts }
]
```

Placing the document state _after_ history but _before_ the user message ensures:

- The model always sees the **latest** document state (not a stale cached version)
- It's positioned close to the user's message, giving it high attention weight
- History pruning never touches it
- The system instruction stays small and fully cacheable

**Verdict: Move editor HTML from `systemInstruction` to `contents[]`.**

#### Analysis: Selected Text ⚠️ Duplicated — Should Deduplicate

Selected text currently appears in **three places**:

1. System instruction suffix (`appendSelectedText` — `prompts.ts` lines 174-236)
2. User prompt (`getUserPrompt` — `prompts.ts` lines 238-261)
3. Context chip in the contentEditable (visual only, not sent to LLM)

Having it in both the system instruction and the user prompt is redundant. It should appear **only in the user prompt** — it's part of the user's _intent_ for that specific turn, not a persistent behavioral rule.

**Verdict: Remove `appendSelectedText` from system instruction. Keep it only in `getUserPrompt`.**

#### Summary: Recommended Context Architecture

| Context              | Current Location                     | Recommended Location               | Rationale                                                           |
| -------------------- | ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------- |
| **Behavioral rules** | `systemInstruction` (base)           | **`systemInstruction`** (keep)     | Stable instructions, fully cacheable                                |
| **Source documents** | `contents[]` (first pair)            | **`contents[]`** (keep)            | Reference data, cacheable, not behavioral                           |
| **Editor HTML**      | `systemInstruction` (dynamic suffix) | **`contents[]`** (move)            | Working data, changes every turn, breaks system prompt cacheability |
| **Selected text**    | `systemInstruction` AND user prompt  | **User prompt only** (deduplicate) | Per-turn intent, only needs to appear once                          |

**Files to change:**

- `services/gemini.ts` — Inject `<document_state>` as a `user→model` pair in `contents[]` instead of passing it to `appendDocumentHtml`
- `services/prompts.ts` — Remove `appendDocumentHtml` from dynamic suffix construction. Remove `appendSelectedText` from system instruction (keep only `getUserPrompt` for selected text)
- `services/geminiCache.ts` — No changes needed (system instruction is now fully static, improving cache hit rate)
- `services/contextManager.ts` — Update `buildContextBudget` to accurately reflect the new layout

### Proposed: User-Controlled Page/Range Selection

For cases where source documents are too large or the user wants to focus on specific sections:

#### UI Concept

```
┌─────────────────────────────────────────┐
│ 📄 Textbook.pdf (342 pages, ~88K tokens)│
│                                         │
│  Pages: [1-342] ▼                       │
│  ┌─────────────────────────────────┐    │
│  │ ○ All pages                     │    │
│  │ ● Custom range                  │    │
│  │   From: [45]  To: [67]          │    │
│  │   Est. tokens: ~5,674           │    │
│  │                                 │    │
│  │ Quick select:                   │    │
│  │   Ch.1 (p1-15) Ch.2 (p16-42)   │    │
│  └─────────────────────────────────┘    │
│                                         │
│ Context usage: ████████░░ 78% of budget │
└─────────────────────────────────────────┘
```

**Implementation:** For native PDFs, use `pdfjs-dist` to extract specific pages into a new PDF blob client-side. For text mode, `pdfjs-dist` already processes page-by-page — store per-page text in an array and let the user select which pages to include.

**Files to change:** `services/parser.ts` (per-page extraction), `components/chat/ChatInput.tsx` (page selector UI), `contexts/AppContext.tsx` (update `DocumentAttachment` type)

### Priority of Context (Proposed Hierarchy)

When context budget is tight, this is the priority order — source docs and editor content are **never pruned**:

1. 🔒 **System instruction** — always present, behavioral rules only (~4K tokens, fully cached)
2. 🔒 **Source documents** — always present in `contents[]` (the knowledge base for Q&A generation)
3. 🔒 **Editor HTML** — always present in `contents[]` (the working document being edited, injected fresh each turn)
4. 🔓 **Recent chat history** — prunable (keep last N turns based on remaining budget)
5. 🔓 **Compaction summary** — prunable (nice-to-have context about earlier topics)

Budget allocation:

```
systemPrompt:  reserved (3-5K tokens, fixed — now fully cacheable)
sourceDocs:    reserved (actual size, up to 60% of model limit)
editorHtml:    reserved (actual size, up to 30% of model limit)
history:       gets whatever is left after the above
```

---

## Sources

| Topic                                                  | URL                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Gemini API — Model resource schema                     | https://ai.google.dev/api/models#Model                                         |
| Gemini API — Document processing                       | https://ai.google.dev/gemini-api/docs/document-processing                      |
| Gemini API — File input methods & supported MIME types | https://ai.google.dev/gemini-api/docs/file-input-methods                       |
| Gemini API — Files API (upload, poll, delete)          | https://ai.google.dev/api/files                                                |
| Gemini API — Context caching                           | https://ai.google.dev/gemini-api/docs/caching                                  |
| JS GenAI SDK — File upload (browser)                   | https://github.com/googleapis/js-genai/blob/main/docs/classes/files.Files.html |
| JS GenAI SDK — File upload code examples               | https://github.com/googleapis/js-genai/blob/main/codegen_instructions.md       |
| JS GenAI SDK — API reference (Model types)             | https://github.com/googleapis/js-genai/blob/main/api-report/genai.api.md       |
