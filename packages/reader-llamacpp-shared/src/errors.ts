import { localReaderMessages } from '@mathtwin/reader';

export type LlamaFailureReason = 'timeout' | 'server_exit' | 'truncated' | 'invalid_json' | 'missing_probs' | 'http_error' | 'aborted';
export class LlamaCppReadError extends Error {
  constructor(readonly code: 'read_failed' | 'text_only' | 'busy', readonly reason?: LlamaFailureReason) {
    super(code === 'text_only' ? localReaderMessages.textOnly : code === 'busy' ? localReaderMessages.busy : localReaderMessages.failed);
    this.name = reason === 'aborted' ? 'AbortError' : 'LlamaCppReadError';
  }
}
export function failed(reason: LlamaFailureReason): never { throw new LlamaCppReadError('read_failed', reason); }
