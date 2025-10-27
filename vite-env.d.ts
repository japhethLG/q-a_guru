/// <reference types="vite/client" />

declare global {
	interface Window {
		tinymce?: {
			licenseKey?: string;
		};
	}
}

export {};

interface ImportMetaEnv {
	readonly VITE_GEMINI_API_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
