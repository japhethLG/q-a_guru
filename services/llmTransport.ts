/**
 * LLM Transport Layer
 *
 * Abstracts the communication transport for LLM requests.
 * Both transports produce identical response shapes (Google format)
 * so all downstream parsing (streamHelpers, useStreamProcessor) works unchanged.
 *
 * - SDKTransport: uses @google/genai SDK directly (current behavior)
 * - ProxyTransport: uses fetch + SSE to an OpenAI-compatible proxy with Google format passthrough
 */

import { GoogleGenAI } from '@google/genai';
import { ProviderConfig } from '../types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LLMTransport {
	/** Streaming generation — returns a promise that resolves to an async iterable of response chunks. */
	generateContentStream(params: {
		model: string;
		contents: any;
		config?: Record<string, any>;
	}): Promise<AsyncIterable<any>>;

	/** Non-streaming generation — returns a single response object. */
	generateContent(params: {
		model: string;
		contents: any;
		config?: Record<string, any>;
	}): Promise<any>;

	/** List available models. Returns an async iterable of model objects. */
	listModels(config?: {
		config?: { pageSize?: number };
	}): Promise<AsyncIterable<any>>;

	/** Whether this transport supports Gemini context caching. */
	supportsCaching: boolean;
}

// ---------------------------------------------------------------------------
// SDK Transport — wraps @google/genai
// ---------------------------------------------------------------------------

export function createSDKTransport(apiKey: string): LLMTransport {
	const ai = new GoogleGenAI({ apiKey });

	return {
		supportsCaching: true,

		async generateContentStream(params) {
			const result = ai.models.generateContentStream(params);
			return await result;
		},

		async generateContent(params) {
			return ai.models.generateContent(params);
		},

		async listModels(config) {
			return ai.models.list(config);
		},
	};
}

// ---------------------------------------------------------------------------
// Proxy Transport — fetch + SSE with Google format passthrough
// ---------------------------------------------------------------------------

/**
 * Normalize contents to the Google format array of { role, parts }.
 * The SDK accepts a raw string or a single content object; the proxy needs
 * the canonical array form.
 */
function normalizeContents(contents: any): any {
	if (typeof contents === 'string') {
		return [{ role: 'user', parts: [{ text: contents }] }];
	}
	if (contents && !Array.isArray(contents) && contents.parts) {
		return [{ role: contents.role || 'user', parts: contents.parts }];
	}
	return contents;
}

/**
 * Normalize systemInstruction to the Google format { parts: [{ text }] }.
 * The SDK accepts a raw string; the proxy / Cloud Code API needs the object form.
 */
function normalizeSystemInstruction(si: any): any {
	if (typeof si === 'string') {
		return { parts: [{ text: si }] };
	}
	return si;
}

// Fields from GenerateContentConfig that go at the TOP LEVEL of the
// Google GenerateContentRequest (not inside generationConfig).
const TOP_LEVEL_CONFIG_FIELDS = new Set([
	'systemInstruction',
	'tools',
	'toolConfig',
	'safetySettings',
	'cachedContent',
	'labels',
]);

// Fields that are SDK-only and should NOT be forwarded to the API.
const SDK_ONLY_FIELDS = new Set([
	'httpOptions',
	'abortSignal',
	'automaticFunctionCalling',
]);

/**
 * Map SDK GenerateContentConfig fields onto the proxy request body.
 *
 * The SDK's config object mixes top-level request fields (systemInstruction,
 * tools, etc.) with generationConfig fields (temperature, thinkingConfig, etc.).
 * This function places each field in the correct location so the proxy's
 * from-google.js converter and the Cloud Code API see a valid request.
 */
function spreadConfigToBody(
	config: Record<string, any>,
	body: Record<string, any>
): void {
	const genConfig: Record<string, any> = {};

	for (const [key, value] of Object.entries(config)) {
		if (value === undefined) continue;
		if (SDK_ONLY_FIELDS.has(key)) continue;

		if (key === 'systemInstruction') {
			body.systemInstruction = normalizeSystemInstruction(value);
		} else if (TOP_LEVEL_CONFIG_FIELDS.has(key)) {
			body[key] = value;
		} else {
			genConfig[key] = value;
		}
	}

	if (Object.keys(genConfig).length > 0) {
		body.generationConfig = genConfig;
	}
}

/**
 * Attach SDK-compatible convenience getters to a raw Google-format response chunk.
 * The GoogleGenAI SDK's GenerateContentResponse has `.text` and `.functionCalls`
 * getters; downstream code (QAGenerator, useStreamProcessor) relies on them.
 */
function attachResponseGetters(chunk: any): any {
	if (!chunk || typeof chunk !== 'object') return chunk;

	if (!('text' in chunk)) {
		Object.defineProperty(chunk, 'text', {
			get() {
				const parts = chunk?.candidates?.[0]?.content?.parts;
				if (!Array.isArray(parts)) return '';
				return parts
					.filter((p: any) => typeof p.text === 'string' && !p.thought)
					.map((p: any) => p.text)
					.join('');
			},
		});
	}

	if (!('functionCalls' in chunk)) {
		Object.defineProperty(chunk, 'functionCalls', {
			get() {
				const parts = chunk?.candidates?.[0]?.content?.parts;
				if (!Array.isArray(parts)) return undefined;
				const calls = parts
					.filter((p: any) => p.functionCall)
					.map((p: any) => p.functionCall);
				return calls.length > 0 ? calls : undefined;
			},
		});
	}

	return chunk;
}

export function createProxyTransport(baseUrl: string): LLMTransport {
	const normalizedBase = baseUrl.replace(/\/+$/, '');

	return {
		supportsCaching: false,

		async generateContentStream(params) {
			const body: Record<string, any> = {
				model: params.model,
				contents: normalizeContents(params.contents),
				stream: true,
			};

			if (params.config) {
				spreadConfigToBody(params.config, body);
			}

			const fetchOptions: RequestInit = {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			};

			if (params.config && params.config.abortSignal) {
				fetchOptions.signal = params.config.abortSignal;
			}

			const response = await fetch(
				`${normalizedBase}/v1/chat/completions?response_format=google`,
				fetchOptions
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Proxy error ${response.status}: ${errorText}`);
			}

			return parseSSEStream(response);
		},

		async generateContent(params) {
			const body: Record<string, any> = {
				model: params.model,
				contents: normalizeContents(params.contents),
				stream: false,
			};

			if (params.config) {
				spreadConfigToBody(params.config, body);
			}

			const fetchOptions: RequestInit = {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			};

			if (params.config && params.config.abortSignal) {
				fetchOptions.signal = params.config.abortSignal;
			}

			const response = await fetch(
				`${normalizedBase}/v1/chat/completions?response_format=google`,
				fetchOptions
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Proxy error ${response.status}: ${errorText}`);
			}

			const data = await response.json();
			// Unwrap Cloud Code envelope if present
			const unwrapped = data.response || data;
			return attachResponseGetters(unwrapped);
		},

		async listModels(_config) {
			const response = await fetch(`${normalizedBase}/v1/models`);
			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.status}`);
			}
			const data = await response.json();
			const models = (data.data || []).map((m: any) => ({
				name: m.id,
				displayName: m.id,
				description: m.description || m.id,
				inputTokenLimit: m.input_token_limit,
				outputTokenLimit: m.output_token_limit,
			}));

			// Return an async iterable to match the SDK's pager interface
			return {
				async *[Symbol.asyncIterator]() {
					for (const model of models) {
						yield model;
					}
				},
			} as AsyncIterable<any>;
		},
	};
}

// ---------------------------------------------------------------------------
// SSE Parser — converts text/event-stream into async iterable of JSON chunks
// ---------------------------------------------------------------------------

async function* parseSSEStream(
	response: Response
): AsyncGenerator<any, void, unknown> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data:')) continue;
				const jsonText = line.slice(5).trim();
				if (!jsonText || jsonText === '[DONE]') continue;

				try {
					const parsed = JSON.parse(jsonText);
					// Unwrap Cloud Code envelope if present
					const chunk = parsed.response || parsed;
					yield attachResponseGetters(chunk);
				} catch {
					// Skip malformed JSON lines
				}
			}
		}

		// Flush remaining buffer
		if (buffer.startsWith('data:')) {
			const jsonText = buffer.slice(5).trim();
			if (jsonText && jsonText !== '[DONE]') {
				try {
					const parsed = JSON.parse(jsonText);
					const chunk = parsed.response || parsed;
					yield attachResponseGetters(chunk);
				} catch {
					// Skip
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTransport(config: ProviderConfig): LLMTransport {
	if (config.type === 'antigravity-proxy') {
		const baseUrl = config.baseUrl || 'https://bigclawdproxy.crabdance.com/';
		return createProxyTransport(baseUrl);
	}
	const apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
	return createSDKTransport(apiKey);
}
