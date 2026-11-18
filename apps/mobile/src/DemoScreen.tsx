import React from 'react';
import { WorkScreen } from './WorkScreen.js';
import { sampleWorkLines, sampleWorkPages, sampleWorkSpec } from './work-sample.js';
import { settingsVi as m } from './settings.vi.js';

export function DemoScreen({ onBack }: { onBack: () => void }) {
  return <div><p className="banner" role="status"><b>{m.demoTitle}</b> · {m.demoNote}</p>
    <WorkScreen spec={sampleWorkSpec} initialLines={sampleWorkLines} pages={sampleWorkPages} onBack={onBack}/>
  </div>;
}
