export interface QaConfig {
	count: number;
	type: 'mixed' | 'multiple choice' | 'true/false' | 'short answer' | 'essay';
	difficulty: 'easy' | 'medium' | 'hard';
	instructions: string;
	apiKey?: string;
	model: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite';
}

export interface ChatConfig {
	model: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite';
}

export interface ChatMessage {
	role: 'user' | 'model' | 'system'; // System role added for internal messages
	content: string;
	sources?: GroundingSource[];
}

export interface GroundingSource {
	uri: string;
	title: string;
}

export type DownloadFormat = 'pdf' | 'txt' | 'docx' | 'md';

export interface DocumentVersion {
	id: string;
	timestamp: number;
	content: string;
	reason: string;
}
