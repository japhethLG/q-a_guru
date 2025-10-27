import React from 'react';
import { QAGenerator } from './components/QAGenerator';
import { Header } from './components/Header';
import { AppContextProvider } from './contexts/AppContext';

export default function App() {
	return (
		<AppContextProvider>
			<div className="h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
				<Header />

				<main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-hidden">
					<div className="h-full">
						<QAGenerator />
					</div>
				</main>
			</div>
		</AppContextProvider>
	);
}
