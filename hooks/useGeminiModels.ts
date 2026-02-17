import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';

interface ModelOption {
	value: string;
	label: string;
	group?: string;
}

// Module-level cache: avoids refetching on every render / remount
let cachedModels: ModelOption[] | null = null;
let cachedCacheKey: string | null = null;

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

/**
 * Infer a human-friendly group name from a model ID.
 * e.g. "gemini-3-pro-preview" → "Gemini 3"
 */
function inferGroup(modelName: string): string | undefined {
	const match = modelName.match(/^gemini-(\d+(?:\.\d+)?)/);
	if (match) return `Gemini ${match[1]}`;
	return undefined;
}

/**
 * Pretty-print a model name to a display label.
 * Strips "models/" prefix and capitalises each segment.
 */
function prettifyName(name: string, displayName?: string): string {
	if (displayName) return displayName;
	// Strip "models/" prefix if present
	const clean = name.replace(/^models\//, '');
	return clean
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * Hook that fetches available models via the active transport.
 * Works with both GoogleGenAI SDK and Antigravity Proxy.
 * Caches results at module level so the API is hit at most once per session.
 */
export function useGeminiModels() {
	const { qaConfig, transport, providerConfig } = useAppContext();
	const apiKey = qaConfig.apiKey || import.meta.env.VITE_GEMINI_API_KEY;

	// Cache key combines provider type + api key / base URL so we refetch on provider switch
	const cacheKey =
		providerConfig.type === 'antigravity-proxy'
			? `proxy:${providerConfig.baseUrl || 'http://localhost:8080'}`
			: `sdk:${apiKey}`;

	const [models, setModels] = useState<ModelOption[]>(
		cachedModels ?? FALLBACK_MODELS
	);
	const [isLoading, setIsLoading] = useState(!cachedModels);
	const [error, setError] = useState<string | null>(null);
	const fetchedRef = useRef(false);

	useEffect(() => {
		// Skip if already fetched with the same key
		if (cachedModels && cachedCacheKey === cacheKey) {
			setModels(cachedModels);
			setIsLoading(false);
			return;
		}

		// For SDK transport, require an API key
		if (providerConfig.type === 'gemini-sdk' && !apiKey) return;

		if (fetchedRef.current) return;

		let cancelled = false;
		fetchedRef.current = true;

		(async () => {
			try {
				setIsLoading(true);
				const pager = await transport.listModels({
					config: { pageSize: 100 },
				});

				const result: ModelOption[] = [];

				for await (const model of pager) {
					const name = (model.name || '').replace(/^models\//, '');

					// Only include Gemini 3+ chat models
					if (!name.startsWith('gemini-3')) continue;

					// Skip embedding / image-only / non-chat models
					const desc = (model.description || '').toLowerCase();
					if (desc.includes('embedding')) continue;
					if (
						desc.includes('image generation') &&
						!desc.includes('text')
					)
						continue;

					result.push({
						value: name,
						label: prettifyName(
							name,
							model.displayName || undefined
						),
						group: inferGroup(name),
					});
				}

				if (cancelled) return;

				// Sort: stable models first, then preview, then alphabetically
				result.sort((a, b) => {
					const aPreview = a.value.includes('preview') ? 1 : 0;
					const bPreview = b.value.includes('preview') ? 1 : 0;
					if (aPreview !== bPreview) return aPreview - bPreview;
					return a.value.localeCompare(b.value);
				});

				const finalModels = result.length > 0 ? result : FALLBACK_MODELS;
				cachedModels = finalModels;
				cachedCacheKey = cacheKey;
				setModels(finalModels);
				setError(null);
			} catch (err) {
				if (cancelled) return;
				console.warn('[useGeminiModels] Failed to fetch models:', err);
				setError(
					err instanceof Error ? err.message : 'Failed to fetch models'
				);
				// Keep fallback models
				setModels(FALLBACK_MODELS);
			} finally {
				setIsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [cacheKey]);

	return { models, isLoading, error };
}
