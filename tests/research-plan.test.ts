import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyContextPeriod } from '../shared/company-workspace.js';
import { contextAmountFields } from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import {
  deriveResearchPlan,
  researchGoalTemplates,
  researchPlanText,
} from '../shared/research-plan.js';

const snapshot = '2026-10-01T02:00:00.000Z';
function period(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: '2026-04-20',
    amounts: {
      ...(Object.fromEntries(
        contextAmountFields.map((field) => [field, null])
      ) as CompanyContextPeriod['amounts']),
      revenue: '1000.00',
      netProfit: '100.00',
      ocf: '50.00',
      receivables: '0.00',
      inventory: '20.00',
      totalAssets: '1000.00',
      totalLiabilities: '200.00',
      cash: '400.00',
      shortLoan: '0.00',
      currentPortionDebt: '0.00',
      currentAssets: '500.00',
      currentLiabilities: '200.00',
    },
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://datacenter.eastmoney.com/'],
    originalUrl: null,
  };
}
function fixture(): CompanyResearchRun {
  return {
    id: 'owner-scoped-record',
    input: { securityCode: '300893', orgId: 'issuerorg', year: 2025 },
    identity: {
      securityCode: '300893',
      orgId: 'issuerorg',
      shortName: '测试企业',
      companyName: '测试企业股份有限公司',
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: snapshot,
    updatedAt: snapshot,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'issuerorg',
      companyName: '测试企业股份有限公司',
      fetchedAt: snapshot,
      status: 'available',
      financials: [period(2024), period(2025)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}
function withCondition(run: CompanyResearchRun): CompanyResearchRun {
  const assessment = deriveCompanyAssessment(run);
  const metric = assessment.metrics.find(
    (item) => item.status === 'available' && item.evidenceIds.length
  )!;
  assert.ok(metric);
  const condition = {
    text: {
      zh: '期后回款资料可能改变现金差异解释。',
      en: 'Subsequent collection records could change the explanation.',
    },
    metricIds: [metric.id],
    evidenceIds: [metric.evidenceIds[0]],
  };
  assessment.narrative = {
    summary: condition,
    dimensions: [],
    strengths: [],
    risks: [],
    actions: [],
    changeConditions: [condition],
  };
  run.assessment = assessment;
  run.assessmentStatus = 'ready';
  return run;
}

test('unstarted and legacy records do not invent source counts or execution plans', () => {
  const run = fixture();
  delete run.context;
  delete run.identity;
  delete run.contextStatus;
  const view = deriveResearchPlan(run);
  assert.equal(view.title[0], '核查框架');
  assert.equal(view.sourceSnapshot, null);
  assert.equal(view.sourceAttempts, null);
  assert.ok(view.sources.every((source) => source.catalog === null && source.read === null));
  assert.ok(view.questions.every((question) => question.state === 'missing'));
  assert.equal(view.changeConditions.length, 0);
  assert.match(researchPlanText(view, 'zh'), /来源快照: 未知/);
  assert.doesNotMatch(researchPlanText(view, 'zh'), /执行计划|置信度.*%|已完成全部/);
});

test('zero and negative amounts remain evidence without implying a normal positive-profit ratio', () => {
  const run = fixture();
  run.context!.financials[1].amounts.netProfit = '0.00';
  run.context!.financials[1].amounts.ocf = '-50.00';
  const view = deriveResearchPlan(run);
  const cash = view.questions.find((question) => question.id === 'cash')!;
  assert.equal(cash.state, 'basis');
  assert.match(cash.detail[0], /利润非正/);
  assert.equal(view.questions.find((question) => question.id === 'changes')!.state, 'basis');
  assert.match(view.scope[2][0], /不能证明.*付款安全/);
});

test('same-year duplicate or cross-source conflicts pause only the dependent comparison', () => {
  const run = fixture();
  const second = structuredClone(run.context!.financials[1]);
  second.amounts.netProfit = '101.00';
  run.context!.financials.push(second);
  let view = deriveResearchPlan(run);
  assert.equal(view.questions.find((question) => question.id === 'cash')!.state, 'conflict');
  assert.equal(view.questions.find((question) => question.id === 'entity')!.state, 'basis');
  run.context!.financials.pop();
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'inventory',
    primary: '20.00',
    secondary: '21.00',
    difference: '1.00',
    matches: false,
  });
  view = deriveResearchPlan(run);
  assert.equal(view.questions.find((question) => question.id === 'changes')!.state, 'conflict');
  assert.equal(view.questions.find((question) => question.id === 'cash')!.state, 'basis');
});

test('an older period cannot fill the requested annual period, and half-year rows are excluded', () => {
  const run = fixture();
  run.context!.financials[1].period = '2025-06-30';
  run.context!.financials[1].annual = false;
  const view = deriveResearchPlan(run);
  assert.equal(view.sources[0].catalog, 0);
  assert.equal(view.questions.find((question) => question.id === 'cash')!.state, 'missing');
  assert.equal(view.questions.find((question) => question.id === 'changes')!.state, 'missing');
});

test('mismatched entities or assessment years never leak old names, counts or conditions', () => {
  for (const mutation of [
    (run: CompanyResearchRun) => {
      run.context!.securityCode = '000001';
      run.context!.companyName = 'OTHER_ENTITY_SECRET';
    },
    (run: CompanyResearchRun) => {
      run.identity!.orgId = 'anotherissuer';
      run.identity!.companyName = 'OTHER_ENTITY_SECRET';
    },
    (run: CompanyResearchRun) => {
      run.assessment!.year = 2024;
    },
  ]) {
    const run = withCondition(fixture());
    mutation(run);
    const view = deriveResearchPlan(run);
    assert.equal(view.snapshot, 'mismatch');
    assert.ok(view.questions.every((question) => question.state === 'blocked'));
    assert.ok(view.sources.every((source) => source.catalog === null));
    assert.equal(view.changeConditions.length, 0);
    assert.doesNotMatch(researchPlanText(view, 'zh'), /OTHER_ENTITY_SECRET/);
  }
});

test('unsupported markets, information gaps and financial-institution scope pause financial judgments', () => {
  for (const mutation of [
    (run: CompanyResearchRun) => {
      run.identity!.exchange = 'us';
    },
    (run: CompanyResearchRun) => {
      run.informationGap = { name: '不支持主体', reason: '资料不足' };
    },
    (run: CompanyResearchRun) => {
      run.context!.profile.industry = '银行';
    },
  ]) {
    const run = withCondition(fixture());
    mutation(run);
    const view = deriveResearchPlan(run);
    assert.ok(view.questions.every((question) => question.state === 'blocked'));
    assert.equal(view.sourceAttempts, null);
    assert.equal(view.changeConditions.length, 0);
  }
});

test('updated sources and old report conditions retain distinct snapshot dates', () => {
  const run = withCondition(fixture());
  run.assessment!.coverage.news = 999;
  run.context!.fetchedAt = '2026-10-03T00:00:00.000Z';
  const view = deriveResearchPlan(run);
  assert.equal(view.snapshot, 'previous');
  assert.equal(view.sourceSnapshot, run.context!.fetchedAt);
  assert.equal(view.conditionSnapshot, snapshot);
  assert.equal(view.sources.find((source) => source.id === 'media')!.catalog, 0);
  assert.equal(view.changeConditions.length, 1);
  assert.ok(view.notes.some((note) => /上一份报告/.test(note[0])));
  assert.match(researchPlanText(view, 'en'), /previous report/);
});

test('failed refresh preserves acquired sources and does not reinterpret failures as no risk', () => {
  const run = fixture();
  run.contextStatus = 'failed';
  run.assessmentStatus = 'failed';
  run.context!.sources.push({
    id: 'failed-source',
    provider: 'source',
    dimension: 'news',
    url: 'https://example.com/',
    status: 'error',
    fetchedAt: snapshot,
    latestDate: null,
    count: 0,
    note: 'unavailable',
    responseHashes: [],
  });
  const view = deriveResearchPlan(run);
  assert.equal(view.sourceAttempts, 1);
  assert.equal(view.sourceFailures, 1);
  assert.equal(view.questions.find((question) => question.id === 'cash')!.state, 'basis');
  assert.ok(view.notes.some((note) => /不能将失败理解为没有风险/.test(note[0])));
});

test('conditions retain only traceable references and never invent evidence for requests', () => {
  const run = withCondition(fixture());
  run.assessment!.narrative!.changeConditions.push(
    { text: { zh: '无来源条件', en: 'Unsourced condition' }, metricIds: [], evidenceIds: [] },
    {
      text: { zh: '未知引用条件', en: 'Unknown reference' },
      metricIds: [],
      evidenceIds: ['missing-source'],
    }
  );
  const view = deriveResearchPlan(run);
  assert.equal(view.changeConditions.length, 1);
  assert.deepEqual(
    view.changeConditions[0].judgment,
    run.assessment!.narrative!.changeConditions[0]
  );
  assert.ok(view.distinguishingEvidence.every((item) => !/已取得/.test(item[0])));
  assert.match(researchPlanText(view, 'zh'), /需要直接核对/);
});

test('unvalidated media bodies and forum posts do not count as read evidence', () => {
  const run = fixture();
  run.context!.news.push({
    title: '标题线索',
    date: '2026-10-01',
    media: '媒体',
    provider: '目录',
    url: 'https://example.com/spoof',
    digest: '摘要',
    contentScope: 'media-excerpt',
    excerpt: {
      text: '仅测试',
      url: 'https://example.com/spoof',
      sha256: 'a'.repeat(64),
      readAt: snapshot,
    },
  });
  run.context!.discussions!.push({
    id: '123456',
    securityCode: '000001',
    title: '其他企业观点',
    date: '2026-10-01',
    url: 'https://guba.eastmoney.com/news,000001,123456.html',
    provider: 'guba',
    textScope: 'post-excerpt',
    excerpt: {
      text: '仅测试',
      url: 'https://guba.eastmoney.com/news,000001,123456.html',
      sha256: 'a'.repeat(64),
      readAt: snapshot,
    },
  });
  const view = deriveResearchPlan(run);
  assert.equal(view.sources.find((source) => source.id === 'media')!.catalog, 1);
  assert.equal(view.sources.find((source) => source.id === 'media')!.read, 0);
  assert.equal(view.sources.find((source) => source.id === 'discussion')!.read, 0);
});

test('read-only derivation and export exclude private preview, notes and unrelated trace text', () => {
  const run = withCondition(fixture());
  const secret = 'PRIVATE_MATERIAL_DO_NOT_EXPORT';
  Object.assign(run, { preview: { material: { note: secret } }, privatePlan: { note: secret } });
  run.trace.push({
    id: 'private-trace',
    tool: 'preview',
    label: secret,
    status: 'completed',
    startedAt: snapshot,
    inputSummary: secret,
    sources: [],
  });
  const before = JSON.stringify(run);
  const view = deriveResearchPlan(run);
  const copy = researchPlanText(view, 'zh');
  assert.equal(JSON.stringify(run), before);
  assert.doesNotMatch(JSON.stringify(view), new RegExp(secret));
  assert.doesNotMatch(copy, new RegExp(secret));
  assert.doesNotMatch(copy, /owner-scoped-record/);
  assert.match(copy, /历史报表不能证明/);
});

test('goal templates are four explicit public focuses with financial boundaries', () => {
  assert.equal(researchGoalTemplates.length, 4);
  assert.deepEqual(
    researchGoalTemplates.map((item) => item.id),
    ['cash-quality', 'before-payment', 'operating-change', 'counter-evidence']
  );
  assert.match(researchGoalTemplates[1].goal[0], /历史报表不证明当前付款安全/);
  assert.match(researchGoalTemplates[3].goal[0], /未检索到反证不等于没有风险/);
});
