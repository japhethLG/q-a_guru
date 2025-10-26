import React from 'react';
import { FileTextIcon, SparklesIcon } from './Icons';

export const Header: React.FC = () => {
	return (
		<header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10 flex-shrink-0">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-16">
					<div className="flex items-center space-x-3">
						<SparklesIcon className="h-7 w-7 text-cyan-400" />
						<h1 className="text-xl font-bold text-gray-50">Q&A Guru</h1>
						<div className="flex items-center space-x-2 text-sm text-gray-400">
							<FileTextIcon className="h-4 w-4" />
							<span>Document-Based Q&A Generator</span>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
};
