# Explore Antigravity Proxy API
_Exported on 2/17/2026 at 22:10:08 GMT+8 from Cursor (2.4.37)_

---

**Cursor**

I'll thoroughly explore the Antigravity Proxy project. Let me start by understanding the project structure and then dive into each file.

Let me read all the key source files systematically.

Now let me read all the converter files, which are the core of the format detection and conversion logic.

Now let me read the remaining key files: the detect.js, from-google.js, to-google.js, the cloud code handlers, schema-cleaner, and model-api.

Now let me read the detect.js file and the remaining converter files.

Now let me check for the session-manager and fallback-config files that are referenced.

I now have a thorough understanding of the entire project. Let me compile a comprehensive analysis.

---

## Antigravity Proxy — Complete Analysis

### 1. Project Overview

**Antigravity Proxy v3** is an Express.js server that acts as a universal AI proxy to Google's internal **Cloud Code API** (the backend powering Google's Antigravity/Gemini IDE extensions). It accepts requests in **OpenAI**, **Anthropic**, or **Google** formats and returns responses in any of those three formats. It supports multiple Google accounts with load balancing, rate limit handling, and model fallback.

**Key insight**: This is NOT a standard Gemini API proxy. It talks to `cloudcode-pa.googleapis.com/v1internal:streamGenerateContent` — an internal Google Cloud Code API — using OAuth tokens from Google accounts that have Antigravity/Gemini Code Assist enabled.

---

### 2. Project Structure

```
src/
├── server.js                     # Express app, all endpoints
├── index.js                      # Entry point (starts server)
├── config.js                     # Configuration (Firebase + env)
├── constants.js                  # All constants, model helpers
├── errors.js                     # Custom error classes
├── fallback-config.js            # Model fallback mapping
│
├── converters/                   # Format conversion pipeline
│   ├── index.js                  # Public API: detectFormat, parseRequest, serializeResponse, serializeStream
│   ├── detect.js                 # Format detection (openai/anthropic/google)
│   ├── thinking.js               # Thinking block utilities, signature caching
│   ├── schema-cleaner.js         # JSON Schema → Google-compatible schema
│   ├── request/
│   │   ├── from-openai.js        # OpenAI → Google internal format
│   │   ├── from-anthropic.js     # Anthropic → Google internal format
│   │   └── from-google.js        # Google → Google (passthrough + validation)
│   └── response/
│       ├── to-openai.js          # Google → OpenAI format (streaming + non-streaming)
│       ├── to-anthropic.js       # Google → Anthropic format (streaming + non-streaming)
│       └── to-google.js          # Google → Google passthrough
│
├── cloudcode/                    # Cloud Code API interaction
│   ├── index.js                  # Re-exports
│   ├── message-handler.js        # Non-streaming requests with retry/failover
│   ├── streaming-handler.js      # Streaming requests with retry/failover
│   ├── request-builder.js        # Builds Cloud Code API payloads + headers
│   ├── model-api.js              # Model listing, resolution, quota checking
│   ├── sse-parser.js             # SSE accumulator for thinking models
│   ├── session-manager.js        # Session ID derivation for cache continuity
│   ├── rate-limit-parser.js      # Parse rate limit reset times
│   └── rate-limit-state.js       # Rate limit state machine
│
├── account-manager/              # Multi-account management
│   ├── index.js                  # AccountManager class
│   ├── storage.js                # Account persistence
│   ├── rate-limits.js            # Rate limit tracking
│   ├── credentials.js            # Credential management
│   ├── onboarding.js             # Account onboarding
│   └── strategies/               # Account selection strategies
│       ├── sticky-strategy.js
│       ├── round-robin-strategy.js
│       ├── hybrid-strategy.js
│       └── base-strategy.js
│
├── auth/                         # OAuth authentication
│   ├── oauth.js
│   ├── database.js
│   └── token-extractor.js
│
├── utils/                        # Utilities
│   ├── logger.js
│   ├── helpers.js
│   ├── ngrok.js
│   └── claude-config.js
│
├── firebase/storage.js           # Firebase config persistence
├── webui/index.js                # Web UI (account management)
└── cli/accounts.js               # CLI for account management
```

---

### 3. Full API Surface

| Endpoint | Method | Description |
|---|---|---|
| `/v1/chat/completions` | POST | Main endpoint. Accepts OpenAI/Anthropic/Google input. Default output: **OpenAI** |
| `/v1/messages` | POST | Anthropic-style endpoint. Default output: **Anthropic** |
| `/v1/models` | GET | List available models (OpenAI format) |
| `/status` | GET | Proxy status, accounts, strategy, supported formats |
| `/health` | GET | Health check |
| `/account-limits` | GET | Per-account quota info |
| `/refresh-token` | POST | Clear token caches and rate limits |
| `/accounts` | GET | Account management page (HTML) |

**Auth**: All `/v1/*` endpoints support optional API key auth via `Authorization: Bearer <key>` or `X-Api-Key: <key>` headers.

**Output format control**: Both `/v1/chat/completions` and `/v1/messages` support output format override via:
- Header: `X-Response-Format: openai|anthropic|google`
- Query param: `?response_format=openai|anthropic|google`

---

### 4. Format Detection (`detect.js`)

The detection strategy is layered, with priorities:

1. **Headers (most reliable)**: If `anthropic-beta` or `anthropic-version` headers are present → `anthropic`
2. **Google structural markers**: If `body.contents` is an array → `google`. If `body.generationConfig` exists without `body.messages` → `google`
3. **OpenAI-exclusive signals** (checked BEFORE Anthropic):
   - `role: "tool"` in messages → `openai`
   - `tool_calls` array on assistant messages → `openai`
   - `role: "system"` or `role: "developer"` in messages → `openai`
   - Tools with `{ type: "function", function: {...} }` wrapper → `openai`
4. **Anthropic-exclusive signals**:
   - Top-level `system` field (string or array) → `anthropic`
   - Tools with `input_schema` directly on the tool object → `anthropic`
   - Content blocks with `type: "tool_use"`, `type: "tool_result"`, `type: "thinking"`, or `cache_control` → `anthropic`
5. **Default**: `openai`

**Important for your Q&A Guru integration**: If you send requests using the **GoogleGenAI SDK format** (with `contents` array and `generationConfig`), the proxy will detect it as `"google"` and pass it through `from-google.js`. However, the GoogleGenAI SDK talks to a different API (`generativelanguage.googleapis.com`), not the Cloud Code API. The proxy expects Cloud Code internal format, not the public Gemini API format — they are very similar but not identical.

---

### 5. Request Format: `/v1/chat/completions`

#### OpenAI Format (default detection)

```json
{
  "model": "gemini-3-flash",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi there!", "tool_calls": [
      { "id": "call_123", "type": "function", "function": { "name": "search", "arguments": "{\"q\": \"test\"}" } }
    ]},
    { "role": "tool", "tool_call_id": "call_123", "content": "Result here" }
  ],
  "tools": [
    { "type": "function", "function": { "name": "search", "description": "Search", "parameters": { "type": "object", "properties": { "q": { "type": "string" } } } } }
  ],
  "max_tokens": 8192,
  "temperature": 0.7,
  "top_p": 0.9,
  "stop": ["\n\n"],
  "stream": true,
  "reasoning_effort": "high"
}
```

Key field mappings in `from-openai.js`:
- `messages[role=system/developer]` → `systemInstruction.parts[].text`
- `messages[role=user]` → `contents[role=user].parts[]` (handles text, `image_url`, `input_audio`)
- `messages[role=assistant]` → `contents[role=model].parts[]` (handles text, `reasoning_content`, `tool_calls`)
- `messages[role=tool]` → `contents[role=user].parts[].functionResponse`
- `max_tokens` / `max_completion_tokens` → `generationConfig.maxOutputTokens`
- `temperature` → `generationConfig.temperature`
- `top_p` → `generationConfig.topP`
- `stop` → `generationConfig.stopSequences`
- `tools` → `tools[0].functionDeclarations[]` (schemas cleaned via `cleanSchemaForGoogle`)
- `reasoning_effort` → `generationConfig.thinkingConfig` (budget mapped: minimal=1024, low=4096, medium=8192, high=16384, xhigh=32768)

#### Anthropic Format

```json
{
  "model": "claude-sonnet-4-5-thinking",
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "Hello" }] },
    { "role": "assistant", "content": [
      { "type": "thinking", "thinking": "...", "signature": "..." },
      { "type": "text", "text": "Hi!" },
      { "type": "tool_use", "id": "toolu_123", "name": "search", "input": { "q": "test" } }
    ]},
    { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "toolu_123", "content": "Result" }
    ]}
  ],
  "tools": [{ "name": "search", "description": "Search", "input_schema": { "type": "object", "properties": { "q": { "type": "string" } } } }],
  "max_tokens": 8192,
  "thinking": { "type": "enabled", "budget_tokens": 16000 },
  "stream": true
}
```

#### Google Format (passthrough)

```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello" }] },
    { "role": "model", "parts": [{ "text": "Hi!" }] }
  ],
  "systemInstruction": { "parts": [{ "text": "Be helpful" }] },
  "generationConfig": { "maxOutputTokens": 8192, "temperature": 0.7 },
  "tools": [{ "functionDeclarations": [{ "name": "search", "description": "Search", "parameters": { "type": "OBJECT", "properties": { "q": { "type": "STRING" } } } }] }]
}
```

---

### 6. Response Formats

#### OpenAI Non-Streaming Response

```json
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1708000000,
  "model": "gemini-3-flash",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello!",
      "reasoning_content": "Let me think...",
      "tool_calls": [{
        "id": "call_<hex>",
        "type": "function",
        "function": { "name": "search", "arguments": "{\"q\": \"test\"}" }
      }]
    },
    "finish_reason": "stop" | "tool_calls" | "length"
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150,
    "prompt_tokens_details": { "cached_tokens": 20 }
  }
}
```

#### OpenAI Streaming Response

Standard `text/event-stream` SSE with `data: {...}` lines:
- First chunk: `delta: { role: "assistant" }`
- Thinking chunks: `delta: { reasoning_content: "..." }`
- Text chunks: `delta: { content: "..." }`
- Tool call chunks: `delta: { tool_calls: [{ index, id, type: "function", function: { name, arguments } }] }`
- Final chunk: `delta: {}, finish_reason: "stop"|"tool_calls"|"length"`
- Terminal: `data: [DONE]`

#### Anthropic Non-Streaming Response

Standard Anthropic Messages format with `id`, `type: "message"`, `role: "assistant"`, `content` array of blocks (`thinking`, `text`, `tool_use`, `image`), `stop_reason`, `usage`.

#### Anthropic Streaming Response

Anthropic SSE format with `event: <type>\ndata: <json>` lines: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.

#### Google Passthrough

Raw Google Cloud Code API response forwarded as-is.

---

### 7. Gemini-Specific Feature Handling

#### Thinking/Reasoning Tokens

- **Detection**: `isThinkingModel()` returns true for models with "thinking" in the name, OR any `gemini-3+` model (Gemini 3 and higher always enable thinking)
- **Request**: For Gemini thinking models, sets `generationConfig.thinkingConfig = { includeThoughts: true, thinkingBudget: N }`. For Claude thinking models, sets `generationConfig.thinkingConfig = { include_thoughts: true, thinking_budget: N }`
- **Response parsing**: Thinking parts come as `{ text: "...", thought: true, thoughtSignature: "..." }`. These map to:
  - OpenAI: `reasoning_content` field on the message (or `reasoning_content` delta in streaming)
  - Anthropic: `{ type: "thinking", thinking: "...", signature: "..." }` content blocks
- **Signature caching**: Gemini requires `thoughtSignature` on subsequent functionCall parts. The proxy caches signatures by tool call ID and restores them when the conversation is replayed. If no cached signature exists, it uses the sentinel `"skip_thought_signature_validator"`.
- **`` tags in regular text. The proxy strips these using both full-block regex and a stateful streaming filter.

#### Function Calling / Tool Use

- OpenAI `tools[].function` → Google `tools[0].functionDeclarations[]`
- Anthropic `tools[].input_schema` → Google `tools[0].functionDeclarations[].parameters`
- **Schema cleaning**: All tool schemas pass through `cleanSchemaForGoogle()` which:
  - Resolves `$ref`/`$defs`/`definitions`
  - Strips `null` variants from `anyOf`/`oneOf`
  - Flattens literal unions to `enum`
  - Converts types to UPPERCASE (`string` → `STRING`)
  - Removes unsupported keywords (`additionalProperties`, `minLength`, etc.)
  - Adds placeholder `{ type: "OBJECT", properties: { reason: ... } }` for empty schemas
- **Tool call IDs**: For Claude models, `functionCall.id` and `functionResponse.id` are preserved. For Gemini, IDs are generated as `call_<hex>`.
- **Function response matching**: Google requires `functionResponse.name` to match the `functionCall.name` (not the tool_call_id). Both converters build lookup maps to resolve this.
- Claude models get `toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } }`

#### System Instructions

- OpenAI: Extracted from `messages` array (role=system/developer)Continuing from where I left off:

#### System Instructions (continued)

- OpenAI: Extracted from `messages` array (role=system/developer) → `systemInstruction.parts[].text`
- Anthropic: Top-level `system` field (string or array) → `systemInstruction.parts[].text`
- Google: `systemInstruction` passed through
- **Cloud Code wrapping** (`request-builder.js`): The proxy **prepends** its own system instruction (`ANTIGRAVITY_SYSTEM_INSTRUCTION`) plus a `[ignore]...[/ignore]` duplicate to trick the model into not identifying as "Antigravity". User system instructions are appended after.
- For Claude thinking models with tools, an interleaved thinking hint is appended to the system instruction.

#### Multimodal (Image) Inputs

- **OpenAI format**: `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }` → `{ inlineData: { mimeType, data } }` for base64, or `{ fileData: { mimeType, fileUri } }` for URLs
- **Anthropic format**: `{ type: "image", source: { type: "base64", media_type, data } }` → `{ inlineData: { mimeType, data } }`, or URL-based → `{ fileData: { ... } }`
- **Audio**: OpenAI `input_audio` → `{ inlineData: { mimeType: "audio/wav", data } }`
- **Response images**: Google `inlineData` in response → Anthropic `{ type: "image", source: { type: "base64", ... } }` blocks

#### Context Caching

- **Session IDs**: `request-builder.js` calls `deriveSessionId()` to generate a stable session ID from the first user content. This provides cache continuity across requests with the same conversation prefix.
- **Cache tokens in usage**: `usageMetadata.cachedContentTokenCount` is reported as `prompt_tokens_details.cached_tokens` (OpenAI) or `cache_read_input_tokens` (Anthropic).
- **cache_control fields**: Anthropic's `cache_control` fields on content blocks are **stripped** by `cleanCacheControl()` because Cloud Code rejects them.

---

### 8. Supported Models

The proxy doesn't hardcode a fixed model list. It dynamically fetches available models from the Cloud Code API via `fetchAvailableModels`. Model resolution (`resolveModelName`) uses token-based normalization:

**Model families detected by `getModelFamily()`:**
- Any model containing "claude" → `claude` family
- Any model containing "gemini" → `gemini` family

**Known model names from constants and fallback config:**

| Model | Pool | Notes |
|---|---|---|
| `gemini-3-flash` | gemini-cli (default) | Mapped to `gemini-3-flash-preview` on CLI pool |
| `gemini-3-pro-low` | antigravity | |
| `gemini-3-pro-high` | antigravity | |
| `gemini-3-flash-preview` | gemini-cli | Static passthrough |
| `gemini-3-pro-preview` | gemini-cli | Static passthrough |
| `gemini-2.5-*` | either | Same name on both pools |
| `claude-opus-4-6-thinking` | antigravity | |
| `claude-sonnet-4-5-thinking` | antigravity | |
| `claude-sonnet-4-5` | antigravity | |

**Dual Quota Pool System:**
- `getQuotaPool()` routes models: Claude → always `antigravity`, Gemini → `gemini-cli` (if enabled), `antigravity-` prefix forces antigravity pool
- `mapModelForPool()` adjusts names: Gemini 3 models get `-preview` suffix on CLI pool, tier suffixes (`-low`, `-high`) stripped
- Cross-pool fallback: if one pool is rate-limited, tries the other before falling back to `MODEL_FALLBACK_MAP`

**Model fallback chain:**
- `gemini-3-pro-high` → `claude-opus-4-6-thinking`
- `gemini-3-pro-low` → `claude-sonnet-4-5`
- `gemini-3-flash` → `claude-sonnet-4-5-thinking`
- And vice versa

---

### 9. Cloud Code API Communication

The proxy talks to these internal Google endpoints:

```
https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent
https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
https://cloudcode-pa.googleapis.com/v1internal:generateContent
```

**The final payload** sent to Cloud Code (built by `buildCloudCodeRequest`):

```json
{
  "project": "<project-id>",
  "model": "gemini-3-flash",
  "request": {
    "contents": [...],
    "generationConfig": {...},
    "systemInstruction": {
      "role": "user",
      "parts": [
        { "text": "<ANTIGRAVITY_SYSTEM_INSTRUCTION>" },
        { "text": "Please ignore the following [ignore]...[/ignore]" },
        { "text": "<user's actual system instruction>" }
      ]
    },
    "tools": [...],
    "sessionId": "<derived-session-id>"
  },
  "userAgent": "antigravity",
  "requestType": "agent",
  "requestId": "agent-<uuid>"
}
```

**Key difference from public Gemini API**: The public Gemini API (`generativelanguage.googleapis.com`) accepts requests at a different URL structure and doesn't require the `project`, `userAgent`, `requestType`, `requestId` wrapping. The Cloud Code API wraps the standard Google `GenerateContentRequest` inside an envelope.

**Headers** include `User-Agent`, `X-Goog-Api-Client`, `Client-Metadata` (JSON with `ideType`, `platform`, `pluginType`), and for Claude thinking models, `anthropic-beta: interleaved-thinking-2025-05-14`.

**Non-streaming for thinking models**: Even for non-streaming requests, thinking models use the SSE endpoint (`streamGenerateContent?alt=sse`) because the non-streaming endpoint doesn't return thinking blocks. The `accumulateSSEResponse()` function in `sse-parser.js` collects all SSE chunks into a single accumulated response.

---

### 10. Key Differences: GoogleGenAI SDK vs. What The Proxy Expects

If you're considering sending requests from the GoogleGenAI SDK to this proxy:

| Aspect | GoogleGenAI SDK (public API) | Antigravity Proxy |
|---|---|---|
| **Endpoint** | `generativelanguage.googleapis.com` | `localhost:8080/v1/chat/completions` |
| **Request format** | Native Google (`contents`, `generationConfig`) | Accepts OpenAI, Anthropic, OR Google |
| **Auth** | API key or OAuth | Optional `API_KEY` env var |
| **Google detection** | `contents` array triggers `google` format | Passes through `from-google.js` |
| **Wrapping** | None | Proxy wraps in Cloud Code envelope |
| **Schema types** | lowercase (`string`, `object`) | Converted to UPPERCASE (`STRING`, `OBJECT`) |
| **Model names** | `gemini-2.0-flash` etc. | Resolved dynamically; `gemini-3-flash` etc. |
| **Thinking** | `thinkingConfig` in `generationConfig` | Same structure preserved in Google passthrough |
| **Streaming** | `generateContentStream` | `stream: true` on the body |

The proxy **will accept** GoogleGenAI SDK-style requests if they have a `contents` array — they'll be detected as `"google"` format and passed through `from-google.js` which does validation, schema cleaning, and role normalization. The proxy then wraps them in the Cloud Code envelope and forwards them. The response comes back in whichever format you request via `X-Response-Format` or `?response_format=`.

