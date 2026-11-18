import React from 'react';
import { productVi as m } from './product-messages.vi.js';
import { BottomNav, HistoryRows } from './product-ui.js';
import type { HistoryItem, Tab } from './product-types.js';
export { SettingsScreen } from './SettingsScreen.js';

export function HistoryScreen({ history, onNavigate, onOpenHistory, onRemove }: { history: readonly HistoryItem[]; onNavigate: (tab: Tab) => void; onOpenHistory: (item: HistoryItem) => void; onRemove?: (item: HistoryItem) => void }) {
  return <div className="screen"><div className="topbar" style={{ paddingLeft: 16 }}><h1>{m.history}</h1></div>
    <div className="content">{history.length ? <HistoryRows rows={history} onOpen={onOpenHistory} {...(onRemove ? { onRemove } : {})}/> : <p>{m.noHistory}</p>}</div><BottomNav active="history" onNavigate={onNavigate}/></div>;
}
