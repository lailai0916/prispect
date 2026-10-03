import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts';
import { deriveCompanyAssessment } from '../shared/company-assessment';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyIndustrySnapshot,
  type CompanyRecordSummary,
  type IndustryMetricSummary,
} from '../shared/company-workspace';
import {
  deriveCompanyNavigationPreview,
  matchingCompanyNavigationRun,
} from '../src/company-navigation-preview';

const fetchedAt = '2026-10-03T08:00:00.000Z';

function annual(
  year: number,
  amounts: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: null,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '1000.00',
      parentProfit: '80.00',
      netProfit: '100.00',
      ocf: '-20.00',
      cash: '200.00',
      shortLoan: '50.00',
      currentPortionDebt: '20.00',
      receivables: '40.00',
      inventory: '30.00',
      totalAssets: '1000.00',
      totalLiabilities: '300.00',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 30, roe: 10, revenueGrowth: 5 },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://datacenter.eastmoney.com/'],
    originalUrl: null,
  };
}

function metric(value: number, count = 5): IndustryMetricSummary {
  return { company: value + 1, mean: value, median: value, count, missing: 0, difference: 1 };
}

function industry(year = 2025): CompanyIndustrySnapshot {
  return {
    version: 1,
    securityCode: '600519',
    period: `${year}-12-31`,
    industry: '公开行业样本',
    industryCode: 'BK0000',
    fetchedAt,
    status: 'available',
    peerCount: 5,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      industryMetricKeys.map((key) => [key, metric(20)])
    ) as CompanyIndustrySnapshot['metrics'],
    chartMetrics: { parentProfit: metric(70), netProfit: metric(90) },
    samples: ['600519', '600001', '600002', '600003', '600004', '600005'].map((code) => ({
      code,
      name: code,
      noticeDate: null,
      values: Object.fromEntries(
        industryMetricKeys.map((key) => [key, 20])
      ) as CompanyIndustrySnapshot['samples'][number]['values'],
      chartValues: { parentProfit: 70, netProfit: 90 },
    })),
    sources: [{ url: 'https://datacenter.eastmoney.com/', sha256: 'a'.repeat(64) }],
    warnings: [],
  };
}

function fixture(): { record: CompanyRecordSummary; run: CompanyResearchRun } {
  const run: CompanyResearchRun = {
    id: 'run-2025',
    input: { securityCode: '600519', orgId: 'org-600519', year: 2025, researchMode: 'financial' },
    identity: {
      securityCode: '600519',
      orgId: 'org-600519',
      shortName: '公开样本',
      companyName: '公开样本股份有限公司',
      exchange: 'sse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    announcements: [],
    trace: [],
    model: { requested: false, status: 'not-called' },
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'org-600519',
      companyName: '公开样本股份有限公司',
      fetchedAt,
      status: 'partial',
      financials: [annual(2024), annual(2025)],
      sources: [
        {
          id: 'em-income',
          provider: '东方财富',
          dimension: '年度财务',
          url: 'https://datacenter.eastmoney.com/',
          status: 'available',
          fetchedAt,
          latestDate: '2025-12-31',
          count: 2,
          note: '第三方年度合并表字段',
          responseHashes: ['a'.repeat(64)],
        },
      ],
      comparisons: [],
      profile: { orgName: '公开样本股份有限公司', secretary: null },
      shareholders: [],
      announcements: [
        {
          id: 'disclosure-1',
          title: '2025 年度报告',
          date: '2026-03-01',
          url: 'https://www.cninfo.com.cn/annual.pdf',
          sources: [],
          category: '财报',
          attention: 'routine',
          matched: '',
          meaning: '年度报告标题线索',
          nextQuestion: '阅读相关原文',
        },
      ],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
    industry: { '2024-12-31': industry(2024), '2025-12-31': industry() },
  };
  const record: CompanyRecordSummary = {
    id: run.id,
    input: { ...run.input },
    name: '公开样本',
    status: 'ready',
    createdAt: fetchedAt,
  };
  return { record, run };
}

test('cached previews require the current owner and the exact selected record scope', () => {
  const { record, run } = fixture();
  const cached = { owner: 'alice', run };
  assert.equal(matchingCompanyNavigationRun(record, cached, 'alice'), run);
  assert.equal(matchingCompanyNavigationRun(record, cached, 'bob'), null);
  assert.equal(matchingCompanyNavigationRun(record, cached, null), null);
  assert.equal(matchingCompanyNavigationRun(null, cached, 'alice'), null);
  assert.equal(matchingCompanyNavigationRun(record, null, 'alice'), null);
  for (const mismatched of [
    { ...record, id: 'different-run' },
    { ...record, input: { ...record.input, securityCode: '600001' } },
    { ...record, input: { ...record.input, orgId: 'different-org' } },
    { ...record, input: { ...record.input, year: 2024 } },
  ]) {
    assert.equal(matchingCompanyNavigationRun(mismatched, cached, 'alice'), null);
    const preview = deriveCompanyNavigationPreview(mismatched, run);
    assert.equal(preview.scope, 'mismatch');
    assert.equal(preview.context, null);
    assert.deepEqual(preview.trends, []);
  }
});

test('missing and mismatched cached scopes withhold all content instead of borrowing record summaries', () => {
  const { record, run } = fixture();
  record.result = {
    grade: 'A',
    score: 100,
    statement: { zh: '另一份摘要', en: 'Another summary' },
    asOf: fetchedAt,
    stale: false,
    modelStatus: 'completed',
  };
  assert.equal(deriveCompanyNavigationPreview(record, null).scope, 'missing');
  const noContext = deriveCompanyNavigationPreview(record, { ...run, context: undefined });
  assert.equal(noContext.overview.summary, null);
  assert.equal(noContext.overview.grade, null);
  for (const invalid of [
    { ...run, context: { ...run.context!, securityCode: '600001' } },
    { ...run, context: { ...run.context!, orgId: 'another-org' } },
    { ...run, identity: { ...run.identity!, orgId: 'another-org' } },
    { ...run, identity: { ...run.identity!, exchange: 'us' as const } },
    { ...run, informationGap: { name: 'Unknown', reason: 'Issuer is unconfirmed' } },
    {
      ...run,
      context: { ...run.context!, warnings: ['来源主体或机构类型存在冲突'] },
    },
  ]) {
    const preview = deriveCompanyNavigationPreview(record, invalid);
    assert.equal(preview.scope, 'mismatch');
    assert.equal(preview.overview.summary, null);
    assert.deepEqual(preview.disclosures, []);
    assert.deepEqual(preview.coverage.receipts, []);
  }
});

test('partial snapshots preserve zero, missing fields and the selected annual profit basis', () => {
  const { record, run } = fixture();
  run.context!.financials = [
    annual(2024, { parentProfit: '75.00' }),
    annual(2025, { parentProfit: null, netProfit: '0.00', ocf: '0.00' }),
    annual(2026, { parentProfit: '999.00' }),
    { ...annual(2025), period: '2025-09-30', annual: false },
  ];
  const parent = deriveCompanyNavigationPreview(record, run);
  assert.equal(parent.available, true);
  assert.equal(
    parent.overview.metrics.find((metric) => metric.field === 'parentProfit')!.value,
    null
  );
  assert.equal(parent.overview.metrics.find((metric) => metric.field === 'ocf')!.value, '0.00');
  assert.equal(parent.coverage.missingFields, 1);
  assert.equal(parent.trends[1]!.profit, null);
  assert.equal(parent.trends[1]!.peerProfit, null);
  assert.deepEqual(
    parent.trends.map((row) => row.period),
    ['2024-12-31', '2025-12-31']
  );
  const consolidated = deriveCompanyNavigationPreview(record, run, 'consolidated');
  assert.equal(consolidated.trends[1]!.profit, '0.00');
  assert.equal(consolidated.trends[1]!.peerProfit, '90.00');
  run.context!.financials = [annual(2024)];
  const noSelectedYear = deriveCompanyNavigationPreview(record, run);
  assert.ok(noSelectedYear.overview.metrics.every((metric) => metric.value === null));
  assert.equal(noSelectedYear.coverage.missingFields, 3);
});

test('conflicting fields and failed source provenance withhold dependent amounts and peer values', () => {
  const { record, run } = fixture();
  run.context!.financials.push(annual(2025, { parentProfit: '81.00' }));
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'revenue',
    primary: '1000.00',
    secondary: '1001.00',
    difference: '-1.00',
    matches: false,
  });
  const preview = deriveCompanyNavigationPreview(record, run);
  assert.equal(preview.overview.metrics[0]!.status, 'conflict');
  assert.equal(preview.overview.metrics[1]!.status, 'conflict');
  assert.equal(preview.trends[1]!.profit, null);
  assert.equal(preview.trends[1]!.peerProfit, null);
  assert.equal(preview.trends[1]!.revenue, null);
  assert.equal(preview.trends[1]!.ocf, '-20.00');
  assert.ok(!preview.industry.metrics.some((metric) => metric.key === 'ocfToRevenue'));
  assert.ok(preview.industry.metrics.some((metric) => metric.key === 'roe'));

  const failed = fixture();
  failed.run.context!.financials.forEach((row) => {
    row.fieldSources.parentProfit = '东方财富';
  });
  failed.run.context!.sources[0]!.status = 'error';
  const withheld = deriveCompanyNavigationPreview(failed.record, failed.run);
  assert.equal(withheld.trends[1]!.profit, null);
  assert.equal(withheld.trends[1]!.peerProfit, null);
  assert.equal(withheld.coverage.availableSources, 0);
});

test('a saved report needs the same year and source snapshot while amounts remain readable', () => {
  const { record, run } = fixture();
  const report = deriveCompanyAssessment(run);
  run.assessment = report;
  report.model.status = 'completed';
  const evidenceId = report.metrics.find((metric) => metric.id === '2025-netProfit')!
    .evidenceIds[0]!;
  report.narrative = {
    summary: {
      text: {
        zh: '利润与经营现金需结合来源核对。',
        en: 'Check profit and operating cash against their sources.',
      },
      metricIds: ['2025-netProfit', '2025-ocf'],
      evidenceIds: [evidenceId],
    },
    dimensions: [],
    strengths: [],
    risks: [],
    actions: [],
    changeConditions: [],
  };
  assert.equal(
    deriveCompanyNavigationPreview(record, run).overview.summary,
    report.narrative.summary.text.zh
  );
  assert.equal(
    deriveCompanyNavigationPreview(record, run, 'parent', 'en').overview.summary,
    report.narrative.summary.text.en
  );
  for (const wrongReport of [
    { ...report, year: 2024 },
    { ...report, snapshotFetchedAt: '2026-10-02T08:00:00.000Z' },
  ]) {
    run.assessment = wrongReport;
    const preview = deriveCompanyNavigationPreview(record, run);
    assert.equal(preview.overview.summary, null);
    assert.equal(preview.overview.grade, null);
    assert.equal(preview.overview.metrics[1]!.value, '80.00');
  }
});

test('same-year industry comparisons need actual valid peer samples and the minimum cohort', () => {
  const { record, run } = fixture();
  const valid = deriveCompanyNavigationPreview(record, run);
  assert.equal(valid.industry.metrics.length, 6);
  assert.equal(valid.trends[1]!.peerProfit, '70.00');
  assert.equal(
    deriveCompanyNavigationPreview(record, run, 'consolidated').trends[1]!.peerProfit,
    '90.00'
  );
  for (const change of [
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.securityCode = '600001';
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.period = '2024-12-31';
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.minimumSamples = 6;
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.peerCount = 4;
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.samples[1]!.code = snapshot.samples[2]!.code;
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.sources = [];
    },
    (snapshot: CompanyIndustrySnapshot) => {
      snapshot.samples = snapshot.samples.filter((sample) => sample.code !== snapshot.securityCode);
    },
  ]) {
    const candidate = fixture();
    change(candidate.run.industry!['2025-12-31']!);
    const preview = deriveCompanyNavigationPreview(candidate.record, candidate.run);
    assert.equal(preview.industry.snapshot, null);
    assert.deepEqual(preview.industry.metrics, []);
    assert.equal(preview.trends[1]!.peerProfit, null);
    assert.equal(preview.trends[0]!.peerProfit, '70.00');
  }
  const sparse = fixture();
  const sparseIndustry = sparse.run.industry!['2025-12-31']!;
  sparseIndustry.metrics.roe.count = 4;
  sparseIndustry.metrics.grossMargin.median = Number.NaN;
  sparseIndustry.samples[1]!.values.ocfToRevenue = null;
  sparseIndustry.samples[1]!.chartValues!.parentProfit = null;
  const noSparseBenchmarks = deriveCompanyNavigationPreview(sparse.record, sparse.run);
  assert.ok(
    !noSparseBenchmarks.industry.metrics.some((row) =>
      ['roe', 'grossMargin', 'ocfToRevenue'].includes(row.key)
    )
  );
  assert.equal(noSparseBenchmarks.trends[1]!.peerProfit, null);
});

test('previews are bounded local public read models and never copy original or private run fields', () => {
  const { record, run } = fixture();
  const secret = 'PRIVATE-UPLOAD-QUESTION-PLAN-SECRET';
  Object.assign(run, {
    preview: { privateOriginal: secret },
    stoppedReason: secret,
    error: secret,
  });
  run.questions = [
    {
      question: secret,
      text: secret,
      citations: [],
      mode: 'model',
      createdAt: fetchedAt,
      snapshotFetchedAt: fetchedAt,
    },
  ];
  run.context!.financials = Array.from({ length: 10 }, (_, index) => annual(2016 + index));
  run.context!.profile.blank = '';
  run.context!.profile.unknownProviderKey = 'Unknown provider metadata';
  const before = JSON.stringify({ record, run });
  const preview = deriveCompanyNavigationPreview(record, run);
  assert.equal(JSON.stringify({ record, run }), before);
  assert.ok(!JSON.stringify(preview).includes(secret));
  assert.equal(preview.trends.length, 6);
  assert.deepEqual(
    preview.trends.map((row) => row.period),
    ['2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31']
  );
  assert.deepEqual(preview.profile, [{ key: 'orgName', value: '公开样本股份有限公司' }]);
  assert.equal(preview.disclosures[0]!.title, '2025 年度报告');
  assert.equal(preview.coverage.annualYears, 6);
});
