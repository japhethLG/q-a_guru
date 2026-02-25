export const VITE_GOTENBERG_URL =
	import.meta.env.VITE_GOTENBERG_URL ||
	'https://bigclawdproxy.crabdance.com/gotenberg';

/**
 * Converts a supported document type (DOCX, PPTX, etc.) to a native PDF File
 * by sending it to a Gotenberg instance via a multipart form request.
 */
export async function convertToPdf(
	file: File,
	filenameOverride?: string
): Promise<File> {
	if (!VITE_GOTENBERG_URL) {
		throw new Error('VITE_GOTENBERG_URL is not configured.');
	}

	const formData = new FormData();
	// Gotenberg expects 'files' as the field name.
	formData.append('files', file);

	const maxAttempts = 3;
	let attempt = 0;
	let lastError: any = null;

	while (attempt < maxAttempts) {
		attempt++;
		try {
			const response = await fetch(
				`${VITE_GOTENBERG_URL}/forms/libreoffice/convert`,
				{
					method: 'POST',
					body: formData,
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Gotenberg conversion failed: ${response.status} ${response.statusText} - ${errorText}`
				);
			}

			const blob = await response.blob();

			// Retain original filename but change the extension to .pdf
			let originalName = file.name;
			const lastDotIndex = originalName.lastIndexOf('.');
			if (lastDotIndex > 0) {
				originalName = originalName.substring(0, lastDotIndex);
			}
			const pdfFilename = filenameOverride || `${originalName}.pdf`;

			// Return a natively typed File object containing the PDF data
			return new File([blob], pdfFilename, { type: 'application/pdf' });
		} catch (error) {
			lastError = error;
			console.warn(`Gotenberg convertToPdf attempt ${attempt} failed:`, error);
			if (attempt < maxAttempts) {
				// Wait a short delay before retrying (exponential optionally)
				await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
			}
		}
	}

	console.error('All Gotenberg convertToPdf attempts failed.');
	throw lastError;
}
