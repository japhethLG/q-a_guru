# LLM Provider Migration Analysis

## Q&A Guru → Configurable LLM Provider (GoogleGenAI / Antigravity Proxy)

### 1. Current State: GoogleGenAI SDK Usage

The app uses `@google/genai` (v1.27.0+) with **zero abstraction** — every LLM call goes directly through the SDK. There are **4 call sites** across 3 files:

| Call Site | File | Method | Streaming | Notes |
|-----------|------|--------|-----------|-------|
| `generateQaStream` | `services/gemini.ts` | `ai.models.generateContentStream` | Yes | Q&A generation. Only `model` + `contents` (text prompt). No config. |
| `getChatResponseStream` | `services/gemini.ts` | `ai.models.generateContentStream` | Yes | Chat. Uses `thinkingConfig`, `systemInstruction`, `tools`, `cachedContent`. |
| `analyzeImage` | `services/gemini.ts` | `ai.models.generateContent` | No | Multimodal. Hardcoded `gemini-2.5-flash`. Sends `inlineData` + text. |
| `useGeminiModels` | `hooks/useGeminiModels.ts` | `ai.models.list` | No | Fetches available models for the picker UI. |

Supporting files with SDK dependency:
- `services/geminiCache.ts` — uses `ai.caches.create/delete` for context caching
- `utils/streamHelpers.ts` — parses Gemini-specific response chunk shape (`candidates[0].content.parts`)
- `hooks/useStreamProcessor.ts` — extracts `functionCalls` from Gemini response objects

### 2. Antigravity Proxy: `/v1/chat/completions`

The proxy accepts **OpenAI, Anthropic, or Google** format requests and returns responses in any of those three formats. For this migration, we use **Google format in both directions** for maximum compatibility with existing code.

**Endpoint**: `POST /v1/chat/completions`

**Format detection** (`detect.js`):
- If body has `contents` array → auto-detected as `google` format (our case)
- If body has `messages` array with `role: "system"` → detected as `openai`
- Default → `openai`

**Response format control** (default is `openai`, so we must set this):
- Query param: `?response_format=google` (recommended — visible in URL)
- Header: `X-Response-Format: google`

**Request path** (`from-google.js`):
- Near-passthrough — validates structure, cleans tool schemas, caps max tokens
- Preserves `contents`, `systemInstruction`, `generationConfig`, `thinkingConfig`, `tools` as-is

**Response path** (`to-google.js`):
- Direct passthrough — returns raw Cloud Code API response unchanged
- Streaming: pipes SSE lines directly (`data: {candidates JSON}`)
- Non-streaming: returns the JSON body as-is

**Streaming**: Set `stream: true` on request body. Returns `text/event-stream` SSE with same chunk shape as GoogleGenAI SDK.

### 3. Google-Format Passthrough: SDK vs Proxy

The proxy supports **Google format in both directions** (`from-google.js` for requests, `to-google.js` for responses). This means the existing request/response structure can be reused almost as-is.

#### 3.1 Request: What Stays the Same

The proxy's `from-google.js` is a near-passthrough. When it detects a `contents` array in the body, it treats the request as Google format and preserves all fields:

| Request Field | GoogleGenAI SDK (current) | Proxy (Google format) | Change? |
|---------------|--------------------------|----------------------|---------|
| `contents` | `[{ role: "user", parts: [{ text }] }]` | Same structure | **None** |
| `systemInstruction` | `"text"` or `{ parts: [{ text }] }` | Same structure | **None** |
| `generationConfig` | `{ thinkingConfig: { thinkingBudget: -1, includeThoughts: true } }` | Same — passed through as-is | **None** |
| `tools` | `[{ functionDeclarations: [...] }]` | Same — proxy runs `cleanSchemaForGoogle()` on schemas | **None** |
| Roles | `"user"`, `"model"` | Same | **None** |
| Images | `parts: [{ inlineData: { data, mimeType } }]` | Same structure | **None** |
| Streaming trigger | `ai.models.generateContentStream(...)` | Add `stream: true` to body | **Minor** |

The proxy additionally:
1. Validates `contents` array exists and roles are `"user"` / `"model"`
2. Cleans tool schemas via `cleanSchemaForGoogle()` (handles `$ref`, type casing, etc.)
3. Caps `maxOutputTokens` for Gemini models
4. Wraps in Cloud Code envelope (adds `project`, `sessionId`, prepends its own system instruction)

#### 3.2 Response: What Stays the Same

With `?response_format=google` or `X-Response-Format: google` header, the proxy returns the raw Cloud Code response as-is:

| Response Field | GoogleGenAI SDK (current) | Proxy (Google format) | Change? |
|----------------|--------------------------|----------------------|---------|
| Text | `candidates[0].content.parts[].text` | Same shape | **None** |
| Thinking | `parts[].thought === true` + `parts[].text` | Same shape | **None** |
| Function calls | `parts[].functionCall: { name, args }` | Same shape (args as object) | **None** |
| Finish reason | `candidates[0].finishReason: "STOP"` | Same | **None** |
| Usage | `usageMetadata` | Same | **None** |
| Stream format | SDK async generator yields JSON objects | SSE lines (`data: {JSON}`) yielding same JSON shape | **Transport only** |

The streaming response shape:
```
data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{...}}
```
This is structurally identical to what the GoogleGenAI SDK yields from its async generator.

#### 3.3 The Only Real Difference: Transport

| Aspect | GoogleGenAI SDK | Proxy (Google format) |
|--------|----------------|----------------------|
| Transport | SDK wraps `fetch` internally, returns async generator | Raw `fetch` + SSE stream, needs client-side SSE parser |
| Auth | API key in SDK constructor | Optional `Authorization: Bearer <key>` header or none |
| Endpoint | `generativelanguage.googleapis.com` (SDK-managed) | `POST <baseUrl>/v1/chat/completions?response_format=google` |
| Streaming toggle | Method choice (`generateContentStream` vs `generateContent`) | `stream: true` in request body |

This means the migration is purely a **transport swap** — all request building and response parsing stays unchanged.

### 4. Feature Compatibility Matrix (Google Format)

| Feature | GoogleGenAI SDK | Proxy (Google fmt in/out) | Gap? |
|---------|----------------|--------------------------|------|
| Text generation (streaming) | Yes | Yes — same response shape | **No** |
| Text generation (non-streaming) | Yes | Yes — same response shape | **No** |
| System instructions | Yes (`systemInstruction`) | Yes — passed through as-is | **No** |
| Function calling (tools) | Yes (`functionDeclarations`) | Yes — same structure, proxy cleans schemas | **No** |
| Multi-turn chat | Yes (`contents` array) | Yes — same roles, same structure | **No** |
| Thinking/reasoning | Yes (`thinkingBudget: -1`) | Yes — `thinkingConfig` passed through as-is | **No** |
| Multimodal (images) | Yes (`inlineData`) | Yes — same `inlineData` structure | **No** |
| Context caching | Yes (`ai.caches.create`) | No direct API | **Gap** — proxy has internal session caching |
| Model listing | Yes (`ai.models.list`) | Yes (`GET /v1/models`) | **Minor** — different response shape |

**Only gap**: Context caching (`geminiCache.ts`) — the proxy doesn't expose `ai.caches.create/delete`. However, the proxy does its own session-based caching via `sessionId` derived from the first user content, so this is an acceptable trade-off.

### 5. Proposed Architecture: Transport Layer Abstraction

Since Google format passthrough preserves the exact same request/response shape, we don't need a full provider abstraction with format conversion. Instead, we abstract only the **transport layer** — how data gets to/from the LLM.

```
services/
  ├── gemini.ts           (existing — swap SDK calls for transport interface)
  ├── geminiCache.ts      (existing — skip when using proxy)
  ├── llmTransport.ts     (NEW — ~80 lines)
  │   ├── sdkTransport()      → uses GoogleGenAI SDK (current behavior)
  │   └── proxyTransport()    → uses fetch + SSE parser (same request/response shape)
  └── ...

hooks/
  ├── useStreamProcessor.ts   (NO CHANGES — same chunk shape)
  ├── useGeminiModels.ts      (minor — delegate to transport.listModels)
  └── ...

utils/
  └── streamHelpers.ts        (NO CHANGES — same chunk shape)
```

#### 5.1 Transport Interface

```typescript
interface LLMTransport {
  // Streaming generation (for Q&A and chat)
  generateContentStream(params: {
    model: string;
    contents: any;
    config?: Record<string, any>;
  }): Promise<AsyncGenerator<any>>; // yields same GenerateContentResponse shape

  // Non-streaming generation (for image analysis)
  generateContent(params: {
    model: string;
    contents: any;
  }): Promise<any>; // same response shape

  // Model listing
  listModels(): Promise<{ name: string; displayName?: string; description?: string }[]>;
}
```

Both transports return **identical response shapes** — the consumer code never knows which transport is in use.

#### 5.2 SDK Transport (current behavior, wrapped)

```typescript
function createSDKTransport(apiKey: string): LLMTransport {
  const ai = new GoogleGenAI({ apiKey });
  return {
    generateContentStream: (params) => ai.models.generateContentStream(params),
    generateContent: (params) => ai.models.generateContent(params),
    listModels: () => ai.models.list({ config: { pageSize: 100 } }),
  };
}
```

#### 5.3 Proxy Transport (new, Google format)

```typescript
function createProxyTransport(baseUrl: string): LLMTransport {
  return {
    async generateContentStream({ model, contents, config }) {
      const res = await fetch(
        `${baseUrl}/v1/chat/completions?response_format=google`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, contents, stream: true,
            ...(config?.systemInstruction && { systemInstruction: config.systemInstruction }),
            ...(config?.tools && { tools: config.tools }),
            generationConfig: {
              ...(config?.thinkingConfig && { thinkingConfig: config.thinkingConfig }),
            },
          }),
        }
      );
      return parseSSEStream(res); // yields same chunk shape as SDK
    },
    async generateContent({ model, contents }) {
      const res = await fetch(
        `${baseUrl}/v1/chat/completions?response_format=google`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, contents, stream: false }),
        }
      );
      return res.json(); // same response shape as SDK
    },
    async listModels() {
      const res = await fetch(`${baseUrl}/v1/models`);
      const data = await res.json();
      return data.data; // map to same shape
    },
  };
}
```

### 6. Migration Steps

#### Phase 1: Create Transport Layer
- Create `services/llmTransport.ts` with `LLMTransport` interface
- Implement `createSDKTransport(apiKey)` wrapping current `GoogleGenAI` usage
- Implement `createProxyTransport(baseUrl)` with `fetch` + SSE parsing
- Write SSE parser utility (~30 lines) that yields JSON objects matching the SDK's chunk shape

#### Phase 2: Wire Transport into Existing Code
- Refactor `services/gemini.ts` to accept a `LLMTransport` instead of creating `GoogleGenAI` directly
  - `generateQaStream` → uses `transport.generateContentStream`
  - `getChatResponseStream` → uses `transport.generateContentStream`
  - `analyzeImage` → uses `transport.generateContent`
- Skip `geminiCache.ts` calls when transport is proxy (proxy handles caching internally)

#### Phase 3: Add Configuration
- Add `providerConfig` to `AppContext.tsx`: `{ type: 'sdk' | 'proxy', apiKey?, baseUrl? }`
- Update `hooks/useGeminiModels.ts` to use `transport.listModels()` instead of direct SDK
- Add provider selector + base URL field to `ConfigSection.tsx`
- Persist choice in localStorage

#### Phase 4: Error Handling
- Extend `services/errorClassifier.ts` with proxy-specific HTTP error patterns
- Proxy returns standard HTTP errors (4xx/5xx) with JSON body — easy to classify

### 7. What Stays Gemini-Only

With Google format passthrough, the only Gemini-SDK-only feature is:

| Feature | SDK | Proxy | Handling |
|---------|-----|-------|----------|
| Context caching (`ai.caches.create/delete`) | Yes | No — proxy has internal session caching | Skip cache calls when using proxy; no user-visible impact |

Everything else (thinking, tools, images, system instructions) passes through identically.

### 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSE parser reliability | Low | Well-understood format; ~30 lines of code; extensively documented |
| Cloud Code response shape drift | Very Low | `to-google.js` is a direct passthrough — no transformation to drift |
| No client-side context caching | Low | Proxy's internal `sessionId`-based caching covers the same use case |
| Proxy downtime | Medium | Transport toggle lets user switch back to direct SDK instantly |
| `/v1/models` response shape | Low | Simple mapping; fallback models already exist in `useGeminiModels.ts` |

### 9. Summary

**Approach**: Use Google format passthrough (`contents` in, `?response_format=google` out) to minimize changes.

**What changes**:
1. New `services/llmTransport.ts` (~80 lines) — `createSDKTransport` + `createProxyTransport`
2. SSE parser utility (~30 lines) — converts `text/event-stream` → async generator of JSON chunks
3. `services/gemini.ts` — swap direct `GoogleGenAI` calls for `transport.*` calls
4. `hooks/useGeminiModels.ts` — delegate to `transport.listModels()`
5. `contexts/AppContext.tsx` — add `providerConfig` state
6. `components/ConfigSection.tsx` — add provider selector + base URL input

**What stays unchanged**:
- `utils/streamHelpers.ts` — identical chunk shape
- `hooks/useStreamProcessor.ts` — identical function call extraction
- `services/prompts.ts` — prompt building is transport-agnostic
- `services/errorClassifier.ts` — minor additions for proxy HTTP errors
- All React components beyond ConfigSection — no awareness of transport layer
