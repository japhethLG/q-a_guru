import React from 'react';
import { DownloadFormat } from '../../types';
import { DownloadIcon } from './Icons';
import { Button, Dropdown } from './';

interface DownloadsDropdownProps {
	onDownload: (format: DownloadFormat) => void;
}

export const DownloadsDropdown: React.FC<DownloadsDropdownProps> = ({
	onDownload,
}) => {
	return (
		<Dropdown
			trigger="hover"
			width="w-28"
			button={
				<Button variant="icon" title="Download">
					<DownloadIcon className="h-5 w-5" />
				</Button>
			}
		>
			<Button
				variant="secondary"
				onClick={() => onDownload('docx')}
				className="w-full justify-start"
			>
				DOCX
			</Button>
			<Button
				variant="secondary"
				onClick={() => onDownload('md')}
				className="w-full justify-start"
			>
				Markdown
			</Button>
			<Button
				variant="secondary"
				onClick={() => onDownload('txt')}
				className="w-full justify-start"
			>
				TXT
			</Button>
		</Dropdown>
	);
};
