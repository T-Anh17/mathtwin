import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(['core', 'reader', 'reader-llamacpp-shared', 'reader-ocr-shared', 'reader-ocr'].map((name) => [`@mathtwin/${name}`,
      decodeURIComponent(new URL(`./packages/${name}/src/index.ts`, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')])),
  },
  test: {
    pool: 'threads',
    include: ['packages/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
