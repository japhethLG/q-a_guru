import React from 'react';
import { AppTab } from '../App';
import { FileTextIcon, ImageIcon, SparklesIcon } from './Icons';

interface HeaderProps {
	activeTab: AppTab;
	setActiveTab: (tab: AppTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
	return (
		<header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10 flex-shrink-0">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-16">
					<div className="flex items-center space-x-3">
						<SparklesIcon className="h-7 w-7 text-cyan-400" />
						<h1 className="text-xl font-bold text-gray-50">AI Document Suite</h1>
					</div>
					<nav className="flex items-center space-x-2 bg-gray-700/50 p-1 rounded-lg">
						<TabButton
							icon={<FileTextIcon className="h-5 w-5" />}
							label="Q&A Generator"
							isActive={activeTab === 'generator'}
							onClick={() => setActiveTab('generator')}
						/>
						<TabButton
							icon={<ImageIcon className="h-5 w-5" />}
							label="Image Analyzer"
							isActive={activeTab === 'image_analyzer'}
							onClick={() => setActiveTab('image_analyzer')}
						/>
					</nav>
				</div>
			</div>
		</header>
	);
};

interface TabButtonProps {
	icon: React.ReactNode;
	label: string;
	isActive: boolean;
	onClick: () => void;
}
const TabButton: React.FC<TabButtonProps> = ({
	icon,
	label,
	isActive,
	onClick,
}) => (
	<button
		onClick={onClick}
		className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
			isActive
				? 'bg-cyan-500 text-white shadow-md'
				: 'text-gray-300 hover:bg-gray-600/70'
		}`}
	>
		{icon}
		<span className="hidden sm:inline">{label}</span>
	</button>
);
