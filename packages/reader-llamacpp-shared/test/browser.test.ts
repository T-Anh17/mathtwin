/// <reference types="vite/client" />
import { expect, it } from 'vitest';
const sources = import.meta.glob<string>(['../src/**/*.ts'], { eager: true, query: '?raw', import: 'default' });
it('shared protocol has no Node imports, globals or hidden networking', () => {
  expect(Object.keys(sources).length).toBeGreaterThan(3);
  for (const [path, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/\b(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) {
      expect(match[1], path).toMatch(/^(?:\.{1,2}\/.*\.js|@mathtwin\/reader|zod)$/);
    }
    expect(source, path).not.toMatch(/\b(?:Buffer|process|require|__dirname|__filename|fetch|XMLHttpRequest|WebSocket)\b|import\s*\(/);
  }
});
