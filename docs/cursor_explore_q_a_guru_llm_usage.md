# Explore Q&A Guru LLM usage
_Exported on 2/17/2026 at 22:10:43 GMT+8 from Cursor (2.4.37)_

---

**Cursor**

I'll explore the Q&A Guru project thoroughly. Let me start with multiple parallel searches to gather all the information you need.

Good, I have the initial picture. Now let me read all the core files in parallel.

Now let me read the remaining important files.

Now let me get the remaining files to complete the picture.

Now I have a comprehensive picture. Let me also check the `.env` file and the main entry point.

I now have a thorough understanding of the entire project. Here's the comprehensive analysis:

---

## Q&A Guru — Complete Project Analysis

### 1. Overall Project Structure & Framework

This is a **React 19 + Vite + TypeScript** single-page application (NOT Next.js). It uses **Tailwind CSS v4** for styling. The project has a flat structure with no `src/` directory — all source files live at the root:

```
q-a_guru/
├── App.tsx                    # Root component
├── index.tsx                  # Entry point (ReactDOM.createRoot)
├── index.html
├── vite.config.ts             # Vite config with Tailwind plugin
├── types.ts                   # All TypeScript interfaces
├── vite-env.d.ts              # Env type declarations
├── .env / .env.example        # API keys
├── components/
│   ├── QAGenerator.tsx        # Main orchestrator component
│   ├── ChatSection.tsx        # Chat panel wrapper
│   ├── ConfigSection.tsx      # Q&A config panel (model picker, template, etc.)
│   ├── EditorSection.tsx      # TinyMCE document editor
│   ├── FileUploadSection.tsx  # File upload area
│   ├── chat/                  # Chat sub-components
│   └── common/                # Reusable UI components (Button, Select, ModelPicker, etc.)
├── contexts/
│   └── AppContext.tsx          # Global React context
├── hooks/
│   ├── useChat.ts             # Chat agent loop
│   ├── useStreamProcessor.ts  # Gemini stream processing
│   ├── useToolExecution.ts    # Function call handling
│   └── useGeminiModels.ts     # Dynamic model list fetching
├── services/
│   ├── gemini.ts              # Core LLM service (GoogleGenAI calls)
│   ├── geminiCache.ts         # Context caching service
│   ├── prompts.ts             # All prompts & system instructions
│   ├── contextManager.ts      # History pruning & token budgeting
│   ├── errorClassifier.ts     # Error classification & retry logic
│   ├── documentParser.ts      # Q&A document parsing
│   ├── htmlReplace.ts         # HTML snippet replacement
│   ├── domEditor.ts           # DOM-based editing
│   ├── parser.ts              # File parsing (PDF, DOCX, etc.)
│   ├── templateStorage.ts     # Template CRUD
│   └── ...
└── utils/
    └── streamHelpers.ts       # Stream chunk processing utilities
```

---

### 2. How GoogleGenAI is Used

The project uses **`@google/genai`** (v1.27.0+) — the newer Google Gen AI SDK (not the older `@google/generative-ai`).

**Files that import from `@google/genai`:**

| File | What's imported |
|------|----------------|
| `services/gemini.ts` | `GoogleGenAI`, `FunctionDeclaration`, `Type`, `GenerateContentResponse` |
| `services/geminiCache.ts` | `GoogleGenAI`, `FunctionDeclaration` |
| `hooks/useGeminiModels.ts` | `GoogleGenAI` |

**Client instantiation pattern** — `GoogleGenAI` is instantiated with an API key:

```1:6:services/gemini.ts
import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	GenerateContentResponse,
} from '@google/genai';
```

There are **three instantiation sites**:
1. **`generateQaStream`** (line 39) — `new GoogleGenAI({ apiKey })` — fresh instance per Q&A generation call
2. **`getAiClient`** (lines 188-195) — cached singleton for chat, reused when API key hasn't changed
3. **`useGeminiModels`** (line 84) — `new GoogleGenAI({ apiKey })` — for listing models
4. **`analyzeImage`** (line 96) — `new GoogleGenAI({ apiKey })` — for image analysis

---

### 3. LLM-Related Configuration

**API Key management:**
- Environment variable: `VITE_GEMINI_API_KEY` (declared in `vite-env.d.ts`)
- Can also be passed by user via the UI's "API Key" input field in `ConfigSection.tsx`
- Resolution: `apiKey || import.meta.env.VITE_GEMINI_API_KEY` (user input takes priority)

**Model configuration:**

```16:24:types.ts
export interface QaConfig {
	count: number;
	type: QuestionType;
	difficulty: 'easy' | 'medium' | 'hard';
	instructions: string;
	apiKey?: string;
	model: string;
	selectedTemplateId?: string;
}
```

```26:28:types.ts
export interface ChatConfig {
	model: string;
}
```

**Default models:**
- Q&A generation: `'gemini-3-flash-preview'` (set in `AppContext.tsx` line 83)
- Chat: `'gemini-3-flash-preview'` (set in `ChatSection.tsx` line 51)
- Image analysis: hardcoded to `'gemini-2.5-flash'` (in `gemini.ts` line 112)

**Fallback models for the model picker:**

```15:26:hooks/useGeminiModels.ts
const FALLBACK_MODELS: ModelOption[] = [
	{
		value: 'gemini-3-pro-preview',
		label: 'Gemini 3 Pro Preview',
		group: 'Gemini 3',
	},
	{
		value: 'gemini-3-flash-preview',
		label: 'Gemini 3 Flash Preview',
		group: 'Gemini 3',
	},
];
```

The model list is **dynamically fetched** from the API via `ai.models.list()`, filtered to only Gemini 3+ chat-capable models.

---

### 4. How the LLM is Called — Parameters

There are **two main calling patterns**:

#### A. Q&A Generation (`generateQaStream`)

```62:67:services/gemini.ts
		const response = ai.models.generateContentStream({
			// Use model from config
			model: config.model,
			contents: prompt,
		});
```

- **Method**: `ai.models.generateContentStream()`
- **Parameters passed**: Only `model` and `contents` (a plain text prompt)
- **No temperature, maxTokens, or system prompt** — uses Google's defaults
- **Streaming**: Yes, async generator yielding `GenerateContentResponse` chunks

#### B. Chat (`getChatResponseStream`)

```301:326:services/gemini.ts
		const config: Record<string, any> = {
			thinkingConfig: {
				thinkingBudget: -1,
				includeThoughts: true,
			},
		};

		if (cacheName) {
			config.cachedContent = cacheName;
			if (dynamicSuffix.trim()) {
				config.systemInstruction = dynamicSuffix;
			}
		} else {
			config.systemInstruction = fullSystemInstruction;
			config.tools = [{ functionDeclarations: tools }];
		}

		const response = ai.models.generateContentStream({
			model: model,
			contents: contents,
			config,
		});
```

- **Method**: `ai.models.generateContentStream()`
- **Parameters**:
  - `model`: configurable (default `gemini-3-flash-preview`)
  - `contents`: chat history + user message (multi-turn)
  - `config.thinkingConfig`: `{ thinkingBudget: -1, includeThoughts: true }` — unlimited thinking
  - `config.systemInstruction`: long system prompt (see section 6)
  - `config.tools`: two function declarations (`edit_document`, `read_document`)
  - `config.cachedContent`: cache name when caching is active
- **No explicit temperature or maxTokens** set
- **Streaming**: Yes

#### C. Image Analysis (`analyzeImage`)

```110:114:services/gemini.ts
		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash',
			contents: { parts: [imagePart, textPart] },
		});
```

- **Method**: `ai.models.generateContent()` (non-streaming)
- **Model**: hardcoded `gemini-2.5-flash`
- **Contents**: multimodal (inline image + text prompt)

---

### 5. System Prompts & Instructions

The entire prompt system lives in `services/prompts.ts`. There are two main prompt systems:

**Q&A Generation prompt** (`getQAPrompt`) — a user-content-style prompt that:
- Specifies count, type, difficulty
- Optionally includes a template format to follow exactly
- Instructs output as clean HTML (no markdown wrappers)

**Chat system instruction** (`baseChatSystemInstruction`) — a rich system prompt that includes:
- Role definition ("AI assistant in a document editor")
- Document status (whether source docs are attached)
- Formatting rules (Markdown for chat, HTML for documents)
- Editing instructions with 6 edit types via function calling
- Agentic behavior rules (explain before edit, provide feedback after)
- Q&A config context (template, question type, difficulty)
- Dynamic appendages: current document HTML state, user's selected text

---

### 6. Expected Response Formats

**Q&A Generation**: Raw HTML output. Questions as `<p><strong>N. Question?</strong></p>` with answers in `<p>` tags. Templates define exact HTML formatting.

**Chat responses**: Dual format:
- **Chat text**: Markdown (rendered via `react-markdown` with `rehype-raw`, `rehype-highlight`, `remark-gfm`)
- **Document edits**: Function calls to `edit_document` or `read_document` tools

**Function call response structure** (from `processFunctionCalls`):

```343:351:services/gemini.ts
export type ProcessFunctionCallsResult = {
	success: boolean;
	newHtml?: string;
	toolUsageMessage?: string;
	toolResponse?: string;
	message: string;
	scrollTo?: ScrollTarget;
	scrollTargets?: ScrollTarget[];
};
```

**Stream response handling**: The stream processor (`useStreamProcessor.ts`) extracts:
- Text content (accumulated)
- Thinking tokens (from Gemini's thinking feature)
- Function calls (via SDK getter + manual parts fallback)

---

### 7. Existing Abstraction Layers

The project has a **well-layered architecture** with clear separation:

| Layer | Files | Responsibility |
|-------|-------|---------------|
| **LLM Service** | `services/gemini.ts` | Direct GoogleGenAI calls, function call processing |
| **Caching** | `services/geminiCache.ts` | Context caching for system instruction + source docs |
| **Prompts** | `services/prompts.ts` | All prompt construction, system instructions |
| **Context Management** | `services/contextManager.ts` | History pruning, token budgeting, source doc truncation |
| **Error Handling** | `services/errorClassifier.ts` | Error classification + retry logic |
| **Stream Processing** | `hooks/useStreamProcessor.ts`, `utils/streamHelpers.ts` | Chunk processing, thinking extraction, text accumulation |
| **Tool Execution** | `hooks/useToolExecution.ts` | Bridges stream results to function call processing |
| **Chat Agent Loop** | `hooks/useChat.ts` | Multi-turn agent loop with tool use |
| **Model Discovery** | `hooks/useGeminiModels.ts` | Dynamic model listing |
| **UI Integration** | `components/ChatSection.tsx`, `QAGenerator.tsx` | Orchestrates all of the above |

**There is NO provider abstraction** — the entire codebase is tightly coupled to Google's `@google/genai` SDK. Every LLM call goes through `GoogleGenAI` directly. There's no interface or adapter pattern that would allow swapping providers.

---

### 8. LLM-Related Package Dependencies

```14:15:package.json
	"dependencies": {
		"@google/genai": "^1.27.0",
```

This is the **only LLM-related dependency**. There's no OpenAI, Anthropic, LangChain, or any other LLM library.

---

### Key Takeaways

1. **Single LLM provider**: Google Gemini only, via `@google/genai` SDK
2. **No abstraction layer** for swapping providers — direct SDK usage everywhere
3. **No temperature/maxTokens** explicitly set anywhere — relies on Google defaults
4. **Thinking mode enabled** for chat (`thinkingBudget: -1, includeThoughts: true`)
5. **Context caching** is implemented to reduce costs for repeated system instructions
6. **Agentic loop** with up to 5 tool-call iterations per message
7. **Two function tools**: `edit_document` (6 edit types) and `read_document`
8. **Token budgeting**: 100K practical limit, 50K for history, 20K for source docs
9. **Auto-retry** for rate limits, context overflow, transient errors
10. **Dynamic model picker** fetches available models from API, filtered to Gemini 3+

