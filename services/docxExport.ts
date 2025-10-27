import { asBlob } from 'html-docx-js-typescript';

interface DocxExportOptions {
	title?: string;
}

/**
 * Converts HTML content to DOCX format with high quality formatting
 * @param htmlContent - HTML string from TinyMCE editor
 * @param options - Export options including title
 * @returns Blob ready for file download
 */
export async function htmlToDocx(
	htmlContent: string,
	options: DocxExportOptions = { title: 'ai-document' }
): Promise<Blob> {
	// Clean up HTML - remove any TinyMCE-specific classes or attributes
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = htmlContent;

	// Remove data-mce-* attributes and mce-* classes
	const allElements = tempDiv.querySelectorAll('*');
	allElements.forEach((el) => {
		const htmlEl = el as HTMLElement;
		// Remove data-mce attributes
		Array.from(htmlEl.attributes).forEach((attr) => {
			if (attr.name.startsWith('data-mce-')) {
				htmlEl.removeAttribute(attr.name);
			}
		});
		// Clean up classes
		if (htmlEl.className) {
			htmlEl.className = htmlEl.className
				.split(' ')
				.filter((cls) => !cls.startsWith('mce-'))
				.join(' ');
		}
	});

	const cleanedHtml = tempDiv.innerHTML;

	// Use html-docx-js-typescript for better HTML to DOCX conversion
	const HTMLtoDOCXOptions = {
		margins: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5 inch margins
	};

	const result = await asBlob(cleanedHtml, HTMLtoDOCXOptions);
	// asBlob can return Blob or Buffer, ensure we return a Blob
	const docxBlob =
		result instanceof Blob ? result : new Blob([result as BlobPart]);
	return docxBlob;
}
