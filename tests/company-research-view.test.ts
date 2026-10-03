import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type {
  AssessmentJudgment,
  AssessmentResearchStep,
  CompanyAssessment,
} from '../shared/company-assessment.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
} from '../shared/company-research-view.js';

const snapshotTime = '2026-10-02T00:00:00.000Z';
const finishTime = '2026-10-02T00:02:00.000Z';
const judgment = (zh = '经营现金存在压力，需核对期后回款。'): AssessmentJudgment => ({
  text: { zh, en: 'Operating cash is under pressure; check subsequent collections.' },
  metricIds: ['cash-to-profit'],
  evidenceIds: ['financial-2025'],
});
const step = (
  tool: string,
  status: AssessmentResearchStep['status'] = 'completed'
): AssessmentResearchStep => ({
  id: `${tool}-${status}`,
  tool,
  label: '原始步骤标签',
  status,
  startedAt: snapshotTime,
  ...(status !== 'running' ? { finishedAt: finishTime } : {}),
  summary: '原始执行记录',
});

function fixture(withAssessment = true): CompanyResearchRun {
  const assessment: CompanyAssessment = {
    version: 1,
    year: 2025,
    basis: 'consolidated',
    snapshotFetchedAt: snapshotTime,
    generatedAt: finishTime,
    grade: 'C',
    score: 81.25,
    methodologyVersion: 'financial-screen-v1',
    dimensions: [
      {
        id: 'cash',
        label: ['经营现金', 'Operating cash'],
        score: 25,
        status: 'pressure',
        metricIds: ['cash-to-profit', 'missing-metric'],
        ruleSummary: ['经营现金低于合并净利润。', 'Operating cash is below consolidated profit.'],
      },
    ],
    metrics: [
      {
        id: 'cash-to-profit',
        label: ['现金利润比', 'Cash-to-profit'],
        value: '7.15',
        display: ['7.15%', '7.15%'],
        unit: 'percent',
        status: 'available',
        evidenceIds: ['financial-2025'],
        formula: ['经营现金净额 ÷ 合并净利润', 'Operating cash / consolidated profit'],
      },
      {
        id: 'missing-metric',
        label: ['缺失字段', 'Missing field'],
        value: null,
        display: ['未知', 'Unknown'],
        unit: 'CNY',
        status: 'missing',
        evidenceIds: [],
        formula: ['未取得', 'Not obtained'],
      },
    ],
    evidence: [
      {
        id: 'financial-2025',
        kind: 'financial',
        label: '2025 年度合并财务',
        url: 'https://datacenter.eastmoney.com/finance',
        period: '2025-12-31',
        sourceQuality: 'web',
      },
    ],
    coverage: {
      fields: 13,
      requiredFields: 13,
      years: 6,
      sources: 8,
      news: 180,
      discussions: 240,
      mediaBodies: 8,
      discussionBodies: 8,
      disclosures: 24,
      excerpts: 6,
      peers: 5,
    },
    gaps: [['受限资金未确认。', 'Restricted funds are unconfirmed.']],
    narrative: {
      summary: judgment(),
      dimensions: [{ ...judgment(), dimensionId: 'cash' }],
      strengths: [judgment('有一项支持性判断。')],
      risks: Array.from({ length: 4 }, (_, i) => judgment(`已验证风险判断 ${i + 1}。`)),
      actions: Array.from({ length: 4 }, (_, i) => judgment(`下一项核查 ${i + 1}。`)),
      changeConditions: [judgment('新回款资料可能改变判断。')],
    },
    model: { status: 'completed', calls: 2, name: 'server-only-provider-name' },
    research: {
      goal: '现金与后续事项',
      steps: [
        step('collect_public_signals'),
        step('planning'),
        step('read_disclosure'),
        step('synthesize'),
        step('review'),
      ],
      modelCalls: 7,
      toolCalls: 4,
    },
  };
  return {
    id: 'private-account-record-id',
    input: { securityCode: '300893', orgId: 'fixtureorg', year: 2025, useModel: true },
    status: 'ready',
    createdAt: snapshotTime,
    updatedAt: finishTime,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextStatus: 'ready',
    assessmentStatus: withAssessment ? 'ready' : undefined,
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixtureorg',
      companyName: '测试公司',
      fetchedAt: snapshotTime,
      status: 'available',
      financials: [],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
      publicSignals: {
        fetchedAt: snapshotTime,
        news: {
          raw: 210,
          accepted: 200,
          unique: 180,
          pages: 6,
          hitsTotal: 230,
          bodyRead: 8,
          oldest: '2026-01-01',
          latest: '2026-10-02',
          stopReason: 'page-limit',
        },
        discussions: {
          raw: 270,
          accepted: 260,
          unique: 240,
          pages: 3,
          hitsTotal: null,
          bodyRead: 8,
          oldest: '2026-09-01',
          latest: '2026-10-02',
          stopReason: 'source-failure',
        },
      },
    },
    ...(withAssessment ? { assessment } : {}),
  };
}

function financialFixture(
  current: Partial<CompanyContextPeriod['amounts']> = {},
  previous: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyResearchRun {
  const run = fixture(false);
  const row = (
    year: number,
    overrides: Partial<CompanyContextPeriod['amounts']>
  ): CompanyContextPeriod => ({
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: year === 2025 ? '1200.00' : '1000.00',
      netProfit: year === 2025 ? '200.00' : '100.00',
      ocf: '200.00',
      cash: '200.00',
      shortLoan: '100.00',
      currentPortionDebt: '50.00',
      totalAssets: '1000.00',
      totalLiabilities: '400.00',
      receivables: '100.00',
      inventory: '100.00',
      ...overrides,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [`https://datacenter.eastmoney.com/report?year=${year}`],
    originalUrl: null,
  });
  run.context!.financials = [row(2024, previous), row(2025, current)];
  run.assessment = deriveCompanyAssessment(run);
  run.assessmentStatus = 'ready';
  return run;
}

test('the headline leads with annual cash pressure and retains the original narrative and source IDs', () => {
  const run = financialFixture({ ocf: '15.00' });
  run.assessment!.narrative = fixture().assessment!.narrative;
  run.assessment!.model.status = 'completed';
  const before = structuredClone(run);
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.headline.text.zh, '经营现金明显低于利润');
  assert.ok(brief.headline.metricIds.includes('2025-ocf'));
  assert.ok(brief.headline.metricIds.includes('cash-profit'));
  assert.ok(brief.headline.evidenceIds.includes('financial-2025-ocf'));
  assert.deepEqual(brief.summary, run.assessment!.narrative!.summary);
  assert.notEqual(brief.headline.text.zh, brief.summary.text.zh);
  brief.headline.evidenceIds.push('local-only');
  assert.deepEqual(run, before);
});

test('annual losses, negative operating cash, occupation and debt coverage have precise factual leads', () => {
  const cases = [
    [{ netProfit: '-20.00', ocf: '-10.00' }, '全年合并亏损，经营活动同时净流出'],
    [{ ocf: '-10.00' }, '全年盈利，经营活动仍净流出'],
    [{ netProfit: '-20.00' }, '全年合并亏损'],
    [{ netProfit: '0.00' }, '全年合并净利润为零'],
    [{ receivables: '500.00', inventory: '200.00' }, '应收与存货占营收比重上升'],
    [{ cash: '25.00' }, '年末货币资金低于两项短债合计'],
    [{ totalLiabilities: '1100.00' }, '年末总负债超过总资产'],
    [{ totalLiabilities: '950.00' }, '年末资产负债率处于承压区间'],
    [{ revenue: '900.00', receivables: '50.00', inventory: '50.00' }, '年度营收同比下降'],
  ] as const;
  for (const [amounts, text] of cases) {
    const brief = deriveCompanyResearchBrief(financialFixture(amounts));
    assert.equal(brief.headline.text.zh, text);
    assert.ok(brief.headline.metricIds.length);
    assert.ok(brief.headline.evidenceIds.length);
    assert.doesNotMatch(brief.headline.text.zh, /违约|坏账|滞销|销售回款率/);
  }
});

test('financial institutions share rule headlines, follow-up and missing/conflict behavior with all issuers', () => {
  const scenarios: Partial<CompanyContextPeriod['amounts']>[] = [
    {},
    { totalLiabilities: '950.00', ocf: '180.00' },
    { ocf: '15.00' },
    { ocf: '0.00' },
    { ocf: '-10.00' },
    { ocf: null },
    { netProfit: '-5.00' },
    { inventory: null },
  ];
  for (const amounts of scenarios) {
    for (const conflict of [false, true]) {
      const baseline = financialFixture(amounts);
      if (conflict) {
        baseline.context!.comparisons = [
          {
            period: '2025-12-31',
            field: 'revenue',
            primary: '1200.00',
            secondary: '1100.00',
            difference: '100.00',
            matches: false,
          },
        ];
        baseline.assessment = deriveCompanyAssessment(baseline);
        assert.equal(
          baseline.assessment.metrics.find((metric) => metric.id === '2025-revenue')!.status,
          'conflict'
        );
      }
      const expected = deriveCompanyResearchBrief(baseline);
      for (const industry of ['银行', '保险', '证券']) {
        const run = structuredClone(baseline);
        run.context!.organizationType = industry;
        run.context!.profile.industry = industry;
        run.assessment = deriveCompanyAssessment(run);
        assert.deepEqual(
          deriveCompanyResearchBrief(run),
          expected,
          `${industry}: ${JSON.stringify(amounts)}, conflict=${conflict}`
        );
      }
    }
  }
});

test('a favorable lead requires complete comparable data and positive prior profit before claiming profit growth', () => {
  const complete = deriveCompanyResearchBrief(financialFixture());
  assert.equal(complete.headline.text.zh, '合并利润增长，经营现金覆盖利润');
  assert.ok(complete.headline.metricIds.includes('2024-netProfit'));
  assert.equal(complete.provisionalRating, undefined);
  const zeroPriorProfit = deriveCompanyResearchBrief(financialFixture({}, { netProfit: '0.00' }));
  assert.equal(zeroPriorProfit.headline.text.zh, '全年盈利，经营现金覆盖合并利润');
  const incomplete = deriveCompanyResearchBrief(financialFixture({ inventory: null }));
  assert.match(incomplete.headline.text.zh, /已取得的财务维度表现较强/);
  assert.match(incomplete.headline.text.zh, /资料待补/);
  assert.deepEqual(incomplete.headline.evidenceIds, incomplete.provisionalRating!.evidenceIds);
  assert.doesNotMatch(incomplete.headline.text.zh, /覆盖.*利润|利润增长/);
  const incomparable = deriveCompanyResearchBrief(financialFixture({}, { revenue: '0.00' }));
  assert.match(incomparable.headline.text.zh, /缺少可比年度数据/);
  assert.doesNotMatch(incomparable.headline.text.zh, /增长/);
  assert.equal(incomparable.provisionalRating!.coveredDimensions, 2);
});

test('an NR lead retains an observed cash weakness without a favorable or fully rated conclusion', () => {
  const run = financialFixture({ ocf: '15.00', inventory: null });
  const brief = deriveCompanyResearchBrief(run);
  assert.match(brief.headline.text.zh, /经营现金明显低于利润/);
  assert.match(brief.headline.text.zh, /资料.*不足/);
  assert.doesNotMatch(brief.headline.text.zh, /暂不评级/);
  assert.equal(run.assessment!.grade, 'NR');
  assert.equal(run.assessment!.score, null);
  assert.equal(brief.provisionalRating!.grade, 'C');
  assert.match(brief.summary.text.zh, /期后回款/);
  assert.doesNotMatch(brief.summary.text.zh, /暂不形成综合评级|资料.*不足/);
  assert.ok(brief.summary.evidenceIds.includes('financial-2025-ocf'));
});

test('rule summaries with a provisional grade identify the follow-up while model summaries stay recorded', () => {
  const run = financialFixture({ inventory: null });
  const before = structuredClone(run);
  const brief = deriveCompanyResearchBrief(run);
  assert.match(brief.summary.text.zh, /初步判断.*已取得的财务维度/);
  assert.match(brief.summary.text.zh, /营运占用.*复核/);
  assert.doesNotMatch(brief.summary.text.zh, /暂不形成综合评级/);
  assert.deepEqual(brief.summary.evidenceIds, brief.provisionalRating!.evidenceIds);
  assert.deepEqual(run, before);
  const empty = financialFixture({ netProfit: null, cash: null, inventory: null });
  assert.equal(
    deriveCompanyResearchBrief(empty).summary.text.zh,
    '关键财务数据未齐或存在冲突，暂不形成综合评级。'
  );
  run.assessment!.model.status = 'completed';
  run.assessment!.narrative = fixture().assessment!.narrative;
  const modeled = deriveCompanyResearchBrief(run);
  assert.ok(modeled.provisionalRating);
  assert.deepEqual(modeled.summary, run.assessment!.narrative!.summary);
});

test('an incomplete headline takes a bounded position on the actually observed dimensions', () => {
  const strong = deriveCompanyResearchBrief(financialFixture({ revenue: null, cash: null }));
  assert.equal(strong.provisionalRating!.coveredDimensions, 1);
  assert.match(strong.headline.text.zh, /已取得的财务维度表现较强/);
  assert.deepEqual(strong.headline.metricIds, strong.provisionalRating!.metricIds);
  const balanced = deriveCompanyResearchBrief(
    financialFixture({ revenue: null, cash: null, ocf: '180.00' })
  );
  assert.equal(balanced.provisionalRating!.grade, 'B');
  // The actual cash shortfall remains more informative than the provisional aggregate.
  assert.match(balanced.headline.text.zh, /经营现金低于合并利润/);
  const noFacts = deriveCompanyResearchBrief(
    financialFixture({ netProfit: null, cash: null, inventory: null })
  );
  assert.equal(noFacts.provisionalRating, undefined);
  assert.match(noFacts.headline.text.zh, /资料不足/);
});

test('losing cash evidence does not turn a combined solvency weakness into a leverage claim', () => {
  const run = financialFixture({ cash: '25.00', totalLiabilities: '600.00', inventory: null });
  assert.equal(
    run.assessment!.dimensions.find((dimension) => dimension.id === 'solvency')!.status,
    'pressure'
  );
  run.assessment!.evidence.find((evidence) => evidence.id === 'financial-2025-cash')!.period =
    '2024-12-31';
  const brief = deriveCompanyResearchBrief(run);
  assert.doesNotMatch(brief.headline.text.zh, /负债率.*承压|货币资金低于/);
  assert.deepEqual(brief.provisionalRating!.dimensionIds, ['profitability', 'cash']);
});

test('provisional ratings preserve valid zero-debt and nonpositive-profit applicability branches', () => {
  const noShortDebt = deriveCompanyResearchBrief(
    financialFixture({ shortLoan: '0.00', currentPortionDebt: '0.00', inventory: null })
  );
  assert.equal(noShortDebt.provisionalRating!.coveredDimensions, 3);
  assert.ok(noShortDebt.provisionalRating!.dimensionIds.includes('solvency'));
  assert.equal(noShortDebt.provisionalRating!.metricIds.includes('cash-short-debt'), false);
  assert.doesNotMatch(noShortDebt.headline.text.zh, /没有.*债务/);
  for (const profit of ['0.00', '-20.00']) {
    for (const cash of ['0.00', '50.00']) {
      const brief = deriveCompanyResearchBrief(
        financialFixture({ netProfit: profit, ocf: cash, cash: null, inventory: null })
      );
      assert.ok(brief.provisionalRating!.dimensionIds.includes('cash'));
      assert.equal(brief.provisionalRating!.metricIds.includes('cash-profit'), false);
      assert.doesNotMatch(brief.headline.text.zh, /现金覆盖.*利润|利润增长/);
    }
  }
});

test('previous headlines and provisional ratings use only the recorded assessment snapshot', () => {
  const run = financialFixture({ inventory: null });
  const before = structuredClone(run.assessment);
  run.context!.fetchedAt = '2026-10-02T03:00:00.000Z';
  run.context!.financials[1]!.amounts.ocf = '-999.00';
  const brief = deriveCompanyResearchBrief(run);
  assert.match(brief.headline.text.zh, /^上次分析：/);
  assert.doesNotMatch(brief.headline.text.zh, /净流出/);
  assert.equal(brief.provisionalRating!.grade, 'A');
  assert.equal(brief.provisionalRating!.coveredDimensions, 3);
  assert.deepEqual(run.assessment, before);
});

test('provisional grades average only supported dimensions and retain the known weak-dimension caps', () => {
  const cases = [
    [{ inventory: null }, 'A', 3, ['profitability', 'cash', 'solvency']],
    [{ inventory: null, ocf: '15.00' }, 'C', 3, ['profitability', 'cash', 'solvency']],
    [
      { inventory: null, cash: null, netProfit: '-20.00', ocf: '-10.00' },
      'D',
      2,
      ['profitability', 'cash'],
    ],
    [{ revenue: null, cash: null }, 'A', 1, ['cash']],
    [{ revenue: null, cash: null, ocf: '180.00' }, 'B', 1, ['cash']],
    [{ revenue: null, cash: null, ocf: '15.00' }, 'D', 1, ['cash']],
  ] as const;
  for (const [amounts, grade, count, dimensions] of cases) {
    const run = financialFixture(amounts);
    const before = structuredClone(run);
    assert.equal(run.assessment!.grade, 'NR');
    const brief = deriveCompanyResearchBrief(run);
    assert.equal(brief.provisionalRating!.grade, grade);
    assert.equal(brief.provisionalRating!.coveredDimensions, count);
    assert.equal(brief.provisionalRating!.totalDimensions, 4);
    assert.deepEqual(brief.provisionalRating!.dimensionIds, dimensions);
    assert.ok(brief.provisionalRating!.metricIds.length);
    assert.ok(brief.provisionalRating!.evidenceIds.length);
    assert.equal('score' in brief.provisionalRating!, false);
    brief.provisionalRating!.evidenceIds.push('local-only');
    brief.provisionalRating!.dimensionIds.pop();
    assert.deepEqual(run, before);
  }
});

test('conflicting, missing, malformed and wrong-year source support cannot enter a provisional grade', () => {
  for (const failure of [
    'conflict',
    'missing-source',
    'wrong-year',
    'nonfinancial',
    'headline-only',
    'invalid-url',
    'malformed',
  ] as const) {
    const run = financialFixture({ inventory: null });
    const metric = run.assessment!.metrics.find((metric) => metric.id === '2025-ocf')!;
    const evidence = run.assessment!.evidence.find(
      (evidence) => evidence.id === metric.evidenceIds[0]
    )!;
    if (failure === 'conflict') metric.status = 'conflict';
    else if (failure === 'missing-source') metric.evidenceIds = [];
    else if (failure === 'wrong-year') evidence.period = '2024-12-31';
    else if (failure === 'nonfinancial') evidence.kind = 'news';
    else if (failure === 'headline-only') evidence.sourceQuality = 'headline';
    else if (failure === 'invalid-url') evidence.url = 'not-a-url';
    else metric.value = 'not-a-number';
    const brief = deriveCompanyResearchBrief(run);
    assert.equal(brief.provisionalRating!.coveredDimensions, 2);
    assert.deepEqual(brief.provisionalRating!.dimensionIds, ['profitability', 'solvency']);
    assert.equal(brief.provisionalRating!.metricIds.includes('2025-ocf'), false);
    assert.doesNotMatch(brief.headline.text.zh, /覆盖.*利润|利润增长/);
  }
  const conflict = financialFixture({ inventory: null });
  conflict.assessment!.dimensions.find((dimension) => dimension.id === 'cash')!.status = 'conflict';
  assert.equal(deriveCompanyResearchBrief(conflict).provisionalRating!.coveredDimensions, 2);
  for (const score of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    const run = financialFixture({ inventory: null });
    run.assessment!.dimensions.find((dimension) => dimension.id === 'cash')!.score = score;
    assert.equal(deriveCompanyResearchBrief(run).provisionalRating!.coveredDimensions, 2);
  }
});

test('no supported core dimension, a mismatched scope or a formal grade yields no provisional grade', () => {
  const empty = financialFixture({ netProfit: null, cash: null, inventory: null });
  assert.equal(deriveCompanyResearchBrief(empty).provisionalRating, undefined);
  for (const scope of ['issuer', 'year', 'basis'] as const) {
    const run = financialFixture({ inventory: null });
    if (scope === 'issuer') run.context!.securityCode = '600000';
    else if (scope === 'year') run.assessment!.year = 2024;
    else Object.assign(run.assessment!, { basis: 'parent' });
    const brief = deriveCompanyResearchBrief(run);
    assert.equal(brief.provisionalRating, undefined);
    assert.deepEqual(brief.headline.metricIds, []);
    assert.deepEqual(brief.headline.evidenceIds, []);
    assert.match(brief.headline.text.zh, /范围未确认/);
  }
  assert.equal(deriveCompanyResearchBrief(financialFixture()).provisionalRating, undefined);
});

test('unstarted research has no invented steps, call counts or field coverage', () => {
  const run = fixture(false);
  delete run.context;
  delete run.contextStatus;
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'not-started');
  assert.equal(progress.mode, 'none');
  assert.equal(progress.snapshot, 'missing');
  assert.equal(progress.activeStage, null);
  assert.equal(progress.counts.modelCalls, null);
  assert.equal(progress.counts.toolCalls, null);
  assert.ok(progress.stages.every((stage) => stage.attempts === 0 && !stage.startedAt));
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.coverage.origin, 'unavailable');
  assert.equal(brief.coverage.fields, null);
  assert.equal(brief.coverage.requiredFields, null);
  assert.deepEqual(brief.summary.evidenceIds, []);
  assert.match(brief.summary.text.zh, /尚未形成分析/);
});

test('a running new job never borrows completion or call totals from the previous report', () => {
  const run = fixture();
  run.assessmentStatus = 'loading';
  run.assessmentTrace = [step('planning', 'running')];
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'running');
  assert.equal(progress.activeStage, 'investigate');
  assert.equal(progress.previousReportAvailable, true);
  assert.equal(progress.stages[1].status, 'running');
  assert.equal(progress.stages[2].status, 'not-started');
  assert.equal(progress.stages[3].status, 'not-started');
  assert.equal(progress.counts.completedSteps, 0);
  assert.equal(progress.counts.modelCalls, null);
  assert.equal(progress.counts.toolCalls, null);
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.summary.text.zh, run.assessment!.narrative!.summary.text.zh);
  assert.ok(brief.warnings.some(([zh]) => zh.includes('上一份报告')));
});

test('completed phases and attempt totals use real recorded execution metadata', () => {
  const run = fixture();
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'completed');
  assert.ok(progress.stages.every((stage) => stage.status === 'completed'));
  assert.equal(progress.stages[3].startedAt, snapshotTime);
  assert.equal(progress.stages[3].finishedAt, finishTime);
  assert.equal(progress.counts.modelCalls, 7);
  assert.equal(progress.counts.toolCalls, 4);
  assert.equal(progress.counts.completedSteps, 5);
  assert.ok(progress.stages.every((stage) => stage.label[0] && stage.label[1]));
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.coverage.news, 180);
  assert.equal(brief.coverage.mediaBodies, 8);
  assert.equal(brief.coverage.newsScope!.stopReason, 'page-limit');
  assert.equal(brief.coverage.discussionScope!.stopReason, 'source-failure');
  assert.equal(brief.priorities.length, 3);
  assert.equal(brief.nextChecks.length, 3);
  assert.deepEqual(brief.priorities[0], run.assessment!.narrative!.risks[0]);
});

test('failed reverse review keeps the validated draft and an explicit partial state', () => {
  const run = fixture();
  run.assessment!.model.warning = '独立复核超时';
  run.assessmentTrace = [...run.assessment!.research!.steps.slice(0, -1), step('review', 'failed')];
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'partial');
  assert.equal(progress.mode, 'model');
  assert.equal(progress.stages[3].status, 'failed');
  assert.equal(progress.counts.failedSteps, 1);
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.mode, 'model');
  assert.ok(brief.warnings.some(([zh]) => zh.includes('已验证的初稿')));
  assert.equal(brief.summary.text.zh, run.assessment!.narrative!.summary.text.zh);
});

test('unconfigured and failed model results stay rule-only and never invent a review', () => {
  for (const status of ['not-configured', 'failed'] as const) {
    const run = fixture();
    delete run.assessment!.narrative;
    run.assessment!.model = { status, calls: 0, warning: 'AI 未完成' };
    run.assessment!.research = {
      goal: '现金核查',
      steps: [step('planning', 'failed'), step('synthesize')],
      modelCalls: 0,
      toolCalls: 1,
    };
    const progress = deriveCompanyResearchProgress(run);
    assert.equal(progress.mode, 'rules');
    assert.equal(progress.state, 'partial');
    assert.equal(progress.stages[2].status, 'partial');
    assert.equal(progress.stages[3].status, 'not-started');
    assert.equal(progress.counts.modelCalls, 0);
    const brief = deriveCompanyResearchBrief(run);
    assert.equal(brief.mode, 'rules');
    assert.match(brief.summary.text.zh, /经营现金/);
    assert.deepEqual(brief.priorities[0].metricIds, ['cash-to-profit']);
    assert.match(brief.nextChecks[0].text.zh, /期后回款/);
    assert.ok(brief.warnings.length);
    assert.equal(run.assessment!.grade, 'C');
    assert.equal(run.assessment!.score, 81.25);
  }
});

test('old reports retain their own coverage and never receive a new snapshot pagination range', () => {
  const run = fixture();
  run.context!.fetchedAt = '2026-10-02T03:00:00.000Z';
  run.context!.publicSignals!.news.unique = 999;
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.snapshot, 'previous');
  assert.equal(progress.state, 'partial');
  assert.equal(progress.previousReportAvailable, true);
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.coverage.origin, 'report');
  assert.equal(brief.coverage.snapshotFetchedAt, snapshotTime);
  assert.equal(brief.coverage.news, 180);
  assert.equal(brief.coverage.newsScope, null);
  assert.equal(brief.coverage.discussionScope, null);
  assert.ok(brief.warnings.some(([zh]) => zh.includes('上一份资料快照')));
});

test('wrong issuer, identity and annual report scope withhold judgments and coverage', () => {
  for (const mismatch of ['issuer', 'identity', 'year'] as const) {
    const run = fixture();
    if (mismatch === 'issuer') run.context!.securityCode = '600000';
    else if (mismatch === 'year') run.assessment!.year = 2024;
    else
      run.identity = {
        securityCode: '600000',
        orgId: 'other-company-org',
        shortName: '其他公司',
        companyName: '其他公司',
        exchange: 'sse',
        sourceUrl: 'https://www.cninfo.com.cn/',
      };
    const progress = deriveCompanyResearchProgress(run);
    assert.equal(progress.snapshot, 'mismatch');
    assert.equal(progress.state, 'failed');
    assert.equal(progress.mode, 'none');
    const brief = deriveCompanyResearchBrief(run);
    assert.equal(brief.mode, 'none');
    assert.deepEqual(brief.summary.metricIds, []);
    assert.deepEqual(brief.summary.evidenceIds, []);
    assert.deepEqual(brief.priorities, []);
    assert.deepEqual(brief.nextChecks, []);
    assert.equal(brief.coverage.origin, 'unavailable');
    assert.equal(brief.coverage.news, 0);
    assert.equal(brief.coverage.newsScope, null);
    assert.match(brief.summary.text.zh, /范围未确认/);
  }
});

test('legacy reports keep unrecorded public body and discussion counts unknown', () => {
  const run = fixture();
  delete run.assessment!.coverage.mediaBodies;
  delete run.assessment!.coverage.discussions;
  delete run.assessment!.coverage.discussionBodies;
  delete run.assessment!.research;
  delete run.context!.publicSignals;
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.coverage.mediaBodies, null);
  assert.equal(brief.coverage.discussions, null);
  assert.equal(brief.coverage.discussionBodies, null);
  assert.equal(brief.coverage.newsScope, null);
  assert.equal(brief.coverage.discussionScope, null);
  assert.equal(deriveCompanyResearchProgress(run).counts.modelCalls, null);
  assert.equal(deriveCompanyResearchProgress(run).stages[3].status, 'not-started');
});

test('a failed replacement job preserves the report while its new failure remains visible', () => {
  const run = fixture();
  run.assessmentStatus = 'failed';
  run.assessmentTrace = [step('read_disclosure', 'failed')];
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'failed');
  assert.equal(progress.previousReportAvailable, true);
  assert.equal(progress.counts.modelCalls, null);
  assert.equal(progress.stages[3].status, 'not-started');
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.mode, 'model');
  assert.ok(brief.warnings.some(([zh]) => zh.includes('本次研究未完成')));
});

test('a source refresh keeps the saved report separate from the new retrieval phase', () => {
  const run = fixture();
  run.contextStatus = 'loading';
  const progress = deriveCompanyResearchProgress(run);
  assert.equal(progress.state, 'running');
  assert.equal(progress.activeStage, 'sources');
  assert.equal(progress.previousReportAvailable, true);
  assert.equal(progress.stages[2].status, 'not-started');
  assert.equal(progress.stages[3].status, 'not-started');
  assert.equal(progress.counts.modelCalls, null);
  assert.equal(progress.counts.toolCalls, null);
  const brief = deriveCompanyResearchBrief(run);
  assert.equal(brief.coverage.snapshotFetchedAt, snapshotTime);
  assert.ok(brief.warnings.some(([zh]) => zh.includes('公开资料正在更新')));
});

test('public read models do not mutate saved results or expose private record/provider metadata', () => {
  const run = fixture();
  Object.assign(run, {
    privateNotes: 'private-sentinel-notes',
    accountId: 'private-sentinel-account',
  });
  const before = structuredClone(run);
  const progress = deriveCompanyResearchProgress(run);
  const brief = deriveCompanyResearchBrief(run);
  brief.summary.text.zh = '本地更改';
  brief.priorities[0].evidenceIds.push('local-only-source');
  brief.coverage.newsScope!.unique = 123;
  assert.deepEqual(run, before);
  const output = JSON.stringify({ progress, brief });
  assert.equal(output.includes('private-sentinel'), false);
  assert.equal(output.includes('private-account-record-id'), false);
  assert.equal(output.includes('server-only-provider-name'), false);
  assert.equal(output.includes('confidence'), false);
});
