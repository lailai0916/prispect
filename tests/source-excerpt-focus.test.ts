import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AssessmentEvidence, AssessmentMetric } from '../shared/company-assessment.js';
import {
  assessmentSourceFocus,
  assessmentSourceHref,
  knownSourcePage,
  matchSourceExcerpt,
} from '../shared/source-excerpt-focus.js';
import { SourceExcerptFocus } from '../src/SourceExcerptFocus.js';

const evidence: AssessmentEvidence = {
  id: 'financial-2025-netProfit',
  kind: 'financial',
  label: '2025 合并净利润',
  url: 'https://example.com/report.pdf',
  period: '2025-12-31',
  sourceQuality: 'web',
  quote: '合并净利润：1200.00 元；公开网页字段。',
};
const direct: AssessmentMetric = {
  id: '2025-netProfit',
  label: ['2025 合并净利润', '2025 Consolidated net profit'],
  value: '1200.00',
  display: ['1200.00 元', 'CNY 1200.00'],
  unit: 'CNY',
  status: 'available',
  evidenceIds: [evidence.id],
  formula: ['网页字段', 'Web field'],
};
const derived: AssessmentMetric = {
  id: 'cash-to-profit',
  label: ['现金利润比', 'Cash-to-profit ratio'],
  value: '7.15',
  display: ['7.15%', '7.15%'],
  unit: 'percent',
  status: 'available',
  evidenceIds: [evidence.id, 'financial-2025-ocf'],
  formula: ['经营现金净额 ÷ 合并净利润', 'Operating cash / consolidated net profit'],
};

test('a derived judgment opens the genuine direct field and distinguishes its calculation', () => {
  const result = assessmentSourceFocus(evidence, [direct, derived], [derived.id]);
  assert.deepEqual(
    result.fields.map((item) => item.id),
    [direct.id]
  );
  assert.deepEqual(
    result.calculations.map((item) => item.id),
    [derived.id]
  );
  assert.deepEqual(
    result.parts.filter((part) => part.matched).map((part) => part.text),
    ['合并净利润', '1200.00 元']
  );
  assert.equal(result.parts.map((part) => part.text).join(''), evidence.quote);
});

test('unrelated fields and coincidental derived values do not become excerpt matches', () => {
  const result = assessmentSourceFocus(
    { ...evidence, quote: '另一个指标为 7.15%，其原因尚未知。' },
    [direct, derived, { ...direct, id: '2025-ocf', evidenceIds: ['financial-2025-ocf'] }],
    [derived.id]
  );
  assert.equal(
    result.parts.some((part) => part.matched),
    false
  );
  assert.deepEqual(
    result.fields.map((item) => item.id),
    [direct.id]
  );
  const absent = assessmentSourceFocus(evidence, [{ ...direct, evidenceIds: [] }], [direct.id]);
  assert.equal(absent.fields.length, 0);
  assert.equal(
    absent.parts.some((part) => part.matched),
    false
  );
});

test('fullwidth punctuation, line breaks and grouped money preserve the exact stored text', () => {
  const quote = '合并净\n利润：１，２００．００　元；范围（合并）。';
  const result = assessmentSourceFocus({ ...evidence, quote }, [direct], [direct.id]);
  assert.deepEqual(
    result.parts.filter((part) => part.matched).map((part) => part.text),
    ['合并净\n利润', '１，２００．００　元']
  );
  assert.equal(result.parts.map((part) => part.text).join(''), quote);
});

test('an amount never matches a larger, negative or differently scaled amount', () => {
  const result = assessmentSourceFocus(
    { ...evidence, quote: '11200.00 元、-1200.00 元、1200.00 万元、1200.00 亿元。' },
    [direct],
    [direct.id]
  );
  assert.equal(
    result.parts.some((part) => part.matched),
    false
  );
});

test('negative values and source ratios retain their own exact sign and unit', () => {
  const loss = assessmentSourceFocus(
    { ...evidence, quote: '合并净利润：−１２００．００ 元。' },
    [{ ...direct, value: '-1200.00' }],
    [direct.id]
  );
  assert.ok(loss.parts.some((part) => part.matched && part.text === '−１２００．００ 元'));
  const ratio = { ...direct, id: '2025-grossMargin', unit: 'percent' as const, value: '40.00' };
  const ratios = assessmentSourceFocus(
    { ...evidence, id: 'financial-2025-grossMargin', quote: '毛利率：40.00％' },
    [
      {
        ...ratio,
        evidenceIds: ['financial-2025-grossMargin'],
        label: ['2025 毛利率', '2025 Gross margin'],
      },
    ],
    [ratio.id]
  );
  assert.ok(ratios.parts.some((part) => part.matched && part.text === '40.00％'));
});

test('headlines, absent quotes and unsupported financial states never fabricate excerpt matches', () => {
  for (const input of [
    { ...evidence, sourceQuality: 'headline' as const },
    { ...evidence, quote: undefined },
  ]) {
    assert.deepEqual(assessmentSourceFocus(input, [direct], [direct.id]).parts, []);
  }
  for (const status of ['missing', 'conflict', 'not-applicable'] as const) {
    const result = assessmentSourceFocus(evidence, [{ ...direct, status }], [direct.id]);
    assert.equal(result.fields.length, 0);
    assert.equal(
      result.parts.some((part) => part.matched),
      false
    );
    assert.equal(result.calculations.length, 0);
  }
  const disclosure = assessmentSourceFocus(
    { ...evidence, id: 'announcement-1', kind: 'disclosure', sourceQuality: 'excerpt' },
    [direct],
    []
  );
  assert.equal(
    disclosure.parts.some((part) => part.matched),
    false
  );
});

test('matches are bounded and overlapping tokens do not duplicate or mutate text', () => {
  const repeated = Array.from({ length: 50 }, () => '合并净利润').join('，');
  const parts = matchSourceExcerpt(repeated, ['合并净利润', '净利润', '合并净利润']);
  assert.equal(parts.filter((part) => part.matched).length, 3);
  assert.equal(parts.map((part) => part.text).join(''), repeated);
  const emoji = matchSourceExcerpt('🧾 合并净利润：1200.00 元。', ['合并净利润']);
  assert.equal(emoji.map((part) => part.text).join(''), '🧾 合并净利润：1200.00 元。');
});

test('React rendering escapes stored text and inserts only the literal matching marks', () => {
  const markup = renderToStaticMarkup(
    createElement(SourceExcerptFocus, {
      evidence: { ...evidence, quote: '<script>alert(1)</script> 合并净利润：1200.00 元。' },
      metrics: [direct, derived],
      selectedMetricIds: [derived.id],
      locale: 'zh-Hans',
    })
  );
  assert.ok(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(markup.includes('<script>'), false);
  assert.ok(markup.includes('支撑字段'));
  assert.ok(markup.includes('用于计算'));
  assert.ok(markup.includes('<mark class="source-excerpt-focus-mark">1200.00 元</mark>'));
  assert.ok(markup.includes('2 处字段或数值匹配'));
});

test('source URLs only append a recorded positive integer page and reject credential or script links', () => {
  assert.equal(
    assessmentSourceHref('https://example.com/a.pdf?download=1', 12),
    'https://example.com/a.pdf?download=1#page=12'
  );
  for (const page of [undefined, 0, -1, 1.5, Infinity, NaN]) {
    assert.equal(knownSourcePage(page), undefined);
    assert.equal(
      assessmentSourceHref('https://example.com/a.pdf', page),
      'https://example.com/a.pdf'
    );
  }
  for (const url of [
    'javascript:alert(1)',
    'file:///tmp/a.pdf',
    'https://owner:secret@example.com/a.pdf',
    'broken',
  ]) {
    assert.equal(assessmentSourceHref(url, 2), undefined);
  }
});
