import type { ClaimBody } from '@mathtwin/core';
import type { WorkVocabulary } from '../types.js';
import { labelList, oneLabel, LabelError } from './labels.js';
import { escapeRegex, fold, language, symbols } from './text.js';
import { numericValue, slotClaim, unpad, writtenNumbers } from './slots.js';
import { algorithmClause } from './algorithms.js';

export type WalkKind = Extract<ClaimBody, { type: 'walk' }>['kind'];
export interface ProseContext { walk?: string[]; kind?: WalkKind; reason?: Extract<ClaimBody, { type: 'hamilton_exists' }>['reason']; lastGradingLine?: boolean }
/** Split only outside notation; commas in lists and decimal numbers stay intact. */
export function splitClauses(input: string, vocab: WorkVocabulary): string[] {
  const text = language(input, vocab.vertexLabels);
  if (/[a-z][).:]\s*(?:dung|sai|d|s)(?:$|[\s.;,])/u.test(text) || /^bac\s*:/u.test(text)) return [input];
  if (/\bdo\s+thi(?:\s+da\s+cho)?\s+co\s+\d+\s+dinh\s+la\b.*\s+(?:va|và)\s+\d+\s+canh\s+la\b/u.test(text)) return [input];
  // Resolve the uniqueness of a detached degree over the whole sentence.
  if (text.includes(',') && /\bbac\s+-?\d/u.test(text) && !/[;.]/u.test(text.replace(/\.$/u, ''))) return [input];
  // Folded text has different offsets from the source: split source by punctuation,
  // then recognize conjunctions on each source token, preserving exact source text.
  const clauses: string[] = []; let start = 0; let depth = 0;
  const separator = /^(?:,?\s*(?:và|va|nên|nen|vì|vi|do đó|do do)\s+|\s*⇒\s*)/iu;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if ('({['.includes(char)) depth++;
    if (')}]'.includes(char)) depth--;
    if (depth) continue;
    const conjunction = (char === ',' || /\s/u.test(char)) ? input.slice(i).match(separator) : char === '⇒' ? input.slice(i).match(separator) : null;
    const punctuation = char === ';' || char === '.' && !(/\d/u.test(input[i - 1] ?? '') && /\d/u.test(input[i + 1] ?? ''));
    if (!conjunction && !punctuation) continue;
    const end = conjunction ? i + conjunction[0].length : i + 1;
    const piece = input.slice(start, i).trim();
    if (conjunction && !gradingContent(piece, vocab) && !/lien thong|euler|hamilton|thoa/u.test(language(piece, vocab.vertexLabels))) continue;
    if (piece) clauses.push(piece);
    start = end; i = end - 1;
  }
  const tail = input.slice(start).trim(); if (tail) clauses.push(tail);
  return clauses;
}
function lastNumber(text: string): number | undefined {
  return numericValue(text.trim().replace(/[.;]$/u, ''));
}
const numberWords = new Map([
  ['mot', 1], ['hai', 2], ['ba', 3], ['bon', 4], ['nam', 5], ['sau', 6], ['bay', 7], ['tam', 8], ['chin', 9], ['muoi', 10],
]);
function numberValue(text: string): number | undefined {
  const numeric = lastNumber(text);
  if (numeric !== undefined) return numeric;
  return numberWords.get(text.trim());
}
function compactWalk(token: string, labels: string[], edgeNames: string[] = []): string[] | undefined {
  const source = token.trim();
  if (!/[→,\s-]/u.test(source)) {
    // In a compact route, case is information: `a` can be an edge name between
    // vertices A and E, but must never silently become vertex A. Exact matching
    // also leaves an exact vertex/edge collision ambiguous instead of guessing.
    const results: string[][] = [];
    const visit = (offset: number, vertices: string[]): void => {
      if (results.length > 1) return;
      if (offset === source.length) { results.push(vertices); return; }
      const choices = [
        ...labels.filter((label) => source.startsWith(label, offset)).map((value) => ({ value, vertex: true })),
        ...edgeNames.filter((name) => source.startsWith(name, offset)).map((value) => ({ value, vertex: false })),
      ];
      for (const choice of choices) visit(offset + choice.value.length, choice.vertex ? [...vertices, choice.value] : vertices);
    };
    visit(0, []);
    return results.length === 1 && results[0]!.length >= 2 ? results[0]! : undefined;
  }
  try {
    const vertices = labelList(source, labels);
    return vertices.length >= 2 ? vertices : undefined;
  } catch (error) {
    if (error instanceof LabelError) return undefined;
    throw error;
  }
}
function redundantWalkNote(input: string, vertices: string[], edgeNames: string[]): boolean {
  const notes = [...input.matchAll(/\(([^()]*)\)/gu)];
  if (!notes.length) return true;
  if (!edgeNames.length) return false;
  const key = (value: string): string => language(value, vertices);
  const pairs = new Set(vertices.slice(1).map((to, index) => `${key(vertices[index]!)}\u0000${key(to)}`));
  for (const note of notes) {
    const clauses = language(note[1]!, vertices).split(/\s*,?\s*(?:roi|va)\s+/u).filter(Boolean);
    if (!clauses.length) return false;
    for (const clause of clauses) {
      const match = clause.match(/^(?:di\s+)?tu\s+([^\s,]+)\s+(?:den|ve)\s+([^\s,]+)\s+theo\s+canh\s+([^\s,]+)$/u);
      if (!match || !edgeNames.includes(match[3]!) || !pairs.has(`${match[1]!}\u0000${match[2]!}`)) return false;
    }
  }
  return true;
}
/** Explicit degree lists have to bind every number to its own vertex. */
function degreeAssertions(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const labels = vocab.vertexLabels;
  const result: ClaimBody[] = [];
  const notation = /(?:(?:d|deg)\(\s*[^(),]+?\s*\)\s*=\s*)+(-?\d+(?:[.,]\d+)?)(?=$|[,;.]|\s+deu\b)/gu;
  const chains = [...text.matchAll(notation)];
  if (chains.length) {
    // Textbook degree lists often have an introductory phrase and a shared
    // parity conclusion.  Accept only those fixed wrappers: any remaining
    // label, number, or free text would make the binding unsafe.
    let residue = text.replace(notation, '').replace(/^[\s,;.]+|[\s,;.]+$/gu, '');
    residue = residue.replace(/^(?:[a-d]\)\s*)?/u, '');
    residue = residue.replace(/^xet\s+(?:da\s+)?do\s+thi(?:\s+g)?\s+o\s+hinh\s+[\d.]+[a-z]?\.?\s*ta\s+co\s*/u, '');
    residue = residue.replace(/^ta\s+co\s*/u, '');
    residue = residue.replace(/^do\s+thi(?:\s+g)?(?:\s+lien\s+thong)?\s+va\s*/u, '');
    residue = residue.replace(/^(?:[,;]\s*)+/u, '').replace(/(?:[,;]\s*)?(?:deu\s+la\s+so\s+(?:chan|le))?\s*$/u, '');
    if (residue) return undefined;
    for (const chain of chains) {
      const vertices = [...chain[0].matchAll(/\b(?:d|deg)\(\s*([^(),]+?)\s*\)/gu)].map((match) => oneLabel(match[1]!, labels));
      const value = Number(chain[1]!.replace(',', '.'));
      result.push(...vertices.map((v) => ({ type: 'degree' as const, v, value })));
    }
    return result.length ? result : undefined;
  }

  const textual = /(?:^|[,;]\s*)([^,;]+?)\s+la\s+(?:dinh\s+)?bac\s+(-?\d+(?:[.,]\d+)?)(?=$|[,;])/gu;
  for (const match of text.matchAll(textual)) {
    const v = oneLabel(match[1]!.trim(), labels);
    result.push({ type: 'degree', v, value: Number(match[2]!.replace(',', '.')) });
  }
  if (result.length) return result;

  const ordered = text.match(/\bbac\s+cua\s+(.+?)\s+lan\s+luot\s+(?:la|bang)?\s+(.+)$/u);
  if (ordered) {
    const vertices = labelList(ordered[1]!, labels);
    const values = [...ordered[2]!.matchAll(/(?<![\p{L}\p{N}_])-?\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu)].map((match) => Number(match[0].replace(',', '.')));
    if (vertices.length !== values.length || !vertices.length) return undefined;
    return vertices.map((v, index) => ({ type: 'degree', v, value: values[index]! }));
  }

  const same = text.match(/^\s*(.+?)\s+(?:deu|đều)\s+co\s+bac\s+(-?\d+(?:[.,]\d+)?)(?:\s+la\s+so\s+(?:chan|chẵn|le|lẻ))?\s*$/u);
  if (same) {
    const vertices = labelList(same[1]!.replace(/^dinh\s+/u, ''), labels);
    if (!vertices.length) return undefined;
    const value = Number(same[2]!.replace(',', '.'));
    return vertices.map((v) => ({ type: 'degree', v, value }));
  }
  const grouped = text.match(/^\s*(?:dinh\s+)?(.+?)\s+co\s+bac\s+(-?\d+(?:[.,]\d+)?)\s*$/u);
  if (grouped) {
    const vertices = labelList(grouped[1]!, labels);
    if (!vertices.length) return undefined;
    const value = Number(grouped[2]!.replace(',', '.'));
    return vertices.map((v) => ({ type: 'degree', v, value }));
  }
  return undefined;
}
function setAssertion(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const set = text.match(/^\s*([VE])\s*\(\s*G\s*\)\s*=\s*\{([^}]*)\}\s*$/iu);
  if (!set) return undefined;
  const values = labelList(set[2]!, vocab.vertexLabels);
  if (set[1]!.toUpperCase() === 'V') return [{ type: 'vertex_list', vertices: values }];
  if (!values.length || values.length % 2) return undefined;
  return [{ type: 'edge_list', edges: Array.from({ length: values.length / 2 }, (_, index) => ({ u: values[2 * index]!, v: values[2 * index + 1]! })) }];
}
function elementCounts(text: string): ClaimBody[] | undefined {
  // Counts for a named comparison graph (for example a complete graph) are not
  // facts about the graph being graded.
  if (/\bdo thi day du\b/u.test(text)) return undefined;
  const both = text.match(/\bdo thi(?: da cho)?\s+co\s+(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+dinh(?:\s+la)?(?:.*?)\s+(?:va|và)\s+(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+canh\b/u);
  if (both) {
    const vertices = numberValue(both[1]!); const edges = numberValue(both[2]!);
    if (vertices !== undefined && edges !== undefined) return [{ type: 'vertex_count', value: vertices }, { type: 'edge_count', value: edges }];
  }
  const components = text.match(/\bdo thi\s+co\s+(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+thanh phan lien thong\b/u);
  if (components) {
    const value = numberValue(components[1]!);
    if (value !== undefined) return [{ type: 'component_count', value }];
  }
  const edge = text.match(/\bdo thi(?: da cho)?\s+co\s+(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+canh\b/u);
  if (edge) {
    const value = numberValue(edge[1]!);
    if (value !== undefined) return [{ type: 'edge_count', value }];
  }
  return undefined;
}
/** Traversal quantifiers are conditions, never graph cardinalities. */
function quantifiedOccurrence(text: string): boolean {
  return /\b(?:moi|mỗi)\s+(?:canh|cạnh|dinh|đỉnh)\b[^.;]*\b(?:dung|đúng|it\s+nhat|ít\s+nhất|mot|một)\s+\d*\s*(?:lan|lần)\b/iu.test(text)
    || /\b(?:canh|cạnh|dinh|đỉnh)\s+(?:dung|đúng|it\s+nhat|ít\s+nhất)\s+\d*\s*(?:lan|lần)\b/iu.test(text);
}
function elementListing(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const listed = text.match(/\bdo\s+thi(?:\s+da\s+cho)?\s+co\s+(\d+)\s+dinh\s+la\s+(.+?)\s+(?:va|và)\s+(\d+)\s+canh\s+la\s+(.+)$/u);
  if (!listed) return undefined;
  const vertexCount = Number(listed[1]!);
  const edgeCount = Number(listed[3]!);
  const vertices = labelList(listed[2]!, vocab.vertexLabels);
  if (vertices.length !== vertexCount) return undefined;
  let endpoints: string[];
  try {
    endpoints = labelList(listed[4]!, vocab.vertexLabels);
  } catch (error) {
    if (!(error instanceof LabelError)) throw error;
    return undefined;
  }
  if (endpoints.length !== edgeCount * 2) return undefined;
  return [
    { type: 'vertex_count', value: vertexCount },
    { type: 'vertex_list', vertices },
    { type: 'edge_count', value: edgeCount },
    { type: 'edge_list', edges: Array.from({ length: edgeCount }, (_, index) => ({ u: endpoints[index * 2]!, v: endpoints[index * 2 + 1]! })) },
  ];
}
function oddDegreeListing(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const match = text.match(/\bcac\s+dinh\s+bac\s+le\s+cua\s+do\s+thi\s+la\s+(.+?)(?:\s*\(|$)/u);
  if (!match) return undefined;
  const vertices = labelList(match[1]!, vocab.vertexLabels);
  return vertices.length ? [{ type: 'odd_vertices', vertices }] : undefined;
}
function postmanPathLengths(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  if (vocab.task !== 'postman') return undefined;
  const matches = [...text.matchAll(/(?:^|[,;:]\s*)([^\s,;:=]+)\s*=\s*([^,;]+?=\s*-?\d+(?:[.,]\d+)?)(?=$|[,;])/gu)];
  if (!matches.length) return undefined;
  const claims: ClaimBody[] = [];
  for (const match of matches) {
    const vertices = compactWalk(match[1]!, vocab.vertexLabels, vocab.edgeNames);
    const value = numericValue(match[2]!, vocab.vertexLabels, true);
    if (!vertices || value === undefined) return undefined;
    claims.push({ type: 'length', vertices, value });
  }
  return claims;
}
function declaredShortestPath(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const match = text.match(/\bduong\s+di\s+ngan\s+nhat\s+tu\s+([^\s,]+)\s+den\s+([^\s,]+)\s+la\s+([^\s,;]+)\s+va\s+co\s+do\s+dai\s+la\s+(.+)$/u);
  if (!match) return undefined;
  const from = oneLabel(match[1]!, vocab.vertexLabels);
  const to = oneLabel(match[2]!, vocab.vertexLabels);
  let vertices: string[] | undefined;
  try { vertices = labelList(match[3]!, vocab.vertexLabels); }
  catch (error) { if (!(error instanceof LabelError)) throw error; }
  const value = numericValue(match[4]!, vocab.vertexLabels, true);
  if (!vertices || vertices[0] !== from || vertices.at(-1) !== to || value === undefined) return undefined;
  return [{ type: 'walk', kind: 'path', vertices }, { type: 'shortest_length', from, to, value }];
}
function namedWalkWithLength(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const prefix = '(?:mot\\s+)?(?:vi\\s+du\\s+(?:ve\\s+)?|mau\\s+)?(?:duong\\s+di|chu\\s+trinh)(?:\\s+euler|\\s+hamilton)?[^:=]*\\bla\\s*:?\\s*';
  const match = text.match(new RegExp(`${prefix}(.+?)\\s*,?\\s*(?:voi\\s+)?tong\\s+(?:do\\s+dai|trong\\s+so|chi\\s+phi)[^:=]*[:=]\\s*(.+)$`, 'u'))
    ?? text.match(new RegExp(`${prefix}(.+)$`, 'u'));
  if (!match) return undefined;
  const vertices = compactWalk(match[1]!, vocab.vertexLabels, vocab.edgeNames);
  if (!vertices) return undefined;
  const walk: ClaimBody = { type: 'walk', kind: walkKind(text, vocab, vertices), vertices };
  if (!match[2]) return [walk];
  const value = numericValue(match[2]!, vocab.vertexLabels, true);
  return value === undefined ? undefined : [walk, { type: 'length', vertices, value }];
}
/** Parse one or more explicitly written route = length propositions. */
function inlinePathLengths(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const parts = text.split(/\s*;\s*/u).filter(Boolean);
  if (!parts.length) return undefined;
  const claims: ClaimBody[] = [];
  for (const part of parts) {
    const match = part.match(/^\s*([\p{L}\p{N}_\s→-]+?)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*(?:\([^)]*\))?\s*$/u);
    if (!match || !/[→-]/u.test(match[1]!)) return undefined;
    let vertices: string[];
    try { vertices = labelList(match[1]!, vocab.vertexLabels); }
    catch (error) { if (error instanceof LabelError) return undefined; throw error; }
    if (vertices.length < 2) return undefined;
    const value = Number(match[2]!.replace(',', '.'));
    // In a shortest-path exercise, a list of alternatives is evidence for
    // comparing lengths, not a declaration that every listed route is shortest.
    // `length` retains the route and is independently gradeable without making
    // the first non-optimal candidate a false conclusion.
    if (vocab.task !== 'shortest_path') claims.push({ type: 'walk', kind: 'path', vertices });
    claims.push({ type: 'length', vertices, value });
  }
  return claims;
}
function contextualTotal(text: string, context: ProseContext): ClaimBody[] | undefined {
  if (!context.walk) return undefined;
  const total = text.match(/^(?:s\s*=|tong\s+(?:trong\s+so|chi\s+phi|quang\s+duong)[^:=]*[:=])\s*(.+)$/u);
  if (!total) return undefined;
  const value = numericValue(total[1]!, [], true);
  return value === undefined ? undefined : [{ type: 'length', vertices: [...context.walk], value }];
}
function compactWalkAssertions(input: string, text: string, vocab: WorkVocabulary, context: ProseContext): ClaimBody[] | undefined {
  const source = input.replace(/[.;]$/u, '').trim();
  const kind = walkKind(text, vocab);
  const listed = source.match(/^\s*(.+?)\s+là\s+(?:các\s+)?(?:một\s+)?(?:ba\s+)?đường\s+đi/iu);
  if (listed) {
    const walks = listed[1]!.split(/\s*,\s*/u).map((part) => compactWalk(part, vocab.vertexLabels, vocab.edgeNames));
    return walks.every((walk) => walk !== undefined) ? walks.map((vertices) => ({ type: 'walk', kind, vertices: vertices! })) : undefined;
  }
  const named = source.match(/(?:^|\s)(?:ta\s+có\s+)?([^\s,;]+)\s+là\s+(?:một\s+)?(?:chu\s+trình|đường\s+đi)/iu)
    ?? source.match(/(?:chu\s+trình|đường\s+đi)(?:\s+Euler|\s+Hamilton)?[^\n]*?\s+là\s+([^\s,;]+)/iu);
  const vertices = named && compactWalk(named[1]!, vocab.vertexLabels, vocab.edgeNames);
  return vertices && redundantWalkNote(source, vertices, vocab.edgeNames) ? [{ type: 'walk', kind, vertices }] : undefined;
}
function relationAssertion(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  const vertex = vocab.vertexLabels.map((label) => escapeRegex(language(label, vocab.vertexLabels))).join('|');
  if (!vertex) return undefined;
  const relation = new RegExp(`(?:^|\\s)(?:tu\\s+)?(${vertex})\\s+(?:(?:di\\s+(?:duoc\\s+)?(?:toi|den))|ke(?:\\s+voi)?|noi\\s+voi|co\\s+canh\\s+(?:voi|den))\\s+(${vertex})(?:$|[\\s.,;])`, 'u').exec(text);
  if (!relation) return undefined;
  const trailing = text.slice((relation.index ?? 0) + relation[0].length).trim();
  if (trailing && !/^(?:roi|nen|vi|do)\b/u.test(trailing)) return undefined;
  return [{ type: 'walk', kind: 'path', vertices: [oneLabel(relation[1]!, vocab.vertexLabels), oneLabel(relation[2]!, vocab.vertexLabels)] }];
}
function compactTourAssertion(input: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  if (!['tsp', 'postman'].includes(vocab.task)) return undefined;
  const match = input.match(/^\s*([^\s:;|]+)\s*:\s*(.+?)\s*[;.]*\s*$/u)
    ?? input.match(/^\s*[^|]+\|\s*([^|\s]+)\s*\|\s*(.+?)\s*$/u)
    ?? input.match(/\b(?:tong chi phi|tong quang duong)\s+theo\s+chu trinh\s+([^\s:;,]+)\s+la\s*:?\s*(.+?)\s*[;.]*\s*$/iu);
  if (!match) return undefined;
  const vertices = compactWalk(match[1]!, vocab.vertexLabels, vocab.edgeNames);
  const value = numericValue(match[2]!, vocab.vertexLabels, true);
  if (!vertices || value === undefined) return undefined;
  const kind = vocab.task === 'tsp' ? 'tsp_tour' : 'postman_tour';
  return [{ type: 'walk', kind, vertices }, { type: 'length', vertices, value }];
}
export function walkKind(text: string, vocab: WorkVocabulary, vertices: string[] = []): WalkKind {
  if (/euler/u.test(text)) return /chu trinh/u.test(text) ? 'euler_circuit' : 'euler_path';
  if (/hamilton/u.test(text)) return /chu trinh/u.test(text) ? 'hamilton_cycle' : 'hamilton_path';
  if (/du lich|tsp/u.test(text)) return 'tsp_tour';
  if (/dua thu/u.test(text)) return 'postman_tour';
  switch (vocab.task) {
    case 'euler': return vertices.length > 1 && vertices[0] === vertices.at(-1) ? 'euler_circuit' : 'euler_path';
    case 'hamilton': return vertices.length > 1 && vertices[0] === vertices.at(-1) ? 'hamilton_cycle' : 'hamilton_path';
    case 'tsp': return 'tsp_tour';
    case 'postman': return 'postman_tour';
    default: return 'path';
  }
}
export function isHeading(text: string): boolean {
  return /^(?:(?:duong di|chu trinh)(?: euler| hamilton| nguoi du lich)?|hanh trinh nguoi dua thu)\s*:$/u.test(text);
}
/** A syntactic grading-content guard; labels alone and explanatory prose are harmless. */
export function gradingContent(input: string, vocab: WorkVocabulary): boolean {
  const text = language(input, vocab.vertexLabels);
  // Named-edge commentary does not add a gradeable assertion; an unknown edge
  // identifier must not suppress a complete route on the same source line.
  if (/\bcanh theo thu tu\b/u.test(text)) return false;
  // Orthographic folding must not turn the descriptive verb “dùng” into “đúng”.
  const judgments = fold(input.normalize('NFC').replace(/(?<![\p{L}])dùng(?![\p{L}])/giu, ''));
  let withoutLabels = text;
  for (const label of vocab.vertexLabels) {
    const key = language(label, vocab.vertexLabels);
    withoutLabels = withoutLabels.split(/([^\p{L}\p{N}_])/u).map((t) => t === key ? '' : t).join('');
  }
  return /\d|=/u.test(withoutLabels) || /[\p{L}\p{N}]\s*(?:→|-)\s*[\p{L}\p{N}]/u.test(text)
    || /\b(?:vay|kl|ket luan|ket qua|dap so|dap an)\b/u.test(text) || /\b(?:dung|sai)\b/u.test(judgments)
    || /^[ds][.;]?$/u.test(text)
    || /(?:^|\s)[a-z][).:]\s*[ds](?:$|[\s.;,])/u.test(text)
    || /\bchon\s+(?:phuong an\s+)?[a-d](?:$|[\s.;,)])/u.test(text)
    || [...text.matchAll(/\b(?:chon|khoanh|danh dau|co dinh|(?:ghi|gan|doi) nhan|di den|lap lai|them canh)\b/gu)].some((action) =>
      text.slice(action.index + action[0].length).split(/[^\p{L}\p{N}_]+/u)
        .some((word) => vocab.vertexLabels.some((v) => language(v, vocab.vertexLabels) === word)));
}
function finalValue(text: string, vocab: WorkVocabulary): unknown {
  const clean = text.replace(/[.]$/u, '').trim();
  const scalar = numericValue(clean, vocab.vertexLabels, true);
  if (scalar !== undefined && ['degree', 'shortest_path', 'tsp', 'postman'].includes(vocab.task)) return scalar;
  const compact = unpad(clean, vocab.vertexLabels);
  const booleanTask = ['connectivity', 'path', 'euler', 'hamilton', 'degree_sequence'].includes(vocab.task);
  if (booleanTask && !/[?\d]|\b(?:chua|hoac)\b/u.test(compact)) {
    const values = [...compact.matchAll(/\b(?:khong (?:co|ton tai|lien thong)|khong|co|ton tai|dung|true|lien thong|sai|false)\b/gu)];
    if (values.length === 1) return !/^(?:khong|sai|false)/u.test(values[0]![0]);
    if (!compact && /\bco\b/u.test(clean)) return true;
  }
  const route = compact.replace(/^(?:duong di|chu trinh)(?: euler| hamilton)?\s*[:=]?\s*/u, '');
  if (/^[\p{L}\p{N}_\s→{}-]+$/u.test(route) && /→|-/u.test(route)) {
    const vertices = labelList(route, vocab.vertexLabels);
    if (vertices.length >= 2 && ['path', 'euler', 'hamilton', 'shortest_path', 'tsp', 'postman'].includes(vocab.task)) return { walk: { vertices } };
  }
  return undefined;
}
/** A comma may separate the named vertex from its explicitly written degree. */
function detachedDegree(text: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  if (!text.includes(',') || [...text.matchAll(/\bbac\b/gu)].length !== 1) return undefined;
  const degree = /\bbac\s+(-?\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_])/u.exec(text);
  if (!degree || writtenNumbers(text, vocab.vertexLabels).length !== 1 || /[?]|\b(?:khong|chua|hoac|khoang|hon|kem)\b/u.test(text)) return undefined;
  const vertices = text.split(/[^\p{L}\p{N}_]+/u).flatMap((word) => vocab.vertexLabels.filter((label) => label.toLowerCase() === word));
  if (vertices.length !== 1) return undefined;
  return [{ type: 'degree', v: vertices[0]!, value: Number(degree[1]!.replace(',', '.')) }];
}
/** Parse a complete clause. undefined means no supported complete interpretation. */
export function proseClause(input: string, vocab: WorkVocabulary, context: ProseContext): ClaimBody[] | undefined {
  const labels = vocab.vertexLabels;
  let text = language(input, labels).replace(/[.;]$/u, '').trim();
  text = text.replace(/^(?:[-•]\s*|={1,2}>\s*)/u, '').replace(/^(?:em ghi|quan sat)\s*:\s*/u, '');
  if (/canh theo thu tu/u.test(text)) return undefined;
  // These are headings or observations for which core has no claim type. They
  // carry no independently gradeable value, so preserve them as prose.
  if (/^tap hop cac (?:dinh|canh)(?: cua do thi)? la$/u.test(text)
    || /^cac dinh ke voi\s+.+$/u.test(text)
    || /^xet (?:da )?do thi\b.*\bhinh\b/u.test(text)) return [];
  const set = setAssertion(text, vocab);
  if (set) return set;
  // d(A, B) and d A,B are distances, never degree notation.
  const distanceNotation = /\bd\s*(?:\(\s*[^(),]+\s*,\s*[^()]+\)|[\p{L}\p{N}_]+\s*,\s*[\p{L}\p{N}_]+)\s*=/u.test(text);
  if (distanceNotation && !/\bd\s*\(/u.test(text)) return undefined;
  if (quantifiedOccurrence(text)) {
    // This is a known qualitative traversal condition but core has no claim
    // for it.  It must not become a fabricated edge/vertex count.
    if (/^(?:duong\s+di\s+nay\s+)?di\s+qua\s+moi\s+(?:canh|dinh)\b.*\b(?:lan)\s*$/u.test(text)) return [];
    return undefined;
  }
  const odd = oddDegreeListing(text, vocab);
  const degreeStart = text.search(/\b(?:d|deg)\(/u);
  const embeddedDegrees = odd && degreeStart >= 0 ? text.slice(degreeStart).replace(/\)\s*$/u, '') : undefined;
  const degrees = degreeAssertions(text, vocab) ?? (embeddedDegrees ? degreeAssertions(embeddedDegrees, vocab) : undefined);
  if (degrees) return odd ? [...odd, ...degrees] : degrees;
  // Do not let a failed symbolic degree list fall through to the generic
  // subject matcher, which can bind the first vertex to the last number.
  if (/\b(?:d|deg)\(\s*[^(),]+\s*\)\s*=/u.test(text) && !/\b(?:n|l|w)\s*\(/u.test(text)) return undefined;
  const listing = elementListing(text, vocab);
  if (listing) return listing;
  if (/\bdo\s+thi(?:\s+da\s+cho)?\s+co\s+\d+\s+dinh\s+la\b.*\s+(?:va|và)\s+\d+\s+canh\s+la\b/u.test(text)) return undefined;
  const counts = elementCounts(text);
  if (counts) return counts;
  const shortest = declaredShortestPath(text, vocab);
  if (shortest) return shortest;
  const namedWalk = namedWalkWithLength(text, vocab);
  if (namedWalk) return namedWalk;
  const inlineLengths = inlinePathLengths(text, vocab);
  if (inlineLengths) return inlineLengths;
  const total = contextualTotal(text, context);
  if (total) return total;
  const postmanLengths = postmanPathLengths(input, vocab);
  if (postmanLengths) return postmanLengths;
  const relation = relationAssertion(text, vocab);
  if (relation) return relation;
  const compact = compactWalkAssertions(input, text, vocab, context);
  if (compact) return compact;
  const compactTour = compactTourAssertion(input, vocab);
  if (compactTour) return compactTour;
  if (/\bdo thi day du\b/u.test(text) && /\bdinh\b.*\bcanh\b/u.test(text)) return undefined;
  // Never turn an unsupported algorithm action into a different kind of claim.
  const final = /\b(?:dap so|dap an|kl|vay|ket luan|ket qua(?: cuoi cung)?)\b/u.exec(text);
  if (!final) {
    const algorithm = algorithmClause(input, vocab);
    if (algorithm) return algorithm;
  }
  if (vocab.questionFormat === 'trac_nghiem') {
    const choice = text.match(/(?:chon|dap an)\s+(?:phuong an\s+)?([a-d])$/u);
    const bare = text.match(/^([a-d])$/u);
    if (bare || choice && unpad(text.slice(0, choice.index)) === '') return [{ type: 'choice', option: (bare ?? choice)![1]!.toUpperCase() }];
  }
  if (!final && (/\b(?:chon|danh dau|khoanh|nhan(?! (?:thay|xet|duoc|ra|so|tong|do|bac|cac)\b)|gan nhan|lap lai|canh lap|them canh|gan nhat|nho nhat)\b/u.test(text) && !/duong di ngan nhat/u.test(text)
    || /\b(?:n|l)\s*\(/u.test(text))) return undefined;
  const statements = [...text.matchAll(/(?:^|[\s;,])([\p{L}\p{N}_]+)[).:]\s*(dung|sai|d|s)(?=$|[\s;,])/gu)];
  if (statements.length && unpad(text.replace(/(?:^|[\s;,])([\p{L}\p{N}_]+)[).:]\s*(dung|sai|d|s)(?=$|[\s;,])/gu, '')) === '') {
    return statements.map((m) => {
      const id = vocab.statementIds.find((id) => language(id, []) === m[1]);
      if (!id) throw new LabelError('unknown_label');
      return { type: 'statement', id, value: m[2] === 'dung' || m[2] === 'd' };
    });
  }
  if (final) {
    const content = (text.slice(0, final.index) + ' ' + text.slice(final.index + final[0].length)).replace(/^\s*[:=]?\s*/u, '').trim();
    let value: unknown;
    {
      const direct = proseClause(content, vocab, context);
      if (direct?.length === 1) {
        const body = direct[0]!;
        if (body.type === 'connected' && vocab.task === 'connectivity'
          || body.type === 'euler_exists' && vocab.task === 'euler'
          || body.type === 'hamilton_exists' && vocab.task === 'hamilton') value = body.value;
        if (body.type === 'degree' && vocab.task === 'degree') value = { degrees: { [body.v]: body.value } };
        if (body.type === 'vertex_count' && vocab.task === 'elements') value = { vertexCount: body.value };
        if (body.type === 'edge_count' && vocab.task === 'elements') value = { edgeCount: body.value };
        if (body.type === 'vertex_list' && vocab.task === 'elements') value = { vertices: body.vertices };
        if (body.type === 'shortest_length' && vocab.task === 'shortest_path' || body.type === 'length' && ['shortest_path', 'tsp', 'postman'].includes(vocab.task)) value = body.value;
      }
    }
    if (value === undefined) value = finalValue(content, vocab);
    return value === undefined ? undefined : [{ type: 'final_answer', value }];
  }
  const degree = detachedDegree(text, vocab);
  if (degree) return degree;
  // Labelled degree rows are a compact table of explicit degree assertions.
  if (/^bac\s*:/u.test(text)) {
    const pairs = text.replace(/^bac\s*:\s*/u, '').split(/,\s*/u);
    const result: ClaimBody[] = [];
    for (const pair of pairs) {
      const match = pair.match(/^([^\s=]+)\s*=\s*(.+)$/u);
      const value = match && lastNumber(match[2]!);
      if (!match || value === undefined || value === null) return undefined;
      result.push({ type: 'degree', v: oneLabel(match[1]!, labels), value });
    }
    return result;
  }
  if (/^khong co dinh(?: co)? bac le$/u.test(text)) return [{ type: 'odd_vertices', vertices: [] }];
  if (/\bkhong the di qua\b.*\bmoi\b.*\bmot lan\b/u.test(text) && vocab.task === 'euler') return [{ type: 'euler_exists', kind: 'path', value: false }];
  const slotted = slotClaim(text, vocab, context);
  if (slotted) return slotted;
  // Predicate claims use the same grammatical padding, retaining negation.
  const predicate = unpad(text);
  if (/^(?:khong )?lien thong$/u.test(predicate)) return [{ type: 'connected', value: !predicate.includes('khong') }];
  if (/^(?:do thi )?(?:khong )?lien thong$/u.test(text)) return [{ type: 'connected', value: !text.includes('khong') }];
  const theorem = predicate.match(/^(khong )?thoa(?: dieu kien)? (dirac|ore)$/u);
  if (theorem) return [{ type: 'theorem', name: theorem[2] as 'dirac' | 'ore', holds: !theorem[1] }];
  const existence = text.match(/^(.*?)\b(co|khong co) (chu trinh|duong di) (euler|hamilton)(.*)$/u);
  if (existence) {
    const value = existence[2] === 'co';
    const kind = existence[3] === 'chu trinh';
    if (existence[4] === 'euler') return [{ type: 'euler_exists', kind: kind ? 'circuit' : 'path', value }];
    const reason = /dirac/u.test(text) ? 'dirac' : /\bore\b/u.test(text) ? 'ore' : /bac 1/u.test(text) ? 'degree1'
      : /bat buoc|bac 2/u.test(text) ? 'forced_edges' : /tim thay/u.test(text) ? 'found' : context.reason;
    const claim: ClaimBody = { type: 'hamilton_exists', kind: kind ? 'cycle' : 'path', value, ...(reason ? { reason } : {}) };
    const antecedent = existence[1]!.match(/^(khong )?thoa(?: dieu kien)? (dirac|ore) nen /u);
    const witnessText = input.match(/\bchang han\s*,?\s*([^\s,.;]+)/iu)?.[1];
    const witness = witnessText && compactWalk(witnessText, vocab.vertexLabels, vocab.edgeNames);
    const witnessClaim = witness ? [{ type: 'walk' as const, kind: kind ? 'hamilton_cycle' as const : 'hamilton_path' as const, vertices: witness }] : [];
    if (antecedent) return [{ type: 'theorem', name: antecedent[2] as 'dirac' | 'ore', holds: !antecedent[1] }, claim, ...witnessClaim];
    const premise = existence[1]!.replace(/\s*nen\s*$/u, '').trim();
    const explicit = premise && premise !== text ? proseClause(premise, vocab, context) : undefined;
    return explicit ? [...explicit, claim, ...witnessClaim] : [claim, ...witnessClaim];
  }
  if (/^(?:khong )?ve (?:duoc )?bang mot net$/u.test(text)) return [{ type: 'euler_exists', kind: 'path', value: !text.startsWith('khong') }];
  if (/(?:→|-)\s*$/u.test(text)) return undefined;
  const routeSubject = /(?:(?:duong di|chu trinh)(?: euler| hamilton| nguoi du lich)?|hanh trinh nguoi dua thu)/u.exec(text);
  const route = routeSubject && unpad(text.slice(0, routeSubject.index)) === ''
    ? text.slice(routeSubject.index + routeSubject[0].length).trim().replace(/^(?:la|gom|bang|:|=)\s*/u, '')
    : routeSubject && unpad(text.slice(routeSubject.index + routeSubject[0].length)) === ''
      ? unpad(text.slice(0, routeSubject.index), labels) : text;
  if (/^[\p{L}\p{N}_\s→,{}-]+$/u.test(route)) {
    // A bare word only qualifies if entirely segmentable into at least two labels.
    if (!/[→,\s-]/u.test(route) && /\p{L}/u.test(route)) {
      const compactSource = route === text ? symbols(input).replace(/[.;]$/u, '').trim() : route;
      const vertices = compactWalk(compactSource, labels, vocab.edgeNames);
      if (vertices) return [{ type: 'walk', kind: route !== text ? walkKind(text, vocab, vertices) : context.kind ?? walkKind('', vocab, vertices), vertices }];
      // Preserve an explicit ambiguity diagnostic where the ordinary label parser
      // can identify one; otherwise the compact token contains an unaccounted
      // character (often a missing named edge) and must be confirmed.
      let loose: string[] | undefined;
      try { loose = labelList(compactSource, labels); } catch (error) {
        if (error instanceof LabelError && error.code === 'ambiguous_line') throw error;
        if (!(error instanceof LabelError)) throw error;
      }
      if (loose !== undefined && loose.length >= 2) throw new LabelError('unknown_label');
    }
    try {
      const vertices = labelList(route, labels);
      if (vertices.length >= 2) return [{ type: 'walk', kind: route !== text ? walkKind(text, vocab, vertices) : context.kind ?? walkKind('', vocab, vertices), vertices }];
    } catch (error) {
      if (/→|-/u.test(route) || error instanceof LabelError && error.code === 'ambiguous_line' || route !== text && gradingContent(input, vocab)) throw error;
    }
  }
  return undefined;
}
