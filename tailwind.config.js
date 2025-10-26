import { defineConfig } from '@tailwindcss/vite';

export default defineConfig({
	content: [
		'./index.html',
		'./index.tsx',
		'./App.tsx',
		'./components/**/*.{js,jsx,ts,tsx}',
		'./services/**/*.{js,jsx,ts,tsx}',
	],
});
