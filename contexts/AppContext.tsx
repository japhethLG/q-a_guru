import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from 'react';
import { QaConfig, DocumentVersion, SelectionMetadata } from '../types';
import { getActiveTemplate } from '../services/templateStorage';

interface AppContextType {
	// Files state
	files: File[];
	setFiles: React.Dispatch<React.SetStateAction<File[]>>;
	documentsContent: string[];
	setDocumentsContent: React.Dispatch<React.SetStateAction<string[]>>;

	// Q&A Config state
	qaConfig: QaConfig;
	setQaConfig: React.Dispatch<React.SetStateAction<QaConfig>>;
	generationConfig: QaConfig | null;
	setGenerationConfig: React.Dispatch<React.SetStateAction<QaConfig | null>>;

	// Editor state
	editorContent: string;
	setEditorContent: React.Dispatch<React.SetStateAction<string>>;
	selectedText: SelectionMetadata | null;
	setSelectedText: React.Dispatch<React.SetStateAction<SelectionMetadata | null>>;
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
	isGenerating: boolean;
	setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
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
	const [documentsContent, setDocumentsContent] = useState<string[]>([]);

	// Q&A Config state
	const [qaConfig, setQaConfig] = useState<QaConfig>({
		count: 5,
		type: 'mixed',
		difficulty: 'medium',
		instructions: '',
		model: 'gemini-2.5-flash',
	});
	const [generationConfig, setGenerationConfig] = useState<QaConfig | null>(
		null
	);

	// Editor state
	const [editorContent, setEditorContent] = useState<string>('');
	const [selectedText, setSelectedText] = useState<SelectionMetadata | null>(null);
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
	const [isGenerating, setIsGenerating] = useState(false);

	// Set default template on mount based on initial question type
	useEffect(() => {
		const activeTemplate = getActiveTemplate(qaConfig.type);
		setQaConfig((config) => ({
			...config,
			selectedTemplateId: activeTemplate.id,
			answerFormat: activeTemplate.answerFormat,
		}));
	}, []);

	// Update template when question type changes (if no template is manually selected)
	useEffect(() => {
		// Only auto-update if no template is currently selected for the new type
		// This prevents overriding manually selected templates
		if (!qaConfig.selectedTemplateId) {
			const activeTemplate = getActiveTemplate(qaConfig.type);
			setQaConfig((config) => ({
				...config,
				selectedTemplateId: activeTemplate.id,
				answerFormat: activeTemplate.answerFormat,
			}));
		}
	}, [qaConfig.type]);

	const value: AppContextType = {
		// Files
		files,
		setFiles,
		documentsContent,
		setDocumentsContent,

		// Q&A Config
		qaConfig,
		setQaConfig,
		generationConfig,
		setGenerationConfig,

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
		isGenerating,
		setIsGenerating,
	};

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
