import { failed } from './errors.js';

export interface ValueSpan { start: number; end: number; rawStart: number; rawEnd: number; kind: 'string' | 'literal' }
/** Index scalar VALUES, never keys/punctuation. Offsets are UTF-8 bytes, including escaped JSON spelling. */
export function jsonValues(text: string): { value: unknown; spans: Map<string, ValueSpan> } {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { return failed('invalid_json'); }
  const encoder = new TextEncoder();
  const offsets: number[] = [0];
  let count = 0;
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i)!;
    const length = code > 0xffff ? 2 : 1;
    offsets[i] = count;
    if (length === 2) offsets[i + 1] = count;
    count += encoder.encode(String.fromCodePoint(code)).length;
    i += length; offsets[i] = count;
  }
  const spans = new Map<string, ValueSpan>();
  let pos = 0;
  const space = (): void => { while (/\s/.test(text[pos] ?? '') && pos < text.length) pos++; };
  function stringEnd(): void {
    pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '\\') pos++;
      else if (c === '"') return;
    }
    failed('invalid_json');
  }
  function parse(path: string): void {
    space();
    if (text[pos] === '{') {
      pos++; space(); const keys = new Set<string>();
      while (text[pos] !== '}') {
        const begin = pos; stringEnd();
        const key = JSON.parse(text.slice(begin, pos)) as string;
        if (keys.has(key)) failed('invalid_json'); // Do not let duplicate keys misalign confidence.
        keys.add(key); space(); pos++; // colon (syntax already validated)
        parse(`${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`); space();
        if (text[pos] !== ',') break;
        pos++; space();
      }
      pos++; return;
    }
    if (text[pos] === '[') {
      pos++; space(); let index = 0;
      while (text[pos] !== ']') {
        parse(`${path}/${index++}`); space();
        if (text[pos] !== ',') break;
        pos++; space();
      }
      pos++; return;
    }
    const begin = pos;
    const string = text[pos] === '"';
    if (string) stringEnd();
    else while (pos < text.length && !/[\s,\]}]/.test(text[pos]!)) pos++;
    spans.set(path, { rawStart: offsets[begin]!, rawEnd: offsets[pos]!,
      start: offsets[begin + (string ? 1 : 0)]!, end: offsets[pos - (string ? 1 : 0)]!, kind: string ? 'string' : 'literal' });
  }
  parse(''); return { value, spans };
}
