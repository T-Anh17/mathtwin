/// <reference types="vite/client" />
import { expect, it } from 'vitest';
const sources = import.meta.glob<string>('../src/**/*.ts', { eager: true, query: '?raw', import: 'default' });
it('keeps every work runtime source free of Node and network APIs', () => {
  for (const [path, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/\b(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) expect(match[1], path).toMatch(/^(?:\.{1,2}\/.*\.js|@mathtwin\/(?:reader|core))$/);
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
    expect(code, path).not.toMatch(/\b(?:Buffer|process|require|__dirname|__filename|fetch|XMLHttpRequest|WebSocket)\b|import\s*\(/);
  }
});
