import React, { useState, ChangeEvent } from 'react';
import { fileToBase64 } from '../services/parser';
import { analyzeImage } from '../services/gemini';
import { ImageIcon, LoaderIcon, SparklesIcon } from './Icons';

export const ImageAnalyzer: React.FC = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('Describe this image in detail.');
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };
    
    const handleAnalyze = async () => {
        if(!imageFile || !prompt) {
            alert("Please select an image and enter a prompt.");
            return;
        }
        setIsLoading(true);
        setAnalysis('');
        try {
            const base64Data = await fileToBase64(imageFile);
            const result = await analyzeImage(base64Data, imageFile.type, prompt);
            setAnalysis(result);
        } catch(error) {
            console.error(error);
            setAnalysis("An error occurred during analysis.");
        }
        setIsLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-4 bg-gray-800 rounded-lg shadow-lg">
            <div className="grid md:grid-cols-2 gap-6">
                {/* Left side: upload and preview */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-cyan-400">Upload Image</h3>
                    <div className="relative border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-cyan-500 transition-colors">
                        <ImageIcon className="mx-auto h-12 w-12 text-gray-500" />
                        <label htmlFor="image-upload" className="mt-2 text-sm font-medium text-gray-300 cursor-pointer">
                            <span className="text-cyan-400">Click to upload</span> or drag and drop
                        </label>
                        <input id="image-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
                    </div>
                    {imagePreview && (
                        <div className="mt-4">
                           <img src={imagePreview} alt="Preview" className="w-full h-auto rounded-lg object-contain max-h-64" />
                        </div>
                    )}
                </div>
                 {/* Right side: prompt and result */}
                <div className="space-y-4">
                     <h3 className="text-lg font-semibold text-cyan-400">Your Prompt</h3>
                     <textarea
                        className="w-full h-24 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., What is in this image?"
                     />
                     <button
                        onClick={handleAnalyze}
                        disabled={isLoading || !imageFile}
                        className="w-full flex justify-center items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-all duration-200"
                    >
                        {isLoading ? <LoaderIcon className="h-5 w-5" /> : <SparklesIcon className="h-5 w-5" />}
                        {isLoading ? 'Analyzing...' : 'Analyze Image'}
                    </button>
                    {analysis && (
                        <div className="mt-4 p-4 bg-gray-900/50 rounded-lg space-y-2">
                             <h3 className="text-lg font-semibold text-cyan-400">Analysis Result</h3>
                             <p className="text-gray-300 whitespace-pre-wrap">{analysis}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
