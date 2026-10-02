import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import {
  deriveCompanyAssessment,
  buildAssessmentPublicPayload,
  resolveAssessmentRating,
  type CompanyAssessment,
} from '../shared/company-assessment.js';

function row(
  year: number,
  overrides: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: year === 2025 ? '1200.00' : '1000.00',
      netProfit: '200.00',
      ocf: '180.00',
      cash: '200.00',
      shortLoan: '100.00',
      currentPortionDebt: '50.00',
      totalAssets: '1000.00',
      totalLiabilities: '400.00',
      receivables: '100.00',
      inventory: '100.00',
      ...overrides,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 40, roe: 20, revenueGrowth: 20 },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [`https://datacenter.eastmoney.com/report?year=${year}`],
    originalUrl: `https://static.cninfo.com.cn/${year}.PDF`,
  };
}
function fixture(): CompanyResearchRun {
  const snapshot: CompanyContextSnapshot = {
    version: 1,
    securityCode: '300893',
    orgId: 'gssz0300893',
    companyName: '松原安全',
    fetchedAt: '2026-10-02T00:00:00.000Z',
    status: 'partial',
    financials: [row(2023), row(2024), row(2025)],
    comparisons: [],
    profile: {},
    sources: [
      {
        id: 'em-income',
        provider: '东方财富',
        dimension: '财务报表 · income',
        url: 'https://datacenter.eastmoney.com/income',
        status: 'available',
        fetchedAt: '2026-10-02T00:00:00.000Z',
        latestDate: '2025-12-31',
        count: 3,
        note: '第三方网页报表字段',
        responseHashes: [],
      },
    ],
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
  return {
    id: 'private-run-id',
    input: { securityCode: '300893', orgId: 'gssz0300893', year: 2025 },
    identity: {
      securityCode: '300893',
      orgId: 'gssz0300893',
      shortName: '松原安全',
      companyName: '松原安全股份有限公司',
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: snapshot.fetchedAt,
    updatedAt: snapshot.fetchedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'completed' },
    context: snapshot,
  };
}
function metric(value: CompanyAssessment, id: string) {
  const item = value.metrics.find((item) => item.id === id);
  assert.ok(item, `metric ${id} exists`);
  return item;
}
function dimension(value: CompanyAssessment, id: string) {
  const item = value.dimensions.find((item) => item.id === id);
  assert.ok(item, `dimension ${id} exists`);
  return item;
}
function replace(
  run: CompanyResearchRun,
  year: number,
  overrides: Partial<CompanyContextPeriod['amounts']>
) {
  const item = run.context!.financials.find((item) => item.period === `${year}-12-31`)!;
  Object.assign(item.amounts, overrides);
}
function peers(count = 5): CompanyIndustrySnapshot {
  return {
    version: 1,
    securityCode: '300893',
    period: '2025-12-31',
    industry: '汽车零部件',
    industryCode: 'BK0481',
    fetchedAt: '2026-10-02T00:00:00.000Z',
    status: 'available',
    peerCount: 5,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      industryMetricKeys.map((key) => [
        key,
        { company: 40, mean: 30, median: 28, count, missing: 5 - count, difference: 10 },
      ])
    ) as CompanyIndustrySnapshot['metrics'],
    samples: [],
    sources: [{ url: 'https://datacenter.eastmoney.com/peers', sha256: 'hash' }],
    warnings: [],
  };
}

test('assessment fixes the selected consolidated annual scope and keeps financial facts separate from originals', () => {
  const run = fixture();
  replace(run, 2025, { parentProfit: '-999999.00' });
  run.context!.financials.push(row(2026, { netProfit: '-88888.00' }), {
    ...row(2025, { netProfit: '-77777.00' }),
    period: '2025-09-30',
    annual: false,
  });
  const result = deriveCompanyAssessment(run);
  assert.equal(result.year, 2025);
  assert.equal(result.basis, 'consolidated');
  assert.equal(result.grade, 'A');
  assert.equal(result.score, 90);
  assert.equal(metric(result, '2025-netProfit').value, '200.00');
  assert.equal(
    result.metrics.some((item) => item.id.includes('2026')),
    false
  );
  const evidence = result.evidence.find((item) => item.id === 'financial-2025-netProfit')!;
  assert.equal(evidence.sourceQuality, 'web');
  assert.equal(evidence.url, 'https://datacenter.eastmoney.com/report?year=2025');
  assert.equal(result.coverage.fields, result.coverage.requiredFields);
  assert.equal(dimension(result, 'industry').score, null);
  assert.equal(dimension(result, 'events').score, null);
});

test('wrong issuer and missing selected year withhold rating instead of reusing current or unrelated figures', () => {
  const wrong = fixture();
  wrong.context!.securityCode = '600000';
  const result = deriveCompanyAssessment(wrong);
  assert.equal(result.grade, 'NR');
  assert.equal(result.score, null);
  assert.equal(result.evidence.length, 0);
  assert.equal(metric(result, '2025-netProfit').status, 'conflict');
  const old = fixture();
  old.input.year = 2022;
  const unavailable = deriveCompanyAssessment(old);
  assert.equal(unavailable.grade, 'NR');
  assert.equal(metric(unavailable, '2022-netProfit').value, null);
  assert.equal(unavailable.coverage.years, 0);
});

test('persisted conflicting values and duplicate annual rows are rechecked before computation', () => {
  const run = fixture();
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'ocf',
    primary: '180.00',
    secondary: '90.00',
    difference: '90.00',
    matches: false,
  });
  const result = deriveCompanyAssessment(run);
  assert.equal(result.grade, 'NR');
  assert.equal(metric(result, '2025-ocf').value, null);
  assert.equal(metric(result, 'cash-profit').status, 'conflict');
  assert.equal(dimension(result, 'cash').status, 'conflict');
  assert.equal(
    result.evidence.some((item) => item.id === 'financial-2025-ocf'),
    false
  );
  const duplicate = fixture();
  duplicate.context!.financials.push(row(2025, { inventory: '999.00' }));
  assert.equal(metric(deriveCompanyAssessment(duplicate), '2025-inventory').status, 'conflict');
  assert.equal(deriveCompanyAssessment(duplicate).grade, 'NR');
});

test('noncritical historical conflicts withhold their dependent history without blocking current core grade', () => {
  const run = fixture();
  run.context!.comparisons.push({
    period: '2023-12-31',
    field: 'netProfit',
    primary: '200.00',
    secondary: '201.00',
    difference: '-1.00',
    matches: false,
  });
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'three-year-cash-profit').status, 'conflict');
  assert.equal(result.grade, 'A');
  assert.equal(dimension(result, 'cash').status, 'balanced');
});

test('missing required prior or current fields never become zeros or redistributed weights', () => {
  for (const [year, field] of [
    [2025, 'currentPortionDebt'],
    [2024, 'inventory'],
    [2024, 'revenue'],
  ] as const) {
    const run = fixture();
    replace(run, year, { [field]: null });
    const result = deriveCompanyAssessment(run);
    assert.equal(result.grade, 'NR');
    assert.equal(result.score, null);
    assert.equal(result.coverage.fields, result.coverage.requiredFields - 1);
    assert.equal(metric(result, `${year}-${field}`).value, null);
  }
});

test('cash thresholds use exact fractions even when two-decimal displays cross the boundary', () => {
  const run = fixture();
  replace(run, 2025, { netProfit: '10000.00', ocf: '6999.99' });
  const below = deriveCompanyAssessment(run);
  assert.equal(metric(below, 'cash-profit').display[0], '70.00%');
  assert.equal(dimension(below, 'cash').score, 25);
  replace(run, 2025, { ocf: '7000.00' });
  assert.equal(dimension(deriveCompanyAssessment(run), 'cash').score, 60);
  replace(run, 2025, { ocf: '9999.99' });
  assert.equal(dimension(deriveCompanyAssessment(run), 'cash').score, 60);
  replace(run, 2025, { ocf: '10000.00' });
  assert.equal(dimension(deriveCompanyAssessment(run), 'cash').score, 100);
});

test('cash negative and nonpositive profit remain separate signals, not misleading ratios', () => {
  const run = fixture();
  replace(run, 2025, { netProfit: '-100.00', ocf: '50.00' });
  let result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'cash-profit').status, 'not-applicable');
  assert.equal(metric(result, 'cash-profit').value, null);
  assert.equal(dimension(result, 'profitability').score, 0);
  assert.equal(dimension(result, 'cash').score, 60);
  replace(run, 2025, { ocf: '-0.01' });
  result = deriveCompanyAssessment(run);
  assert.equal(dimension(result, 'cash').score, 0);
  replace(run, 2025, { netProfit: '0.00', ocf: '0.00' });
  result = deriveCompanyAssessment(run);
  assert.equal(dimension(result, 'profitability').score, 25);
  assert.equal(dimension(result, 'cash').score, 25);
});

test('growth rejects nonpositive denominators and compares the decline threshold without rounding', () => {
  const run = fixture();
  replace(run, 2024, { revenue: '0.00' });
  let result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'revenue-growth').status, 'not-applicable');
  assert.equal(result.grade, 'NR');
  replace(run, 2024, { revenue: '10000.00' });
  replace(run, 2025, { revenue: '9000.00' });
  assert.equal(dimension(deriveCompanyAssessment(run), 'profitability').score, 60);
  replace(run, 2025, { revenue: '8999.99' });
  result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'revenue-growth').value, '-10.00');
  assert.equal(dimension(result, 'profitability').score, 25);
});

test('zero short-debt subtotal is not Infinity or a declaration that the company has no debt', () => {
  const run = fixture();
  replace(run, 2025, { shortLoan: '0.00', currentPortionDebt: '0.00', totalLiabilities: '800.00' });
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'cash-short-debt').status, 'not-applicable');
  assert.equal(dimension(result, 'solvency').score, 25);
  assert.match(dimension(result, 'solvency').ruleSummary[0], /其他偿付责任/);
  assert.equal(result.grade, 'C');
});

test('invalid balance-sheet denominators and negative debt balances withhold the grade', () => {
  for (const overrides of [
    { totalAssets: '0.00' },
    { totalAssets: '-1.00' },
    { shortLoan: '-1.00' },
    { cash: '-1.00' },
    { inventory: '-1.00' },
  ]) {
    const run = fixture();
    replace(run, 2025, overrides);
    const result = deriveCompanyAssessment(run);
    assert.equal(result.grade, 'NR');
    assert.equal(result.score, null);
  }
});

test('working-capital change uses percentage points with exact boundary tests', () => {
  const run = fixture();
  replace(run, 2024, { revenue: '1000.00', receivables: '100.00', inventory: '100.00' });
  replace(run, 2025, { revenue: '1000.00', receivables: '200.00', inventory: '100.00' });
  let result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'working-capital-change').display[0], '10.00 个百分点');
  assert.equal(dimension(result, 'workingCapital').score, 60);
  replace(run, 2025, { receivables: '200.01' });
  result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'working-capital-change').display[0], '10.00 个百分点');
  assert.equal(dimension(result, 'workingCapital').score, 25);
});

test('three-year ratio requires each consecutive annual period and does not skip a missing year', () => {
  const run = fixture();
  run.context!.financials = [row(2021), row(2024), row(2025)];
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, 'three-year-cash-profit').value, null);
  assert.equal(metric(result, 'three-year-cash-profit').status, 'missing');
  assert.equal(result.grade, 'A');
});

test('large integer-cent amounts retain exact accuracy and cannot change a threshold through Number conversion', () => {
  const run = fixture();
  replace(run, 2025, { netProfit: '9007199254740993.01', ocf: '9007199254740993.00' });
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, '2025-netProfit').value, '9007199254740993.01');
  assert.equal(metric(result, 'cash-profit').value, '100.00');
  assert.equal(dimension(result, 'cash').score, 60);
});

test('bank/insurance and unsupported issuers are not rated using general-industry thresholds', () => {
  const run = fixture();
  run.context!.profile.industry = '银行';
  assert.equal(deriveCompanyAssessment(run).grade, 'NR');
  run.context!.profile.industry = '保险';
  assert.equal(deriveCompanyAssessment(run).grade, 'NR');
  run.context!.profile.industry = '汽车零部件';
  run.identity!.exchange = 'bse';
  assert.equal(deriveCompanyAssessment(run).grade, 'NR');
});

test('industry comparisons need same company/year and at least five peers per metric', () => {
  const run = fixture();
  run.industry = { '2025-12-31': peers(4) };
  assert.equal(dimension(deriveCompanyAssessment(run), 'industry').metricIds.length, 0);
  run.industry['2025-12-31'] = peers();
  let result = deriveCompanyAssessment(run);
  assert.equal(dimension(result, 'industry').metricIds.length, 12);
  assert.equal(metric(result, 'industry-grossMargin-median').value, '28.00');
  assert.equal(result.score, 90);
  run.industry['2025-12-31'].period = '2024-12-31';
  result = deriveCompanyAssessment(run);
  assert.equal(dimension(result, 'industry').metricIds.length, 0);
  assert.equal(result.coverage.peers, 0);
});

test('headlines and news volume do not lower the score, while read excerpt scope is preserved', () => {
  const run = fixture();
  for (let i = 0; i < 30; i++) {
    run.context!.announcements.push({
      id: String(i),
      title: '关于诉讼的公告',
      date: '2026-09-01',
      url: `https://static.cninfo.com.cn/${i}.PDF`,
      sources: [],
      category: '司法',
      attention: 'high',
      matched: '诉讼',
      meaning: '需核对公司角色',
      nextQuestion: '案件进展？',
      ...(i === 29
        ? {
            excerpt: {
              page: 1,
              quote: '公司在本案中作为原告。',
              url: 'https://static.cninfo.com.cn/29.PDF',
              sha256: 'hash',
              pagesRead: 3,
            },
          }
        : {}),
    });
    run.context!.news.push({
      title: '关于诉讼的新闻',
      date: '2026-09-01',
      media: '媒体',
      url: `https://finance.sina.com.cn/${i}`,
      provider: '新浪财经',
      digest: '媒体线索',
    });
  }
  const result = deriveCompanyAssessment(run);
  assert.equal(result.score, 90);
  assert.equal(result.coverage.disclosures, 20);
  assert.equal(result.coverage.news, 30);
  assert.equal(result.coverage.excerpts, 1);
  assert.equal(
    result.evidence.find((item) => item.id === 'disclosure-29')!.sourceQuality,
    'excerpt'
  );
  assert.equal(result.evidence.find((item) => item.id === 'disclosure-29')!.page, 1);
  assert.equal(dimension(result, 'events').score, null);
});

test('public payload is constructed from allowed data and cannot include private run/candidate fields', () => {
  const run = fixture();
  Object.assign(run, {
    privatePlan: 'PRIVATE_PAYMENT_PLAN',
    ownerId: 'PRIVATE_ACCOUNT_ID',
    preview: {
      material: {
        title: 'PRIVATE_UPLOADED_TITLE',
        observations: [{ value: 'PRIVATE_OBSERVATION' }],
      },
    },
  });
  run.trace.push({
    id: 'private-trace',
    tool: 'internal',
    label: 'PRIVATE_TRACE',
    status: 'completed',
    startedAt: run.createdAt,
    inputSummary: 'PRIVATE_INPUT',
    outputSummary: 'PRIVATE_OUTPUT',
    sources: [],
  });
  Object.assign(run.context!, { uploadedBody: 'PRIVATE_BODY' });
  Object.assign(run.context!.profile, { accountNote: 'PRIVATE_PROFILE_KEY' });
  const payload = buildAssessmentPublicPayload(run);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /PRIVATE_|private-run-id|private-trace/);
  assert.equal(payload.company, '松原安全');
  assert.equal(payload.year, 2025);
  assert.equal(payload.grade, 'A');
  assert.equal(payload.publicObservationDates.latestFinancialPeriod, '2025-12-31');
});

test('amounts without any public provenance are withheld and private URL credentials are excluded', () => {
  const run = fixture();
  run.context!.sources = [];
  run.context!.financials.forEach(
    (item) => (item.sourceUrls = ['https://private:password@example.com/report'])
  );
  const result = deriveCompanyAssessment(run);
  assert.equal(result.grade, 'NR');
  assert.equal(result.coverage.fields, 0);
  assert.doesNotMatch(JSON.stringify(result), /private:password/);
  assert.equal(metric(result, '2025-netProfit').value, null);
});

test('failed table receipts cannot be bypassed using a stale row URL with retained amounts', () => {
  const run = fixture();
  run.context!.sources[0]!.status = 'error';
  run.context!.financials.forEach((item) => (item.fieldSources.netProfit = '东方财富'));
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, '2025-netProfit').value, null);
  assert.equal(result.grade, 'NR');
  assert.equal(
    result.evidence.some((item) => item.id === 'financial-2025-netProfit'),
    false
  );
});

test('optional full statement amounts and ratios enrich analysis without changing the four-dimension grade', () => {
  const run = fixture();
  replace(run, 2025, {
    salesCash: '1320.00',
    currentAssets: '800.00',
    currentLiabilities: '400.00',
    deductedProfit: '190.00',
    financingCash: '-30.00',
  });
  run.context!.sources.push({
    ...run.context!.sources[0]!,
    id: 'em-ratios',
    dimension: '财务报表 · ratios',
    url: 'https://datacenter.eastmoney.com/ratios',
  });
  const result = deriveCompanyAssessment(run);
  assert.equal(metric(result, '2025-deductedProfit').value, '190.00');
  assert.equal(metric(result, '2025-financingCash').value, '-30.00');
  assert.equal(metric(result, 'current-ratio').value, '2.00');
  assert.equal(metric(result, 'quick-ratio').value, '1.75');
  assert.equal(metric(result, 'sales-cash-revenue').value, '110.00');
  assert.match(metric(result, 'sales-cash-revenue').formula[0], /不是销售收款率/);
  assert.equal(metric(result, '2025-grossMargin').value, '40.00');
  assert.equal(result.score, 90);
});

test('a weak cash dimension caps an otherwise A arithmetic score at C without rewriting the score', () => {
  const run = fixture();
  replace(run, 2025, { netProfit: '200.00', ocf: '10.00' });
  const result = deriveCompanyAssessment(run);
  assert.equal(result.score, 81.25);
  assert.equal(dimension(result, 'cash').score, 25);
  assert.equal(result.grade, 'C');
  assert.match(result.ratingConstraints![0]![0], /经营现金质量/);
  assert.match(result.ratingConstraints![0]![0], /最高为 C/);
  assert.deepEqual(
    buildAssessmentPublicPayload(run, result).ratingConstraints,
    result.ratingConstraints
  );
});

test('two weak core dimensions cap an otherwise B arithmetic score at D', () => {
  const run = fixture();
  replace(run, 2025, { ocf: '10.00', receivables: '500.00', inventory: '100.00' });
  const result = deriveCompanyAssessment(run);
  assert.equal(dimension(result, 'cash').score, 25);
  assert.equal(dimension(result, 'workingCapital').score, 25);
  assert.equal(result.score, 62.5);
  assert.equal(result.grade, 'D');
  assert.match(result.ratingConstraints![0]![0], /经营现金质量、营运占用/);
  assert.match(result.ratingConstraints![0]![0], /最高为 D/);
});

test('the grade cap uses strictly below 40 and does not improve an already weaker grade', () => {
  const boundary = [
    { id: 'cash' as const, score: 40 },
    { id: 'profitability' as const, score: 100 },
    { id: 'solvency' as const, score: 100 },
    { id: 'workingCapital' as const, score: 100 },
  ];
  assert.deepEqual(resolveAssessmentRating(85, boundary), { grade: 'A', ratingConstraints: [] });
  assert.equal(
    resolveAssessmentRating(84.9975, [{ ...boundary[0]!, score: 39.99 }, ...boundary.slice(1)])
      .grade,
    'C'
  );
  assert.equal(resolveAssessmentRating(30, [{ id: 'cash', score: 25 }]).grade, 'D');
  assert.deepEqual(resolveAssessmentRating(null, boundary), { grade: 'NR', ratingConstraints: [] });
});
