import { readFile } from 'node:fs/promises';
import type { TextLine, TruthLine } from '@mathtwin/reader';
import { parseVietOcrConfig, unsupportedSymbols } from '@mathtwin/reader-ocr';

export async function loadUnsupportedSymbols(): Promise<string[]> {
  // This checked-in JSON is pinned to the same release/hash as the recognition models.
  const config = parseVietOcrConfig(JSON.parse(await readFile(new URL('../../models/config/vietocr.json', import.meta.url), 'utf8')) as unknown);
  return unsupportedSymbols(config.vocab);
}
export function symbolTruthLineCount(lines: readonly TruthLine[], symbols: readonly string[]): number {
  return lines.filter((line) => !line.struck && line.text !== null && symbols.some((symbol) => line.text!.includes(symbol))).length;
}
export function truncatedLineCount(lines: readonly TextLine[]): number {
  return lines.filter((line) => 'truncated' in line && line.truncated === true).length;
}
export function debugLines(id: string, lines: readonly TextLine[], pass = 1) {
  return lines.map((line) => ({ id, pass, ...(line.box ? { box: line.box } : {}), text: line.text, conf: line.conf,
    ...('truncated' in line && line.truncated === true ? { truncated: true } : {}) }));
}
