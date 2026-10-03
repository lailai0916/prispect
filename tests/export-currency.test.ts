import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze } from '../server/engine.js';
import { reportHtml } from '../server/export.js';
import { seeds } from '../server/store.js';
import type { AnalysisTask, MetricKey, Report } from '../shared/contracts.js';
import { buildReviewChecklist, rankReviewQuestions } from '../src/reviewChecklist';

const fixture = await seeds(process.cwd());
function historicalTask(): AnalysisTask {
  const material = structuredClone(fixture.materials[0]!);
  return {
    id: 'legacy-export-currency',
    title: '历史报告导出',
    company: material.company,
    year: 2025,
    materialIds: [material.id],
    excludedMetrics: [],
    purpose: 'external',
    status: 'completed',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    stages: [],
    report: analyze(
      { title: '历史报告导出', company: material.company, year: 2025, materialIds: [material.id] },
      [material]
    ),
  };
}
const metric = (report: Report, key: string) => report.metrics.find((item) => item.key === key)!;
const observation = (report: Report, key: MetricKey, year = report.year) =>
  report.snapshot[0]!.observations.find((item) => item.key === key && item.year === year)!;
function section(html: string, title: string) {
  return html.split(`<section><h2>${title}</h2>`)[1]?.split('</section>')[0] || '';
}

test('HTML and Markdown withhold old mixed-currency analysis while preserving raw evidence and exact saved JSON', () => {
  const task = historicalTask();
  const report = task.report!;
  observation(report, 'netProfit').currency = 'USD';
  observation(report, 'netProfit').unit = 'usd';
  metric(report, 'cashConversion').value = '424.24';
  report.model = {
    enabled: true,
    status: 'completed',
    provider: 'recorded-provider',
    name: 'recorded-model',
    text: 'Historical model conclusion relying on 424.24 percent conversion.',
  };
  const originalJson = JSON.stringify(task);
  const html = reportHtml(task);
  const computations = section(html, '指标与计算');
  assert.match(computations, /现金利润比<\/td><td class="amount">不可计算/);
  assert.ok(!computations.includes('424.24'));
  assert.match(section(html, '现金桥'), /现金桥未生成/);
  assert.ok(!section(html, '现金桥').includes('366373098.93'));
  assert.ok(!section(html, '解释与依据').includes('cash-gap'));
  assert.ok(!section(html, '解释与依据').includes('424.24'));
  assert.match(section(html, 'AI 解读'), /AI 解读已完成/);
  assert.match(section(html, 'AI 解读'), /recorded-provider · recorded-model/);
  assert.match(section(html, 'AI 解读'), /暂不展示；原执行状态与完整记录保留/);
  assert.ok(!html.includes(report.model.text!));
  assert.match(section(html, '币种与单位核对'), /366373098\.93<\/td><td>美元 · USD/);
  assert.ok(section(html, '来源与输入快照').includes('366373098.93'));
  assert.match(section(html, '来源与输入快照'), /美元<\/span>.*?USD/s);
  assert.equal(JSON.stringify(task), originalJson);

  for (const locale of ['zh-Hans', 'en'] as const) {
    const markdown = buildReviewChecklist(task, locale);
    assert.match(markdown, locale === 'en' ? /Currency and amount-unit review/ : /币种与单位核对/);
    assert.ok(markdown.includes('\n366373098.93\n'));
    assert.ok(markdown.includes('usd / USD'));
    assert.match(markdown, locale === 'en' ? /have not been converted to CNY/ : /未转换为人民币/);
    assert.ok(!markdown.includes('424.24'));
    assert.ok(!markdown.includes('Saved triggering fact'));
    assert.ok(!markdown.includes('已保存触发事实'));
    assert.match(markdown, locale === 'en' ? /not used for ordering/ : /不用于排序/);
    assert.equal(JSON.stringify(task), originalJson);
  }
  assert.ok(rankReviewQuestions(report).every(({ question }) => !question.trigger));
});

test('complete legacy USD reports never export a CNY bridge, computed ratio or completed combination', () => {
  const task = historicalTask();
  for (const row of task.report!.snapshot[0]!.observations) {
    row.currency = 'USD';
    row.unit = 'usd';
  }
  for (const item of task.report!.metrics) if (item.unit === 'CNY') item.unit = 'USD';
  const original = JSON.stringify(task);
  const html = reportHtml(task);
  assert.ok(!section(html, '指标与计算').includes('7.15'));
  assert.ok(!section(html, '指标与计算').includes('366373098.93'));
  assert.ok(!section(html, '现金桥').includes('<table'));
  assert.ok(!section(html, '组合规则评估记录').includes('<span class="status">组合成立</span>'));
  assert.ok(section(html, '币种与单位核对').includes('26197123.70'));
  assert.ok(section(html, '来源与输入快照').includes('USD'));
  assert.equal(JSON.stringify(task), original);
});

test('a foreign adjustment retains independently valid CNY conversion but stops bridge and trigger ordering', () => {
  const task = historicalTask();
  observation(task.report!, 'inventoryAdjustment').currency = 'CAD';
  const before = JSON.stringify(task);
  const html = reportHtml(task);
  assert.match(section(html, '指标与计算'), /现金利润比<\/td><td class="amount">7\.15/);
  assert.match(section(html, '现金桥'), /现金桥未生成/);
  assert.ok(!html.includes('<h3>存货形成现金占用</h3>'));
  assert.ok(!html.includes('触发事实：'));
  assert.match(section(html, '币种与单位核对'), /-321030062\.96.*?CAD/s);
  const markdown = buildReviewChecklist(task, 'en');
  assert.match(markdown, /yuan \/ CAD/);
  assert.ok(!markdown.includes('Saved triggering fact'));
  assert.ok(!markdown.includes('The 2025 historical cash-effect magnitude'));
  assert.equal(JSON.stringify(task), before);
});

test('foreign prior-year currency pauses comparisons without erasing the valid current CNY bridge', () => {
  const task = historicalTask();
  observation(task.report!, 'netProfit', 2024).currency = 'USD';
  const html = reportHtml(task);
  assert.match(section(html, '指标与计算'), /现金利润比<\/td><td class="amount">7\.15/);
  assert.match(section(html, '指标与计算'), /净利润同比<\/td><td class="amount">不可计算/);
  assert.match(section(html, '现金桥'), /金额（CNY）/);
  assert.ok(section(html, '现金桥').includes('366373098.93'));
  assert.match(section(html, '币种与单位核对'), /2024 · 合并净利润/);
});

test('raw currency-review amounts retain their original wan scale instead of being presented as base currency', () => {
  const task = historicalTask();
  const original = observation(task.report!, 'inventoryAdjustment');
  original.currency = 'CAD';
  original.unit = 'wan';
  original.value = '-32103.006296';
  const json = JSON.stringify(task);
  const html = reportHtml(task);
  assert.match(section(html, '币种与单位核对'), /-32103\.006296<\/td><td>万元 · CAD/);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const markdown = buildReviewChecklist(task, locale);
    assert.ok(markdown.includes('\n-32103.006296\n'));
    assert.ok(markdown.includes('wan / CAD'));
  }
  assert.equal(JSON.stringify(task), json);
});

test('valid CNY exports preserve amount calculations, source references and recorded model interpretation', () => {
  const task = historicalTask();
  task.report!.model = { enabled: true, status: 'completed', text: 'Saved CNY interpretation.' };
  const original = JSON.stringify(task);
  const html = reportHtml(task);
  assert.ok(!html.includes('<h2>币种与单位核对</h2>'));
  assert.match(section(html, '指标与计算'), /现金利润比<\/td><td class="amount">7\.15/);
  assert.ok(section(html, '现金桥').includes('366373098.93'));
  assert.ok(section(html, 'AI 解读').includes('Saved CNY interpretation.'));
  assert.ok(buildReviewChecklist(task, 'en').includes('Saved triggering fact'));
  assert.equal(JSON.stringify(task), original);
});

test('HTML and checklist mask failed or warned historical currency calculations without rewriting the saved report', () => {
  for (const status of ['fail', 'warn'] as const) {
    const task = historicalTask();
    const material = structuredClone(task.report!.snapshot[0]!);
    material.observations.find(
      (item) => item.key === 'inventoryAdjustment' && item.year === 2025
    )!.value = '-321030061.96';
    task.report = analyze(
      { title: task.title, company: task.company, year: task.year, materialIds: task.materialIds },
      [material]
    );
    observation(task.report, 'inventoryAdjustment').currency = 'USD';
    const balance = task.report.checks.find((item) => item.id === 'bridge-balance')!;
    assert.match(balance.message, /26197124\.70 元/);
    balance.status = status;
    const indicator = task.report.checks.find((item) => item.id === '2025-inventoryAdjustment')!;
    indicator.status = status;
    indicator.message = '历史换算结果为 917263.45 元，按人民币分核对。';
    const before = JSON.stringify(task);
    const html = reportHtml(task);
    const checks = section(html, '口径检查');
    assert.match(checks, /币种或金额单位待核对/);
    assert.ok(!checks.includes('26197124.70'));
    assert.ok(!checks.includes('917263.45'));
    assert.ok(!section(html, '组合规则评估记录').includes('26197124.70'));
    assert.match(checks, status === 'fail' ? /未通过/ : /需核对/);
    assert.match(section(html, '币种与单位核对'), /-321030061\.96.*?USD/s);
    for (const locale of ['zh-Hans', 'en'] as const) {
      const markdown = buildReviewChecklist(task, locale);
      assert.ok(!markdown.includes('26197124.70'));
      assert.ok(!markdown.includes('917263.45'));
      assert.ok(markdown.includes('-321030061.96'));
    }
    assert.equal(JSON.stringify(task), before);
  }
});
