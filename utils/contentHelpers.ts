/**
 * Strips markdown code block wrappers from HTML content.
 * Handles various formats of code blocks that might wrap HTML output.
 *
 * @param content - The content that may contain code block wrappers
 * @returns The content with code block wrappers removed
 */
export const stripCodeBlockWrappers = (content: string): string => {
	if (!content || typeof content !== 'string') {
		return content;
	}

	let cleaned = content.trim();

	// Pattern 1: ```html ... ``` (with html language tag)
	const htmlCodeBlockPattern = /^```\s*html\s*\n([\s\S]*?)\n```\s*$/;
	if (htmlCodeBlockPattern.test(cleaned)) {
		cleaned = cleaned.replace(htmlCodeBlockPattern, '$1');
	}

	// Pattern 2: ``` ... ``` (generic code block without language)
	// This is more permissive - only match if content starts with HTML tags after stripping
	const genericCodeBlockPattern = /^```\s*(?:[a-zA-Z]+)?\s*\n([\s\S]*?)\n```\s*$/;
	if (genericCodeBlockPattern.test(cleaned)) {
		const extracted = cleaned.replace(genericCodeBlockPattern, '$1');
		// Only use this if the extracted content looks like HTML (starts with <)
		if (extracted.trim().startsWith('<')) {
			cleaned = extracted;
		}
	}

	// Pattern 3: Handle cases where code blocks might have trailing/leading whitespace
	// Match ```html followed by newline and content, ending with ``` and optional whitespace
	const looseHtmlPattern = /^[\s\n]*```\s*html\s*[\n\r]+([\s\S]*?)[\n\r]+\```[\s\n]*$/;
	if (looseHtmlPattern.test(cleaned)) {
		cleaned = cleaned.replace(looseHtmlPattern, '$1');
	}

	// Pattern 4: Handle cases where there might be no language tag but content is HTML
	const looseGenericPattern = /^[\s\n]*```\s*[\n\r]+([\s\S]*?)[\n\r]+\```[\s\n]*$/;
	if (looseGenericPattern.test(cleaned)) {
		const extracted = cleaned.replace(looseGenericPattern, '$1').trim();
		// Only strip if it looks like HTML content
		if (extracted.startsWith('<') && extracted.includes('</')) {
			cleaned = extracted;
		}
	}

	return cleaned.trim();
};

