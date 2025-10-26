import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';

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
			className="relative group mb-3"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{language && (
				<div
					className={`absolute top-2 left-2 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded font-mono z-10 transition-all duration-200 ${
						showButton ? 'opacity-100 visible' : 'opacity-0 invisible'
					}`}
				>
					{language}
				</div>
			)}
			<pre className="rounded-lg bg-gray-900 border border-gray-700 p-3 overflow-x-auto shadow-inner max-w-full">
				<code className="text-sm font-mono">{code}</code>
			</pre>
			<button
				onClick={handleCopy}
				className={`absolute top-2 right-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 z-10 ${
					showButton ? 'opacity-100 visible' : 'opacity-0 invisible'
				} ${
					copied
						? 'bg-green-600 text-white'
						: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
				}`}
				title={copied ? 'Copied!' : 'Copy code'}
			>
				{copied ? '✓ Copied' : '📋 Copy'}
			</button>
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
						<p className="mb-3 last:mb-0 leading-relaxed break-words">{children}</p>
					),
					h1: ({ children }) => (
						<h1 className="text-xl font-bold mb-2 mt-3 text-cyan-400 break-words">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="text-lg font-bold mb-2 mt-3 text-cyan-400 break-words">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="text-base font-semibold mb-2 mt-3 text-cyan-300 break-words">
							{children}
						</h3>
					),
					ul: ({ children }) => (
						<ul className="list-disc mb-3 space-y-2 ml-4 marker:text-cyan-400">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="list-decimal mb-3 space-y-2 ml-4 marker:text-cyan-400">
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li className="ml-2 pl-1 break-words">{children}</li>
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-cyan-200">{children}</strong>
					),
					em: ({ children }) => <em className="italic text-cyan-100">{children}</em>,
					code: ({ node, inline, className, children, ...props }: any) => {
						const match = /language-(\w+)/.exec(className || '');
						return inline ? (
							<code
								className="px-1.5 py-0.5 rounded bg-gray-800/70 text-cyan-300 text-sm font-mono border border-gray-700 break-words"
								{...props}
							>
								{children}
							</code>
						) : (
							<code
								className={`block p-3 rounded-lg bg-gray-900 border border-gray-700 text-sm font-mono whitespace-pre ${className || ''}`}
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
							<pre className="mb-3 rounded-lg bg-gray-900 border border-gray-700 p-3 overflow-x-auto shadow-inner max-w-full">
								{children}
							</pre>
						);
					},
					a: ({ children, href }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-cyan-400 hover:text-cyan-300 underline transition-colors break-all"
						>
							{children}
						</a>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-l-4 border-cyan-500 pl-3 italic my-3 text-gray-400 bg-gray-800/50 py-2 rounded-r break-words">
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
						<div className="overflow-x-auto mb-3 max-w-full">
							<table className="min-w-full border-collapse text-sm rounded-lg">
								{children}
							</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="bg-gray-800 border-b-2 border-cyan-500">
							{children}
						</thead>
					),
					tbody: ({ children }) => (
						<tbody className="bg-gray-900/50">{children}</tbody>
					),
					tr: ({ children }) => (
						<tr className="border-b border-gray-700 last:border-b-0 hover:bg-gray-800/30 transition-colors">
							{children}
						</tr>
					),
					th: ({ children }) => (
						<th className="px-3 py-2 text-left font-semibold text-cyan-400 break-words">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-2 break-words">{children}</td>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
};
