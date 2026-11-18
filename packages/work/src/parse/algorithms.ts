import type { ClaimBody } from '@mathtwin/core';
import type { WorkVocabulary } from '../types.js';
import { labelList, oneLabel } from './labels.js';
import { escapeRegex, language } from './text.js';
import { numericValue, unpad, vertexQualifier } from './slots.js';

/** Translate written algorithm actions. No graph state or mathematical repair. */
export function algorithmClause(input: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  let text = language(input, vocab.vertexLabels).replace(/[.;]$/u, '').trim()
    .replace(/^(?:em ghi|ket qua)\s*:\s*/u, '');
  const start = /\b(?:gan nhan|khoi tao|khoanh|chon|dinh duoc chon|tu|tai|lap lai duong|lap lai canh|them canh lap)\b/u.exec(text);
  if (start && !/\b(?:nhan|khoang cach|do dai)\s*$/u.test(text.slice(0, start.index)) && unpad(text.slice(0, start.index), vocab.vertexLabels) === '') text = text.slice(start.index);
  const pieces = text.split(/[,;]\s*(?=(?:n|l)\s*\(|khoanh\b|chon\b)/u);
  if (pieces.length > 1) {
    const groups = pieces.map((piece) => algorithmClause(piece, vocab));
    return groups.every((group) => group !== undefined) ? groups.flatMap((group) => group!) : undefined;
  }
  const label = (value: string): string => oneLabel(value, vocab.vertexLabels);
  let match: RegExpMatchArray | null;
  if (vocab.task === 'shortest_path') {
    match = text.match(/^(?:gan nhan|khoi tao(?: nhan)?)\s+(\S+)\s*=\s*0\s*[,;]\s*(?:cac )?dinh (?:khac|con lai)\s*(?:=|la)?\s*∞$/u);
    if (match) return [{ type: 'dijkstra_init', source: label(match[1]!) }];
    match = text.match(/\b(?:khoanh(?: tron)?|chon|danh dau|co dinh|(?:dinh )?(?:duoc )?chon\s*:)\s*(?:(?:dinh|diem)\s+)?([^\s:]+)$/u);
    if (match && vocab.questionFormat !== 'trac_nghiem') return [{ type: 'dijkstra_select', v: label(match[1]!) }];
    const vertex = vocab.vertexLabels.map((v) => escapeRegex(language(v, vocab.vertexLabels))).join('|');
    match = text.match(/\b(?:n|l|d)\s*\(\s*([^(),]+)\s*\)\s*(.+)$/u)
      ?? text.match(new RegExp(`\\b(?:(?:nhan|khoang cach|do dai)\\s+${vertexQualifier}(${vertex})|tai\\s+(${vertex})\\s*,?\\s*(?:doi )?nhan)(?![\\p{L}\\p{N}_])\\s*(.+)$`, 'u'));
    if (match) {
      const v = label(match[1] ?? match[2]!);
      let rhs = match.at(-1)!;
      const viaPattern = /\b(?:(?:di )?qua|tu)\s+([^\s(),;]+)/u;
      const via = rhs.match(viaPattern) ?? rhs.match(/(?:n|l|d)\s*\(\s*([^()]+)\s*\)/u);
      rhs = rhs.replace(viaPattern, '').replace(/\(\s*\)/gu, '').replace(/[,;]\s*$/u, '').replace(/^.*\bthanh\s+/u, '').trim();
      // A second bare vertex is not a value connector; via and function arguments have their own slots.
      const bareWords = rhs.replace(/\b(?:n|l|d|w)\s*\([^()]*\)/gu, '').split(/[^\p{L}\p{N}_]+/u);
      if (bareWords.some((word) => vocab.vertexLabels.some((v) => language(v, vocab.vertexLabels) === word))) return undefined;
      const value = /^\s*(?:=|la|bang)?\s*∞$/u.test(rhs) ? null : numericValue(rhs, vocab.vertexLabels, true);
      if (value !== undefined) return [{ type: 'dijkstra_label', v, value, ...(via ? { via: label(via[1]!) } : {}) }];
    }
    match = text.match(/^tai\s+(\S+)\s+doi nhan\s+\S+\s+thanh\s+(.+)$/u);
    if (match) {
      const value = numericValue(match[2]!);
      if (value !== undefined) return [{ type: 'dijkstra_label', v: label(match[1]!), value }];
    }
  }
  if (vocab.task === 'tsp') {
    match = text.match(/^tu\s+(\S+)\s+(?:di )?den\s+(\S+)\s*\(gan nhat\)$/u)
      ?? text.match(/^(\S+)\s*→\s*(\S+)\s+vi\s+.+\b(?:nho|gan) nhat$/u);
    if (match) return [{ type: 'nn_step', from: label(match[1]!), to: label(match[2]!) }];
  }
  if (vocab.task === 'postman') {
    const subject = /\b(?:lap lai duong|lap lai canh|them canh lap)\b/u.exec(text);
    if (subject) {
      if (subject[0] === 'lap lai canh') {
        const tail = text.slice(subject.index + subject[0].length).replace(/\s+de\s+.+$/u, '').trim();
        const pairs = [...tail.matchAll(/\(([^()]+)\)/gu)];
        if (!pairs.length || tail.replace(/\([^()]+\)/gu, '').replace(/[,;\s]/gu, '')) return undefined;
        return pairs.map((pair) => ({ type: 'postman_duplicate', vertices: labelList(pair[1]!, vocab.vertexLabels) }));
      }
      const before = unpad(text.slice(0, subject.index), vocab.vertexLabels);
      const after = unpad(text.slice(subject.index + subject[0].length), vocab.vertexLabels);
      if (before && after) return undefined;
      const vertices = labelList(before || after, vocab.vertexLabels);
      if (vertices.length >= 2) return [{ type: 'postman_duplicate', vertices }];
    }
  }
  return undefined;
}
