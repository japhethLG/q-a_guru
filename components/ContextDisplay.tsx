
import React, { useState } from 'react';
import { WandIcon, XIcon } from './Icons';

interface ContextDisplayProps {
    contextText: string;
    onClear: () => void;
}

export const ContextDisplay: React.FC<ContextDisplayProps> = ({ contextText, onClear }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!contextText) {
        return null;
    }

    return (
        <div className="mb-2 bg-gray-700/50 border border-gray-600 rounded-lg overflow-hidden transition-all duration-300">
            <div className="flex justify-between items-center p-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-2">
                    <WandIcon className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-gray-300">Context</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClear(); }} 
                        className="p-1 hover:bg-gray-600 rounded-full"
                        title="Clear context for next message"
                    >
                        <XIcon className="h-3 w-3 text-gray-400" />
                    </button>
                    <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-3 pt-0">
                    <div 
                        className="text-xs text-gray-300 bg-gray-900/50 p-2 rounded max-h-24 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: contextText }}
                    >
                    </div>
                </div>
            </div>
        </div>
    );
};