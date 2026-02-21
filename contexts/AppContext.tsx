import React, {
	createContext,
	useContext,
	useState,
	useMemo,
	useEffect,
	ReactNode,
} from 'react';
import {
	QaConfig,
	DocumentVersion,
	SelectionMetadata,
	ProviderConfig,
	DocumentAttachment,
} from '../types';
import {
	getActiveTemplate,
	getTemplateById,
} from '../services/templateStorage';
import { LLMTransport, createTransport } from '../services/llmTransport';

interface AppContextType {
	// Files state
	files: File[];
	setFiles: React.Dispatch<React.SetStateAction<File[]>>;
	documentsContent: DocumentAttachment[];
	setDocumentsContent: React.Dispatch<
		React.SetStateAction<DocumentAttachment[]>
	>;

	// Q&A Config state
	qaConfig: QaConfig;
	setQaConfig: React.Dispatch<React.SetStateAction<QaConfig>>;

	// Editor state
	editorContent: string;
	setEditorContent: React.Dispatch<React.SetStateAction<string>>;
	selectedText: SelectionMetadata | null;
	setSelectedText: React.Dispatch<
		React.SetStateAction<SelectionMetadata | null>
	>;
	isEditorDirty: boolean;
	setIsEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;

	// Version history state
	versionHistory: DocumentVersion[];
	setVersionHistory: React.Dispatch<React.SetStateAction<DocumentVersion[]>>;
	currentVersionId: string | null;
	setCurrentVersionId: React.Dispatch<React.SetStateAction<string | null>>;
	previewVersionId: string | null;
	setPreviewVersionId: React.Dispatch<React.SetStateAction<string | null>>;

	// Highlighted content state
	highlightedContent: string | null;
	setHighlightedContent: React.Dispatch<React.SetStateAction<string | null>>;

	// Loading states
	isParsing: boolean;
	setIsParsing: React.Dispatch<React.SetStateAction<boolean>>;

	// Provider config
	providerConfig: ProviderConfig;
	setProviderConfig: React.Dispatch<React.SetStateAction<ProviderConfig>>;
	transport: LLMTransport;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error('useAppContext must be used within AppContextProvider');
	}
	return context;
};

interface AppContextProviderProps {
	children: ReactNode;
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({
	children,
}) => {
	// Files state
	const [files, setFiles] = useState<File[]>([]);
	const [documentsContent, setDocumentsContent] = useState<DocumentAttachment[]>(
		[]
	);

	// Q&A Config state
	const [qaConfig, setQaConfig] = useState<QaConfig>({
		count: 5,
		type: 'mixed',
		difficulty: 'medium',
		instructions: '',
		model: 'gemini-3-flash-preview',
	});

	// Editor state
	const [editorContent, setEditorContent] = useState<string>('');
	const [selectedText, setSelectedText] = useState<SelectionMetadata | null>(
		null
	);
	const [isEditorDirty, setIsEditorDirty] = useState(false);

	// Version history state
	const [versionHistory, setVersionHistory] = useState<DocumentVersion[]>([]);
	const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
	const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

	// Highlighted content state
	const [highlightedContent, setHighlightedContent] = useState<string | null>(
		null
	);

	// Loading states
	const [isParsing, setIsParsing] = useState(false);

	// Provider config — persisted to localStorage
	const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => {
		try {
			const saved = localStorage.getItem('qa-guru-provider-config');
			if (saved) return JSON.parse(saved);
		} catch {
			// Ignore parse errors
		}
		return { type: 'gemini-sdk' } as ProviderConfig;
	});

	// Persist provider config changes
	useEffect(() => {
		try {
			localStorage.setItem(
				'qa-guru-provider-config',
				JSON.stringify(providerConfig)
			);
		} catch {
			// Ignore storage errors
		}
	}, [providerConfig]);

	// Create transport instance — memoized on provider config + API key
	const transport = useMemo(() => {
		const config = { ...providerConfig };
		// For SDK transport, merge in the API key from qaConfig
		if (config.type === 'gemini-sdk' && !config.apiKey) {
			config.apiKey = qaConfig.apiKey;
		}
		return createTransport(config);
	}, [providerConfig, qaConfig.apiKey]);

	// Set default template on mount and sync type from template
	useEffect(() => {
		const activeTemplate = getActiveTemplate(qaConfig.type);
		setQaConfig((config) => ({
			...config,
			selectedTemplateId: activeTemplate.id,
			type: activeTemplate.questionType,
		}));
	}, []);

	// Sync type from selected template whenever template changes
	useEffect(() => {
		if (qaConfig.selectedTemplateId) {
			const selectedTemplate = getTemplateById(qaConfig.selectedTemplateId);
			if (selectedTemplate && selectedTemplate.questionType !== qaConfig.type) {
				setQaConfig((config) => ({
					...config,
					type: selectedTemplate.questionType,
				}));
			}
		} else {
			// If no template is selected, select default template for current type
			const activeTemplate = getActiveTemplate(qaConfig.type);
			setQaConfig((config) => ({
				...config,
				selectedTemplateId: activeTemplate.id,
				type: activeTemplate.questionType,
			}));
		}
	}, [qaConfig.selectedTemplateId]);

	const value: AppContextType = {
		// Files
		files,
		setFiles,
		documentsContent,
		setDocumentsContent,

		// Q&A Config
		qaConfig,
		setQaConfig,

		// Editor
		editorContent,
		setEditorContent,
		selectedText,
		setSelectedText,
		isEditorDirty,
		setIsEditorDirty,

		// Version history
		versionHistory,
		setVersionHistory,
		currentVersionId,
		setCurrentVersionId,
		previewVersionId,
		setPreviewVersionId,

		// Highlighted content
		highlightedContent,
		setHighlightedContent,

		// Loading states
		isParsing,
		setIsParsing,

		// Provider
		providerConfig,
		setProviderConfig,
		transport,
	};

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
