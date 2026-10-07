import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        infohub: resolve(process.cwd(), 'infohub.html'),
        recruiterhub: resolve(process.cwd(), 'recruiterhub.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/exceljs/')) return 'exceljs';
        }
      }
    }
  }
});