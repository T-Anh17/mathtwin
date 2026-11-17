/** Shared request/image defaults for Node and Android. See README for upstream DRY defaults. */
export { defaultMaxImageSide } from '@mathtwin/reader';
export const defaultReadTimeout = 300_000;
export interface DryConfig {
  dry_multiplier: number;
  dry_base: number;
  dry_allowed_length: number;
  dry_penalty_last_n: number;
}
// Multiplier 0.8 is an experimental app setting; upstream disables DRY with 0.
export const defaultDry: Readonly<DryConfig> = Object.freeze({ dry_multiplier: 0.8, dry_base: 1.75,
  dry_allowed_length: 2, dry_penalty_last_n: 64 });
export function validateDry(dry: DryConfig): void {
  if (!Number.isFinite(dry.dry_multiplier) || dry.dry_multiplier < 0
    || !Number.isFinite(dry.dry_base) || dry.dry_base < 1
    || !Number.isSafeInteger(dry.dry_allowed_length) || dry.dry_allowed_length < 0
    || !Number.isSafeInteger(dry.dry_penalty_last_n) || dry.dry_penalty_last_n < -1) throw new Error('Invalid DRY configuration.');
}
/** Allow model loading plus all passes; always exceeds a single HTTP read timeout. */
export function imageTimeout(readTimeout: number, requests = 1): number {
  return 180_000 + readTimeout * requests;
}
