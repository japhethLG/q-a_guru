import React from 'react';
import { ChatConfig } from '../../types';
import { Button, Select } from '../common';
import { RefreshCwIcon } from '../common/Icons';

interface ChatHeaderProps {
	chatConfig: ChatConfig;
	onConfigChange: (config: ChatConfig) => void;
	onReset: () => void;
	hasMessages: boolean;
	isLoading: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
	chatConfig,
	onConfigChange,
	onReset,
	hasMessages,
	isLoading,
}) => {
	return (
		<div className="space-y-2 border-b border-gray-700 p-3">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold text-cyan-400">AI Assistant</h3>
				{hasMessages && (
					<Button
						variant="icon"
						onClick={onReset}
						title="Clear chat history"
						disabled={isLoading}
						icon={<RefreshCwIcon className="h-5 w-5" />}
					/>
				)}
			</div>
			<Select
				label="Model"
				size="md"
				options={[
					{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
					{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
					{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
					{ value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
					{ value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
				]}
				value={chatConfig.model}
				onChange={(e) =>
					onConfigChange({
						model: e.target.value as ChatConfig['model'],
					})
				}
				disabled={isLoading}
			/>
		</div>
	);
};
