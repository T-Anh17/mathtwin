import type { ClaimBody } from '@mathtwin/core';
import type { ParsedWork, WorkIssueCode, WorkLine, WorkVocabulary } from '../types.js';
import { workMessages } from '../messages.vi.js';
import { labelList, LabelError } from './labels.js';
import { gradingContent, isHeading, proseClause, splitClauses, walkKind } from './prose.js';
import type { ProseContext } from './prose.js';
import { labelKey, language, sameQuestion, symbols } from './text.js';

export function parseWork(lines: WorkLine[], vocab: WorkVocabulary, _opts?: { confThreshold?: number }): ParsedWork {
  const parsed: ParsedWork = { steps: [], ignored: [], unchecked: [], issues: [] };
  const context: ProseContext = {};
  const ordered = [...lines].sort((a, b) => a.index - b.index);
  const ignoredReason = (line: WorkLine): ParsedWork['ignored'][number]['reason'] | undefined => {
    if (line.struck) return 'struck';
    if (!line.text.trim()) return 'empty';
    if (line.region === 'question') return 'question';
    if (line.region === 'figure') return 'figure';
    if (vocab.questionText.some((q) => sameQuestion(line.text, q))) return 'question';
    // A copied true/false prompt is not an answer. Bare a) Đ / a) S is handled below.
    if (vocab.questionFormat === 'dung_sai' && /^[a-z][).:]\s+/u.test(language(line.text, vocab.vertexLabels))
      && !/^[a-z][).:]\s*(?:dung|sai|d|s)(?:$|[\s.;,])/u.test(language(line.text, vocab.vertexLabels))) return 'question';
    return undefined;
  };
  const tableLines = new Set<number>();
  const labels = new Set(vocab.vertexLabels.map(labelKey));
  const tableLike = (line: WorkLine): boolean => {
    if (ignoredReason(line)) return false;
    const tokens = symbols(line.text).replace(/^(?:Chọn|Chon|Bước|Buoc)\s+/iu, '').split(/\s+/u);
    return tokens.length >= 2 && tokens.every((t) => labels.has(labelKey(t)) || /^(?:-?\d+(?:[.,]\d+)?|∞|-)$/u.test(t));
  };
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end < ordered.length && ordered[end]!.page === ordered[start]!.page && tableLike(ordered[end]!)) end++;
    if (end - start >= 3) for (const row of ordered.slice(start, end)) tableLines.add(row.index);
    start = Math.max(start + 1, end);
  }
  const issue = (code: keyof typeof workMessages, sources: WorkLine[], severity: 'blocking' | 'warning' = 'blocking'): void => {
    parsed.issues.push({ code: code as WorkIssueCode, severity, lines: sources.map((l) => l.index), message: workMessages[code] });
  };
  for (let i = 0; i < ordered.length; i++) {
    const line = ordered[i]!;
    const ignored = ignoredReason(line);
    if (ignored) {
      parsed.ignored.push({ line: line.index, reason: ignored });
      if (ignored === 'figure' && /\d|=|[\p{L}]/u.test(line.text)) issue('figure_annotations', [line], 'warning');
      continue;
    }
    if (line.region === 'table' || tableLines.has(line.index)) {
      parsed.unchecked.push(line.index); issue('table_unrecognized', [line], 'warning'); continue;
    }
    const sources = [line];
    // Same-page wrapped walks only. Cross-page joining belongs to batch 3.3.
    while (/(?:→|-)\s*$/u.test(symbols(sources.at(-1)!.text))) {
      const next = ordered[i + 1];
      if (!next || next.page !== line.page || ignoredReason(next) || next.region === 'table' || tableLines.has(next.index)) break;
      // A wrapped route may consume only route text, not the next independent claim.
      if (!/^[\p{L}\p{N}_\s→,-]+[.]?$/u.test(symbols(next.text))) break;
      try { labelList(symbols(next.text).replace(/(?:→|-)\s*$/u, ''), vocab.vertexLabels); }
      catch (error) { if (error instanceof LabelError) break; throw error; }
      sources.push(next); i++;
    }
    const text = sources.map((l) => l.text).join(' ');
    const normalized = language(text, vocab.vertexLabels);
    if (isHeading(normalized)) {
      context.kind = walkKind(normalized, vocab);
      parsed.ignored.push({ line: line.index, reason: 'prose' }); continue;
    }
    try {
      const bodies: ClaimBody[] = [];
      let incomplete = false;
      // A statement-answer group is one clause. Decimal points are not separators.
      const deferred = /\b(?:khoanh|nhan(?! (?:thay|xet|duoc|ra)\b)|gan nhan|lap lai|canh lap|them canh|gan nhat|nho nhat)\b/u.test(normalized) && !/duong di ngan nhat/u.test(normalized)
        || /\b(?:n|l)\s*\(/u.test(normalized);
      const clauses = deferred ? [text] : splitClauses(text, vocab);
      const local: ProseContext = { ...context };
      local.reason = /dirac/u.test(normalized) ? 'dirac' : /\bore\b/u.test(normalized) ? 'ore'
        : /bac 1\b/u.test(normalized) ? 'degree1' : /bat buoc|bac 2\b/u.test(normalized) ? 'forced_edges'
        : /tim thay/u.test(normalized) ? 'found' : undefined;
      for (const clause of clauses) {
        const found = proseClause(clause, vocab, local);
        if (found) {
          bodies.push(...found);
          for (const body of found) if (body.type === 'walk') local.walk = body.vertices;
        } else if (gradingContent(clause, vocab)) incomplete = true;
      }
      if (bodies.length) {
        const boxes = sources.flatMap((s) => s.box ? [s.box] : []);
        const box: [number, number, number, number] | undefined = boxes.length === sources.length
          ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined;
        for (const body of bodies) {
          const conf = Math.min(...sources.map((s) => s.conf));
          parsed.steps.push({ claim: { ...body, step: parsed.steps.length + 1, raw: sources.map((s) => s.text).join('\n'), conf, ...(box ? { box } : {}) },
            lines: sources.map((s) => s.index), page: line.page, ...(box ? { box } : {}), candidates: [body], origin: 'text' });
          if (body.type === 'walk') context.walk = body.vertices;
        }
      }
      if (incomplete) {
        parsed.unchecked.push(...sources.map((s) => s.index)); issue('unparsed_line', sources);
      } else if (!bodies.length) parsed.ignored.push(...sources.map((s) => ({ line: s.index, reason: 'prose' as const })));
    } catch (error) {
      if (!(error instanceof LabelError)) throw error;
      parsed.unchecked.push(...sources.map((s) => s.index)); issue(error.code, sources); issue('unparsed_line', sources);
    }
  }
  if (!parsed.steps.length && !parsed.unchecked.length) issue('no_solution_lines', []);
  return parsed;
}
