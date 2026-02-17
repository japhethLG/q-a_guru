/**
 * DOM-based document editor with scored candidate matching.
 *
 * Replaces the fragile exact/fuzzy string matching in htmlReplace.ts
 * with a DOMParser-based approach that matches on text content rather
 * than raw HTML strings. This handles whitespace, attribute order,
 * and entity encoding differences that cause string matching to fail.
 */

export interface DomEditResult {
	html: string;
	success: boolean;
	matchInfo: string;
}

interface ScoredCandidate {
	element: Element;
	score: number;
	matchType: string;
}

/**
 * Normalize text for comparison: collapse whitespace, decode entities, lowercase.
 */
function normalizeText(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * Extract plain text content from an HTML string.
 */
function htmlToText(html: string): string {
	const temp = new DOMParser().parseFromString(html, 'text/html');
	return temp.body.textContent || '';
}

/**
 * Find the best matching element in the document for a given snippet.
 *
 * Strategy:
 * 1. Parse document as DOM
 * 2. Walk all block-level elements
 * 3. Score each by text similarity to the search snippet
 * 4. Use context clues (surrounding text, question numbers) to disambiguate
 */
function findBestMatch(
	doc: Document,
	snippetText: string,
	snippetHtml: string
): ScoredCandidate | null {
	const normalizedSnippet = normalizeText(snippetText);
	if (!normalizedSnippet) return null;

	const candidates: ScoredCandidate[] = [];

	// Walk block-level elements that could be replacement targets
	const blockElements = doc.body.querySelectorAll(
		'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr, section, article'
	);

	for (const element of blockElements) {
		const elementText = normalizeText(element.textContent || '');
		if (!elementText) continue;

		let score = 0;
		let matchType = '';

		// Exact text match (strongest signal)
		if (elementText === normalizedSnippet) {
			score += 10;
			matchType = 'exact-text';
		}
		// Element text contains the snippet
		else if (elementText.includes(normalizedSnippet)) {
			score += 6;
			matchType = 'contains';
		}
		// Snippet contains the element text (snippet spans multiple elements)
		else if (normalizedSnippet.includes(elementText)) {
			score += 3;
			matchType = 'partial';
		}
		// Significant word overlap
		else {
			const snippetWords = new Set(
				normalizedSnippet.split(' ').filter((w) => w.length > 2)
			);
			const elementWords = new Set(
				elementText.split(' ').filter((w) => w.length > 2)
			);
			const overlap = [...snippetWords].filter((w) => elementWords.has(w)).length;
			const overlapRatio = snippetWords.size > 0 ? overlap / snippetWords.size : 0;

			if (overlapRatio > 0.7) {
				score += Math.round(overlapRatio * 5);
				matchType = 'word-overlap';
			}
		}

		if (score > 0) {
			// Bonus: prefer elements whose HTML structure also matches
			const elementHtml = element.outerHTML;
			if (elementHtml.includes(snippetHtml.trim())) {
				score += 3;
				matchType += '+html';
			}

			// Bonus: prefer elements at the right nesting level (not too deep)
			let depth = 0;
			let parent = element.parentElement;
			while (parent && parent !== doc.body) {
				depth++;
				parent = parent.parentElement;
			}
			if (depth <= 2) score += 1;

			candidates.push({ element, score, matchType });
		}
	}

	if (candidates.length === 0) return null;

	// Sort by score descending
	candidates.sort((a, b) => b.score - a.score);

	return candidates[0];
}

/**
 * Find the best matching parent container that wraps multiple elements
 * matching the snippet (for multi-element snippets like a full Q&A block).
 */
function findContainerMatch(
	doc: Document,
	snippetText: string
): ScoredCandidate | null {
	const normalizedSnippet = normalizeText(snippetText);
	if (!normalizedSnippet) return null;

	// Check containers (divs, sections, etc.)
	const containers = doc.body.querySelectorAll(
		'div, section, article, blockquote'
	);
	const candidates: ScoredCandidate[] = [];

	for (const container of containers) {
		const containerText = normalizeText(container.textContent || '');
		if (!containerText) continue;

		// Container text should closely match snippet text
		if (containerText === normalizedSnippet) {
			candidates.push({
				element: container,
				score: 12,
				matchType: 'container-exact',
			});
		} else if (
			containerText.includes(normalizedSnippet) &&
			containerText.length < normalizedSnippet.length * 1.5
		) {
			// Container is slightly larger than snippet but close
			candidates.push({
				element: container,
				score: 8,
				matchType: 'container-close',
			});
		}
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0];
}

/**
 * Replace a snippet in the document using DOM-based matching.
 *
 * This is the main entry point — call this instead of tryReplaceExact/tryReplaceFuzzy.
 *
 * @param documentHtml - The full document HTML
 * @param snippetToReplace - The HTML snippet the AI wants to replace
 * @param replacementHtml - The new HTML to insert
 * @returns Edit result with success status and match info
 */
export function tryReplaceDom(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string
): DomEditResult {
	if (!documentHtml || !snippetToReplace) {
		return { html: documentHtml, success: false, matchInfo: 'Missing input' };
	}

	const doc = new DOMParser().parseFromString(documentHtml, 'text/html');
	const snippetText = htmlToText(snippetToReplace);

	// Strategy 1: Try to find a container that wraps the full snippet
	const containerMatch = findContainerMatch(doc, snippetText);
	if (containerMatch && containerMatch.score >= 8) {
		const temp = new DOMParser().parseFromString(replacementHtml, 'text/html');
		const newNodes = Array.from(temp.body.childNodes);

		containerMatch.element.replaceWith(...newNodes);

		return {
			html: doc.body.innerHTML,
			success: true,
			matchInfo: `Container match (${containerMatch.matchType}, score: ${containerMatch.score})`,
		};
	}

	// Strategy 2: Find best matching single element
	const bestMatch = findBestMatch(doc, snippetText, snippetToReplace);
	if (bestMatch && bestMatch.score >= 5) {
		const temp = new DOMParser().parseFromString(replacementHtml, 'text/html');
		const newNodes = Array.from(temp.body.childNodes);

		bestMatch.element.replaceWith(...newNodes);

		return {
			html: doc.body.innerHTML,
			success: true,
			matchInfo: `Element match (${bestMatch.matchType}, score: ${bestMatch.score})`,
		};
	}

	// Strategy 3: Fall back to text-node level replacement for inline content
	const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
	const normalizedSnippet = normalizeText(snippetText);
	let node: Node | null;

	while ((node = walker.nextNode())) {
		const nodeText = normalizeText(node.textContent || '');
		if (nodeText.includes(normalizedSnippet)) {
			const parentElement = node.parentElement;
			if (parentElement) {
				const temp = new DOMParser().parseFromString(replacementHtml, 'text/html');
				const newNodes = Array.from(temp.body.childNodes);
				parentElement.replaceWith(...newNodes);

				return {
					html: doc.body.innerHTML,
					success: true,
					matchInfo: `Text-node match in <${parentElement.tagName.toLowerCase()}>`,
				};
			}
		}
	}

	return {
		html: documentHtml,
		success: false,
		matchInfo: bestMatch
			? `Best candidate scored ${bestMatch.score} (below threshold of 5)`
			: 'No matching text found in document',
	};
}
