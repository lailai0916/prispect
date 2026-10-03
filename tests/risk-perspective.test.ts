import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';
import type { Material, Report } from '../shared/contracts.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { RiskOverview } from '../src/RiskOverview.js';
import { deriveRiskPerspective, riskStatusText } from '../src/riskDimensions.js';

const fixture = await seeds(process.cwd());

function review(material: Material): Report {
  return analyze(
    { company: material.company, title: '核查状态回归', year: 2025, materialIds: [material.id] },
    [material]
  );
}

function dimension(report: Report, key: 'finance' | 'credit' | 'reputation' | 'risk') {
  return deriveRiskPerspective(report, 'zh-Hans').dimensions.find((item) => item.key === key)!;
}

test('issuer, period, scope and amount conflicts pause interpretation without claiming a company risk event', () => {
  const base = fixture.materials[0]!;
  const cases = ['issuer', 'period', 'scope', 'amount', 'source'] as const;
  for (const kind of cases) {
    const material = structuredClone(base);
    if (kind === 'period') material.observations[0]!.period = 'interim';
    if (kind === 'scope') material.observations[0]!.scope = 'parent';
    if (kind === 'amount')
      material.observations.push({
        ...material.observations[0]!,
        id: 'different',
        value: '999.00',
      });
    const report = review(material);
    if (kind === 'issuer') report.company = '另一主体';
    if (kind === 'source')
      report.checks.push({
        id: 'source-verification',
        label: '来源核查',
        status: 'fail',
        message: '原件来源待核对',
        sourceRefs: report.metrics[0]!.sourceRefs,
      });
    const before = structuredClone(report);
    const perspective = deriveRiskPerspective(report, 'zh-Hans');
    assert.equal(perspective.overall.status, 'unknown', kind);
    assert.equal(perspective.overall.title.zh, '材料口径待核对', kind);
    assert.equal(dimension(report, 'finance').status, 'unknown', kind);
    assert.equal(dimension(report, 'risk').status, 'unknown', kind);
    assert.equal(dimension(report, 'finance').metrics[2]!.value, '—', kind);
    assert.doesNotMatch(perspective.overall.title.zh, /发现风险|低风险/, kind);
    assert.deepEqual(report, before, 'rendering must not rewrite the saved record');
  }
});

test('conflict counts describe failed recorded checks without adding their summary verdict again', () => {
  const report = review(fixture.materials[3]!);
  const failures = report.checks.filter((check) => check.status === 'fail');
  assert.ok(failures.length > 0);
  const conflicts = dimension(report, 'risk').metrics.find((item) => item.label.zh === '证据冲突')!;
  assert.equal(conflicts.value, `${failures.length} 处`);
  assert.equal(conflicts.refs.length, failures.flatMap((check) => check.sourceRefs).length);
  report.checks = [];
  assert.equal(dimension(report, 'risk').metrics[1]!.value, '待核对');
});

test('issuer comparison accepts only casing and surrounding whitespace normalization, not a company alias', () => {
  const report = structuredClone(review(fixture.materials[1]!));
  report.company = 'Example Holdings';
  report.snapshot[0]!.company = '  EXAMPLE holdings  ';
  const matching = deriveRiskPerspective(report, 'zh-Hans');
  assert.equal(matching.dimensions.find((item) => item.key === 'finance')!.status, 'good');
  assert.notEqual(matching.overall.title.zh, '材料口径待核对');
  report.snapshot[0]!.company = 'Example';
  const alias = deriveRiskPerspective(report, 'zh-Hans');
  assert.equal(alias.overall.title.zh, '材料口径待核对');
  assert.equal(alias.dimensions.find((item) => item.key === 'finance')!.metrics[2]!.value, '—');
});

test('empty and incomplete evidence never becomes a passed review or a company risk claim', () => {
  const empty = structuredClone(fixture.materials[0]!);
  empty.observations = [];
  const report = review(empty);
  assert.equal(report.coverage.present, 0);
  const perspective = deriveRiskPerspective(report, 'zh-Hans');
  assert.equal(perspective.overall.status, 'unknown');
  assert.equal(perspective.overall.title.zh, '材料待补充');
  assert.equal(dimension(report, 'finance').status, 'unknown');
  assert.equal(dimension(report, 'risk').status, 'unknown');
  assert.ok(dimension(report, 'risk').metrics.every((item) => item.tone !== 'good'));
  assert.equal(dimension(report, 'credit').metrics[1]!.tone, 'unknown');

  const incomplete = structuredClone(fixture.materials[1]!);
  incomplete.observations = incomplete.observations.filter((row) =>
    ['netProfit', 'operatingCashFlow'].includes(row.key)
  );
  const partial = review(incomplete);
  assert.equal(partial.verdict, 'insufficient');
  assert.equal(dimension(partial, 'finance').status, 'unknown');
  assert.equal(dimension(partial, 'risk').status, 'unknown');
  assert.notEqual(
    dimension(partial, 'finance').metrics[2]!.value,
    '—',
    'a supported ratio remains a fact'
  );
});

test('saved USD and cross-field currency mismatches preserve amounts but withhold historical ratio interpretation', () => {
  for (const mixed of [false, true]) {
    const report = structuredClone(review(fixture.materials[1]!));
    for (const metric of report.metrics)
      if (metric.key === 'operatingCashFlow' || (!mixed && metric.unit === 'CNY'))
        metric.unit = 'USD';
    for (const material of report.snapshot)
      for (const observation of material.observations)
        if (observation.key === 'operatingCashFlow' || !mixed) observation.currency = 'USD';
    const before = structuredClone(report);
    assert.ok(report.metrics.find((metric) => metric.key === 'cashConversion')!.value);
    const perspective = deriveRiskPerspective(report, 'zh-Hans');
    assert.equal(perspective.overall.status, 'unknown');
    assert.equal(perspective.overall.title.zh, '币种口径待核对');
    assert.equal(dimension(report, 'finance').status, 'unknown');
    assert.equal(dimension(report, 'finance').metrics[2]!.value, '—');
    assert.equal(dimension(report, 'finance').metrics[1]!.value, '—');
    assert.deepEqual(report, before);
  }
});

test('a legacy USD amount unit cannot be interpreted as CNY solely because its metric and currency labels say CNY', () => {
  const report = structuredClone(review(fixture.materials[1]!));
  report.snapshot[0]!.observations.find(
    (observation) => observation.year === 2025 && observation.key === 'netProfit'
  )!.unit = 'usd';
  const before = structuredClone(report);
  const perspective = deriveRiskPerspective(report, 'zh-Hans');
  assert.equal(perspective.overall.status, 'unknown');
  assert.equal(perspective.overall.title.zh, '币种口径待核对');
  assert.equal(dimension(report, 'finance').metrics[0]!.value, '—');
  assert.equal(dimension(report, 'finance').metrics[2]!.value, '—');
  assert.deepEqual(report, before);
});

test('foreign-currency adjustments pause the bridge without withdrawing independently supported CNY totals or ratio', () => {
  const material = structuredClone(fixture.materials[1]!);
  material.observations.find(
    (observation) => observation.year === 2025 && observation.key === 'inventoryAdjustment'
  )!.currency = 'USD';
  const report = review(material);
  assert.equal(report.verdict, 'conflict');
  assert.equal(report.bridge, null);
  const perspective = deriveRiskPerspective(report, 'zh-Hans');
  assert.equal(perspective.overall.status, 'unknown');
  assert.equal(perspective.overall.title.zh, '材料口径待核对');
  assert.equal(dimension(report, 'finance').status, 'unknown');
  assert.equal(dimension(report, 'finance').metrics[2]!.value, '164.18%');
  assert.match(dimension(report, 'finance').summary.zh, /独立支持/);
});

test('supported CNY checks and cash gaps retain distinct scope-bound states while public coverage stays unassessed', () => {
  const supported = review(fixture.materials[1]!);
  assert.equal(dimension(supported, 'finance').status, 'good');
  assert.equal(deriveRiskPerspective(supported, 'zh-Hans').overall.status, 'warn');
  assert.equal(
    dimension(supported, 'risk').status,
    'warn',
    'open follow-ups remain review matters'
  );
  supported.findings = supported.findings.filter((finding) => finding.severity !== 'attention');
  supported.questions = [];
  assert.equal(deriveRiskPerspective(supported, 'zh-Hans').overall.status, 'good');
  assert.equal(deriveRiskPerspective(supported, 'zh-Hans').overall.title.zh, '已完成所列财务核查');
  assert.equal(dimension(supported, 'risk').status, 'good');
  assert.equal(dimension(supported, 'reputation').status, 'unknown');
  assert.equal(dimension(supported, 'reputation').metrics[0]!.value, '未纳入');
  const gap = review(fixture.materials[0]!);
  assert.equal(deriveRiskPerspective(gap, 'zh-Hans').overall.status, 'warn');
  assert.equal(dimension(gap, 'finance').status, 'warn');
  assert.equal(dimension(gap, 'finance').metrics[2]!.value, '7.15%');
  assert.equal(riskStatusText.unknown.zh, '暂不能判断');
  const englishRisk = deriveRiskPerspective(gap, 'en').dimensions.find(
    (item) => item.key === 'risk'
  )!;
  assert.equal(
    englishRisk.metrics[2]!.value,
    `${gap.questions.filter((question) => question.status === 'open').length} items`
  );
});

test('a historical record with no checks cannot claim completed verification, even if amounts were saved', () => {
  const report = structuredClone(review(fixture.materials[1]!));
  report.checks = [];
  assert.equal(deriveRiskPerspective(report, 'zh-Hans').overall.status, 'unknown');
  assert.equal(dimension(report, 'risk').status, 'unknown');
  assert.equal(dimension(report, 'risk').metrics[0]!.value, '—');
  report.snapshot = [];
  assert.equal(dimension(report, 'credit').status, 'unknown');
  assert.ok(dimension(report, 'credit').metrics.every((item) => item.tone !== 'good'));
});

test('the visible review index uses evidence-status language and accessible dimension targets in both locales', () => {
  const report = review(fixture.materials[3]!);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const html = renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        { value: { locale, t: (zh, en) => (locale === 'en' ? en : zh) } as AppContextValue },
        createElement(RiskOverview, { report })
      )
    );
    assert.match(html, locale === 'en' ? /Evidence scope needs review/ : /材料口径待核对/);
    assert.doesNotMatch(html, /Risk signals found|发现风险信号|低风险/);
    assert.equal((html.match(/aria-controls="risk-detail-/g) || []).length, 4);
    assert.match(html, /data-status="unknown"/);
  }
});
