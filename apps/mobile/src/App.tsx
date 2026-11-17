import React from 'react';
import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BenchmarkScreen } from './BenchmarkScreen.js';
import { ConfirmScreen } from './ConfirmScreen.js';
import { GraphEditScreen } from './GraphEditScreen.js';
import { HomeScreen } from './HomeScreen.js';
import { ResultScreen } from './ResultScreen.js';
import { HistoryScreen, SettingsScreen } from './SecondaryScreens.js';
import { Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { captureImage, fileDataUrl } from './capture.js';
import { decodeImage } from './images.js';
import { workerRunner } from './figure-suggest.js';
import { emptyProductActions, sampleConfirmation, sampleCorrect, sampleHistory, sampleInsufficient, samplePending, sampleReader, sampleWrong } from './sample-data.js';
import type { HistoryItem, ResultData, Tab } from './product-types.js';

type Page = Tab | 'confirm' | 'result' | 'benchmark' | 'graph';
/** The figure reader works on a 1000 px copy; the photo itself is never stored. */
const decodeForFigure = async (dataUrl: string) => (await decodeImage(dataUrl, 1000)).resized;

export function App() {
  const [page, setPage] = useState<Page>('home');
  const [returnPage, setReturnPage] = useState<Tab>('home');
  const [result, setResult] = useState<ResultData>(sampleWrong);
  const [photo, setPhoto] = useState<string | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  const file = useRef<HTMLInputElement | null>(null);
  const back = () => setPage(returnPage);
  const openGraph = (dataUrl: string | null) => { setPhoto(dataUrl); setGraphKey((k) => k + 1); setPage('graph'); };
  // Native: system camera. Browser preview: file picker. A cancelled capture leaves the page unchanged.
  const pickPhoto = () => {
    if (Capacitor.isNativePlatform()) captureImage().then(openGraph).catch(() => {});
    else file.current?.click();
  };
  // Grading integration is phase 4; the graph screen is the real reading/review step for now.
  const actions = { ...emptyProductActions,
    onCapture: () => { setReturnPage('home'); pickPhoto(); },
    onManualInput: () => { setReturnPage('home'); openGraph(null); },
    onEdit: () => openGraph(photo),
    onConfirm: () => { emptyProductActions.onConfirm(); setResult(sampleWrong); setPage('result'); },
    onCancel: back,
  };
  const openHistory = (item: HistoryItem) => {
    setReturnPage(page === 'history' ? 'history' : 'home');
    const results = { sai: sampleWrong, dung: sampleCorrect, can_xac_nhan: samplePending, khong_du_can_cu: sampleInsufficient };
    setResult(results[item.verdict]); setPage('result');
  };
  return <div className="product-app">
    <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => {
      const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
      if (chosen) fileDataUrl(chosen).then(openGraph).catch(() => {});
    }}/>
    {page === 'home' && <HomeScreen state="du-lieu" reader={sampleReader} history={sampleHistory} actions={actions} onNavigate={setPage} onOpenHistory={openHistory}/>}
    {page === 'history' && <HistoryScreen history={sampleHistory} onNavigate={setPage} onOpenHistory={openHistory}/>}
    {page === 'settings' && <SettingsScreen reader={sampleReader} onNavigate={setPage} onBenchmark={() => setPage('benchmark')}/>}
    {page === 'confirm' && <ConfirmScreen state="du-lieu" data={sampleConfirmation} actions={actions} onBack={back}/>}
    {page === 'graph' && <GraphEditScreen key={graphKey} photo={photo} decode={decodeForFigure} runner={workerRunner}
      onBack={() => { setPhoto(null); back(); }} onPickPhoto={pickPhoto}/>}
    {page === 'result' && (result.verdict === 'dung' ? <ResultScreen state="rong" data={result} actions={actions} onBack={back}/>
      : result.verdict === 'khong_du_can_cu' ? <ResultScreen state="loi" data={result} actions={actions} onBack={back}/>
      : <ResultScreen state="du-lieu" data={result} actions={actions} onBack={back}/>)}
    {page === 'benchmark' && <div><Topbar title={m.benchmark} onBack={() => setPage('settings')}/><BenchmarkScreen/></div>}
  </div>;
}
