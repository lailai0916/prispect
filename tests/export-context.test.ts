import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../server/engine.js';
import { reportHtml } from '../server/export.js';
import { seeds } from '../server/store.js';
import type { AnalysisTask } from '../shared/contracts.js';

test('HTML export preserves private context, exact cash assumptions and unknown propagation', async () => {
  const material = (await seeds(process.cwd())).materials[0]!;
  const input = {
    title: '交接核查',
    company: material.company,
    year: 2025,
    materialIds: [material.id],
    excludedMetrics: [],
  };
  const task: AnalysisTask = {
    ...input,
    id: 'export-context-fixture',
    purpose: 'handover',
    contextNotes: {
      'external.promise': { done: false, note: '合同条件仍待核对' },
      'handover.cash': { done: true, note: '<img src=x onerror=alert(1)> & 未独立认证' },
    },
    cashPlan: {
      asOf: '2026-10-02',
      openingCash: '12.34',
      periods: [
        { days: 30, inflow: '0.01', outflow: '10.02' },
        { days: 60, inflow: null, outflow: '0' },
        { days: 90, inflow: '0', outflow: '0' },
      ],
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
    status: 'completed',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    stages: [],
    report: analyze(input, [material]),
  };
  const html = reportHtml(task);
  assert.ok(html.includes('内部接手者 · 经营交接核查'));
  assert.ok(html.includes('合同条件仍待核对'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; 未独立认证'));
  assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('跟进已标记完成'));
  assert.ok(html.includes('勾选不代表企业可靠或问题已解决'));
  assert.ok(html.includes('测算日期 2026-10-02'));
  assert.ok(html.includes('用户输入情景 · 人民币元'));
  assert.match(html, /0–30<\/td>.*?0\.01<\/td>.*?10\.02<\/td>.*?2\.33<\/td>/s);
  assert.match(html, /31–60<\/td>.*?未知<\/td>.*?0<\/td>.*?未知<\/td>.*?存在未知输入/s);
  assert.match(html, /61–90<\/td>.*?0<\/td>.*?0<\/td>.*?未知<\/td>.*?存在未知输入/s);
  assert.ok(html.includes('年度经营现金流、历史年末余额未自动填入'));
  assert.ok(html.includes('本表不发送模型'));
  assert.ok(html.includes('366373098.93'));
  assert.ok(html.includes('26197123.70'));
  assert.ok(html.includes('7.15'));
  assert.ok(html.includes('PDF 第 191 页'));
  assert.ok(html.includes('组合线索与下一项核查'));
  assert.ok(html.includes('利润在增长，经营现金在下降'));
  assert.ok(html.includes('客户账龄、期后回款'));
  assert.ok(html.includes('解释一'));
  assert.ok(html.includes('组合规则评估记录'));
  assert.ok(html.includes('组合成立'));
  assert.ok(html.includes('组合不成立'));
  assert.ok(html.includes('不表示企业安全'));
});

test('HTML export retains actual combination blockers and does not evaluate older saved reports', async () => {
  const material = (await seeds(process.cwd())).materials[0]!;
  const input = {
    title: '证据撤回',
    company: material.company,
    year: 2025,
    materialIds: [material.id],
    excludedMetrics: ['inventoryAdjustment' as const],
  };
  const task: AnalysisTask = {
    ...input,
    id: 'export-combination-blocker',
    status: 'completed',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    stages: [],
    report: analyze(input, [material]),
  };
  const html = reportHtml(task);
  const ruleSection = html.split('<section><h2>组合规则评估记录</h2>')[1]!.split('</section>')[0]!;
  assert.ok(ruleSection.includes('未能核对'));
  assert.ok(ruleSection.includes('2025 存货调整：本次主动排除'));
  assert.match(
    ruleSection,
    /2025 · 存货调整<\/td><td>本次排除<\/td><td class="amount">—<\/td><td>—<\/td>/
  );
  assert.equal(ruleSection.includes('组合成立'), true); // The explanatory state legend is retained.
  assert.equal(ruleSection.includes('<span class="status">组合成立</span>'), false);

  task.report!.crossSignalChecks![0]!.blockers[0]!.message.zh = '<img src=x onerror=alert(1)>';
  assert.ok(reportHtml(task).includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(reportHtml(task).includes('<img src=x'), false);

  const oldReport = structuredClone(task.report!);
  delete oldReport.crossSignalChecks;
  const before = JSON.stringify(oldReport);
  const oldHtml = reportHtml({ ...task, report: oldReport });
  assert.ok(oldHtml.includes('旧版报告没有保存组合规则评估记录'));
  assert.ok(oldHtml.includes('本次导出未重新计算'));
  assert.equal(JSON.stringify(oldReport), before);
  assert.equal(oldHtml.includes('<span class="status">未能核对</span>'), false);
});
