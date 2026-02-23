// Add declarations for CDN libraries to satisfy TypeScript
declare const JSZip: any;
import mammoth from 'mammoth';
import JSZipImport from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { DocumentAttachment } from '../types';
import { countTokensForAttachment } from './tokenCounter';
import { convertToPdf } from './gotenberg';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min?url';

export const parseTxt = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			resolve(event.target?.result as string);
		};
		reader.onerror = (error) => {
			reject(error);
		};
		reader.readAsText(file);
	});
};

export const parseDocx = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const arrayBuffer = event.target?.result as ArrayBuffer;
			if (arrayBuffer) {
				mammoth
					.extractRawText({ arrayBuffer })
					.then((result: any) => {
						resolve(result.value);
					})
					.catch(reject);
			} else {
				reject(new Error('Failed to read DOCX file.'));
			}
		};
		reader.onerror = (error) => {
			reject(error);
		};
		reader.readAsArrayBuffer(file);
	});
};

export const parsePptx = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const arrayBuffer = event.target?.result;
				if (!arrayBuffer) {
					return reject(new Error('Failed to read PPTX file.'));
				}
				const zip = await JSZipImport.loadAsync(arrayBuffer);
				const slideFiles = Object.keys(zip.files).filter(
					(name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
				);

				let fullText = '';

				for (const slideFileName of slideFiles) {
					const slideContent = await zip.file(slideFileName).async('string');
					// A simple regex to extract text from <a:t> tags. This is fragile but avoids a full XML parser.
					const textNodes = slideContent.match(/<a:t>.*?<\/a:t>/g) || [];
					const slideText = textNodes
						.map((node) => {
							return node.replace(/<a:t>/, '').replace(/<\/a:t>/, '');
						})
						.join(' ');
					fullText += slideText + '\n\n';
				}

				resolve(fullText.trim());
			} catch (err) {
				reject(err);
			}
		};
		reader.onerror = reject;
		reader.readAsArrayBuffer(file);
	});
};

// Configure pdf.js worker
// Use Vite's ?url import to get the correct worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const parsePdf = async (file: File): Promise<string> => {
	const arrayBuffer = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
	let textContent = '';

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const text = await page.getTextContent();
		textContent += text.items.map((item: any) => item.str).join(' ');
		textContent += '\n\n';
	}

	return textContent;
};

export const parseFile = async (file: File): Promise<string> => {
	const extension = file.name.split('.').pop()?.toLowerCase();
	switch (extension) {
		case 'txt':
			return parseTxt(file);
		case 'docx':
			return parseDocx(file);
		case 'pptx':
			return parsePptx(file);
		case 'pdf':
			return parsePdf(file);
		default:
			throw new Error(`Unsupported file type: ${extension}`);
	}
};

/**
 * Helper to process a PDF File into a native DocumentAttachment.
 */
const createPdfAttachment = async (
	pdfFile: File,
	originalFileName: string
): Promise<DocumentAttachment> => {
	const arrayBuffer = await pdfFile.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
	const base64 = await fileToBase64(pdfFile);
	return {
		fileName: originalFileName,
		type: 'native',
		rawBase64: base64,
		mimeType: 'application/pdf',
		totalPages: pdf.numPages,
	};
};

/**
 * Parse a file into a DocumentAttachment for the new context pipeline.
 * PDFs are stored as native binary (base64) for direct LLM consumption.
 * Other types are parsed to text.
 */
export const parseFileToAttachment = async (
	file: File
): Promise<DocumentAttachment> => {
	const extension = file.name.split('.').pop()?.toLowerCase();
	let doc: DocumentAttachment;

	switch (extension) {
		case 'pdf': {
			// Native handoff — store raw bytes as base64
			doc = await createPdfAttachment(file, file.name);
			break;
		}
		case 'txt': {
			const text = await parseTxt(file);
			doc = {
				fileName: file.name,
				type: 'text',
				mimeType: 'text/plain',
				parsedText: text,
			};
			break;
		}
		case 'docx': {
			const pdfFile = await convertToPdf(file);
			doc = await createPdfAttachment(pdfFile, file.name);
			break;
		}
		case 'pptx': {
			const pdfFile = await convertToPdf(file);
			doc = await createPdfAttachment(pdfFile, file.name);
			break;
		}
		default:
			throw new Error(`Unsupported file type: ${extension}`);
	}

	doc.tokenCount = await countTokensForAttachment(doc);
	return doc;
};

export const fileToBase64 = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => {
			const result = reader.result as string;
			// remove the "data:*/*;base64," prefix
			resolve(result.split(',')[1]);
		};
		reader.onerror = (error) => reject(error);
	});
};
