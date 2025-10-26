import React from 'react';

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (
	props
) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6-10.375A1 1 0 0 1 3.437 2.5l10.375 6a2 2 0 0 0 1.437 1.437l6 10.375a1 1 0 0 1-1.187 1.187l-10.375-6Z" />
		<path d="M5 3 3 5" />
		<path d="M21 19 19 21" />
		<path d="M12.5 5.5 10 3" />
		<path d="M21 11.5 18.5 9" />
	</svg>
);

export const FileTextIcon: React.FC<React.SVGProps<SVGSVGElement>> = (
	props
) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
		<polyline points="14 2 14 8 20 8" />
		<line x1="16" y1="13" x2="8" y2="13" />
		<line x1="16" y1="17" x2="8" y2="17" />
		<line x1="10" y1="9" x2="8" y2="9" />
	</svg>
);

export const ImageIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
		<circle cx="9" cy="9" r="2" />
		<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
	</svg>
);

export const LoaderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
		className={`animate-spin ${props.className}`}
	>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</svg>
);

export const UploadCloudIcon: React.FC<React.SVGProps<SVGSVGElement>> = (
	props
) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
		<path d="M12 12v9" />
		<path d="m16 16-4-4-4 4" />
	</svg>
);

export const XIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<line x1="18" y1="6" x2="6" y2="18" />
		<line x1="6" y1="6" x2="18" y2="18" />
	</svg>
);

export const WandIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M15 4V2" />
		<path d="M15 16v-2" />
		<path d="M12.07 14.52A4.5 4.5 0 0 0 9 10.5" />
		<path d="M11.5 20H8" />
		<path d="M22 11.5h-2" />
		<path d="M7 11.5H4" />
		<path d="M14.52 12.07A4.5 4.5 0 0 0 10.5 9" />
		<path d="M9.5 4H7" />
		<path d="m3.49 10.63 1.42-1.42" />
		<path d="m20.51 3.49-1.42 1.42" />
		<path d="M13.43 20.51 12 19.07" />
		<path d="M4.91 20.51 6.34 19.07" />
	</svg>
);

export const HistoryIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
		<path d="M3 3v5h5" />
		<path d="M12 7v5l4 2" />
	</svg>
);

export const SaveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
		<polyline points="17 21 17 13 7 13 7 21" />
		<polyline points="7 3 7 8 15 8" />
	</svg>
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<polyline points="3 6 5 6 21 6" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		<line x1="10" y1="11" x2="10" y2="17" />
		<line x1="14" y1="11" x2="14" y2="17" />
	</svg>
);
