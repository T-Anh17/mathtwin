import { describe, expect, it } from 'vitest';
import type { ClaimBody } from '@mathtwin/core';
import { parseWork } from '../src/index.js';
import type { WorkLine, WorkVocabulary } from '../src/index.js';
const vocab: WorkVocabulary = { vertexLabels: ['A','B','C','D'], edgeNames: [], task: 'shortest_path', questionFormat: 'tu_luan', statementIds: [], questionText: [] };
const lines = (texts: string[]): WorkLine[] => texts.map((text,index) => ({text,index,page:0,conf:0.98,alternatives:[]}));
const body = (text: string, task = vocab.task) => parseWork(lines([text]), {...vocab, task}).steps.map(({claim}) => {
  const {step,raw,conf,box,...body} = claim; return body;
});
describe('algorithm text and table parser, batch 3.3', () => {
  it.each([
    ['Gán nhãn A = 0, các đỉnh khác ∞', {type:'dijkstra_init',source:'A'}],
    ['Khoanh tròn C', {type:'dijkstra_select',v:'C'}],
    ['Chọn C', {type:'dijkstra_select',v:'C'}],
    ['Đỉnh được chọn: C', {type:'dijkstra_select',v:'C'}],
    ['n(B) = n(C) + w(CB) = 1 + 3 = 2', {type:'dijkstra_label',v:'B',value:2,via:'C'}],
    ['L(D) = 4 (qua B)', {type:'dijkstra_label',v:'D',value:4,via:'B'}],
    ['Tại B đổi nhãn 3 thành 2', {type:'dijkstra_label',v:'B',value:2}],
    ['Tại D, nhãn bằng 4 qua B', {type:'dijkstra_label',v:'D',value:4,via:'B'}],
    ['n(D) = ∞', {type:'dijkstra_label',v:'D',value:null}],
  ] satisfies [string,ClaimBody][])('translates %s', (text, expected) => expect(body(text)).toEqual([expected]));
  it('understands nearest neighbor and duplicate paths literally', () => {
    for (const text of ['Từ A đi đến B (gần nhất)', 'A → B vì AB = 1 nhỏ nhất']) expect(body(text,'tsp')).toEqual([{type:'nn_step',from:'A',to:'B'}]);
    expect(body('Em nhan thay Tu A di den B (gan nhat)', 'tsp')).toEqual([{type:'nn_step',from:'A',to:'B'}]);
    expect(body('Lặp lại đường B → C → D','postman')).toEqual([{type:'postman_duplicate',vertices:['B','C','D']}]);
    expect(body('Thêm cạnh lặp BD','postman')).toEqual([{type:'postman_duplicate',vertices:['B','D']}]);
    expect(parseWork(lines(['Cập nhật nhãn D qua cạnh BD.']),vocab)).toMatchObject({steps:[],unchecked:[],ignored:[{line:0,reason:'prose'}]});
  });
  it('retains all finite unsettled cells, the last written value and predecessors', () => {
    const parsed = parseWork(lines(['Chọn A B C D','A 0 (4, A) 1/A 9A','C - 2C 1 3/C','B - 2 - 3','D - - - 3']),vocab);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.filter((s)=>s.claim.type==='dijkstra_select').map((s)=>s.claim)).toMatchObject([{v:'A'},{v:'C'},{v:'B'},{v:'D'}]);
    expect(parsed.steps.filter((s)=>s.claim.type==='dijkstra_label').map((s)=>s.claim)).toMatchObject([
      {v:'B',value:4,via:'A'},{v:'C',value:1,via:'A'},{v:'D',value:9,via:'A'},
      {v:'B',value:2,via:'C'},{v:'D',value:3,via:'C'},{v:'D',value:3},
    ]);
    expect(parsed.steps.every((s)=>s.origin==='table')).toBe(true);
  });
  it('infers only a disappearing column and lowers confidence', () => {
    const parsed = parseWork(lines(['A B C D','0 1 3 4','- 1 2 4','C - - 2 4']),vocab,{confThreshold:0.9});
    expect(parsed.steps.filter((s)=>s.claim.type==='dijkstra_select')).toMatchObject([
      {origin:'inferred',claim:{v:'A',conf:0.89}}, {origin:'inferred',claim:{v:'B',conf:0.89}}, {origin:'table',claim:{v:'C'}},
    ]);
    for (const row of ['0 1 3 4','0 *1 ✓3 4']) {
      const malformed = lines(['A B C D',row]); malformed.forEach((l)=>l.region='table');
      expect(parseWork(malformed,vocab)).toMatchObject({steps:[],unchecked:[0,1],issues:[{code:'table_unrecognized'}]});
    }
  });
  it('recognizes selection marks without region metadata, including a mark-only cell', () => {
    const parsed = parseWork(lines(['A B C D', '*0 1/A 3/A 4/A', '- ✓ 2/B 4/A', 'C - - 2 3/C']), vocab);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.filter((s) => s.claim.type === 'dijkstra_select').map((s) => s.claim)).toMatchObject([{v:'A'}, {v:'B'}, {v:'C'}]);
  });
  it('retains stale numeric cells and rejects an unidentifiable selection', () => {
    const parsed = parseWork(lines(['Chọn A B C D', 'A 0 2/A 7/A 4/A', 'B - 2 3/B 4/A', 'C - - 3 4/A']), vocab);
    expect(parsed.steps.filter((s) => s.claim.type === 'dijkstra_label').map((s) => s.claim)).toContainEqual(expect.objectContaining({v:'D',value:4,via:'A'}));
    const input = lines(['A B C D', '0 2 3 4', '- - 3 4']);
    expect(parseWork(input, vocab)).toMatchObject({steps:[],unchecked:[0,1,2],issues:[{code:'table_unrecognized'}]});
  });
  it('continues a table across pages with a repeated header and omits infinite cells', () => {
    const input = lines(['Chọn A B C D', 'A 0 2/A ∞ ∞', 'Chọn A B C D', 'B - 2 3/B ∞']);
    input.forEach((l, i) => { l.region='table'; l.page = i < 2 ? 0 : 1; });
    const parsed = parseWork(input, vocab);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.map((s) => s.claim)).toMatchObject([{type:'dijkstra_select',v:'A'}, {type:'dijkstra_label',v:'B',value:2}, {type:'dijkstra_select',v:'B'}, {type:'dijkstra_label',v:'C',value:3}]);
  });
  it('does not treat a dash at a never-selected vertex as infinity', () => {
    const input=lines(['Chọn A B C D','A 0 - 1 2']);input.forEach((l)=>l.region='table');
    expect(parseWork(input,vocab)).toMatchObject({steps:[],unchecked:[0,1]});
  });
  it('groups boxes by overlapping y and columns by header x, including empty cells', () => {
    const input: WorkLine[]=[];
    const row=(texts:string[],y:number) => texts.forEach((text,c)=> { if(text) input.push({text,index:input.length,page:0,conf:1,alternatives:[],region:'table',box:[c*180,y,c*180+140,y+30]}); });
    row(['Chọn','D','B','A','C'],10);row(['A','9/A','4/A','0','1/A'],60);row(['C','3/C','2/C','','1'],110);
    const parsed=parseWork(input.reverse(),vocab);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.filter((s)=>s.claim.type==='dijkstra_label').map((s)=>s.claim)).toMatchObject([{v:'D',value:9},{v:'B',value:4},{v:'C',value:1},{v:'D',value:3},{v:'B',value:2}]);
  });
  it('joins routes and arithmetic across pages ordered by page then index, with page-local boxes', () => {
    const route=lines(['A → B →','C → A']);route[0]!.page=0;route[0]!.index=8;route[0]!.box=[10,900,400,950];route[1]!.page=1;route[1]!.index=0;route[1]!.box=[20,10,300,50];
    const parsed=parseWork(route.reverse(),vocab);
    expect(parsed.steps).toMatchObject([{lines:[8,0],page:0,box:[10,900,400,950],claim:{type:'walk',vertices:['A','B','C','A']}}]);
    const arithmetic=lines(['n(B) = n(C) + w(CB) =','1 + 3 = 2']);arithmetic[1]!.page=1;
    expect(parseWork(arithmetic,vocab).steps).toMatchObject([{lines:[0,1],claim:{type:'dijkstra_label',value:2,via:'C'}}]);
    const gap=lines(['A → B','Đề bài']);gap[1]!.page=2;gap[1]!.region='question';
    expect(parseWork(gap,vocab).issues.filter((i)=>i.code==='page_order')).toHaveLength(2);
    const missing=lines(['A ? B ?','C ? A']);missing[1]!.page=2;
    expect(parseWork(missing,vocab).steps.every((s)=>s.lines.length===1)).toBe(true);
    const independent=lines(['n(B) =','n(C) = 3']);independent[1]!.page=1;
    expect(parseWork(independent,vocab)).toMatchObject({unchecked:[0],steps:[{lines:[1],claim:{v:'C',value:3}}]});
  });
});

describe('review 3.3-r1 grammatical slots', () => {
  it('takes select actions with optional nouns and keeps unsupported actions unchecked', () => {
    for (const verb of ['Chọn', 'Khoanh', 'Khoanh tròn', 'Đánh dấu', 'Cố định'])
      for (const noun of ['', 'đỉnh ', 'điểm ']) for (const v of vocab.vertexLabels)
        expect(body(`${verb} ${noun}${v}`), `${verb} ${noun}${v}`).toEqual([{type:'dijkstra_select',v}]);
    for (const text of ['Ghi nhãn C', 'Gán nhãn C', 'Đổi nhãn C', 'Đi đến C', 'Lặp lại C', 'Thêm cạnh C', 'Khoanh C hoặc D', 'Chọn đỉnh C và D'])
      expect(parseWork(lines([text]), vocab),text).toMatchObject({steps:[],unchecked:[0],ignored:[]});
    expect(parseWork(lines(['Em xem các cạnh tại B trước khi đánh dấu phương án.']),vocab)).toMatchObject({steps:[],unchecked:[],ignored:[{line:0,reason:'prose'}]});
    const indexed = {...vocab,vertexLabels:['v1','v2']};
    expect(parseWork(lines(['Khoanh đỉnh v2']),indexed).steps).toMatchObject([{claim:{type:'dijkstra_select',v:'v2'}}]);
    expect(parseWork(lines(['Ghi nhãn v2']),indexed).unchecked).toEqual([0]);
  });
  it('extracts a unique value after the topic with open prefixes/connectors and literal via', () => {
    for (const prefix of ['Nhận xét:', 'Ghi lại:', 'Ghi nhận', 'Sau khi xem bài, em viết:'])
      for (const connector of [':', '=', 'là', 'bằng', 'có giá trị', 'em ghi nhận được'])
        for (const via of ['qua', 'đi qua', 'từ']) {
          const text=`${prefix} nhãn của đỉnh B ${connector} 2, ${via} C`;
          expect(body(text),text).toEqual([{type:'dijkstra_label',v:'B',value:2,via:'C'}]);
        }
    expect(body('Nhãn của đỉnh B là 2 hoặc 4')).toEqual([]);
    expect(body('Nhãn của đỉnh B chưa biết')).toEqual([]);
    expect(body('Mục 2: số đỉnh có giá trị 4')).toEqual([{type:'vertex_count',value:4}]);
    expect(body('Nhãn của đỉnh B có giá trị 1,5, từ C')).toEqual([{type:'dijkstra_label',v:'B',value:1.5,via:'C'}]);
    expect(parseWork(lines(['A → B → C','Tổng quãng đường có giá trị 4']),vocab).steps[1]!.claim).toMatchObject({type:'length',value:4,vertices:['A','B','C']});
    for (const prefix of ['Nhận xét:', 'Ghi lại:', 'Ghi nhận']) for (const connector of [':', 'là', 'bằng', 'có giá trị']) {
      expect(body(`${prefix} Số đỉnh ${connector} 4`)).toEqual([{type:'vertex_count',value:4}]);
      expect(body(`${prefix} Số cạnh ${connector} 7`)).toEqual([{type:'edge_count',value:7}]);
      expect(body(`${prefix} Tổng bậc ${connector} 14`)).toEqual([{type:'degree_sum',value:14}]);
    }
  });
  it('recognizes conclusion words and task-specific numeric/route values', () => {
    for (const word of ['Kết luận', 'Kết quả', 'Kết quả cuối cùng']) {
      expect(body(`${word}: 4`)).toEqual([{type:'final_answer',value:4}]);
      expect(body(`${word}: A → B → D`)).toEqual([{type:'final_answer',value:{walk:{vertices:['A','B','D']}}}]);
      expect(parseWork(lines([word]),vocab)).toMatchObject({steps:[],unchecked:[0]});
    }
  });
  it('uses a no-walk total only on the last grading line of an eligible task', () => {
    for (const task of ['shortest_path','tsp','postman'] as const) {
      expect(body('Tổng = 6 + 2 = 9',task)).toEqual([{type:'final_answer',value:9}]);
      const parsed=parseWork(lines(['Tổng = 8','Chọn C','Lời trình bày kết thúc']),{...vocab,task});
      expect(parsed.unchecked).toContain(0);
      expect(parsed.steps.some((s)=>s.claim.type==='final_answer')).toBe(false);
    }
    expect(body('Tổng = 8','euler')).toEqual([]);
    const parsed=parseWork(lines(['A → B','Tổng = 8']),{...vocab,task:'postman'});
    expect(parsed.steps[1]!.claim).toMatchObject({type:'length',vertices:['A','B'],value:8});
  });
});

describe('review 3.3-r2 labelled topics', () => {
  it('combines prepositions, optional nouns, values and literal predecessors', () => {
    for (const subject of ['Nhãn', 'Khoảng cách', 'Độ dài'])
      for (const preposition of ['', 'của ', 'tại ', 'ở ', 'cho ', 'đến ', 'tới '])
        for (const noun of ['', 'đỉnh ', 'điểm ']) for (const v of vocab.vertexLabels)
          for (const connector of [':', 'là', 'bằng', '='])
            for (const via of ['', ', qua C', ', đi qua C', ', từ C']) {
              const text = `Ghi lại: ${subject} ${preposition}${noun}${v} ${connector} 2${via}`;
              expect(body(text), text).toEqual([{type:'dijkstra_label',v,value:2,...(via ? {via:'C'} : {})}]);
            }
    for (const fn of ['n', 'L', 'd'])
      expect(body(`${fn}(B) = ${fn}(C) + w(CB) = 1 + 3 = 2`)).toEqual([{type:'dijkstra_label',v:'B',value:2,via:'C'}]);
    expect(body('Đường đi ngắn nhất từ A đến D dài 4')).toEqual([{type:'shortest_length',from:'A',to:'D',value:4}]);
    const indexed = {...vocab,vertexLabels:['v1','v2']};
    expect(parseWork(lines(['Nhãn ở điểm v₂ là 1,5, từ v₁']), indexed).steps).toMatchObject([{claim:{type:'dijkstra_label',v:'v2',value:1.5,via:'v1'}}]);
  });
  it('keeps unknown labels and competing values unchecked', () => {
    for (const text of ['Nhãn ở đỉnh X = 2', 'Nhãn cho điểm B là 2 hoặc 4', 'Nhãn tới B chưa biết = 2', 'Nhãn ở B và C là 2', 'Nhãn tại B là 2, qua X'])
      expect(parseWork(lines([text]), vocab),text).toMatchObject({steps:[],unchecked:[0]});
  });
});
