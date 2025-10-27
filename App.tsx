import React from 'react';
import { QAGenerator } from './components/QAGenerator';
import { Header } from './components/Header';
import { AppContextProvider } from './contexts/AppContext';

export default function App() {
	return (
		<AppContextProvider>
			<div className="flex h-screen flex-col bg-gray-900 font-sans text-gray-100">
				<Header />

				<main className="container mx-auto flex-grow overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
					<div className="h-full">
						<QAGenerator />
					</div>
				</main>
			</div>
		</AppContextProvider>
	);
}
