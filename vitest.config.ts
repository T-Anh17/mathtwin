import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@mathtwin/core': decodeURIComponent(new URL('./packages/core/src/index.ts', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1') },
  },
  test: {
    pool: 'threads',
    include: ['packages/*/test/**/*.test.ts'],
  },
});
