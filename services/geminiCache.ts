/**
 * Gemini Context Caching Service
 *
 * Caches the system instruction and source documents across API calls
 * to reduce token cost and improve latency. If caching fails for any
 * reason (unsupported model, content too small, API error), falls back
 * silently to uncached mode.
 *
 * @see https://ai.google.dev/gemini-api/docs/caching
 */

import { GoogleGenAI, FunctionDeclaration } from '@google/genai';
import { DocumentAttachment } from '../types';

interface CacheEntry {
	cacheName: string;
	fingerprint: string;
	createdAt: number;
}

/** Simple hash for cache invalidation when content changes */
function computeFingerprint(...parts: string[]): string {
	const combined = parts.join('|||');
	let hash = 0;
	for (let i = 0; i < combined.length; i++) {
		const char = combined.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return hash.toString(36);
}

// Singleton cache entry — one cache at a time per session
let currentCache: CacheEntry | null = null;

/**
 * Get or create a context cache for the given content.
 * Returns the cache name if caching succeeds, or null to use uncached mode.
 *
 * Tries caching regardless of model — if the model doesn't support it,
 * the error is caught and null is returned silently.
 */
export async function getOrCreateCache(params: {
	ai: GoogleGenAI;
	model: string;
	systemInstruction: string;
	sourceDocuments: DocumentAttachment[];
	tools: FunctionDeclaration[];
	apiKey: string;
}): Promise<string | null> {
	const { ai, model, systemInstruction, sourceDocuments, tools, apiKey } =
		params;

	// Compute fingerprint from all cached content
	// For native docs, use fileName+mimeType as a lighter proxy for the full base64
	const docFingerprints = sourceDocuments.map((d) =>
		d.type === 'native'
			? `native:${d.fileName}:${d.mimeType}:${d.rawBase64?.length || 0}`
			: `text:${d.parsedText || ''}`
	);
	const fingerprint = computeFingerprint(
		model,
		systemInstruction,
		...docFingerprints,
		apiKey
	);

	// Return existing cache if content hasn't changed
	if (currentCache && currentCache.fingerprint === fingerprint) {
		// Check if cache is still relatively fresh (< 30 minutes)
		const ageMs = Date.now() - currentCache.createdAt;
		if (ageMs < 30 * 60 * 1000) {
			console.log(
				`[geminiCache] Reusing existing cache: ${currentCache.cacheName} (age: ${Math.round(ageMs / 1000)}s)`
			);
			return currentCache.cacheName;
		}
		// Cache is old — create a new one
		console.log('[geminiCache] Cache expired, creating new one');
	}

	try {
		// Build content to cache: source documents as a user/model pair
		const buildCachedParts = () => {
			const parts: any[] = [];

			// Native docs: cache as inlineData
			for (const doc of sourceDocuments) {
				if (doc.type === 'native' && doc.rawBase64) {
					parts.push({
						inlineData: {
							data: doc.rawBase64,
							mimeType: doc.mimeType,
						},
					});
				}
			}

			// Text docs: cache as text
			const textDocs = sourceDocuments.filter((d) => d.type === 'text');
			if (textDocs.length > 0) {
				const textContent = textDocs
					.map((d) => d.parsedText || '')
					.join('\n\n---\n\n');
				parts.push({
					text: `<source_documents>\nThe following source documents are provided for reference. Base your knowledge and Q&A generation on this content.\n\n${textContent}\n</source_documents>`,
				});
			}

			return parts;
		};

		const cachedParts = buildCachedParts();
		const cachedContents =
			cachedParts.length > 0
				? [
						{
							role: 'user' as const,
							parts: cachedParts,
						},
						{
							role: 'model' as const,
							parts: [
								{
									text:
										'I have received the source documents and will use them for reference.',
								},
							],
						},
					]
				: undefined;

		const cache = await ai.caches.create({
			model,
			config: {
				systemInstruction,
				contents: cachedContents,
				tools: [{ functionDeclarations: tools }],
				ttl: '3600s', // 1 hour
				displayName: `qa-guru-${fingerprint}`,
			},
		});

		if (!cache.name) {
			console.warn('[geminiCache] Cache created but no name returned');
			return null;
		}

		// Clean up old cache if exists
		if (currentCache) {
			try {
				await ai.caches.delete({ name: currentCache.cacheName });
				console.log(`[geminiCache] Deleted old cache: ${currentCache.cacheName}`);
			} catch {
				// Ignore deletion errors — cache may have already expired
			}
		}

		currentCache = {
			cacheName: cache.name,
			fingerprint,
			createdAt: Date.now(),
		};

		console.log(`[geminiCache] Created new cache: ${cache.name}`);
		return cache.name;
	} catch (error) {
		// Silently fall back to uncached mode
		console.warn(
			'[geminiCache] Caching failed, falling back to uncached mode:',
			error instanceof Error ? error.message : error
		);
		return null;
	}
}

/**
 * Clear the current cache. Call this when the session ends
 * or when a major config change occurs.
 */
export async function clearCache(ai: GoogleGenAI): Promise<void> {
	if (!currentCache) return;

	try {
		await ai.caches.delete({ name: currentCache.cacheName });
		console.log(`[geminiCache] Cleared cache: ${currentCache.cacheName}`);
	} catch {
		// Ignore — cache may have already expired
	}
	currentCache = null;
}

/**
 * Check if a cache is currently active.
 */
export function hasCacheActive(): boolean {
	return currentCache !== null;
}
