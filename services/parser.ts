// Add declarations for CDN libraries to satisfy TypeScript
declare const mammoth: any;
declare const pdfjsLib: any;
declare const JSZip: any;

export const parseTxt = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			resolve(event.target?.result as string);
		};
		reader.onerror = (error) => {
			reject(error);
		};
		reader.readAsText(file);
	});
};

export const parseDocx = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const arrayBuffer = event.target?.result;
			if (arrayBuffer) {
				mammoth
					.extractRawText({ arrayBuffer })
					.then((result: any) => {
						resolve(result.value);
					})
					.catch(reject);
			} else {
				reject(new Error('Failed to read DOCX file.'));
			}
		};
		reader.onerror = (error) => {
			reject(error);
		};
		reader.readAsArrayBuffer(file);
	});
};

export const parsePptx = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const arrayBuffer = event.target?.result;
				if (!arrayBuffer) {
					return reject(new Error('Failed to read PPTX file.'));
				}
				const zip = await JSZip.loadAsync(arrayBuffer);
				const slideFiles = Object.keys(zip.files).filter(
					(name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
				);

				let fullText = '';

				for (const slideFileName of slideFiles) {
					const slideContent = await zip.file(slideFileName).async('string');
					// A simple regex to extract text from <a:t> tags. This is fragile but avoids a full XML parser.
					const textNodes = slideContent.match(/<a:t>.*?<\/a:t>/g) || [];
					const slideText = textNodes
						.map((node) => {
							return node.replace(/<a:t>/, '').replace(/<\/a:t>/, '');
						})
						.join(' ');
					fullText += slideText + '\n\n';
				}

				resolve(fullText.trim());
			} catch (err) {
				reject(err);
			}
		};
		reader.onerror = reject;
		reader.readAsArrayBuffer(file);
	});
};

export const parsePdf = async (file: File): Promise<string> => {
	const arrayBuffer = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
	let textContent = '';

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const text = await page.getTextContent();
		textContent += text.items.map((item: any) => item.str).join(' ');
		textContent += '\n\n';
	}

	return textContent;
};

export const parseFile = async (file: File): Promise<string> => {
	const extension = file.name.split('.').pop()?.toLowerCase();
	switch (extension) {
		case 'txt':
			return parseTxt(file);
		case 'docx':
			return parseDocx(file);
		case 'pptx':
			return parsePptx(file);
		case 'pdf':
			return parsePdf(file);
		default:
			throw new Error(`Unsupported file type: ${extension}`);
	}
};

export const fileToBase64 = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => {
			const result = reader.result as string;
			// remove the "data:*/*;base64," prefix
			resolve(result.split(',')[1]);
		};
		reader.onerror = (error) => reject(error);
	});
};
