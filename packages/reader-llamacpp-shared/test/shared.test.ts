import { expect, it } from 'vitest';
import { compareRead, normalizeDraft, readProblem, resizeImage } from '@mathtwin/reader';
import { completionRequest, graphResult, lineResult, parseCompletion, plainLines, spottingLines } from '../src/index.js';
import { draft, FakeVisionReader, image } from '../../reader/test/fixtures.js';

const encoder = new TextEncoder();
it.each(['', '   '])('classifies empty length output as truncated: %j', (content) => {
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length', message: { content } }] }, true)).toThrowError(expect.objectContaining({ reason: 'truncated' }));
});
it('uses the shared 1536 token default for completion requests', () => {
  expect(completionRequest('b', 'lines', ['data:image/png;base64,AA=='])).toMatchObject({ max_tokens: 1536, stream: false });
});
interface Change { probability?: number; alternatives?: { text: string; probability: number }[] }
function response(text: string, changes = new Map<number, Change>()): unknown {
  let offset = 0;
  return { choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: { content: [...text].map((char) => {
    const change = changes.get(offset); offset += char.length;
    return { bytes: [...encoder.encode(char)], logprob: Math.log(change?.probability ?? 0.99),
      top_logprobs: (change?.alternatives ?? []).map((a) => ({ bytes: [...encoder.encode(a.text)], logprob: Math.log(a.probability) })) };
  }) } }] };
}
function scored(text: string, changes?: Map<number, Change>) { return parseCompletion(response(text, changes)); }

it.each(['lines', 'edges', 'neighbors'] as const)('emits only llama.cpp-compatible array items throughout %s schema', (mode) => {
  const request = completionRequest('b', mode, ['data:image/png;base64,AA==']);
  const boxes: unknown[] = [];
  const fixedArrays: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    expect(node).not.toHaveProperty('prefixItems');
    if ('items' in node) { expect(typeof node.items).toBe('object'); expect(node.items).not.toBeNull(); expect(Array.isArray(node.items)).toBe(false); }
    if ('box' in node) boxes.push(node.box);
    if (node.minItems === 4 && node.maxItems === 4) fixedArrays.push(node);
    Object.values(node).forEach(visit);
  };
  visit(request.response_format);
  expect(boxes.length).toBeGreaterThan(0);
  // Zod can reuse the box through $ref; its actual definition is a fixed numeric array.
  expect(fixedArrays.length).toBeGreaterThan(0);
  for (const box of fixedArrays) expect(box).toMatchObject({ type: 'array', items: { type: 'number' } });
});

it('aligns stripped JSON fences, split UTF-8 bytes, per-value confidence and top-k alternatives', () => {
  const text = '{"lines":[{"text":"Đề 7"},{"text":"B"}]}';
  const bytes = encoder.encode(text), target = encoder.encode(text.slice(0, text.indexOf('7'))).length;
  const fence = (token: string) => ({ token, bytes: [...encoder.encode(token)], logprob: Math.log(0.001), top_logprobs: [] });
  // Real server shape: message.content excludes the fence, logprobs.content still contains it.
  const completion = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: {
    content: [fence('```'), fence('json'), fence('\n'),
      ...[...bytes].map((byte, i) => ({ bytes: [byte], logprob: Math.log(i === target ? 0.4 : 0.99),
        top_logprobs: i === target ? [{ bytes: [...encoder.encode('1')], logprob: Math.log(0.3) }] : [] })), fence('\n'), fence('```')],
  } }] }, true);
  expect(lineResult(completion, 100, 100)).toEqual([
    { text: 'Đề 7', conf: 0.4, alternatives: ['Đề 1'], charConf: [0.99, 0.99, 0.99, 0.4] }, { text: 'B', conf: 0.99, alternatives: [], charConf: [0.99] },
  ]);
  expect(completion.finish_reason).toBe('stop');
});

it('handles a token spanning fence/content boundaries without corrupting byte offsets', () => {
  const text = '{"lines":[{"text":"Đề"}]}';
  const wrapped = '```json\r\n' + text + '\r\n```';
  const c = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: text },
    logprobs: { content: [{ bytes: [...encoder.encode(wrapped)], logprob: Math.log(0.6),
      top_logprobs: [{ bytes: [...encoder.encode(wrapped.replace('Đề', 'Đê'))], logprob: Math.log(0.2) }] }] } }] });
  expect(lineResult(c, 1, 1)[0]).toEqual({ text: 'Đề', conf: 0.6, alternatives: ['Đê'], charConf: [0.6, 0.6] });
});

it.each(['prefix data', '```json\n{"lines":[]}\n```'])('rejects unmatched token content with logprob_alignment: %s', (tokens) => {
  expect(() => parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: '{"lines":[{"text":"7"}]}' },
    logprobs: { content: [{ bytes: [...encoder.encode(tokens)], logprob: -0.1 }] } }] }))
    .toThrow(expect.objectContaining({ code: 'logprob_alignment', reason: 'logprob_alignment' }));
});

it.each(['stop', 'length'])('reports repeated n-grams separately and retains finish_reason=%s', (finish_reason) => {
  expect(() => parseCompletion({ choices: [{ finish_reason, message: { content: '{"lines":[{"text":"' + 'lặp chữ '.repeat(12) } }] }, true))
    .toThrow(expect.objectContaining({ code: 'repetition_loop', reason: 'repetition_loop', finish_reason }));
});
it('rejects token-limited incomplete JSON without repairing it; complete JSON at length is still truncated', () => {
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length', message: { content: '{"lines":[' } }] }, true))
    .toThrow(expect.objectContaining({ code: 'repetition_loop', finish_reason: 'length' }));
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length', message: { content: '{"lines":[]}' } }] }, true))
    .toThrow(expect.objectContaining({ reason: 'truncated' }));
  // Closed malformed JSON and braces inside strings are not an unclosed JSON loop.
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length', message: { content: '{bad}' } }] }, true))
    .toThrow(expect.objectContaining({ reason: 'truncated' }));
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length', message: { content: '{"text":"[\\\"}"}' } }] }, true))
    .toThrow(expect.objectContaining({ reason: 'truncated' }));
});

it('only the ambiguous weight has low confidence; punctuation and keys do not contaminate other values', () => {
  const text = JSON.stringify(draft()), weight = text.indexOf('"w":7') + 4;
  const result = graphResult(scored(text, new Map([[weight, { probability: 0.4 }], [0, { probability: 0.001 }],
    [text.indexOf('representation'), { probability: 0.01 }]])));
  expect(result.vertices.every((v) => v.conf === 0.99)).toBe(true);
  expect(result.edges.map((e) => e.conf)).toEqual([0.99, 0.99, 0.99, 0.99]);
  expect(result.edges.map((e) => e.wConf)).toEqual([0.99, 0.99, 0.99, 0.4]);
  expect(result.question?.conf).toBe(0.99);
  expect(normalizeDraft(result).spec?.uncertain).toEqual([{ item: 'e4.w', candidates: [7] }]);
});

it.each([1, 2] as const)('flags an uncertain 9 at e2.w without an alternative after %i pass(es), preserving comparison semantics', async (passes) => {
  const d = draft(); d.edges[1]!.w = 9;
  const text = JSON.stringify(d), weight = text.indexOf('"w":9') + 4;
  const result = graphResult(scored(text, new Map([[weight, { probability: 0.4 }]])));
  expect(result.edges[1]).toMatchObject({ uConf: 0.99, vConf: 0.99, wConf: 0.4, conf: 0.99, wAlternatives: [] });
  const outcome = await readProblem([image], { reader: new FakeVisionReader({ edges: result, neighbors: result }), passes });
  expect(outcome.spec?.uncertain).toEqual([{ item: 'e2.w', candidates: [9] }]);
  expect(outcome.graphUncertain).toEqual([{ item: 'e2.w', candidates: [9] }]);
  const truthDraft = draft(); truthDraft.edges[1]!.w = 7;
  const comparison = compareRead(outcome, normalizeDraft(truthDraft).spec!);
  expect(comparison.differences).toEqual([expect.objectContaining({ item: 'e2.w', predicted: 9, expected: 7 })]);
  // The existing metric requires the true candidate for precise coverage; a field flag alone is not coarse coverage.
  expect(comparison.coverage).toEqual({ precise: 0, coarse: 0, none: 1 });
  expect(comparison.silentError).toBe(true);
});

it('measures u/v separately, includes a present edge name in existence confidence and ignores a null name', () => {
  const d = draft(), text = JSON.stringify(d);
  const result = graphResult(scored(text, new Map([
    [text.indexOf('"u":"A"') + 5, { probability: 0.4 }],
    [text.indexOf('"v":"B"') + 5, { probability: 0.5 }],
    [text.indexOf('"name":"b"') + 8, { probability: 0.6 }],
    [text.indexOf('"name":null') + 7, { probability: 0.01 }],
  ])));
  expect(result.edges[0]).toMatchObject({ uConf: 0.4, vConf: 0.5, wConf: 0.99, conf: 0.4 });
  expect(result.edges[1]?.conf).toBeCloseTo(0.6);
  expect(result.edges[2]?.conf).toBe(0.99);
  const flags = normalizeDraft(result).spec?.uncertain;
  expect(flags).toContainEqual({ item: 'e1.u', candidates: ['A'] });
  expect(flags).toContainEqual({ item: 'e1.v', candidates: ['B'] });
});

it('top-k weight 7/1 becomes a candidate and a matching reader uncertainty flag', () => {
  const text = JSON.stringify(draft()), weight = text.indexOf('"w":7') + 4;
  const result = graphResult(scored(text, new Map([[weight, { probability: 0.4, alternatives: [
    { text: '1', probability: 0.35 }, { text: '0', probability: 0.12 }, { text: '-2', probability: 0.11 },
    { text: '8', probability: 0.09 }, { text: '7', probability: 0.4 }, { text: 'null', probability: 0.1 },
  ] }]])));
  expect(result.edges[3]?.wAlternatives).toEqual([1]);
  expect(normalizeDraft(result).spec?.uncertain).toContainEqual({ item: 'e4.w', candidates: [7, 1] });
  expect(graphResult(scored(text, new Map([[weight, { alternatives: [{ text: '1', probability: 0.35 }] }]])), 0.36).edges[3]?.wAlternatives).toEqual([]);
});

it('keeps vertex and endpoint label alternatives without selecting a value to help the answer', () => {
  const text = JSON.stringify(draft());
  const index = text.indexOf('"label":"A"') + 9, endpoint = text.indexOf('"u":"A"') + 5;
  const result = graphResult(scored(text, new Map([[index, { alternatives: [{ text: 'X', probability: 0.2 }] }],
    [endpoint, { alternatives: [{ text: 'B', probability: 0.2 }] }]])));
  expect(result.vertices[0]?.alternatives).toEqual(['X']); expect(result.edges[0]?.uAlternatives).toEqual(['B']);
  expect(normalizeDraft(result).spec?.uncertain).toContainEqual({ item: 'A', candidates: ['A', 'X'] });
  expect(normalizeDraft(result).spec?.uncertain).toContainEqual({ item: 'e1.u', candidates: ['A', 'B'] });
});

it('scores question and option text separately, including repeated and escaped Vietnamese strings', () => {
  const d = draft(); d.question!.options = [{ id: 'a', text: 'Đề "7"', check: null, conf: 0 }];
  d.question!.rawText = 'Đề "7"';
  const text = JSON.stringify(d), index = text.lastIndexOf('7');
  const result = graphResult(scored(text, new Map([[index, { probability: 0.3 }]])));
  expect(result.question?.conf).toBe(0.99); expect(result.question?.options[0]?.conf).toBeCloseTo(0.3);
});

it('scores only each JSON text value and forms single-token alternatives, never combinations', () => {
  const text = JSON.stringify({ lines: [{ text: 'A7' }, { text: 'Đề "7" 😀', box: [100, 200, 900, 800] }] });
  const result = lineResult(scored(text, new Map([
    [text.indexOf('A7'), { probability: 0.8, alternatives: [{ text: 'B', probability: 0.15 }] }],
    [text.indexOf('A7') + 1, { probability: 0.4, alternatives: [{ text: '1', probability: 0.35 }, { text: '', probability: 0.12 }] }],
    [text.indexOf('"text"'), { probability: 0.001 }],
  ])), 4000, 3000);
  expect(result[0]).toEqual({ text: 'A7', conf: 0.4, alternatives: ['B7', 'A1', 'A'], charConf: [0.8, 0.4] });
  expect(result[1]).toEqual({ text: 'Đề "7" 😀', conf: 0.99, alternatives: [], box: [400, 600, 3600, 2400], charConf: Array(8).fill(0.99) });
  expect(result[0]?.alternatives).not.toContain('B1');
});

it('maps UTF-8 fragments and escaped JSON bytes to the right value', () => {
  const text = '{"lines":[{"text":"Đ\\u1ec1"},{"text":"OK"}]}';
  const bytes = encoder.encode(text); const target = encoder.encode(text.slice(0, text.indexOf('1ec1'))).length;
  const c = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: {
    content: [...bytes].map((byte, i) => ({ bytes: [byte], logprob: Math.log(i === target ? 0.45 : 0.98) })),
  } }] });
  const lines = lineResult(c, 100, 100);
  expect(lines[0]?.text).toBe('Đề'); expect(lines[0]?.conf).toBeCloseTo(0.45); expect(lines[1]?.conf).toBeCloseTo(0.98);
  expect(lines[0]?.charConf).toEqual([0.98, 0.45]);
  expect(lines[1]?.charConf).toEqual([0.98, 0.98]);
});

it('aligns NFC composition, escaped surrogate pairs and tokens containing several characters', () => {
  const text = '{"lines":[{"text":"o\\u0302\\u0301 \\ud83d\\ude00 7"}]}';
  const result = lineResult(scored(text, new Map([[text.indexOf('0301'), { probability: 0.3 }],
    [text.indexOf('ude00'), { probability: 0.4 }]])), 1, 1)[0]!;
  expect(result.text).toBe('ố 😀 7'); expect(result.charConf).toEqual([expect.closeTo(0.3), 0.99, 0.4, 0.99, 0.99]);
  const grouped = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'ABC' }, logprobs: {
    content: [{ bytes: [...encoder.encode('ABC')], logprob: Math.log(0.7) }] } }] });
  expect(plainLines(grouped)[0]!.charConf).toEqual([0.7, 0.7, 0.7]);
});

it('permits tokens straddling quotes/punctuation only when outside-value bytes are preserved', () => {
  const text = '{"lines":[{"text":"A7"}]}', split = text.indexOf('A7');
  const prefix = text.slice(0, split - 1), token = '"A7"', suffix = text.slice(split + 3);
  const c = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: { content: [
    { bytes: [...encoder.encode(prefix)], logprob: Math.log(0.99) },
    { bytes: [...encoder.encode(token)], logprob: Math.log(0.8), top_logprobs: [
      { bytes: [...encoder.encode('"A1"')], logprob: Math.log(0.2) },
      { bytes: [...encoder.encode('"A1",')], logprob: Math.log(0.2) },
    ] }, { bytes: [...encoder.encode(suffix)], logprob: Math.log(0.99) },
  ] } }] });
  expect(lineResult(c, 1, 1)[0]?.alternatives).toEqual(['A1']);
});

it('plain Paddle OCR is scored by line, excluding newline tokens', () => {
  const text = 'Đề\r\nA7\nB8';
  const result = plainLines(scored(text, new Map([[text.indexOf('7'), { probability: 0.4, alternatives: [{ text: '1', probability: 0.35 }] }],
    [text.indexOf('\r'), { probability: 0.001 }]])));
  expect(result).toEqual([{ text: 'Đề', conf: 0.99, alternatives: [], charConf: [0.99, 0.99] }, { text: 'A7', conf: 0.4, alternatives: ['A1'], charConf: [0.99, 0.4] },
    { text: 'B8', conf: 0.99, alternatives: [], charConf: [0.99, 0.99] }]);
});

it.each([[0, 0, 1100, 900], [2, 3, 1, 4], [0, 0, 0, 0], [-1, 0, 2, 4], [0, 0, 3], 'bad'])('drops bad boxes but keeps recognized lines: %j', (box) => {
  const text = JSON.stringify({ lines: [{ text: '7', box }] });
  expect(lineResult(scored(text), 4000, 3000)).toEqual([{ text: '7', conf: 0.99, alternatives: [], charConf: [0.99] }]);
});

it('parses Paddle spotting polygons, measures text only and maps box to original pixels', () => {
  const loc = '<|LOC_100|><|LOC_200|><|LOC_900|><|LOC_200|><|LOC_900|><|LOC_800|><|LOC_100|><|LOC_800|>';
  const text = `<|TEXT_START|>A7<|TEXT_END|><|LOC_BEGIN|>${loc}<|LOC_END|>`;
  const result = spottingLines(scored(text, new Map([[0, { probability: 0.001 }],
    [text.indexOf('7'), { probability: 0.4, alternatives: [{ text: '1', probability: 0.35 }] }]])), 4000, 3000);
  expect(result).toEqual([{ text: 'A7', conf: 0.4, alternatives: ['A1'], box: [400, 600, 3600, 2400], charConf: [0.99, 0.4] }]);
  expect(spottingLines(scored(`A7${loc}`), 4000, 3000)[0]?.box).toEqual([400, 600, 3600, 2400]);
  expect(spottingLines(scored(text.replace('LOC_100', 'LOC_1001')), 4000, 3000)[0]?.box).toBeUndefined();
});

it('converts vertex boxes to original dimensions and drops malformed vertex coordinates without losing the graph', () => {
  const d = draft();
  d.vertices[0]!.box = [100, 200, 900, 800];
  d.vertices[1]!.box = [-1, 0, 100, 100];
  const result = graphResult(scored(JSON.stringify(d)), 0.1, [{ width: 4000, height: 3000 }]);
  expect(result.vertices[0]?.box).toEqual([400, 600, 3600, 2400]); expect(result.vertices[1]?.box).toBeUndefined();
  expect(graphResult(scored(JSON.stringify(d)), 0.1, [{ width: 1, height: 1 }, { width: 1, height: 1 }]).vertices[0]?.box).toBeUndefined();
});

it('invalid JSON, duplicate keys and invalid/missing scores have data-free reason codes', () => {
  expect(() => lineResult(scored('```json\n{}\n```'), 1, 1)).toThrow(expect.objectContaining({ reason: 'invalid_json' }));
  expect(() => lineResult(scored('{"lines":[],"lines":[{"text":"A"}]}'), 1, 1)).toThrow(expect.objectContaining({ reason: 'invalid_json' }));
  expect(() => parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'private data' } }] }))
    .toThrow(expect.objectContaining({ reason: 'missing_probs' }));
  expect(() => parseCompletion({ choices: [{ finish_reason: 'length' }] })).toThrow(expect.objectContaining({ reason: 'truncated' }));
});

it('builds grammar-constrained B requests with pre-sampling scores, distinct passes and no previous draft', () => {
  const urls = ['data:image/png;base64,AA=='];
  const edges = completionRequest('b', 'edges', urls), neighbors = completionRequest('b', 'neighbors', urls);
  expect(edges).toHaveProperty('response_format.type', 'json_schema'); expect(edges).toMatchObject({ post_sampling_probs: false, logprobs: true, top_logprobs: 5 });
  expect(edges.messages).not.toEqual(neighbors.messages);
  expect(completionRequest('a', 'spotting', urls)).not.toHaveProperty('response_format');
  expect(() => completionRequest('b', 'lines', ['https://external.invalid/image'])).toThrow();
});

it('executes shared parsing, request construction and resize without Node or networking globals', () => {
  let result: unknown, request: unknown, resized: unknown, graph: unknown;
  const names = ['Buffer', 'process', 'require', 'fetch', 'XMLHttpRequest', 'WebSocket'];
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  try {
    for (const name of names) Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
    result = lineResult(scored('{"lines":[{"text":"Đề"}]}'), 2, 1);
    graph = graphResult(scored(JSON.stringify(draft())));
    request = completionRequest('b', 'lines', ['data:image/png;base64,AA==']);
    resized = resizeImage({ width: 2, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]) }, 1);
  } finally {
    names.forEach((name, i) => { const descriptor = descriptors[i]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  expect(result).toEqual([{ text: 'Đề', conf: 0.99, alternatives: [], charConf: [0.99, 0.99] }]);
  expect(graph).toHaveProperty('vertices.0.conf', 0.99);
  expect(request).toHaveProperty('response_format.type', 'json_schema');
  expect(resized).toMatchObject({ width: 1, height: 1, pixels: new Uint8ClampedArray([50, 50, 50, 255]) });
});
it('B glyph requests use one scalar string and measured UTF-8 value probabilities', async () => {
  const {glyphResult}=await import('../src/index.js');
  const request=completionRequest('b','glyph',['data:image/png;base64,AA=='],32);
  expect(request).toMatchObject({response_format:{schema:{type:'string'}},max_tokens:32,post_sampling_probs:false});
  const result=glyphResult(scored('"17"',new Map([[1,{probability:.8,alternatives:[{text:'7',probability:.15}]}]])));
  expect(result[0]).toEqual({text:'17',probability:.8});expect(result[1]!.text).toBe('77');expect(result[1]!.probability).toBeCloseTo(.15);
  expect(()=>glyphResult(scored('{"text":"17"}'))).toThrow();
  expect(()=>parseCompletion({choices:[{finish_reason:'stop',message:{content:'"17"'}}]},true)).toThrow();
});
