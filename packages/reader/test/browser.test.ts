/// <reference types="vite/client" />
import { expect, it } from 'vitest';

// Scan both the reader and its transitive in-repo dependency. Only Zod is an external runtime import.
const sources = import.meta.glob<string>(['../src/**/*.ts', '../../core/src/**/*.ts'], { eager: true, query: '?raw', import: 'default' });
it('keeps runtime sources free of Node imports, globals, network and dynamic dependency escapes', () => {
  expect(Object.keys(sources).length).toBeGreaterThan(10);
  for (const [path, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/\b(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) {
      expect(match[1], path).toMatch(/^(?:\.{1,2}\/.*\.js|@mathtwin\/core|zod)$/);
    }
    expect(source, path).not.toMatch(/\b(?:Buffer|process|require|__dirname|__filename|fetch|XMLHttpRequest|WebSocket)\b|import\s*\(/);
  }
});
