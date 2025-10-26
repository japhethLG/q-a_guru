import React, { useState } from 'react';
import { QAGenerator } from './components/QAGenerator';
import { ImageAnalyzer } from './components/ImageAnalyzer';
import { Header } from './components/Header';

export type AppTab = 'generator' | 'image_analyzer';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('generator');

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-hidden">
        <div className="h-full">
            {activeTab === 'generator' && <QAGenerator />}
            {activeTab === 'image_analyzer' && <ImageAnalyzer />}
        </div>
      </main>
    </div>
  );
}
