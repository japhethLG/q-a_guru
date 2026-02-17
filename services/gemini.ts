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
import {
	parseQuestions,
	rebuildDocument,
	updateQuestionField,
	renumberQuestions,
	summarizeDocument,
} from './documentParser';
import { getTemplateById } from './templateStorage';
import { buildContextBudget, truncateSourceDocuments } from './contextManager';
import { getOrCreateCache } from './geminiCache';

/**
 * Generates questions and answers based on provided documents and configuration.
 * Returns an async generator that yields streaming responses.
 */
export const generateQaStream = async function* (
	documents: string[],
	config: QaConfig,
	apiKey?: string,
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

	// Get template if selected
	const selectedTemplate = config.selectedTemplateId
		? getTemplateById(config.selectedTemplateId)
		: null;

	// Build config with template
	const promptConfig = {
		count: config.count,
		type: config.type,
		difficulty: config.difficulty,
		instructions: config.instructions,
		...(selectedTemplate && {
			template: {
				templateString: selectedTemplate.templateString,
			},
		}),
	};

	const prompt = prompts.getQAPrompt(documents, promptConfig);

	try {
		// Use generateContentStream for streaming responses
		const response = ai.models.generateContentStream({
			// Use model from config
			model: config.model,
			contents: prompt,
		});

		for await (const chunk of await response) {
			if (signal?.aborted) {
				break;
			}
			yield chunk;
		}
	} catch (error) {
		// Check if it was an abort error
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.error('Error generating Q&A:', error);
		throw error;
	}
};

/**
 * Analyzes an image with a user-provided prompt.
 */
export const analyzeImage = async (
	base64ImageData: string,
	mimeType: string,
	prompt: string,
	apiKey?: string
): Promise<string> => {
	try {
		const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
		const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

		const imagePart = {
			inlineData: {
				data: base64ImageData,
				mimeType: mimeType,
			},
		};

		const textPart = {
			text: prompt,
		};

		// Per guidelines, use generateContent for multimodal input.
		const response = await ai.models.generateContent({
			// 'gemini-2.5-flash' is a suitable model for multimodal chat.
			model: 'gemini-2.5-flash',
			contents: { parts: [imagePart, textPart] },
		});

		// Per guidelines, extract text output via the .text property.
		return response.text;
	} catch (error) {
		console.error('Error analyzing image:', error);
		return 'An error occurred during analysis. Please check the console for details.';
	}
};

const editDocumentTool: FunctionDeclaration = {
	name: 'edit_document',
	description:
		'Edits the document content. Choose the most appropriate edit_type for the task. Prefer semantic types (edit_question, add_questions, delete_question) for Q&A content.',
	parameters: {
		type: Type.OBJECT,
		properties: {
			edit_type: {
				type: Type.STRING,
				description:
					'The type of edit: "edit_question" to change a specific question field, "add_questions" to insert new questions, "delete_question" to remove a question, "edit_section" for non-Q&A content, "snippet_replace" for targeted HTML replacement, "full_replace" for complete document rewrite.',
			},
			question_number: {
				type: Type.NUMBER,
				description:
					'For edit_question/delete_question: the 1-based question number to target. For add_questions with position before/after: the reference question number.',
			},
			field: {
				type: Type.STRING,
				description:
					'For edit_question: which field to edit. Values: "question_text", "answer", "reference", "full_question".',
			},
			new_content: {
				type: Type.STRING,
				description:
					'The new content for the targeted field or section. For edit_question: the new text. For add_questions: the complete HTML for new question(s). For edit_section: the replacement HTML.',
			},
			position: {
				type: Type.STRING,
				description:
					'For add_questions: where to insert. Values: "before", "after", "beginning", "end".',
			},
			full_document_html: {
				type: Type.STRING,
				description:
					'For full_replace only: the complete new HTML content for the entire document.',
			},
			html_snippet_to_replace: {
				type: Type.STRING,
				description:
					'For snippet_replace only: an exact HTML snippet from the current document to find and replace.',
			},
			replacement_html: {
				type: Type.STRING,
				description:
					'For snippet_replace only: the new HTML to replace the snippet with. Use empty string to delete.',
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

// Reuse AI client when API key hasn't changed
let cachedAiClient: { ai: GoogleGenAI; apiKey: string } | null = null;

function getAiClient(apiKey: string): GoogleGenAI {
	if (cachedAiClient && cachedAiClient.apiKey === apiKey) {
		return cachedAiClient.ai;
	}
	const ai = new GoogleGenAI({ apiKey });
	cachedAiClient = { ai, apiKey };
	return ai;
}

/**
 * Handles chat interactions, providing context and tools to the AI.
 * Returns an async generator that yields streaming responses.
 *
 * Attempts to use Gemini context caching for the system instruction,
 * source documents, and tools. Falls back to uncached mode on any error.
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
	signal?: AbortSignal
): AsyncGenerator<GenerateContentResponse, void, unknown> {
	const effectiveApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
	const ai = getAiClient(effectiveApiKey);

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

	// --- Try context caching (system instruction + source docs + tools) ---
	const cacheName = await getOrCreateCache({
		ai,
		model,
		systemInstruction: baseSystemInstruction,
		sourceDocuments: trimmedSourceDocs,
		tools,
		apiKey: effectiveApiKey,
	});

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

		const response = ai.models.generateContentStream({
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
	toolResponse?: string; // For non-edit tools like read_document
	message: string; // Descriptive result for retry feedback
	scrollTo?: ScrollTarget;
	scrollTargets?: ScrollTarget[]; // For multiple edits
};

/**
 * Process a single edit_document call against the given HTML.
 * Returns the result with updated HTML (if successful).
 */
function processSingleEdit(
	args: Record<string, unknown>,
	documentHtml: string,
	accumulatedText: string
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
		case 'edit_question': {
			const questionNumber = args.question_number as number;
			const field = args.field as string;
			const newContent = args.new_content as string;

			if (!questionNumber || !field || newContent === undefined) {
				return {
					success: false,
					message:
						'edit_question requires question_number, field, and new_content. ' +
						'Please provide all three parameters.',
				};
			}

			const parseResult = parseQuestions(documentHtml);
			const targetQuestion = parseResult.questions.find(
				(q) => q.number === questionNumber
			);

			if (!targetQuestion) {
				return {
					success: false,
					message:
						`Question ${questionNumber} not found in the document. ` +
						`The document has ${parseResult.questions.length} question(s): ` +
						`${parseResult.questions.map((q) => q.number).join(', ')}. ` +
						`Please use a valid question number, or use read_document to inspect the document.`,
				};
			}

			const updatedQuestion = updateQuestionField(
				targetQuestion,
				field,
				newContent
			);

			// Check if the field was actually updated
			if (
				updatedQuestion.fullHtml === targetQuestion.fullHtml &&
				field !== 'full_question'
			) {
				return {
					success: false,
					message:
						`Could not locate the "${field}" field in question ${questionNumber}. ` +
						`The question text is: "${targetQuestion.questionText}". ` +
						`Try using field "full_question" with the complete HTML for this question, ` +
						`or use snippet_replace/full_replace as a fallback.`,
				};
			}

			const updatedQuestions = parseResult.questions.map((q) =>
				q.number === questionNumber ? updatedQuestion : q
			);
			const newHtml = rebuildDocument(documentHtml, parseResult, updatedQuestions);
			const result = successMessage(
				`Updated ${field} of question ${questionNumber}.`
			);
			result.newHtml = newHtml;
			result.scrollTo = { type: 'question', number: questionNumber };
			return result;
		}

		case 'add_questions': {
			const newContent = args.new_content as string;
			const position = (args.position as string) || 'end';
			const refNumber = args.question_number as number | undefined;

			if (!newContent) {
				return {
					success: false,
					message:
						'add_questions requires new_content with the HTML for new question(s).',
				};
			}

			const parseResult = parseQuestions(documentHtml);

			let insertIndex: number;
			switch (position) {
				case 'beginning':
					insertIndex = 0;
					break;
				case 'before':
					if (refNumber) {
						insertIndex = parseResult.questions.findIndex(
							(q) => q.number === refNumber
						);
						if (insertIndex === -1) insertIndex = 0;
					} else {
						insertIndex = 0;
					}
					break;
				case 'after':
					if (refNumber) {
						insertIndex =
							parseResult.questions.findIndex((q) => q.number === refNumber) + 1;
						if (insertIndex === 0) insertIndex = parseResult.questions.length;
					} else {
						insertIndex = parseResult.questions.length;
					}
					break;
				case 'end':
				default:
					insertIndex = parseResult.questions.length;
					break;
			}

			// Parse the new content to get new questions
			const newQuestionsParsed = parseQuestions(newContent);
			if (newQuestionsParsed.questions.length > 0) {
				// Insert parsed questions and renumber
				const updatedQuestions = [...parseResult.questions];
				updatedQuestions.splice(insertIndex, 0, ...newQuestionsParsed.questions);
				const renumbered = renumberQuestions(updatedQuestions);
				const newHtml = rebuildDocument(documentHtml, parseResult, renumbered);
				const result = successMessage(
					`Added ${newQuestionsParsed.questions.length} question(s) at position "${position}".`
				);
				result.newHtml = newHtml;

				// Scroll to the first added question
				const firstNewQuestionNumber =
					position === 'beginning'
						? 1
						: position === 'before' && refNumber
							? refNumber
							: position === 'after' && refNumber
								? refNumber + 1
								: parseResult.questions.length + 1;

				result.scrollTo = { type: 'question', number: firstNewQuestionNumber };
				return result;
			} else {
				// New content didn't parse as questions — insert raw HTML
				// After inserting, renumber all questions in the combined document
				if (insertIndex === 0) {
					const result = successMessage('Inserted content at the beginning.');
					result.newHtml = renumberFullDocument(newContent + '\n' + documentHtml);
					return result;
				} else if (insertIndex >= parseResult.questions.length) {
					const result = successMessage('Inserted content at the end.');
					result.newHtml = renumberFullDocument(documentHtml + '\n' + newContent);
					return result;
				} else {
					const insertPos = parseResult.questions[insertIndex].startIndex;
					const result = successMessage('Inserted content.');
					const combined =
						documentHtml.substring(0, insertPos) +
						newContent +
						'\n' +
						documentHtml.substring(insertPos);
					result.newHtml = renumberFullDocument(combined);
					return result;
				}
			}
		}

		case 'delete_question': {
			const questionNumber = args.question_number as number;

			if (!questionNumber) {
				return {
					success: false,
					message: 'delete_question requires question_number.',
				};
			}

			const parseResult = parseQuestions(documentHtml);
			const targetIndex = parseResult.questions.findIndex(
				(q) => q.number === questionNumber
			);

			if (targetIndex === -1) {
				return {
					success: false,
					message:
						`Question ${questionNumber} not found. ` +
						`The document has questions: ${parseResult.questions.map((q) => q.number).join(', ')}.`,
				};
			}

			const updatedQuestions = parseResult.questions.filter(
				(q) => q.number !== questionNumber
			);
			const renumbered = renumberQuestions(updatedQuestions);
			const newHtml = rebuildDocument(documentHtml, parseResult, renumbered);
			const result = successMessage(
				`Deleted question ${questionNumber}. Remaining questions renumbered.`
			);
			result.newHtml = newHtml;
			// Scroll to previous question or top
			result.scrollTo =
				questionNumber > 1
					? { type: 'question', number: questionNumber - 1 }
					: { type: 'top' };
			return result;
		}

		case 'edit_section': {
			const newContent = args.new_content as string;
			const snippetToReplace = args.html_snippet_to_replace as string;

			if (snippetToReplace && newContent !== undefined) {
				// Use snippet replace for section editing
				return processSnippetReplace(
					documentHtml,
					snippetToReplace,
					newContent,
					accumulatedText
				);
			}
			return {
				success: false,
				message: 'edit_section requires html_snippet_to_replace and new_content.',
			};
		}

		case 'full_replace': {
			const fullHtml = args.full_document_html as string;
			if (fullHtml !== undefined && typeof fullHtml === 'string') {
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

			// Support legacy calls without edit_type
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
					accumulatedText
				);
				if (res.success) {
					res.scrollTo = { type: 'text', text: replacementHtml };
				}
				return res;
			}

			return {
				success: false,
				message:
					'Invalid arguments. For snippet_replace provide html_snippet_to_replace + replacement_html. ' +
					'For Q&A edits, prefer edit_question with question_number and field. ' +
					'For full rewrites, use full_replace with full_document_html.',
			};
		}
	}
}

export function processFunctionCalls(params: {
	functionCalls: any[] | undefined;
	documentHtml: string;
	accumulatedText: string;
}): ProcessFunctionCallsResult {
	const { functionCalls, documentHtml, accumulatedText } = params;

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
		return processSingleEdit(
			editCalls[0].args as Record<string, unknown>,
			documentHtml,
			accumulatedText
		);
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
		// Don't include accumulatedText in individual edit messages — we compose it at the end
		const result = processSingleEdit(args, currentHtml, '');

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
			// Continue processing remaining edits — don't abort on partial failure
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
		// If multiple edits, collect all successful targets
		scrollTargets: results
			.map((r) => r.scrollTo)
			.filter((t): t is ScrollTarget => !!t),
	};
}

/**
 * Infer legacy edit type from arguments when edit_type is not provided.
 */
function inferEditType(args: Record<string, unknown>): string {
	if (args.full_document_html !== undefined) return 'full_replace';
	if (args.html_snippet_to_replace) return 'snippet_replace';
	if (args.new_content && args.position) return 'add_questions';
	if (args.question_number && args.field) return 'edit_question';
	if (args.question_number && !args.field && !args.new_content)
		return 'delete_question';
	return 'snippet_replace';
}

/**
 * Re-parse the full document HTML and renumber all questions sequentially.
 * Used as a safety net when raw HTML is inserted and the structured
 * parse → splice → renumber path couldn't be used.
 */
function renumberFullDocument(html: string): string {
	const parsed = parseQuestions(html);
	if (parsed.questions.length === 0) return html;

	const renumbered = renumberQuestions(parsed.questions);
	return rebuildDocument(html, parsed, renumbered);
}

/**
 * Process a snippet-based replacement (exact then fuzzy fallback).
 */
function processSnippetReplace(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string,
	accumulatedText: string
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

	// Layer 3: Fuzzy regex fallback (last resort)
	const fuzzyResult = tryReplaceFuzzy(
		documentHtml,
		snippetToReplace,
		replacementHtml
	);
	if (fuzzyResult !== null) {
		return makeSuccess(fuzzyResult, 'fuzzy match');
	}

	return {
		success: false,
		message:
			`The html_snippet_to_replace was not found in the document (tried exact, DOM, and fuzzy matching). ` +
			`${domResult.matchInfo}. ` +
			'Try using semantic edit types instead: ' +
			'(1) edit_question with question_number and field, ' +
			'(2) delete_question with question_number, ' +
			'(3) full_replace with full_document_html.',
	};
}
