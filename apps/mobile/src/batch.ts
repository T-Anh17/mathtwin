import { Benchmark } from './benchmark.js';
import type { BenchImage, BenchmarkConfig, Dataset, DatasetEntry, ImageResult, MobilePlugin } from './contracts.js';
import { errorCode } from './messages.vi.js';

export type ImageSource = { images: BenchImage[] } | { dataset: Dataset };
/** One image at a time; dataset bytes are released after each awaited run. */
export async function runBatch(source: ImageSource, config: BenchmarkConfig, plugin: MobilePlugin, runner: Benchmark,
  signal: AbortSignal, onResult: (result: ImageResult) => void): Promise<void> {
  const jobs = 'dataset' in source ? source.dataset.entries : source.images;
  if (signal.aborted) return;
  try {
  await plugin.setBenchmarkState({ running: true, backgroundIdleMinutes: config.backgroundIdleMinutes });
  for (const job of jobs) {
    if (signal.aborted) break;
    let image: BenchImage;
    try {
      image = 'dataset' in source ? { id: job.id, imageSource: 'dataset', ...(await plugin.datasetImage({ name: source.dataset.name, file: (job as DatasetEntry).file, location: source.dataset.location })) }
        : job as BenchImage;
    } catch (e) {
      const engine = config.model === 'a' ? 'offline:paddleocr-vl-1.5' : 'offline:qwen3-vl-2b';
      onResult({ id: job.id, imageSource: 'dataset' in source ? 'dataset' : (job as BenchImage).imageSource,
        config: { ...config }, engine, usage: { engine, passes: 0, latencyMs: 0 },
        totalMs: 0, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: false, errorCode: errorCode(e) });
      break;
    }
    if (signal.aborted) break;
    const result = await runner.run(image, config, signal);
    onResult(result);
    if (result.errorCode && ['exec_blocked', 'aborted', 'memory_pressure', 'server_killed', 'server_exit', 'model_missing', 'low_ram', 'native_error', 'text_only', 'timeout', 'cpu_backend_unknown'].includes(result.errorCode)) break;
  }
  } finally { await plugin.setBenchmarkState({ running: false, backgroundIdleMinutes: config.backgroundIdleMinutes }); }
}
