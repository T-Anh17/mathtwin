import type { ClaimBody } from '@mathtwin/core';
import type { WorkVocabulary } from '../types.js';
import { labelList, oneLabel, LabelError } from './labels.js';
import { fold, language } from './text.js';
import { numericValue, slotClaim, unpad, writtenNumbers } from './slots.js';
import { algorithmClause } from './algorithms.js';

export type WalkKind = Extract<ClaimBody, { type: 'walk' }>['kind'];
export interface ProseContext { walk?: string[]; kind?: WalkKind; reason?: Extract<ClaimBody, { type: 'hamilton_exists' }>['reason']; lastGradingLine?: boolean }
/** Split only outside notation; commas in lists and decimal numbers stay intact. */
export function splitClauses(input: string, vocab: WorkVocabulary): string[] {
  const text = language(input, vocab.vertexLabels);
  if (/[a-z][).:]\s*(?:dung|sai|d|s)(?:$|[\s.;,])/u.test(text) || /^bac\s*:/u.test(text)) return [input];
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
  text = text.replace(/^em ghi\s*:\s*/u, '');
  if (/canh theo thu tu/u.test(text)) return undefined;
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
    if (antecedent) return [{ type: 'theorem', name: antecedent[2] as 'dirac' | 'ore', holds: !antecedent[1] }, claim];
    const premise = existence[1]!.replace(/\s*nen\s*$/u, '').trim();
    const explicit = premise && premise !== text ? proseClause(premise, vocab, context) : undefined;
    return explicit ? [...explicit, claim] : [claim];
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
    try {
      const vertices = labelList(route, labels);
      if (vertices.length >= 2) return [{ type: 'walk', kind: route !== text ? walkKind(text, vocab, vertices) : context.kind ?? walkKind('', vocab, vertices), vertices }];
    } catch (error) {
      if (/→|-/u.test(route) || error instanceof LabelError && error.code === 'ambiguous_line' || route !== text && gradingContent(input, vocab)) throw error;
    }
  }
  return undefined;
}
