import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	GenerateContentResponse,
} from '@google/genai';
import {
	QaConfig,
	ChatConfig,
	ChatMessage,
	SelectionMetadata,
	ScrollTarget,
} from '../types';
import { prompts, toolDeclarations } from './prompts';
import { tryReplaceExact, tryReplaceFuzzy } from './htmlReplace';
import { tryReplaceDom } from './domEditor';
import { parseQuestions, summarizeDocument } from './documentParser';
import { getTemplateById } from './templateStorage';
import { buildContextBudget, truncateSourceDocuments } from './contextManager';
import { getOrCreateCache } from './geminiCache';
import { LLMTransport, createSDKTransport } from './llmTransport';
import { fixLLMEdit } from './llmEditFixer';

/**
 * Analyzes an image with a user-provided prompt.
 */
export const analyzeImage = async (
	base64ImageData: string,
	mimeType: string,
	prompt: string,
	apiKey?: string,
	transport?: LLMTransport
): Promise<string> => {
	try {
		const effectiveTransport =
			transport ||
			createSDKTransport(apiKey || import.meta.env.VITE_GEMINI_API_KEY);

		const imagePart = {
			inlineData: {
				data: base64ImageData,
				mimeType: mimeType,
			},
		};

		const textPart = {
			text: prompt,
		};

		const response = await effectiveTransport.generateContent({
			model: 'gemini-2.5-flash',
			contents: { parts: [imagePart, textPart] },
		});

		return response.text;
	} catch (error) {
		console.error('Error analyzing image:', error);
		return 'An error occurred during analysis. Please check the console for details.';
	}
};

const editDocumentTool: FunctionDeclaration = {
	name: 'edit_document',
	description:
		'Edits the document content. Use snippet_replace for targeted edits (changing an answer, fixing a reference). Use full_replace for structural changes (adding/deleting questions, major rewrites).',
	parameters: {
		type: Type.OBJECT,
		properties: {
			edit_type: {
				type: Type.STRING,
				description:
					'The type of edit: "snippet_replace" for targeted search-and-replace edits, "full_replace" for complete document replacement (adding questions, deleting questions, rewriting).',
			},
			html_snippet_to_replace: {
				type: Type.STRING,
				description:
					'For snippet_replace: an exact HTML snippet from the current document to find and replace. Include 3+ lines of surrounding context for reliable matching.',
			},
			replacement_html: {
				type: Type.STRING,
				description:
					'For snippet_replace: the new HTML to replace the snippet with. Use empty string to delete the snippet.',
			},
			instruction: {
				type: Type.STRING,
				description:
					'For snippet_replace: a short description of WHY this edit is needed (e.g. "Change the answer of question 3 from Paris to London"). Used for self-correction if the match fails.',
			},
			full_document_html: {
				type: Type.STRING,
				description:
					'For full_replace: the complete new HTML content for the entire document.',
			},
		},
	},
};

const readDocumentTool: FunctionDeclaration = {
	name: 'read_document',
	description:
		'Inspect the current document structure. Returns a summary of all questions with numbers, text, answers, and references. Use before making edits when you need to understand the document.',
	parameters: {
		type: Type.OBJECT,
		properties: {},
	},
};

/**
 * Handles chat interactions, providing context and tools to the AI.
 * Returns an async generator that yields streaming responses.
 *
 * Attempts to use Gemini context caching for the system instruction,
 * source documents, and tools. Falls back to uncached mode on any error.
 * When using a proxy transport, caching is skipped (proxy handles it internally).
 */
export const getChatResponseStream = async function* (
	history: ChatMessage[],
	newMessage: string,
	sourceDocuments: string[],
	documentHtml?: string,
	selectedText?: SelectionMetadata | null,
	apiKey?: string,
	model: string = 'gemini-3-flash-preview',
	qaConfig?: QaConfig | null,
	signal?: AbortSignal,
	transport?: LLMTransport
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveTransport =
		transport ||
		createSDKTransport(apiKey || import.meta.env.VITE_GEMINI_API_KEY);

	// Build the base system instruction (static — cacheable)
	const baseSystemInstruction = prompts.baseChatSystemInstruction(
		sourceDocuments,
		qaConfig
	);

	// Dynamic parts (change every turn — NOT cached)
	let dynamicSuffix = '';
	if (documentHtml) {
		dynamicSuffix += prompts.appendDocumentHtml('', documentHtml);
	}
	if (selectedText) {
		dynamicSuffix += prompts.appendSelectedText('', selectedText);
	}

	const fullSystemInstruction = baseSystemInstruction + dynamicSuffix;

	const geminiHistory = history
		.filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
		.map((message) => ({
			role: message.role,
			parts: [{ text: message.content }],
		}));

	const userPrompt = prompts.getUserPrompt(
		newMessage,
		selectedText || undefined
	);

	// Auto-truncate source documents if they exceed their token budget
	const trimmedSourceDocs = truncateSourceDocuments(sourceDocuments || []);

	const tools: FunctionDeclaration[] = [editDocumentTool, readDocumentTool];

	// --- Try context caching (only when transport supports it) ---
	let cacheName: string | null = null;
	if (effectiveTransport.supportsCaching) {
		const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
		const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
		cacheName = await getOrCreateCache({
			ai,
			model,
			systemInstruction: baseSystemInstruction,
			sourceDocuments: trimmedSourceDocs,
			tools,
			apiKey: effectiveApiKey,
		});
	}

	// Token budget check (informational — logs breakdown in dev)
	buildContextBudget({
		systemPrompt: fullSystemInstruction,
		sourceDocuments: sourceDocuments || [],
		documentHtml: documentHtml || '',
		history,
		newMessage,
	});

	// Build contents: if cached, source docs are already in the cache — skip inline
	const sourceDocContext =
		!cacheName && trimmedSourceDocs.length > 0
			? [
					{
						role: 'user',
						parts: [
							{
								text: `<source_documents>\nThe following source documents are provided for reference. Base your knowledge and Q&A generation on this content.\n\n${trimmedSourceDocs.join('\n\n---\n\n')}\n</source_documents>`,
							},
						],
					},
					{
						role: 'model',
						parts: [
							{
								text:
									'I have received the source documents and will use them for reference.',
							},
						],
					},
				]
			: [];

	const contents = [
		...sourceDocContext,
		...geminiHistory,
		{ role: 'user', parts: [{ text: userPrompt }] },
	];

	try {
		const config: Record<string, any> = {
			thinkingConfig: {
				thinkingBudget: -1,
				includeThoughts: true,
			},
		};

		if (cacheName) {
			// Cached mode: tools + base system instruction are in the cache
			config.cachedContent = cacheName;
			// Dynamic parts (document HTML, selection) still need system instruction
			if (dynamicSuffix.trim()) {
				config.systemInstruction = dynamicSuffix;
			}
		} else {
			// Uncached mode: send everything inline
			config.systemInstruction = fullSystemInstruction;
			config.tools = [{ functionDeclarations: tools }];
		}

		if (signal) {
			config.abortSignal = signal;
		}

		const response = effectiveTransport.generateContentStream({
			model: model,
			contents: contents,
			config,
		});

		for await (const chunk of await response) {
			if (signal?.aborted) {
				break;
			}
			yield chunk;
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.error('Error in chat:', error);
		throw error;
	}
};

export type ProcessFunctionCallsResult = {
	success: boolean;
	newHtml?: string;
	toolUsageMessage?: string;
	toolResponse?: string;
	message: string;
	scrollTo?: ScrollTarget;
	scrollTargets?: ScrollTarget[];
	_needsLLMFix?: boolean;
	_fixerParams?: {
		instruction: string;
		failedSearchString: string;
		replacementString: string;
		errorMessage: string;
		documentHtml: string;
	};
};

/**
 * Process a single edit_document call against the given HTML.
 * Returns the result with updated HTML (if successful).
 */
function processSingleEdit(
	args: Record<string, unknown>,
	documentHtml: string,
	accumulatedText: string,
	transport?: LLMTransport
): ProcessFunctionCallsResult {
	const editType = (args.edit_type as string) || inferEditType(args);

	const successMessage = (description: string): ProcessFunctionCallsResult => {
		const toolUsageMessage = accumulatedText
			? `${accumulatedText}\n\n✅ *Document updated successfully.*`
			: '✅ *Document updated successfully.*';
		return {
			success: true,
			message: `The edit_document tool was executed successfully. ${description}`,
			toolUsageMessage,
		};
	};

	switch (editType) {
		case 'full_replace': {
			const fullHtml = args.full_document_html as string;
			if (fullHtml !== undefined && typeof fullHtml === 'string') {
				validateFullReplace(documentHtml, fullHtml);
				const result = successMessage(
					fullHtml === ''
						? 'Full document was cleared.'
						: 'Full document was replaced with new content.'
				);
				result.newHtml = fullHtml;
				result.scrollTo = { type: 'top' };
				return result;
			}
			return {
				success: false,
				message: 'full_replace requires full_document_html.',
			};
		}

		case 'snippet_replace':
		default: {
			const snippetToReplace = args.html_snippet_to_replace as string;
			const replacementHtml = args.replacement_html as string;
			const fullHtml = args.full_document_html as string;
			const instruction = args.instruction as string;

			// Support legacy calls without edit_type that provide full_document_html
			if (typeof fullHtml === 'string') {
				const result = successMessage(
					fullHtml === ''
						? 'Full document was cleared.'
						: 'Full document was replaced.'
				);
				result.newHtml = fullHtml;
				return result;
			}

			if (snippetToReplace && typeof replacementHtml === 'string') {
				const res = processSnippetReplace(
					documentHtml,
					snippetToReplace,
					replacementHtml,
					accumulatedText,
					instruction,
					transport
				);
				return res;
			}

			return {
				success: false,
				message:
					'Invalid arguments. For snippet_replace provide html_snippet_to_replace + replacement_html + instruction. ' +
					'For structural changes, use full_replace with full_document_html.',
			};
		}
	}
}

export async function processFunctionCalls(params: {
	functionCalls: any[] | undefined;
	documentHtml: string;
	accumulatedText: string;
	transport?: LLMTransport;
}): Promise<ProcessFunctionCallsResult> {
	const { functionCalls, documentHtml, accumulatedText, transport } = params;

	if (!functionCalls || functionCalls.length === 0) {
		return { success: true, message: 'No function calls to process.' };
	}

	// --- Handle read_document tool ---
	const readCall = functionCalls.find((fc) => fc.name === 'read_document');
	if (readCall) {
		const parseResult = parseQuestions(documentHtml);
		const summary = summarizeDocument(parseResult);
		return {
			success: true,
			toolResponse: summary,
			message: 'Document summary returned.',
		};
	}

	// --- Handle edit_document tool(s) ---
	const editCalls = functionCalls.filter(
		(fc) => fc.name === 'edit_document' && fc.args
	);

	if (editCalls.length === 0) {
		return { success: true, message: 'No actionable tool call found.' };
	}

	// Single edit — fast path (most common case)
	if (editCalls.length === 1) {
		const result = processSingleEdit(
			editCalls[0].args as Record<string, unknown>,
			documentHtml,
			accumulatedText,
			transport
		);
		return maybeFixWithLLM(result, accumulatedText, transport);
	}

	// --- Multiple edits — process sequentially, cascading HTML ---
	console.log(
		`[processFunctionCalls] Processing ${editCalls.length} edit_document calls sequentially`
	);

	let currentHtml = documentHtml;
	let successCount = 0;
	const failures: string[] = [];
	const descriptions: string[] = [];
	const results: ProcessFunctionCallsResult[] = [];

	for (let i = 0; i < editCalls.length; i++) {
		const args = editCalls[i].args as Record<string, unknown>;
		let result = processSingleEdit(args, currentHtml, '', transport);

		// Attempt LLM self-correction if needed
		result = await maybeFixWithLLM(result, '', transport);

		if (result.success && result.newHtml !== undefined) {
			currentHtml = result.newHtml;
			successCount++;
			descriptions.push(result.message);
			results.push(result);
			console.log(
				`[processFunctionCalls] Edit ${i + 1}/${editCalls.length} succeeded: ${result.message}`
			);
		} else {
			failures.push(`Edit ${i + 1}: ${result.message}`);
			console.warn(
				`[processFunctionCalls] Edit ${i + 1}/${editCalls.length} failed: ${result.message}`
			);
		}
	}

	// Build combined result
	if (successCount === 0) {
		return {
			success: false,
			message: `All ${editCalls.length} edits failed:\n${failures.join('\n')}`,
		};
	}

	const statusEmoji = failures.length > 0 ? '⚠️' : '✅';
	const statusText =
		failures.length > 0
			? `${statusEmoji} *${successCount} of ${editCalls.length} edits applied.* ${failures.length} failed:\n${failures.join('\n')}`
			: `${statusEmoji} *All ${successCount} edits applied successfully.*`;

	const toolUsageMessage = accumulatedText
		? `${accumulatedText}\n\n${statusText}`
		: statusText;

	return {
		success: true,
		newHtml: currentHtml,
		toolUsageMessage,
		message: `Processed ${editCalls.length} edits: ${successCount} succeeded, ${failures.length} failed.`,
		scrollTargets: results
			.map((r) => r.scrollTo)
			.filter((t): t is ScrollTarget => !!t),
	};
}

/**
 * If a snippet_replace result needs LLM self-correction, attempt it.
 * Uses the secondary LLM to produce a corrected search string, then retries exact match.
 */
async function maybeFixWithLLM(
	result: ProcessFunctionCallsResult,
	accumulatedText: string,
	transport?: LLMTransport
): Promise<ProcessFunctionCallsResult> {
	if (!result._needsLLMFix || !result._fixerParams || !transport) {
		return result;
	}

	const {
		instruction,
		failedSearchString,
		replacementString,
		errorMessage,
		documentHtml,
	} = result._fixerParams;

	const fixResult = await fixLLMEdit({
		instruction,
		failedSearchString,
		replacementString,
		errorMessage,
		documentHtml,
		transport,
	});

	if (fixResult.success && fixResult.correctedSearchString) {
		const correctedResult = tryReplaceExact(
			documentHtml,
			fixResult.correctedSearchString,
			replacementString
		);

		if (correctedResult !== null) {
			const toolUsageMessage = accumulatedText
				? `${accumulatedText}\n\n✅ *Document updated successfully.*`
				: '✅ *Document updated successfully.*';
			return {
				success: true,
				newHtml: correctedResult,
				toolUsageMessage,
				message: 'Snippet replacement succeeded (LLM self-correction).',
				scrollTo: { type: 'text', text: replacementString },
			};
		}
	}

	return {
		success: false,
		message:
			`The html_snippet_to_replace was not found in the document (tried exact, DOM, fuzzy, and LLM self-correction). ` +
			'Try using snippet_replace with the exact HTML copied from the document, ' +
			'or use full_replace with the complete updated document.',
	};
}

/**
 * Infer edit type from arguments when edit_type is not provided.
 */
function inferEditType(args: Record<string, unknown>): string {
	if (args.full_document_html !== undefined) return 'full_replace';
	return 'snippet_replace';
}

/**
 * Process a snippet-based replacement with 3-layer matching + LLM self-correction.
 *
 * Matching layers (in order):
 * 1. Exact string match
 * 2. DOM-based matching (handles whitespace, entity, attribute differences)
 * 3. Fuzzy regex fallback
 * 4. LLM self-correction (secondary LLM call to fix the search string)
 */
function processSnippetReplace(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string,
	accumulatedText: string,
	instruction?: string,
	transport?: LLMTransport
): ProcessFunctionCallsResult {
	const makeSuccess = (
		html: string,
		method: string
	): ProcessFunctionCallsResult => {
		const toolUsageMessage = accumulatedText
			? `${accumulatedText}\n\n✅ *Document updated successfully.*`
			: '✅ *Document updated successfully.*';
		return {
			success: true,
			newHtml: html,
			toolUsageMessage,
			message: `Snippet replacement succeeded (${method}).`,
			scrollTo: { type: 'text', text: replacementHtml },
		};
	};

	// Layer 1: Exact string match (fastest, most reliable when it works)
	const exactResult = tryReplaceExact(
		documentHtml,
		snippetToReplace,
		replacementHtml
	);
	if (exactResult !== null) {
		return makeSuccess(exactResult, 'exact match');
	}

	// Layer 2: DOM-based matching (handles whitespace, entity, attribute differences)
	const domResult = tryReplaceDom(
		documentHtml,
		snippetToReplace,
		replacementHtml
	);
	if (domResult.success) {
		console.log(`[processSnippetReplace] DOM editor: ${domResult.matchInfo}`);
		return makeSuccess(domResult.html, `DOM — ${domResult.matchInfo}`);
	}

	// Layer 3: Fuzzy regex fallback
	const fuzzyResult = tryReplaceFuzzy(
		documentHtml,
		snippetToReplace,
		replacementHtml
	);
	if (fuzzyResult !== null) {
		return makeSuccess(fuzzyResult, 'fuzzy match');
	}

	// Layer 4: LLM self-correction (async — returns a pending result that
	// the caller can await). Since processSingleEdit is synchronous,
	// we store the fixer params so the caller can attempt async correction.
	if (transport && instruction) {
		return {
			success: false,
			_needsLLMFix: true,
			_fixerParams: {
				instruction,
				failedSearchString: snippetToReplace,
				replacementString: replacementHtml,
				errorMessage: `Snippet not found after exact, DOM (${domResult.matchInfo}), and fuzzy matching.`,
				documentHtml,
			},
			message:
				`The html_snippet_to_replace was not found in the document (tried exact, DOM, and fuzzy matching). ` +
				`${domResult.matchInfo}. LLM self-correction will be attempted.`,
		} as ProcessFunctionCallsResult;
	}

	return {
		success: false,
		message:
			`The html_snippet_to_replace was not found in the document (tried exact, DOM, and fuzzy matching). ` +
			`${domResult.matchInfo}. ` +
			'Try using snippet_replace with the exact HTML from the document, ' +
			'or use full_replace with the complete updated document.',
	};
}

/**
 * Count question-like elements in HTML for validation.
 * Looks for patterns like <strong>N. or <li><strong> that indicate questions.
 */
function countQuestionElements(html: string): number {
	if (!html) return 0;
	const pStrongPattern =
		html.match(/<p[^>]*>\s*<strong[^>]*>\s*\d+\s*[:.)\-]/gi) || [];
	const liStrongPattern = html.match(/<li[^>]*>\s*<strong[^>]*>/gi) || [];
	return Math.max(pStrongPattern.length, liStrongPattern.length);
}

/**
 * Lightweight post-edit validation for full_replace.
 * Logs a warning if the question count changed unexpectedly.
 * Does NOT block the edit — version history provides undo.
 */
function validateFullReplace(beforeHtml: string, afterHtml: string): void {
	if (!beforeHtml || !afterHtml) return;

	const beforeCount = countQuestionElements(beforeHtml);
	const afterCount = countQuestionElements(afterHtml);

	if (beforeCount > 0 && afterCount === 0) {
		console.warn(
			`[validateFullReplace] ⚠️ All ${beforeCount} questions were removed. ` +
				'This may be unintentional. The user can undo via version history.'
		);
	} else if (
		beforeCount > 0 &&
		Math.abs(afterCount - beforeCount) > beforeCount * 0.5
	) {
		console.warn(
			`[validateFullReplace] ⚠️ Question count changed significantly: ${beforeCount} → ${afterCount}. ` +
				'Verify this was intentional.'
		);
	}
}
