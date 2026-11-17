import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(['core', 'reader', 'reader-llamacpp-shared', 'reader-ocr-shared', 'reader-ocr', 'reader-figure'].map((name) => [`@mathtwin/${name}`,
      decodeURIComponent(new URL(`./packages/${name}/src/index.ts`, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')])),
  },
  test: {
    pool: 'threads',
    maxWorkers: 2,
    include: ['packages/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
