import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'web', envDir: '..', plugins: [react()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' }, fs: { deny: ['**/.git/**', '**/data/**', '**/.local/**', '**/.env*', '**/server/**'] } }, build: { outDir: '../dist', emptyOutDir: true, sourcemap: false } });
