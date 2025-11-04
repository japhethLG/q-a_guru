import React, { useRef, useEffect } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEInstance } from 'tinymce';
import { QuestionType } from '../../types';
import { previewTemplate } from '../../services/templates';

interface ContentPreviewProps {
	content: string;
	contentType?: 'template' | 'html';
	questionType?: QuestionType;
	height?: number;
	maxHeight?: number;
	className?: string;
}

export const ContentPreview: React.FC<ContentPreviewProps> = ({
	content,
	contentType = 'html',
	questionType,
	height = 150,
	maxHeight,
	className = '',
}) => {
	const editorRef = useRef<TinyMCEInstance | null>(null);
	const isUpdatingContentRef = useRef(false);

	// Generate preview HTML based on content type
	const previewHtml = React.useMemo(() => {
		if (contentType === 'template' && questionType) {
			return previewTemplate(content, questionType);
		}
		return content;
	}, [content, contentType, questionType]);

	// Update editor content when preview HTML changes
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || isUpdatingContentRef.current || !previewHtml) return;

		const currentContent = editor.getContent();
		if (currentContent !== previewHtml) {
			isUpdatingContentRef.current = true;
			editor.setContent(previewHtml, { format: 'html' });
			setTimeout(() => {
				isUpdatingContentRef.current = false;
			}, 0);
		}
	}, [previewHtml]);

	const contentStyle =
		'body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #d1d5db; background-color: #374151; } .mce-content-body { background-color: #374151 !important; color: #d1d5db !important; } body::-webkit-scrollbar { width: 6px; height: 6px; } body::-webkit-scrollbar-track { background: transparent; } body::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 3px; } body::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }';

	const containerStyle = maxHeight
		? { maxHeight: `${maxHeight}px`, height: `${height}px` }
		: { height: `${height}px` };

	return (
		<div
			className={`overflow-hidden rounded bg-gray-900/50 ${className}`}
			style={containerStyle}
		>
			<Editor
				onInit={(evt, editor) => {
					editorRef.current = editor;
					if (previewHtml) {
						editor.setContent(previewHtml, { format: 'html' });
					}
				}}
				value={previewHtml}
				disabled={true}
				apiKey={`${import.meta.env.VITE_TINYMCE_API_KEY as string}`}
				init={{
					height,
					menubar: false,
					toolbar: false,
					statusbar: false,
					resize: false,
					branding: false,
					content_style: contentStyle,
					skin: 'oxide-dark',
					content_css: 'dark',
					body_class: 'dark-theme',
					plugins: [],
					automatic_uploads: false,
				}}
			/>
		</div>
	);
};

