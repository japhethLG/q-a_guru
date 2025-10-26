import React, { useRef, useEffect } from 'react';
import { DownloadFormat, DocumentVersion } from '../types';
import { HistoryIcon, SaveIcon, XIcon } from './Icons';

declare const Quill: any;
declare const TurndownService: any;
declare const html2pdf: any;
declare const saveAs: any;

interface EditorSectionProps {
    content: string;
    onContentChange: (newContent: string) => void;
    onTextSelect: (selectedText: string) => void;
    onDirtyChange: (isDirty: boolean) => void;
    isPreviewing: boolean;
    onExitPreview: () => void;
}

const toolbarOptions = [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'font': [] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'script': 'sub'}, { 'script': 'super' }],
    ['blockquote', 'code-block'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'direction': 'rtl' }],
    [{ 'align': [] }],
    ['link', 'image', 'video'],
    ['clean']
];

export const EditorSection: React.FC<EditorSectionProps> = ({ 
    content, 
    onContentChange, 
    onTextSelect, 
    onDirtyChange,
    isPreviewing,
    onExitPreview
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const quillInstanceRef = useRef<any>(null);

    useEffect(() => {
        if (editorRef.current && !quillInstanceRef.current) {
            const quill = new Quill(editorRef.current, {
                modules: { toolbar: toolbarOptions },
                theme: 'snow',
                placeholder: 'Generated Q&A will appear here...',
            });
            quillInstanceRef.current = quill;

            quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
                if (source === 'user') {
                    onContentChange(quill.root.innerHTML);
                    onDirtyChange(true);
                }
            });

            quill.on('selection-change', (range: any, oldRange: any, source: string) => {
                if (range) {
                    if (range.length > 0) {
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            const container = document.createElement('div');
                            const content = selection.getRangeAt(0).cloneContents();
                            container.appendChild(content);
                            onTextSelect(container.innerHTML);
                        }
                    } else {
                        onTextSelect('');
                    }
                }
                // If range is null, do nothing, preserving context on focus loss
            });
        }
    }, []);
    
    useEffect(() => {
        const quill = quillInstanceRef.current;
        if (quill) {
             // Only update if the content is actually different to avoid cursor jumps and infinite loops
            if (quill.root.innerHTML !== content) {
                // FIX: Clear the editor's current content before pasting the new content.
                // This ensures the content is REPLACED, not merged, fixing the revert bug.
                quill.deleteText(0, quill.getLength());
                quill.clipboard.dangerouslyPasteHTML(0, content);
                quill.setSelection(quill.getLength(), 0); // Move cursor to end
                onDirtyChange(false);
            }
             // Handle read-only state for preview mode
            quill.enable(!isPreviewing);
        }
    }, [content, isPreviewing, onDirtyChange]);
    
    const handleDownload = (format: DownloadFormat) => {
        const quill = quillInstanceRef.current;
        if (!quill) return;
        
        const contentHtml = quill.root.innerHTML;
        const contentText = quill.getText();
        const title = 'ai-document';

        switch(format) {
            case 'txt':
                const blobTxt = new Blob([contentText], { type: 'text/plain;charset=utf-t' });
                saveAs(blobTxt, `${title}.txt`);
                break;
            case 'md':
                const turndownService = new TurndownService();
                const markdown = turndownService.turndown(contentHtml);
                const blobMd = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
                saveAs(blobMd, `${title}.md`);
                break;
            case 'pdf':
                 html2pdf().from(contentHtml).save(`${title}.pdf`);
                break;
            case 'docx':
                 const docx = (window as any).htmlDocx.asBlob(contentHtml);
                 saveAs(docx, `${title}.docx`);
                 break;
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-cyan-400">Document Editor</h3>
                <div className="relative group">
                    <button className="p-2 hover:bg-gray-700 rounded-md" title="Download">
                        <SaveIcon className="h-5 w-5" />
                    </button>
                    <div className="absolute right-0 mt-2 w-28 bg-gray-700 border border-gray-600 rounded-md shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-opacity duration-200 z-20">
                        <a onClick={() => handleDownload('pdf')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-cyan-600 cursor-pointer">PDF</a>
                        <a onClick={() => handleDownload('docx')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-cyan-600 cursor-pointer">DOCX</a>
                        <a onClick={() => handleDownload('md')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-cyan-600 cursor-pointer">Markdown</a>
                        <a onClick={() => handleDownload('txt')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-cyan-600 cursor-pointer">TXT</a>
                    </div>
                </div>
            </div>

            {isPreviewing && (
                <div className="bg-yellow-500 text-black px-4 py-2 text-sm font-semibold flex justify-between items-center flex-shrink-0">
                    <span>You are previewing a past version. The editor is read-only.</span>
                    <button onClick={onExitPreview} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded-md flex items-center gap-1">
                        <XIcon className="h-4 w-4" />
                        Exit Preview
                    </button>
                </div>
            )}
            
            <div ref={editorRef} className="flex-grow flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
                {/* Quill will attach here */}
            </div>
        </div>
    );
};