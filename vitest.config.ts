import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    include: ['packages/*/test/**/*.test.ts'],
  },
});
