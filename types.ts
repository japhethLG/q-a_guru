export type QuestionType =
	| 'mixed'
	| 'multiple choice'
	| 'true/false'
	| 'short answer'
	| 'essay';

export interface QuestionTemplate {
	id: string;
	name: string;
	questionType: QuestionType;
	templateString: string;
	isDefault?: boolean;
}

export interface QaConfig {
	count: number;
	type: QuestionType;
	difficulty: 'easy' | 'medium' | 'hard';
	instructions: string;
	apiKey?: string;
	model: string;
	selectedTemplateId?: string;
}

export interface ChatConfig {
	model: string;
}

export interface ImageAttachment {
	data: string; // base64-encoded image data
	mimeType: string; // e.g. "image/png", "image/jpeg", "image/webp"
	name?: string; // original file name
	tokenCount?: number; // actual token count from API
}

export interface DocumentAttachment {
	fileName: string;
	type: 'native' | 'text';
	rawBase64?: string; // base64-encoded binary data (for native PDFs)
	mimeType: string; // e.g. "application/pdf", "text/plain"
	parsedText?: string; // extracted text (for text-type attachments)
	totalPages?: number; // page count (for PDFs)
	tokenCount?: number; // actual token count from countTokens API
}

export interface ChatMessage {
	role: 'user' | 'model' | 'system'; // System role added for internal messages
	content: string;
	images?: ImageAttachment[]; // Inline image attachments
	thinking?: string; // Thinking tokens from Gemini
	thinkingStartTime?: number; // Timestamp when thinking started
	sources?: GroundingSource[];
}

export interface GroundingSource {
	uri: string;
	title: string;
}

export type DownloadFormat = 'txt' | 'docx' | 'md';

export interface DocumentVersion {
	id: string;
	timestamp: number;
	content: string;
	reason: string;
}

export interface SelectionMetadata {
	selectedText: string;
	selectedHtml: string;
	startLine: number;
	endLine: number;
	startOffset: number;
	endOffset: number;
	contextBefore?: string; // 100 chars before selection
	contextAfter?: string; // 100 chars after selection
}

export type ScrollTarget =
	| { type: 'question'; number: number }
	| { type: 'text'; text: string }
	| { type: 'top' };

export interface ProviderConfig {
	type: 'gemini-sdk' | 'antigravity-proxy';
	apiKey?: string;
	baseUrl?: string;
}
