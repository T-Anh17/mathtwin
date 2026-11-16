import { ocrMessages } from '@mathtwin/reader';

export type OcrErrorCode = 'unsupported_mode' | 'missing_log_probs' | 'invalid_output' | 'decode_limit' | 'busy' | 'aborted' | 'read_failed';
export class OcrError extends Error {
  constructor(readonly code: OcrErrorCode) { super(ocrMessages[code]); this.name = 'OcrError'; }
}
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new OcrError('aborted'); }
