import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { HomeScreen } from '../src/HomeScreen.js';
import { ConfirmScreen } from '../src/ConfirmScreen.js';
import { ResultScreen } from '../src/ResultScreen.js';
import { HistoryScreen, SettingsScreen } from '../src/SecondaryScreens.js';
import { Logo } from '../src/Logo.js';
import { emptyProductActions as actions, sampleConfirmation, sampleCorrect, sampleHistory, sampleInsufficient, samplePending, sampleReader, sampleWrong } from '../src/sample-data.js';
import { productVi as m } from '../src/product-messages.vi.js';
import type { ScreenState } from '../src/product-types.js';
import type { ResultProps } from '../src/ResultScreen.js';

const noop = () => {};
const root = fileURLToPath(new URL('../../..', import.meta.url));
const source = join(root, 'apps/mobile/src');
const read = (file: string) => readFileSync(join(root, file), 'utf8').replaceAll('\r\n', '\n');
const home = (state: ScreenState, ready = true) => renderToStaticMarkup(createElement(HomeScreen, {
  state, reader: { ...sampleReader, ready }, history: sampleHistory, actions, onNavigate: noop, onOpenHistory: noop,
}));
const confirm = (state: ScreenState) => renderToStaticMarkup(createElement(ConfirmScreen, { state, data: sampleConfirmation, actions, onBack: noop }));
const renderResult = (props: ResultProps) => renderToStaticMarkup(createElement(ResultScreen, props));
const result = (state: ScreenState) => renderResult(state === 'rong' ? { state, data: sampleCorrect, actions, onBack: noop }
  : state === 'loi' ? { state, data: sampleInsufficient, actions, onBack: noop }
  : { state, data: sampleWrong, actions, onBack: noop });

describe('UI-1 · 3 màn × 4 trạng thái wireframe', () => {
  const states: ScreenState[] = ['du-lieu', 'dang-tai', 'rong', 'loi'];
  for (const state of states) {
    it(`Trang chủ A · ${state}`, () => {
      const html = home(state);
      expect(html).toContain(state === 'dang-tai' ? m.loading.title : state === 'rong' ? m.noHistory : state === 'loi' ? m.downloadReader : m.heroTitle);
    });
    it(`Xác nhận B · ${state}`, () => {
      const html = confirm(state);
      expect(html).toContain(state === 'dang-tai' ? m.loading.confirm : state === 'rong' ? m.allClear : state === 'loi' ? m.blurryTitle : m.uncertainProgress(1, 2));
    });
    it(`Kết quả A · ${state}`, () => {
      const html = result(state);
      expect(html).toContain(state === 'dang-tai' ? m.loading.title : state === 'rong' ? m.correctPrefix : state === 'loi' ? m.insufficient : m.wrongStep(4));
    });
  }
});

describe('Nội dung và các điểm nối', () => {
  it('SAI giữ bước đầu tiên, số học sinh gạch và số đúng do dữ liệu truyền vào', () => {
    const html = result('du-lieu');
    expect(html).toContain('Sai ở bước 4');
    expect(html).toContain('<span class="strike-num">9</span>');
    expect(html).toContain('<span class="fix-num">→ 8</span>');
    const other = renderResult({ state: 'du-lieu', data: { ...sampleWrong, firstErrorStep: 6, studentValue: 12, correctValue: 11 }, actions, onBack: noop });
    expect(other).toContain('Sai ở bước 6');
    expect(other).toContain('<span class="strike-num">12</span>');
    expect(other).toContain('<span class="fix-num">→ 11</span>');
  });
  it('Xác nhận có tiến độ và hai lựa chọn đúng wireframe', () => {
    const html = confirm('du-lieu');
    expect(html).toContain('Chỗ chưa chắc 1 / 2');
    expect(html).toContain('class="option math" aria-pressed="true">1</button>');
    expect(html).toContain('class="option math">7</button>');
  });
  it('khóa Chụp bài và hiện Tải bộ đọc bài khi chưa tải', () => {
    const html = home('du-lieu', false);
    expect(html).toMatch(/class="btn btn-hero btn-block" disabled=""/);
    expect(html).toContain('Tải bộ đọc bài');
    expect(html).toContain(m.missingReader);
  });
  it('đúng tọa độ cắt và khoanh trên ảnh mẫu', () => {
    const wrong = result('du-lieu'), question = confirm('du-lieu');
    expect(wrong).toContain('height:150px;background-image:');
    expect(wrong).toContain('background-size:250% auto;background-position:6% 74%');
    expect(wrong).toContain('left:9%;top:34%;width:66%;height:30%');
    expect(question).toContain('background-size:330% auto;background-position:72% 41%');
    expect(question).toContain('left:40%;top:30%;width:22%;height:40%');
  });
  it('Lịch sử có đủ bốn kết quả và Cài đặt có trạng thái/dung lượng + màn Đo', () => {
    const html = renderToStaticMarkup(createElement(HistoryScreen, { history: sampleHistory, onNavigate: noop, onOpenHistory: noop }));
    for (const row of sampleHistory) expect(html).toContain(m.verdictLabels[row.verdict]);
    const settings = renderToStaticMarkup(createElement(SettingsScreen, { reader: sampleReader, onNavigate: noop, onBenchmark: noop }));
    expect(settings).toContain(m.downloaded); expect(settings).toContain(sampleReader.size); expect(settings).toContain(m.benchmark);
    const missing = renderToStaticMarkup(createElement(SettingsScreen, { reader: { ...sampleReader, ready: false }, onNavigate: noop, onBenchmark: noop }));
    expect(missing).toContain(m.notDownloaded);
  });
  it('kết quả chưa chắc dùng đúng màn hỏi xác nhận, không kết luận sai', () => {
    const html = renderResult({ state: 'du-lieu', data: samplePending, actions, onBack: noop });
    expect(html).toContain(m.uncertainProgress(1, 2)); expect(html).not.toContain(m.wrongStep(4));
  });
  it('mở app vào Trang chủ, chưa mount màn Đo', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain(m.heroTitle); expect(html).not.toContain('benchmark-screen');
    expect(html).toContain('aria-current="page"');
  });
});

describe('Nhận diện và tài nguyên offline', () => {
  it('token và CSS component chép nguyên khối wireframe, bỏ khung và nấc xám', () => {
    const css = read('docs/design/wireframe.html').split('<style>')[1]!.split('</style>')[0]!;
    expect(read('apps/mobile/src/tokens.css').trim()).toBe(css.match(/:root \{[\s\S]*?\n\}/)![0]);
    const expected = css.slice(css.indexOf('* { box-sizing'), css.indexOf('/* ===== THANH WIREFRAME'))
      .replace(/\.phone \{[\s\S]*?\}\nbody\[data-frame\] \.phone \{[\s\S]*?\}\n\.status-bar \{[\s\S]*?\}\n/, '');
    expect(read('apps/mobile/src/ui.css')).toBe(expected);
  });
  it('logo dùng đúng SVG và nhận màu qua prop', () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 72, ink: '#fffdf9', amber: '#c8892b', paper: '#1f2d55' }));
    expect(html).toContain('d="M14 30 C 20 14, 28 14, 34 30"');
    expect(html).toContain('width="72"'); expect(html).toContain('fill="#1f2d55"');
    expect(html).toContain('r="2.6" fill="#c8892b"');
  });
  it('ảnh mẫu là bản sao nguyên byte', () => {
    expect(readFileSync(join(source, 'assets/bai-lam.png'))).toEqual(readFileSync(join(root, 'docs/design/bai-lam.png')));
  });
  it('source không dùng CDN/font từ xa; chỉ nạp 4 độ đậm, latin và vietnamese', () => {
    const files = readdirSync(source, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(tsx?|css)$/.test(entry.name));
    for (const entry of files) expect(readFileSync(join(entry.parentPath, entry.name), 'utf8')).not.toMatch(/fonts\.googleapis|cdn\.jsdelivr/);
    const css = read('apps/mobile/src/fonts.css');
    const fonts = [...css.matchAll(/be-vietnam-pro-(vietnamese|latin)-(\d+)-normal \*\//g)].map((match) => `${match[1]}-${match[2]}`);
    expect(fonts.sort()).toEqual(['latin-400', 'latin-500', 'latin-600', 'latin-700', 'vietnamese-400', 'vietnamese-500', 'vietnamese-600', 'vietnamese-700']);
    expect(css.match(/unicode-range:/g)).toHaveLength(8);
    expect(read('apps/mobile/src/main.tsx')).toContain("import './fonts.css'");
  });
});
