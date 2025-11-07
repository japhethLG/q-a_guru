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
	model: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite';
	selectedTemplateId?: string;
}

export interface ChatConfig {
	model: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite';
}

export interface ChatMessage {
	role: 'user' | 'model' | 'system'; // System role added for internal messages
	content: string;
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