import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './Icons';
import { Button } from './Button';

interface ThinkingSectionProps {
	thinking: string;
	isStreaming?: boolean;
	thinkingStartTime?: number;
	className?: string;
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({
	thinking,
	isStreaming = false,
	thinkingStartTime,
	className = '',
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [elapsedTime, setElapsedTime] = useState<number>(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);

	// Calculate elapsed time
	useEffect(() => {
		if (thinkingStartTime && isStreaming) {
			const updateTime = () => {
				const elapsed = (Date.now() - thinkingStartTime) / 1000;
				setElapsedTime(elapsed);
			};

			updateTime();
			intervalRef.current = setInterval(updateTime, 100);

			return () => {
				if (intervalRef.current) {
					clearInterval(intervalRef.current);
				}
			};
		} else if (thinkingStartTime && !isStreaming) {
			// Final time when streaming stops
			const elapsed = (Date.now() - thinkingStartTime) / 1000;
			setElapsedTime(elapsed);
		}
	}, [thinkingStartTime, isStreaming]);

	// Auto-scroll to end when streaming and expanded
	useEffect(() => {
		if (isExpanded && isStreaming && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [thinking, isExpanded, isStreaming]);

	// Get last words for collapsed view - show last portion of text
	const getLastWords = (text: string, maxLength: number = 120): string => {
		if (!text) return '';
		// Remove any leading/trailing whitespace
		const trimmed = text.trim();
		if (trimmed.length <= maxLength) {
			return trimmed;
		}
		// Show last maxLength characters with ellipsis
		return '...' + trimmed.slice(-maxLength);
	};

	if (!thinking) {
		return null;
	}

	const displayTime = elapsedTime > 0 ? elapsedTime.toFixed(1) : '0.0';
	const lastWords = getLastWords(thinking, 120);

	return (
		<div
			className={`mb-2 rounded-lg border border-gray-600 bg-gray-800/50 ${className}`}
		>
			{/* Collapsed view - show header with time and last words */}
			{!isExpanded && (
				<div
					className="cursor-pointer px-3 py-2 transition-colors hover:bg-gray-700/50"
					onClick={() => setIsExpanded(true)}
				>
					<div className="mb-1 flex items-center justify-between">
						<span className="text-xs font-medium text-cyan-400">
							Thought ({displayTime}s)
						</span>
						<ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
					</div>
					<div className="truncate overflow-hidden text-xs whitespace-nowrap text-gray-400">
						{lastWords}
					</div>
				</div>
			)}

			{/* Expanded view - full content with max height and scroll */}
			{isExpanded && (
				<div className="px-3 py-2">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-xs font-medium text-cyan-400">
							Thought ({displayTime}s)
						</span>
						<Button
							variant="icon"
							size="sm"
							icon={<ChevronUpIcon className="h-3.5 w-3.5 text-gray-400" />}
							onClick={(e) => {
								e.stopPropagation();
								setIsExpanded(false);
							}}
							title="Collapse"
						/>
					</div>
					<div
						ref={scrollRef}
						className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent max-h-[200px] overflow-x-hidden overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap text-gray-400"
					>
						{thinking}
					</div>
				</div>
			)}
		</div>
	);
};
