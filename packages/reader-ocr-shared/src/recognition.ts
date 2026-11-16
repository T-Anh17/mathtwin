import type { OcrTextLine, OrtLike, OrtSession, OrtTensor, VietOcrConfig } from './types.js';
import { checkAbort, OcrError } from './errors.js';

export function output(outputs: Record<string, OrtTensor>, name: string | undefined): OrtTensor {
  const tensor = name === undefined ? undefined : outputs[name];
  if (!tensor) throw new OcrError('invalid_output');
  return tensor;
}
export function dispose(tensors: readonly OrtTensor[]): void { for (const tensor of new Set(tensors)) tensor.dispose(); }

export function rankedLogProbs(tensor: OrtTensor | undefined, config: VietOcrConfig): { id: number; logProb: number }[] {
  const count = Array.from(config.vocab).length + config.offset;
  if (!tensor || tensor.type !== 'float32' || !(tensor.data instanceof Float32Array) || tensor.data.length !== count
    || tensor.dims.at(-1) !== count || tensor.dims.reduce((a, b) => a * b, 1) !== count) throw new OcrError('missing_log_probs');
  const ranking = Array.from(tensor.data, (logProb, id) => ({ id, logProb })).sort((a, b) => b.logProb - a.logProb || a.id - b.id);
  if (ranking.some((entry) => Number.isNaN(entry.logProb) || entry.logProb > 0) || !Number.isFinite(ranking[0]?.logProb)
    || Math.abs(tensor.data.reduce((sum, logp) => sum + Math.exp(logp), 0) - 1) > 0.01) throw new OcrError('missing_log_probs');
  return ranking;
}

/** Export README ABI: image -> [hidden, encoder_outputs], step(tgt,hidden,encoder_outputs) -> [logp,hidden]. */
export async function recognizeLine(ort: OrtLike, encoder: OrtSession, decoder: OrtSession, input: OrtTensor,
  config: VietOcrConfig, signal?: AbortSignal): Promise<Omit<OcrTextLine, 'box'>> {
  const vocabulary = Array.from(config.vocab);
  const chars: string[] = [], charConf: number[] = [], logProbs: number[] = [];
  const choices: string[][] = [];
  const finish = (eosConf: number, reason?: OcrTextLine['truncationReason']): Omit<OcrTextLine, 'box'> => {
    const text = chars.join('').normalize('NFC');
    const weakest = charConf.indexOf(Math.min(...charConf));
    const alternatives = weakest < 0 ? [] : (choices[weakest] ?? []).map((char) => chars.map((c, i) => i === weakest ? char : c).join('').normalize('NFC'));
    return { text, charConf, logProbs, conf: reason ? 0 : charConf.length ? Math.min(...charConf) : eosConf,
      alternatives: [...new Set(alternatives)].filter((candidate) => candidate !== text).slice(0, 3),
      ...(reason ? { truncated: true, truncationReason: reason } : {}) };
  };
  let encoded: Record<string, OrtTensor> = {}, hidden: OrtTensor | undefined, features: OrtTensor | undefined;
  let token = config.sos;
  try {
    checkAbort(signal);
    encoded = await encoder.run({ image: input });
    checkAbort(signal);
    hidden = output(encoded, encoder.outputNames[0]); features = output(encoded, encoder.outputNames[1]);
    for (let step = 0; step < config.max_seq_length; step++) {
      checkAbort(signal);
      const target = ort.tensor('int64', BigInt64Array.of(BigInt(token)), [1]);
      let decoded: Record<string, OrtTensor> = {};
      try {
        decoded = await decoder.run({ tgt: target, hidden, encoder_outputs: features });
        checkAbort(signal);
        const ranking = rankedLogProbs(decoded[decoder.outputNames[0] ?? ''], config);
        const nextHidden = output(decoded, decoder.outputNames[1]);
        if (nextHidden.type !== hidden.type || nextHidden.dims.length !== hidden.dims.length
          || nextHidden.dims.some((dim, i) => dim !== hidden!.dims[i])
          || !(nextHidden.data instanceof Float32Array) || nextHidden.data.length !== nextHidden.dims.reduce((a, b) => a * b, 1)) throw new OcrError('invalid_output');
        const best = ranking[0]!;
        if (best.id === config.eos) return finish(Math.exp(best.logProb));
        const char = vocabulary[best.id - config.offset];
        // A valid decoder distribution can select a special token other than EOS.
        // Keep the prefix as uncertain text; tensor/session/probability errors still throw.
        if (char === undefined) return finish(0, 'invalid_output');
        chars.push(char); charConf.push(Math.exp(best.logProb)); logProbs.push(best.logProb);
        choices.push(ranking.slice(1, 3).flatMap(({ id }) => vocabulary[id - config.offset] === undefined ? [] : [vocabulary[id - config.offset]!]));
        token = best.id;
        if (hidden !== features && hidden !== nextHidden && !Object.values(encoded).includes(hidden)) hidden.dispose();
        hidden = nextHidden;
      } finally { dispose([target, ...Object.values(decoded).filter((tensor) => tensor !== hidden && tensor !== features)]); }
    }
    return finish(0, 'decode_limit');
  } finally { dispose([input, ...Object.values(encoded), ...(hidden ? [hidden] : [])]); }
}
