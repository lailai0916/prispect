import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { ModelExplanation, parseModelCitations } from '../src/ModelExplanation.js';
import type { Report } from '../shared/contracts.js';

const fixture = await seeds(process.cwd());
const material = fixture.materials[0]!;
const report = analyze(
  { title: '引用交互测试', company: material.company, year: 2025, materialIds: [material.id] },
  [material]
);
const profit = report.snapshot[0]!.observations.find((obs) => obs.key === 'netProfit')!;
const cash = report.snapshot[0]!.observations.find((obs) => obs.key === 'operatingCashFlow')!;

test('real saved observation citations resolve original amounts, pages and public source', () => {
  const text = `先核对利润，再比较现金。 [${profit.id}, ${cash.id}, ${profit.id}]\n保留不确定性。`;
  const parts = parseModelCitations(text, report.snapshot);
  assert.equal(parts.map((part) => part.text).join(''), text);
  const citations = parts.filter((part) => part.kind === 'citation');
  assert.equal(citations.length, 1);
  assert.equal(citations[0]!.refs.length, 2);
  assert.deepEqual(citations[0]!.refs, [
    {
      materialId: material.id,
      page: profit.page,
      quote: profit.quote,
      sourceUrl: material.sourceUrl,
    },
    { materialId: material.id, page: cash.page, quote: cash.quote, sourceUrl: material.sourceUrl },
  ]);
  assert.ok(citations[0]!.refs[0]!.quote.includes('366373098.93'));
  assert.deepEqual(citations[0]!.ids, [profit.id, cash.id]);
});

test('missing, partial and unfinished citations retain their entire original text', () => {
  for (const text of [
    '无法核对 [missing-id]，保留原文。',
    `部分匹配 [${profit.id}, missing-id]，不能暗示整组已验证。`,
    `未闭合 [${profit.id}`,
    `缺少一个 ID [${profit.id}, ]`,
    `[${profit.id}\n${cash.id}]`,
    `嵌套引用 [[${profit.id}]]`,
    `不完整引用 [unknown [${profit.id}]`,
  ]) {
    const parts = parseModelCitations(text, report.snapshot);
    assert.equal(parts.map((part) => part.text).join(''), text);
    assert.equal(
      parts.some((part) => part.kind === 'citation'),
      false
    );
  }
  const mixed = `未知 [missing-id] 后接真实 [${cash.id}]。`;
  const parts = parseModelCitations(mixed, report.snapshot);
  assert.equal(parts.map((part) => part.text).join(''), mixed);
  assert.equal(parts.filter((part) => part.kind === 'citation').length, 1);
});

test('conflicting duplicate observation IDs do not choose an arbitrary document', () => {
  const duplicate = structuredClone(material);
  duplicate.id = 'different-document';
  const text = `同一编号对应不同来源 [${profit.id}]`;
  const parts = parseModelCitations(text, [material, duplicate]);
  assert.deepEqual(parts, [{ kind: 'text', text }]);
  assert.deepEqual(parseModelCitations('', report.snapshot), []);
});

function render(text: string | undefined, locale: 'zh' | 'en' = 'en') {
  const value = {
    locale,
    t: (zh: string, en: string) => (locale === 'en' ? en : zh),
  } as AppContextValue;
  const current: Report = {
    ...report,
    model: { enabled: true, status: 'completed', ...(text === undefined ? {} : { text }) },
  };
  return renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value },
      createElement(ModelExplanation, { report: current, onSource: () => {} })
    )
  );
}

test('model prose is escaped text and English UI preserves original Chinese response', () => {
  const html = render(
    `中文原文 <img src=x onerror=alert(1)>\n\n第二段 [${profit.id}] [missing-id]`
  );
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script'), false);
  assert.ok(html.includes('中文原文'));
  assert.ok(html.includes('Original AI interpretation in Chinese; not translated.'));
  assert.ok(html.includes('[missing-id]'));
  assert.equal((html.match(/class="model-explanation-paragraph"/g) || []).length, 2);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.ok(html.includes('type="button"'));
  assert.ok(html.includes('aria-haspopup="dialog"'));
  assert.ok(html.includes('Inspect 1 original source'));
  assert.equal(render(undefined), '');
  assert.equal(render(' \n '), '');
  assert.equal(render(`未闭合 [unknown\n\n嵌套 [${profit.id}]`).includes('<button'), false);
});
