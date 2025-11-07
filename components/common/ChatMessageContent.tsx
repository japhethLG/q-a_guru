import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';
import { Button } from './Button';

interface CodeBlockProps {
	language?: string;
	code: string;
	onHighlight?: (content: string | null) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
	language,
	code,
	onHighlight,
}) => {
	const [copied, setCopied] = useState(false);
	const [showButton, setShowButton] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	};

	const handleMouseEnter = () => {
		setShowButton(true);
		if (onHighlight) {
			onHighlight(code);
		}
	};

	const handleMouseLeave = () => {
		setShowButton(false);
		if (onHighlight) {
			onHighlight(null);
		}
	};

	return (
		<div
			className="group relative mb-3"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{language && (
				<div
					className={`absolute top-2 left-2 z-10 rounded bg-gray-800 px-2 py-1 font-mono text-xs text-gray-400 transition-all duration-200 ${
						showButton ? 'visible opacity-100' : 'invisible opacity-0'
					}`}
				>
					{language}
				</div>
			)}
			<pre className="max-w-full overflow-x-auto rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-inner">
				<code className="font-mono text-sm">{code}</code>
			</pre>
			<Button
				variant={copied ? 'primary' : 'secondary'}
				size="sm"
				onClick={handleCopy}
				className={`absolute top-2 right-2 z-10 text-xs transition-all duration-200 ${
					showButton ? 'visible opacity-100' : 'invisible opacity-0'
				} ${
					copied
						? 'bg-green-600 hover:bg-green-700 text-white border-0'
						: 'border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
				}`}
				title={copied ? 'Copied!' : 'Copy code'}
			>
				{copied ? '✓ Copied' : '📋 Copy'}
			</Button>
		</div>
	);
};

interface ChatMessageContentProps {
	content: string;
	className?: string;
	onHighlight?: (content: string | null) => void;
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
	content,
	className = '',
	onHighlight,
}) => {
	return (
		<div className={`markdown-content w-full ${className}`}>
			<style>{`
				.markdown-content details {
					margin: 0.75rem 0;
					border: 1px solid #374151;
					border-radius: 0.5rem;
					background-color: rgba(31, 41, 55, 0.5);
					overflow: hidden;
				}
				.markdown-content details summary {
					cursor: pointer;
					padding: 0.75rem 1rem;
					color: #22d3ee;
					font-weight: 500;
					transition: background-color 0.2s, color 0.2s;
					display: flex;
					align-items: center;
					list-style: none;
				}
				.markdown-content details summary::-webkit-details-marker {
					display: none;
				}
				.markdown-content details summary:hover {
					background-color: rgba(55, 65, 81, 0.5);
					color: #67e8f9;
				}
				.markdown-content details summary span {
					display: inline-block;
					margin-right: 0.5rem;
					transition: transform 0.2s;
					font-size: 0.75rem;
				}
				.markdown-content details[open] summary span {
					transform: rotate(90deg);
				}
				.markdown-content details[open] summary {
					border-bottom: 1px solid #374151;
				}
				.markdown-content details > :not(summary) {
					padding: 1rem;
				}
			`}</style>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, rehypeHighlight]}
				components={{
					p: ({ children }) => (
						<p className="mb-3 leading-relaxed wrap-break-word last:mb-0">
							{children}
						</p>
					),
					h1: ({ children }) => (
						<h1 className="mt-3 mb-2 text-xl font-bold wrap-break-word text-cyan-400">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="mt-3 mb-2 text-lg font-bold wrap-break-word text-cyan-400">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="mt-3 mb-2 text-base font-semibold wrap-break-word text-cyan-300">
							{children}
						</h3>
					),
					ul: ({ children }) => (
						<ul className="mb-3 ml-4 list-disc space-y-2 marker:text-cyan-400">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="mb-3 ml-4 list-decimal space-y-2 marker:text-cyan-400">
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li className="ml-2 pl-1 wrap-break-word">{children}</li>
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-cyan-200">{children}</strong>
					),
					em: ({ children }) => <em className="text-cyan-100 italic">{children}</em>,
					code: ({ node, inline, className, children, ...props }: any) => {
						const match = /language-(\w+)/.exec(className || '');
						return inline ? (
							<code
								className="rounded border border-gray-700 bg-gray-800/70 px-1.5 py-0.5 font-mono text-sm wrap-break-word text-cyan-300"
								{...props}
							>
								{children}
							</code>
						) : (
							<code
								className={`block rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-sm whitespace-pre ${className || ''}`}
								{...props}
							>
								{children}
							</code>
						);
					},
					pre: ({ children }: any) => {
						// Helper function to extract text from children recursively
						const extractText = (node: any): string => {
							if (typeof node === 'string') return node;
							if (typeof node === 'number') return String(node);
							if (!node) return '';
							if (Array.isArray(node)) {
								return node.map(extractText).join('');
							}
							if (typeof node === 'object' && node.props) {
								return extractText(node.props.children);
							}
							return '';
						};

						// Check if this is a code block with syntax highlighting
						const codeChild = React.Children.toArray(children).find((child: any) =>
							child?.props?.className?.includes('language-')
						);

						if (codeChild) {
							const codeElement = (codeChild as any).props;
							const languageMatch = /language-(\w+)/.exec(codeElement.className || '');
							const language = languageMatch?.[1];
							const codeString = extractText(codeElement.children).replace(/\n$/, '');

							return (
								<CodeBlock
									language={language}
									code={codeString}
									onHighlight={onHighlight}
								/>
							);
						}

						// Regular pre element without syntax highlighting
						return (
							<pre className="mb-3 max-w-full overflow-x-auto rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-inner">
								{children}
							</pre>
						);
					},
					a: ({ children, href }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="break-all text-cyan-400 underline transition-colors hover:text-cyan-300"
						>
							{children}
						</a>
					),
					blockquote: ({ children }) => (
						<blockquote className="my-3 rounded-r border-l-4 border-cyan-500 bg-gray-800/50 py-2 pl-3 wrap-break-word text-gray-400 italic">
							{children}
						</blockquote>
					),
					details: ({ node, children }: any) => <details>{children}</details>,
					summary: ({ children }: any) => (
						<summary className="details-summary">
							<span className="details-arrow">▶</span>
							{children}
						</summary>
					),
					hr: () => (
						<div className="my-6 flex items-center">
							<div className="flex-grow border-t border-gray-600"></div>
							<div className="mx-2 text-cyan-400">•</div>
							<div className="flex-grow border-t border-gray-600"></div>
						</div>
					),
					table: ({ children }) => (
						<div className="mb-3 max-w-full overflow-x-auto">
							<table className="min-w-full border-collapse rounded-lg text-sm">
								{children}
							</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="border-b-2 border-cyan-500 bg-gray-800">
							{children}
						</thead>
					),
					tbody: ({ children }) => (
						<tbody className="bg-gray-900/50">{children}</tbody>
					),
					tr: ({ children }) => (
						<tr className="border-b border-gray-700 transition-colors last:border-b-0 hover:bg-gray-800/30">
							{children}
						</tr>
					),
					th: ({ children }) => (
						<th className="px-3 py-2 text-left font-semibold wrap-break-word text-cyan-400">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-2 wrap-break-word">{children}</td>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
};
