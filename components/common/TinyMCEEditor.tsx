import React, { useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEInstance } from 'tinymce';

interface TinyMCEEditorProps {
	value: string;
	onChange?: (content: string) => void;
	onSelectionChange?: (selection: string) => void;
	disabled?: boolean;
	onInit?: (editor: TinyMCEInstance) => void;
	height?: string | number;
	plugins?: string[];
	toolbar?: string;
	contentStyle?: string;
	resize?: boolean;
	branding?: boolean;
	statusbar?: boolean;
}

export const TinyMCEEditor: React.FC<TinyMCEEditorProps> = ({
	value,
	onChange,
	onSelectionChange,
	disabled = false,
	onInit,
	height = '100%',
	plugins = [
		'advlist',
		'autolink',
		'lists',
		'link',
		'image',
		'charmap',
		'preview',
		'anchor',
		'searchreplace',
		'visualblocks',
		'code',
		'fullscreen',
		'insertdatetime',
		'media',
		'table',
		'help',
		'wordcount',
	],
	toolbar = 'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | subscript superscript | blockquote code | alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | link image | removeformat',
	contentStyle = 'body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #d1d5db; background-color: #374151; } .mce-content-body { background-color: #374151 !important; color: #d1d5db !important; }',
	resize = true,
	branding = false,
	statusbar = false,
}) => {
	const editorRef = useRef<TinyMCEInstance | null>(null);
	const isUpdatingContentRef = useRef(false);

	const handleEditorChange = useCallback(
		(content: string) => {
			if (!isUpdatingContentRef.current && onChange) {
				onChange(content);
			}
		},
		[onChange]
	);

	const handleSelectionChange = useCallback(() => {
		const editor = editorRef.current;
		if (!editor || !onSelectionChange) return;

		const selection = editor.selection.getContent({ format: 'html' });
		if (selection) {
			onSelectionChange(selection);
		} else {
			const selectedText = editor.selection.getContent({ format: 'text' });
			if (selectedText.trim()) {
				onSelectionChange(selectedText);
			} else {
				onSelectionChange('');
			}
		}
	}, [onSelectionChange]);

	// Update editor content when value prop changes
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || isUpdatingContentRef.current) return;

		const currentContent = editor.getContent();
		if (currentContent !== value) {
			isUpdatingContentRef.current = true;
			editor.setContent(value, { format: 'html' });
			// Reset flag after a short delay to allow content to update
			setTimeout(() => {
				isUpdatingContentRef.current = false;
			}, 0);
		}
	}, [value]);

	return (
		<Editor
			onInit={(evt, editor) => {
				editorRef.current = editor;
				if (onInit) {
					onInit(editor);
				}
			}}
			value={value}
			onEditorChange={handleEditorChange}
			onSelectionChange={handleSelectionChange}
			disabled={disabled}
			apiKey={`${import.meta.env.VITE_TINYMCE_API_KEY as string}`}
			init={{
				height,
				menubar: false,
				plugins,
				toolbar,
				content_style: contentStyle,
				skin: 'oxide-dark',
				content_css: 'dark',
				body_class: 'dark-theme',
				automatic_uploads: false,
				resize,
				branding,
				statusbar,
			}}
		/>
	);
};
