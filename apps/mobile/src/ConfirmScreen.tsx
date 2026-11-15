import React from 'react';
import { Camera, CircleCheckBig, ImageOff, Pencil } from 'lucide-react';
import { productVi as m } from './product-messages.vi.js';
import { Actions, Crop, GraphPreview, LoadingScreen, NextButton, Topbar } from './product-ui.js';
import type { ConfirmationData, ProductActions, ScreenState } from './product-types.js';

export interface ConfirmProps { state: ScreenState; data: ConfirmationData; actions: ProductActions; onBack: () => void }
export function ConfirmScreen({ state, data, actions, onBack }: ConfirmProps) {
  if (state === 'dang-tai') return <LoadingScreen title={m.loading.confirm} onCancel={actions.onCancel}/>;
  const top = <Topbar title={m.confirmTitle} onBack={onBack}/>;
  if (state === 'loi') return <div className="screen">{top}<div className="content">
    <div className="banner banner-error"><ImageOff/><div><b>{m.blurryTitle}</b><br/>{m.blurryDescription}</div></div>
    <div className="photo" style={{ filter: 'blur(1.5px)' }}><img src={data.image} alt=""/></div></div>
    <Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onManualInput}>{m.manual}</button><button className="btn btn-primary" style={{ flex: 1 }} onClick={actions.onRetake}><Camera/>{m.retake}</button></Actions></div>;
  if (state === 'rong') return <div className="screen">{top}<div className="content">
    <div className="card empty"><div className="empty-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><CircleCheckBig/></div><div className="section-title">{m.allClear}</div><p className="text-sm muted" style={{ margin: 0 }}>{m.allClearDescription}</p></div>
    <div className="card"><GraphPreview data={data.graph}/></div></div>
    <Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onEdit}>{m.edit}</button><NextButton onClick={actions.onConfirm}>{m.grade}</NextButton></Actions></div>;
  return <div className="screen">{top}<div className="content">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><div className="text-sm muted">{m.uncertainProgress(data.current, data.total)}</div>
      <div className="progress-dots">{Array.from({ length: data.total }, (_, i) => <i key={i} className={i < data.current ? 'on' : undefined}/>)}</div></div>
    <div className="card question-card"><div className="section-title" style={{ fontSize: 17 }}>{data.question}</div>
      <Crop image={data.image} crop={data.crop} confirm/>
      <p className="text-xs muted" style={{ margin: 0 }}>{data.explanation}</p>
      <div className="options">{data.options.map((value) => <button key={value} className="option math" aria-pressed={data.selected === value ? true : undefined} onClick={() => actions.onChooseOption(value)}>{value}</button>)}</div>
      <button className="btn btn-ghost" style={{ alignSelf: 'center' }} onClick={actions.onOtherNumber}><Pencil/>{m.otherNumber}</button>
    </div><details className="card"><summary className="text-sm" style={{ cursor: 'pointer', fontWeight: 500 }}>{m.viewGraph}</summary><div style={{ marginTop: 12 }}><GraphPreview data={data.graph} unsure size={200}/></div></details>
    </div><Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onSkip}>{m.skip}</button><NextButton onClick={actions.onConfirm}>{m.next}</NextButton></Actions></div>;
}
