import React from 'react';
import { Button } from '../common';
import { RefreshCwIcon } from '../common/Icons';

interface ChatHeaderProps {
	onReset: () => void;
	hasMessages: boolean;
	isLoading: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
	onReset,
	hasMessages,
	isLoading,
}) => {
	return (
		<div className="flex items-center justify-between border-b border-gray-700 p-3">
			<h3 className="text-lg font-semibold text-cyan-400">AI Assistant</h3>
			<div className="flex items-center gap-2">
				{hasMessages && (
					<Button
						variant="icon"
						size="sm"
						onClick={onReset}
						disabled={isLoading}
						title="Reset chat"
					>
						<RefreshCwIcon className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
};
