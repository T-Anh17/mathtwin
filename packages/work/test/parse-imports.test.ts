import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps parse/** and its runtime helpers independent of all core runtime exports and Node APIs', async () => {
  const root = resolve('packages/work/src');
  const sourceFiles = async (directory: string): Promise<string[]> => {
    const files: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await sourceFiles(path));
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
    return files;
  };
  const pending = await sourceFiles(join(root, 'parse'));
  const checked = new Set<string>();
  while (pending.length) {
    const path = pending.pop()!;
    if (checked.has(path)) continue;
    checked.add(path);
    const code = (await readFile(path, 'utf8')).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
    expect(code, path).not.toMatch(/\b(?:import\s*\(|require\s*\(|process\.|Buffer\.)/u);
    // Walk static imports and re-exports, including multiline and aliased imports.
    const declarations = [...code.matchAll(/\b(import|export)\s+(type\s+)?[^;]*?\bfrom\s*['"]([^'"]+)['"]/gu)];
    expect(code, path).not.toMatch(/\bimport\s*['"]/u); // No unchecked side-effect imports.
    for (const declaration of declarations) {
      const target = declaration[3]!;
      if (declaration[2]) continue;
      expect(target, path).not.toMatch(/core|node:|^(?:fs|path|process|buffer)$/u);
      expect(target.startsWith('.'), path).toBe(true);
      const next = resolve(dirname(path), target.replace(/\.js$/u, '.ts'));
      expect(next.startsWith(root), target).toBe(true);
      pending.push(next);
    }
  }
  expect(checked.size).toBeGreaterThanOrEqual(5);
});
