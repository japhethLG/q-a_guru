/**
 * LLM self-correction for snippet_replace failures.
 *
 * Inspired by Gemini CLI's FixLLMEditWithInstruction pattern:
 * when all matching layers (exact, DOM, fuzzy) fail to find the
 * search string in the document, this module calls a secondary LLM
 * to produce a corrected search string that should match.
 */

import { LLMTransport } from './llmTransport';

interface FixEditParams {
	instruction: string;
	failedSearchString: string;
	replacementString: string;
	errorMessage: string;
	documentHtml: string;
	transport: LLMTransport;
	model?: string;
}

interface FixEditResult {
	correctedSearchString: string | null;
	success: boolean;
}

const FIXER_SYSTEM_PROMPT = `You are a precise text-matching assistant. Your task is to fix a failed search-and-replace operation in an HTML document.

The user will provide:
1. An INSTRUCTION describing what edit was intended
2. A FAILED SEARCH STRING that could not be found in the document
3. The FULL DOCUMENT HTML

Your job: Find the actual text in the document that the search string was trying to match, and return ONLY that exact text — nothing else. The returned text must be a verbatim substring of the document.

Rules:
- Return ONLY the corrected search string, no explanations
- The corrected string MUST be an exact substring of the document HTML
- Preserve all HTML tags, attributes, whitespace, and entities exactly as they appear in the document
- If the search string was close but had whitespace/attribute differences, return the exact version from the document
- If you cannot find a reasonable match, respond with exactly: NO_MATCH`;

/**
 * Call a secondary LLM to fix a failed snippet_replace search string.
 *
 * Returns a corrected search string that should be an exact substring
 * of the document HTML, or null if the fixer couldn't help.
 */
export async function fixLLMEdit(params: FixEditParams): Promise<FixEditResult> {
	const {
		instruction,
		failedSearchString,
		errorMessage,
		documentHtml,
		transport,
		model = 'gemini-2.0-flash',
	} = params;

	const userPrompt = `INSTRUCTION: ${instruction}

FAILED SEARCH STRING:
"""
${failedSearchString}
"""

ERROR: ${errorMessage}

FULL DOCUMENT HTML:
"""
${documentHtml}
"""

Return the corrected search string that exactly matches a portion of the document:`;

	try {
		console.log('[llmEditFixer] Attempting LLM self-correction...');

		const response = await transport.generateContent({
			model,
			contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
			config: {
				systemInstruction: FIXER_SYSTEM_PROMPT,
				temperature: 0,
			},
		});

		const corrected = (response.text || '').trim();

		if (!corrected || corrected === 'NO_MATCH') {
			console.log('[llmEditFixer] Fixer returned NO_MATCH');
			return { correctedSearchString: null, success: false };
		}

		if (!documentHtml.includes(corrected)) {
			console.warn(
				'[llmEditFixer] Fixer returned a string not found in document, discarding'
			);
			return { correctedSearchString: null, success: false };
		}

		console.log(
			`[llmEditFixer] Fixer returned a valid corrected search string (${corrected.length} chars)`
		);
		return { correctedSearchString: corrected, success: true };
	} catch (error) {
		console.error('[llmEditFixer] Self-correction call failed:', error);
		return { correctedSearchString: null, success: false };
	}
}
