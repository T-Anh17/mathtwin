import React from 'react';
import { useState } from 'react';
import { BenchmarkScreen } from './BenchmarkScreen.js';
import { ConfirmScreen } from './ConfirmScreen.js';
import { HomeScreen } from './HomeScreen.js';
import { ResultScreen } from './ResultScreen.js';
import { HistoryScreen, SettingsScreen } from './SecondaryScreens.js';
import { Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { emptyProductActions, sampleConfirmation, sampleCorrect, sampleHistory, sampleInsufficient, samplePending, sampleReader, sampleWrong } from './sample-data.js';
import type { HistoryItem, ResultData, Tab } from './product-types.js';

type Page = Tab | 'confirm' | 'result' | 'benchmark';
export function App() {
  const [page, setPage] = useState<Page>('home');
  const [returnPage, setReturnPage] = useState<Tab>('home');
  const [result, setResult] = useState<ResultData>(sampleWrong);
  const back = () => setPage(returnPage);
  // Only local sample navigation is connected. All product integration handlers remain empty.
  const actions = { ...emptyProductActions,
    onCapture: () => { emptyProductActions.onCapture(); setReturnPage('home'); setPage('confirm'); },
    onConfirm: () => { emptyProductActions.onConfirm(); setResult(sampleWrong); setPage('result'); },
    onCancel: back,
  };
  const openHistory = (item: HistoryItem) => {
    setReturnPage(page === 'history' ? 'history' : 'home');
    const results = { sai: sampleWrong, dung: sampleCorrect, can_xac_nhan: samplePending, khong_du_can_cu: sampleInsufficient };
    setResult(results[item.verdict]); setPage('result');
  };
  return <div className="product-app">
    {page === 'home' && <HomeScreen state="du-lieu" reader={sampleReader} history={sampleHistory} actions={actions} onNavigate={setPage} onOpenHistory={openHistory}/>}
    {page === 'history' && <HistoryScreen history={sampleHistory} onNavigate={setPage} onOpenHistory={openHistory}/>}
    {page === 'settings' && <SettingsScreen reader={sampleReader} onNavigate={setPage} onBenchmark={() => setPage('benchmark')}/>}
    {page === 'confirm' && <ConfirmScreen state="du-lieu" data={sampleConfirmation} actions={actions} onBack={back}/>}
    {page === 'result' && (result.verdict === 'dung' ? <ResultScreen state="rong" data={result} actions={actions} onBack={back}/>
      : result.verdict === 'khong_du_can_cu' ? <ResultScreen state="loi" data={result} actions={actions} onBack={back}/>
      : <ResultScreen state="du-lieu" data={result} actions={actions} onBack={back}/>)}
    {page === 'benchmark' && <div><Topbar title={m.benchmark} onBack={() => setPage('settings')}/><BenchmarkScreen/></div>}
  </div>;
}
