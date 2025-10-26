import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '');
	// Use base path for production (GitHub Pages), root for development
	const base = mode === 'production' ? '/q-a_guru/' : '/';

	return {
		base,
		server: {
			port: 3000,
			host: '0.0.0.0',
			hmr: true, // Hot Module Replacement enabled
		},
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, '.'),
			},
		},
		worker: {
			format: 'es',
		},
		optimizeDeps: {
			include: ['pdfjs-dist'],
		},
	};
});
