import { Benchmark, engineFor, exportReport } from './benchmark.js';
import type { BenchImage, BenchmarkConfig, Dataset, DatasetEntry, DeviceInfo, ImageResult, MobilePlugin } from './contracts.js';
import { errorCode } from './messages.vi.js';

export type ImageSource = { images: BenchImage[] } | { dataset: Dataset };
/** Where the run is saved after every image, so a killed app or interrupted run keeps what it measured. */
export interface ProgressTarget { runId: string; device: DeviceInfo }
/** One image at a time; dataset bytes are released after each awaited run. */
export async function runBatch(source: ImageSource, config: BenchmarkConfig, plugin: MobilePlugin, runner: Benchmark,
  signal: AbortSignal, onResult: (result: ImageResult) => void, progress?: ProgressTarget): Promise<void> {
  const done: ImageResult[] = [];
  const report = async (result: ImageResult): Promise<void> => {
    done.push(result);
    // Saving must never abort the measurement itself; the screen still holds every result.
    if (progress) await plugin.saveProgress({ runId: progress.runId, json: exportReport({ version: 1, device: progress.device, results: done }) }).catch(() => {});
    onResult(result);
  };
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
      const engine = engineFor(config.model);
      await report({ id: job.id, imageSource: 'dataset' in source ? 'dataset' : (job as BenchImage).imageSource,
        config: { ...config }, engine, usage: { engine, passes: 0, latencyMs: 0 },
        totalMs: 0, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: false, errorCode: errorCode(e) });
      break;
    }
    if (signal.aborted) break;
    const result = await runner.run(image, config, signal);
    await report(result);
    if (result.errorCode && ['exec_blocked', 'aborted', 'memory_pressure', 'server_killed', 'server_exit', 'model_missing', 'low_ram', 'native_error', 'text_only', 'timeout', 'cpu_backend_unknown', 'invalid_work_spec'].includes(result.errorCode)) break;
  }
  } finally { await plugin.setBenchmarkState({ running: false, backgroundIdleMinutes: config.backgroundIdleMinutes }); }
}
