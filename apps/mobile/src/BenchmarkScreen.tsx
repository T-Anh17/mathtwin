import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { defaultDry, defaultMaxImageSide, defaultReadTimeout } from '@mathtwin/reader-llamacpp-shared';
import manifest from '../../../tools/models/manifest.json';
import { Benchmark, exportReport } from './benchmark.ts';
import { decodeImage } from './images.ts';
import { mobile, transport } from './native.ts';
import { vi, messageFor } from './messages.vi.ts';
import { captureImage, captureWebViewImage, fileDataUrl } from './capture.ts';
import { flagOverlays } from './overlays.ts';
import { runBatch } from './batch.ts';
import type { Graph as GraphModel } from '@mathtwin/core';
import type { ReadUncertainty } from '@mathtwin/reader';
import { ocrMessages } from '@mathtwin/reader';
import type { BenchImage, BenchmarkConfig, Dataset, DeviceInfo, ImageResult, Model, ModelState } from './contracts.js';

const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(2)} GB`;
const ms = (value: number): string => `${Math.round(value)} ms`;
const modelIds: Model[] = ['a', 'b'];
const runner = new Benchmark(mobile, transport, decodeImage);
export function BenchmarkScreen() {
  const [tab, setTab] = useState('bench');
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [models, setModels] = useState<ModelState[]>([]);
  const [config, setConfig] = useState<BenchmarkConfig>({ model: 'b', passes: 2, mode: 'lines', threads: 4, minRamGb: 6, allowLowRam: false, backgroundIdleMinutes: 5,
    maxImageSide: defaultMaxImageSide, readTimeout: defaultReadTimeout, dry: { ...defaultDry } });
  const [images, setImages] = useState<BenchImage[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetName, setDatasetName] = useState('synthetic');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const native = Capacitor.isNativePlatform();
  const refresh = async () => { if (native) { setDevice(await mobile.device()); setModels((await mobile.models()).models); } };
  useEffect(() => { refresh().catch((e: unknown) => setMessage(messageFor(e)));
    return () => { abort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => { refresh().catch(() => {}); }, 1000);
    return () => clearInterval(timer);
  }, [downloading]);
  const action = async (work: () => Promise<unknown>): Promise<void> => { setMessage(''); try { await work(); } catch (e) { setMessage(messageFor(e)); } };
  const set = <K extends keyof BenchmarkConfig,>(name: K, value: BenchmarkConfig[K]): void => setConfig((old) => ({ ...old, [name]: value }));
  const addPhoto = (dataUrl: string, imageSource: BenchImage['imageSource'], captureMethod?: BenchImage['captureMethod']): void => {
    setDataset(null); setImages((old) => [...old, { id: `photo-${old.length + 1}`, dataUrl, imageSource, ...(captureMethod ? { captureMethod } : {}) }]);
  };
  const modelAction = async (model: Model, importing: boolean): Promise<void> => {
    setDownloading(true);
    try { await (importing ? mobile.importModel({ model }) : mobile.download({ model })); }
    finally { setDownloading(false); await refresh(); }
  };
  const run = async () => {
    const signal = new AbortController(); abort.current = signal; setBusy(true); setMessage(vi.running);
    try {
      await runBatch(dataset ? { dataset } : { images }, config, mobile, runner, signal.signal,
        (result) => setResults((old) => [...old, result]));
      setMessage(signal.signal.aborted ? messageFor({ code: 'aborted' }) : vi.done);
    } finally { setBusy(false); abort.current = null; await refresh(); }
  };
  const lowRam = device !== null && device.totalRamBytes < config.minRamGb * 1e9;
  const ready = models.find((m) => m.model === config.model)?.ready;
  return <main className="benchmark-screen">
    <header><span className="brand">{vi.title}</span><span>{vi.subtitle}</span></header>
    <nav aria-label={vi.title}><button className={tab === 'bench' ? 'selected' : ''} onClick={() => setTab('bench')}>{vi.bench}</button><button className={tab === 'models' ? 'selected' : ''} onClick={() => setTab('models')}>{vi.models}</button></nav>
    {!native && <p className="warning">{vi.nativeOnly}</p>}
    {device && <p className="device">{device.manufacturer} {device.model} · Android {device.android} · {device.cores} CPU · {vi.ram}: {gb(device.totalRamBytes)} · {vi.storage}: {gb(device.freeStorageBytes)}</p>}
    {message && <p role="status" className="status">{message}</p>}
    {tab === 'models' ? <section><h1>{vi.models}</h1><p>{vi.downloadNote}</p>
      <p className="warning">{ocrMessages.weightsWarning}</p>
      {modelIds.map((model) => { const files = manifest.files.filter((f) => f.model === model); const bytes = files.reduce((n, f) => n + f.bytes, 0); const state = models.find((m) => m.model === model);
        return <article key={model}><h2>{vi[model]}</h2><p>{gb(bytes)} · {state?.ready ? vi.ready : vi.missing}</p>
          {files.map((f) => <p className="file" key={f.filename}>{f.filename} · {gb(f.bytes)}</p>)}
          <progress max={bytes} value={state?.downloadedBytes ?? 0} aria-label={vi.download}/>
          <div className="actions"><button disabled={!native || busy || downloading || state?.ready || (device !== null && device.freeStorageBytes < bytes - (state?.downloadedBytes ?? 0) + 67108864)} onClick={() => action(() => modelAction(model, false))}>{vi.download}</button>
          <button disabled={!native || busy || downloading} onClick={() => action(() => modelAction(model, true))}>{vi.importModel}</button></div>
          {device && device.freeStorageBytes < bytes - (state?.downloadedBytes ?? 0) + 67108864 && <p className="warning">{vi.errors.no_space}</p>}
        </article>; })}
      {downloading && <button onClick={() => action(() => mobile.cancelDownload())}>{vi.cancelDownload}</button>}
    </section> : <section><h1>{vi.bench}</h1>
      <fieldset disabled={busy || downloading}><legend>{vi.settings}</legend><div className="settings">
        <label>{vi.models}<select value={config.model} onChange={(e) => set('model', e.target.value === 'a' ? 'a' : 'b')}><option value="a">{vi.a}</option><option value="b">{vi.b}</option></select></label>
        <label>{vi.passes}<select value={config.passes} onChange={(e) => set('passes', e.target.value === '1' ? 1 : 2)}><option value={1}>1</option><option value={2}>2</option></select></label>
        <label>{vi.mode}<select value={config.mode} onChange={(e) => set('mode', e.target.value === 'graph' ? 'graph' : 'lines')}><option value="graph">{vi.graph}</option><option value="lines">{vi.lines}</option></select></label>
        <label>{vi.threads}<input type="number" min="1" max={device?.cores ?? 256} value={config.threads} onChange={(e) => set('threads', Number(e.target.value))}/></label>
        <label>{vi.maxImageSide}<select value={config.maxImageSide} onChange={(e) => set('maxImageSide', Number(e.target.value))}>{[512, 768, 1024].map((side) => <option key={side} value={side}>{side} px</option>)}</select></label>
        <label>{vi.readTimeout}<input type="number" min="1" max="3600" value={config.readTimeout! / 1000} onChange={(e) => set('readTimeout', Number(e.target.value) * 1000)}/></label>
        <label>{vi.dry}<select value={config.dry!.dry_multiplier === 0 ? 'off' : 'on'} onChange={(e) => set('dry', { ...config.dry!, dry_multiplier: e.target.value === 'off' ? 0 : defaultDry.dry_multiplier })}><option value="on">{vi.enabled}</option><option value="off">{vi.disabled}</option></select></label>
        {(['dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n'] as const).map((key) => <label key={key}>{vi[key]}<input type="number" min={key === 'dry_base' ? 1 : key === 'dry_penalty_last_n' ? -1 : 0} step={key === 'dry_multiplier' || key === 'dry_base' ? 0.05 : 1} value={config.dry![key]} onChange={(e) => set('dry', { ...config.dry!, [key]: Number(e.target.value) })}/></label>)}
        <label>{vi.minRam}<input type="number" min="1" max="64" step="0.5" value={config.minRamGb} onChange={(e) => set('minRamGb', Number(e.target.value))}/></label>
        <label>{vi.backgroundIdle}<input type="number" min="1" max="60" value={config.backgroundIdleMinutes} onChange={(e) => set('backgroundIdleMinutes', Number(e.target.value))}/></label>
      </div>
      {config.model === 'a' && config.mode === 'graph' && <p className="warning">{vi.textOnly}</p>}
      {lowRam && <div className="warning"><p>{vi.lowRam}</p><label><input type="checkbox" checked={config.allowLowRam} onChange={(e) => set('allowLowRam', e.target.checked)}/>{vi.allowLowRam}</label></div>}
      <div className="actions"><button disabled={!native} onClick={() => action(async () => addPhoto(await captureImage(), 'camera', 'system'))}>{vi.camera}</button>
      <button disabled={!native} onClick={() => action(async () => addPhoto(await captureWebViewImage(), 'camera', 'webview'))}>{vi.webViewCamera}</button><button onClick={() => input.current?.click()}>{vi.gallery}</button></div>
      <input ref={input} hidden type="file" accept="image/png,image/jpeg" multiple onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void action(async () => { for (const file of files) addPhoto(await fileDataUrl(file), 'gallery'); }); }}/>
      <div className="dataset"><label>{vi.datasetName}<input value={datasetName} onChange={(e) => setDatasetName(e.target.value)}/></label><button disabled={!native} onClick={() => action(async () => { const data = await mobile.dataset({ name: datasetName }); setDataset({ name: datasetName, ...data }); setImages([]); })}>{vi.dataset}</button></div>
      </fieldset>
      <p>{dataset ? vi.datasetSummary(dataset.name, dataset.entries.length, dataset.location) : images.length ? `${vi.queued}: ${images.length}` : vi.empty}</p>
      <div className="thumbnails">{images.map((image) => <img key={image.id} src={image.dataUrl} alt={image.id}/>)}</div>
      <div className="actions"><button className="primary" disabled={!native || busy || downloading || !ready || (!images.length && !dataset) || (lowRam && !config.allowLowRam)} onClick={() => action(run)}>{vi.run}</button>
      <button disabled={!native || downloading} onClick={() => action(async () => { abort.current?.abort(); await mobile.stop(); })}>{vi.stop}</button>
      <button disabled={busy} onClick={() => { setImages([]); setDataset(null); setResults([]); }}>{vi.clear}</button></div>
      <h2>{vi.results}</h2>
      {results.map((result, i) => <Result key={i} result={result} image={images.find((p) => p.id === result.id)} dataset={dataset}/>)}
      <button disabled={!device || !results.length || busy} onClick={() => action(async () => { if (!device) return; const out = await mobile.exportResult({ json: exportReport({ version: 1, device, results }) }); setMessage(`${vi.saved}: ${out.path}`); })}>{vi.export}</button>
    </section>}
    <footer>{vi.privacy}</footer>
  </main>;
}
function Result({ result, image, dataset }: { result: ImageResult; image: BenchImage | undefined; dataset: Dataset | null }) {
  const [preview, setPreview] = useState<string | null | undefined>(image?.dataUrl);
  const [size, setSize] = useState<[number, number] | null>(null);
  useEffect(() => { setPreview(image?.dataUrl); }, [image]);
  const previewEntry = dataset?.entries.find((e) => e.id === result.id);
  const marks = flagOverlays(result);
  return <article><h3>{result.id} · {vi[result.config.model]} · {vi[result.config.mode]} · {result.config.passes}</h3>
    {previewEntry && dataset && <button onClick={() => { if (preview) setPreview(null); else void mobile.datasetImage({ name: dataset.name, file: previewEntry.file, location: dataset.location }).then(({ dataUrl }) => setPreview(dataUrl)).catch(() => {}); }}>{preview ? vi.hideImage : vi.showImage}</button>}
    {preview && <div className="preview"><img src={preview} alt={result.id} onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}/>
      {size && <svg viewBox={`0 0 ${size[0]} ${size[1]}`} aria-label={vi.flags}>{marks.map((m, i) => <rect key={i} x={m.box[0]} y={m.box[1]} width={m.box[2] - m.box[0]} height={m.box[3] - m.box[1]}><title>{m.label}</title></rect>)}</svg>}
    </div>}
    <p>{vi.total}: {ms(result.totalMs)} · {result.reusedModel ? vi.warm : vi.firstLoad}: {ms(result.modelLoadMs)} · {vi.peak}: {result.memory?.peakMemoryMb === undefined ? vi.noMemory : `${result.memory.peakMemoryMb.toFixed(1)} MB`}</p>
    <p>{vi.verify}: {ms(result.modelVerifyMs)}</p>
    {result.memory?.cpuVariant && <p>{vi.cpuVariant}: {result.memory.cpuVariant}</p>}
    <p>{result.usage.serverTimings ? `${vi.prompt}: ${ms(result.usage.serverTimings.promptMs)} · ${vi.predicted}: ${ms(result.usage.serverTimings.predictedMs)}` : vi.noTimings}</p>
    {result.errorCode && <p className="warning">{result.errorCode}: {vi.errors[result.errorCode]}</p>}
    {result.outcome && <><Graph graph={result.outcome.graph} flags={result.outcome.spec?.uncertain ?? result.outcome.graphUncertain}/><p>{vi.noBox}</p><pre>{JSON.stringify(result.outcome, null, 2)}</pre></>}
    {result.linePasses?.map((pass, i) => <div key={i}><h4>{vi.linePass} {i + 1}</h4>{pass.lines.map((line, j) => <p key={j} className={line.conf < 0.85 || line.alternatives.length ? 'flag' : ''}>{line.text} <small>{line.conf.toFixed(3)}{line.alternatives.length ? ` · ${line.alternatives.join(' / ')}` : ''}</small></p>)}</div>)}
  </article>;
}
function Graph({ graph, flags }: { graph: GraphModel | null; flags: ReadUncertainty[] }) {
  if (!graph) return null;
  const labels = graph.vertices;
  const positions = new Map<string, [number, number]>(labels.map((v, i) => [v.id, [160 + 110 * Math.cos(2 * Math.PI * i / labels.length), 140 + 100 * Math.sin(2 * Math.PI * i / labels.length)]]));
  const marked = (id: string): boolean => flags.some((f) => f.item === 'graph' || f.item === id || f.item.startsWith(`${id}.`));
  return <svg className="graph" viewBox="0 0 320 280" aria-label={vi.graph}>
    {graph.edges.map((edge, i) => { const a = positions.get(edge.u), b = positions.get(edge.v); if (!a || !b) return null; const [x, y] = a; const [tx, ty] = b; const bend = 16 + 14 * (i % 3); const mx = (x + tx) / 2 + bend; const my = (y + ty) / 2 - bend;
      return <g key={edge.id} className={marked(edge.id) ? 'uncertain' : ''}>{edge.u === edge.v ? <ellipse cx={x + 14} cy={y - 18} rx="20" ry="22"/> : <path d={`M ${x} ${y} Q ${mx} ${my} ${tx} ${ty}`}/>}<text x={edge.u === edge.v ? x + 34 : mx} y={edge.u === edge.v ? y - 30 : my}>{[edge.name, edge.w].filter((v) => v !== null && v !== undefined).join(': ')}</text></g>; })}
    {labels.map((v) => { const position = positions.get(v.id); if (!position) return null; const [x, y] = position; return <g key={v.id} className={marked(v.id) ? 'uncertain' : ''}><circle cx={x} cy={y} r="14"/><text x={x} y={y + 5} textAnchor="middle">{v.label}</text></g>; })}
  </svg>;
}
