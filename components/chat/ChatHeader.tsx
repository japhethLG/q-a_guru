import React from 'react';
import { ChatConfig } from '../../types';
import { Button, ModelPicker } from '../common';
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
			<ModelPicker
				value={chatConfig.model}
				onChange={(model) => onConfigChange({ model })}
				size="md"
				disabled={isLoading}
			/>
		</div>
	);
};
