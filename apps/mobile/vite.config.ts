import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: Object.fromEntries(['core', 'reader', 'reader-llamacpp-shared', 'reader-figure', 'reader-ocr-shared', 'work'].map((name) =>
    [`@mathtwin/${name}`, new URL(`../../packages/${name}/src/index.ts`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')])) },
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
