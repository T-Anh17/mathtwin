import type { ReadOutcome, ReadUsage, TextLine } from '@mathtwin/reader';
import type { DryConfig } from '@mathtwin/reader-llamacpp-shared';

export type Model = 'a' | 'b' | 'c';
/** Benchmark engines: llama.cpp A/B, WASM OCR C, or D (pure-TS hand-drawn graph structure reader, no model file). */
export type BenchModel = Model | 'd';
export interface DeviceInfo {
  manufacturer: string; model: string; android: string; sdk: number; cores: number;
  totalRamBytes: number; availableRamBytes: number; freeStorageBytes: number;
}
export interface ModelState { model: Model; bytes: number; downloadedBytes: number; ready: boolean }
export interface Session { port: number; apiKey: string; reused: boolean; loadMs: number; verifyMs?: number }
export interface MemoryPressure { callback: 'onTrimMemory' | 'onLowMemory'; trimLevel: number | null }
export interface ServerState { alive: boolean; peakMemoryMb?: number; rssMemoryMb?: number; exitCode?: number; cpuVariant?: string; cpuVariantSource?: 'maps' | 'log'; errorCode?: 'cpu_backend_unknown'; memoryPressure?: MemoryPressure }
export interface BenchmarkConfig { model: BenchModel; passes: 1 | 2; mode: 'graph' | 'lines'; threads: number; minRamGb: number; allowLowRam: boolean; backgroundIdleMinutes: number;
  maxImageSide?: number; readTimeout?: number; maxTokens?: number; dry?: DryConfig }
export interface DatasetEntry { id: string; file: string }
export type DatasetLocation = 'internal' | 'external';
export interface Dataset { name: string; entries: DatasetEntry[]; location: DatasetLocation }
export interface MobilePlugin {
  post(options: PostOptions): Promise<{ status: number; data: unknown }>;
  cancelRequest(options: { requestId: string }): Promise<void>;
  slots(options: { url: string; headers: Record<string, string>; timeout: number }): Promise<{ idle: boolean }>;
  device(): Promise<DeviceInfo>;
  models(): Promise<{ models: ModelState[] }>;
  download(options: { model: Model }): Promise<void>;
  cancelDownload(): Promise<void>;
  importModel(options: { model: Model }): Promise<void>;
  start(options: { model: 'a' | 'b'; threads: number; minRamGb: number; allowLowRam: boolean }): Promise<Session>;
  status(): Promise<ServerState>;
  ocrModels(): Promise<{ detector: string; encoder: string; decoder: string; config: unknown; verifyMs: number }>;
  appMemory(): Promise<{ rssMemoryMb?: number; peakMemoryMb?: number; memoryPressure?: MemoryPressure }>;
  stop(): Promise<void>;
  setBenchmarkState(options: { running: boolean; backgroundIdleMinutes: number }): Promise<void>;
  cleanupCameraTempFiles(): Promise<void>;
  dataset(options: { name: string }): Promise<{ entries: DatasetEntry[]; location: DatasetLocation }>;
  datasetImage(options: { name: string; file: string; location?: DatasetLocation }): Promise<{ dataUrl: string }>;
  exportResult(options: { json: string }): Promise<{ path: string }>;
  saveProgress(options: { runId: string; json: string }): Promise<{ path: string }>;
}
export interface HttpTransport {
  post(options: PostOptions): Promise<{ status: number; data: unknown }>;
}
export interface PostOptions { requestId: string; url: string; headers: Record<string, string>; data: Record<string, unknown>; connectTimeout: number; readTimeout: number; disableRedirects: boolean }
export type ImageSourceKind = 'camera' | 'gallery' | 'dataset';
export interface BenchImage { id: string; dataUrl: string; imageSource: ImageSourceKind; captureMethod?: 'system' | 'webview' }
export interface ImageResult {
  id: string; engine: string; config: BenchmarkConfig;
  outcome?: ReadOutcome; linePasses?: { lines: TextLine[]; usage: ReadUsage }[];
  usage: ReadUsage; totalMs: number; modelLoadMs: number; modelVerifyMs: number; reusedModel: boolean;
  memory?: ServerState; errorCode?: string; serverRestarted?: boolean;
  wasm?: { numThreads: number; crossOriginIsolated: boolean; simd: true };
  imageSource: ImageSourceKind; captureMethod?: 'system' | 'webview';
}
export interface BenchmarkReport { version: 1; device: DeviceInfo; results: ImageResult[] }
