import { localReaderMessages } from '@mathtwin/reader';

export type LlamaFailureReason = 'timeout' | 'server_exit' | 'truncated' | 'invalid_json' | 'missing_probs' | 'http_error' | 'aborted' | 'logprob_alignment' | 'repetition_loop';
export class LlamaCppReadError extends Error {
  constructor(readonly code: 'read_failed' | 'text_only' | 'busy' | 'repetition_loop' | 'logprob_alignment', readonly reason?: LlamaFailureReason,
    readonly finish_reason?: string) {
    super(code === 'text_only' ? localReaderMessages.textOnly : code === 'busy' ? localReaderMessages.busy : localReaderMessages.failed);
    this.name = reason === 'aborted' ? 'AbortError' : 'LlamaCppReadError';
  }
}
export function failed(reason: LlamaFailureReason, finish_reason?: string): never {
  throw new LlamaCppReadError(reason === 'repetition_loop' || reason === 'logprob_alignment' ? reason : 'read_failed', reason, finish_reason);
}
