import type { ReadOutcome, ReadUsage, TextLine } from '@mathtwin/reader';

export type Model = 'a' | 'b';
export interface DeviceInfo {
  manufacturer: string; model: string; android: string; sdk: number; cores: number;
  totalRamBytes: number; availableRamBytes: number; freeStorageBytes: number;
}
export interface ModelState { model: Model; bytes: number; downloadedBytes: number; ready: boolean }
export interface Session { port: number; apiKey: string; reused: boolean; loadMs: number; verifyMs?: number }
export interface ServerState { alive: boolean; peakMemoryMb?: number; rssMemoryMb?: number; exitCode?: number; cpuVariant?: string }
export interface BenchmarkConfig { model: Model; passes: 1 | 2; mode: 'graph' | 'lines'; threads: number; minRamGb: number; allowLowRam: boolean; backgroundIdleMinutes: number }
export interface DatasetEntry { id: string; file: string }
export interface MobilePlugin {
  device(): Promise<DeviceInfo>;
  models(): Promise<{ models: ModelState[] }>;
  download(options: { model: Model }): Promise<void>;
  cancelDownload(): Promise<void>;
  importModel(options: { model: Model }): Promise<void>;
  start(options: { model: Model; threads: number; minRamGb: number; allowLowRam: boolean }): Promise<Session>;
  status(): Promise<ServerState>;
  stop(): Promise<void>;
  setBenchmarkState(options: { running: boolean; backgroundIdleMinutes: number }): Promise<void>;
  cleanupCameraTempFiles(): Promise<void>;
  dataset(options: { name: string }): Promise<{ entries: DatasetEntry[] }>;
  datasetImage(options: { name: string; file: string }): Promise<{ dataUrl: string }>;
  exportResult(options: { json: string }): Promise<{ path: string }>;
}
export interface HttpTransport {
  post(options: { url: string; headers: Record<string, string>; data: Record<string, unknown>; connectTimeout: number; readTimeout: number; disableRedirects: boolean }): Promise<{ status: number; data: unknown }>;
}
export type ImageSourceKind = 'camera' | 'gallery' | 'dataset';
export interface BenchImage { id: string; dataUrl: string; imageSource: ImageSourceKind; captureMethod?: 'system' | 'webview' }
export interface ImageResult {
  id: string; engine: string; config: BenchmarkConfig;
  outcome?: ReadOutcome; linePasses?: { lines: TextLine[]; usage: ReadUsage }[];
  usage: ReadUsage; totalMs: number; modelLoadMs: number; modelVerifyMs: number; reusedModel: boolean;
  memory?: ServerState; errorCode?: string;
  imageSource: ImageSourceKind; captureMethod?: 'system' | 'webview';
}
export interface BenchmarkReport { version: 1; device: DeviceInfo; results: ImageResult[] }
