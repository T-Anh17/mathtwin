import React from 'react';
import { ChevronRight, Download, Gauge, ShieldCheck } from 'lucide-react';
import { productVi as m } from './product-messages.vi.js';
import { BottomNav, HistoryRows } from './product-ui.js';
import type { HistoryItem, ReaderStatus, Tab } from './product-types.js';

export function HistoryScreen({ history, onNavigate, onOpenHistory }: { history: readonly HistoryItem[]; onNavigate: (tab: Tab) => void; onOpenHistory: (item: HistoryItem) => void }) {
  return <div className="screen"><div className="topbar" style={{ paddingLeft: 16 }}><h1>{m.history}</h1></div>
    <div className="content"><HistoryRows rows={history} onOpen={onOpenHistory}/></div><BottomNav active="history" onNavigate={onNavigate}/></div>;
}
export function SettingsScreen({ reader, onNavigate, onBenchmark }: { reader: ReaderStatus; onNavigate: (tab: Tab) => void; onBenchmark: () => void }) {
  return <div className="screen"><div className="topbar" style={{ paddingLeft: 16 }}><h1>{m.settings}</h1></div><div className="content">
    <div className="list"><div className="list-row"><div className={`row-icon ${reader.ready ? 'v-ok' : 'v-confirm'}`}>{reader.ready ? <ShieldCheck/> : <Download/>}</div>
      <div className="row-main"><div className="row-title">{m.reader}</div><div className="row-meta">{reader.ready ? m.downloaded : m.notDownloaded}{' · '}{reader.size}</div></div></div>
      <div className="list-row" role="button" tabIndex={0} onClick={onBenchmark} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onBenchmark(); } }}>
        <div className="row-icon"><Gauge/></div><div className="row-main"><div className="row-title">{m.benchmark}</div></div><ChevronRight size={20}/></div></div>
    </div><BottomNav active="settings" onNavigate={onNavigate}/></div>;
}
