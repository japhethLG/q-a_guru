export function tryReplaceExact(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string
): string | null {
	if (!documentHtml || !snippetToReplace) return null;
	if (documentHtml.includes(snippetToReplace)) {
		return documentHtml.replace(snippetToReplace, replacementHtml);
	}
	return null;
}

function normalizeHtml(html: string): string {
	// Remove tags, collapse whitespace, lowercase
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

export function tryReplaceFuzzy(
	documentHtml: string,
	snippetToReplace: string,
	replacementHtml: string
): string | null {
	if (!documentHtml || !snippetToReplace) return null;

	const normalizedDoc = normalizeHtml(documentHtml);
	const normalizedSnippet = normalizeHtml(snippetToReplace);

	if (!normalizedSnippet) return null;

	// Try to locate by first 50 chars of normalized snippet
	const anchor = normalizedSnippet.substring(0, 50);
	const startIndex = normalizedDoc.indexOf(anchor);

	if (startIndex === -1) {
		return null;
	}

	// Build a relaxed regex from the original snippet allowing flexible whitespace and tag variations
	const escaped = snippetToReplace
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
		.replace(/\s+/g, '\\s*') // flexible whitespace
		.replace(/</g, '<')
		.replace(/>/g, '>');

	const relaxed = new RegExp(escaped, 'i');
	const match = documentHtml.match(relaxed);
	if (match && match[0]) {
		return documentHtml.replace(match[0], replacementHtml);
	}

	return null;
}
