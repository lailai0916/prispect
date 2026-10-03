import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { answerCompanyQuestion, answerCompanyRules } from '../server/company-questions.js';

function annual(year: number, profit = '100000.00', cash = '60000.00'): CompanyContextPeriod {
  const url = (reportName: string) =>
    `https://datacenter.eastmoney.com/api/data/v1/get?reportName=${reportName}&filter=fixture-${year}`;
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '1000000.00',
      netProfit: profit,
      parentProfit: '80000.00',
      ocf: cash,
      cash: '300000.00',
      shortLoan: '100000.00',
      currentPortionDebt: '50000.00',
      inventory: '25000.00',
      receivables: '35000.00',
      totalAssets: '800000.00',
      totalLiabilities: '400000.00',
      currentAssets: '500000.00',
      currentLiabilities: '250000.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 30, roe: 15, revenueGrowth: 25 },
    auditOpinion: null,
    fieldSources: {
      netProfit: '东方财富',
      parentProfit: '东方财富',
      ocf: '东方财富',
      cash: '东方财富',
    },
    sourceUrls: [
      url('RPT_F10_FINANCE_GINCOME'),
      url('RPT_F10_FINANCE_GCASHFLOW'),
      url('RPT_F10_FINANCE_GBALANCE'),
    ],
    originalUrl: null,
  };
}

function research(): CompanyResearchRun {
  const time = '2026-10-03T00:00:00.000Z';
  return {
    id: 'selected-year-question-fixture',
    input: { securityCode: '300893', orgId: 'fixture-org', year: 2025, purpose: 'external' },
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    model: { requested: true, status: 'not-called' },
    trace: [],
    announcements: [],
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: '选年测试公司',
      fetchedAt: time,
      status: 'available',
      financials: [annual(2024, '80000.00', '70000.00'), annual(2025)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}

test('ordinary cash questions answer the selected annual period with only two saved annuals', async () => {
  const run = research();
  const before = structuredClone(run);
  const answer = await answerCompanyQuestion(
    run,
    '本公司利润与经营现金有什么差异？',
    'consolidated',
    true,
    {}
  );
  assert.equal(answer.mode, 'rules-fallback');
  assert.match(answer.text, /2025 年全年/);
  assert.match(answer.text, /合并净利润 100000\.00 元/);
  assert.match(answer.text, /经营现金净额 60000\.00 元/);
  assert.match(answer.text, /差额 40000\.00 元/);
  assert.match(answer.text, /经营现金低于所选利润，现金利润比 60\.00%/);
  assert.doesNotMatch(answer.text, /三年|暂停/);
  assert.equal(answer.citations.length, 2);
  for (const citation of answer.citations) {
    assert.match(citation.label, /2025-12-31/);
    assert.match(citation.url, /fixture-2025/);
    assert.doesNotMatch(citation.url, /GBALANCE/);
  }
  assert.deepEqual(run, before);
});

test('selected year never uses a later annual period, and English ordinary questions are natural English', () => {
  const run = research();
  run.input.year = 2024;
  run.context!.financials.push(annual(2026, '900000.00', '900000.00'));
  const answer = answerCompanyRules(
    run,
    'How do profit and operating cash differ?',
    'consolidated'
  );
  assert.match(answer.text, /2024 annual period/);
  assert.match(answer.text, /CNY 80000\.00/);
  assert.match(answer.text, /CNY 70000\.00/);
  assert.match(answer.text, /profit minus operating cash CNY 10000\.00/);
  assert.match(answer.text, /87\.50%/);
  assert.doesNotMatch(answer.text, /900000|2026|unknown|three consecutive/);
  assert.ok(answer.citations.every((citation) => /fixture-2024/.test(citation.url)));
});

test('explicit three-year questions withhold an incomplete selected-year window instead of borrowing a later year', () => {
  const run = research();
  run.context!.financials.push(annual(2026));
  for (const question of ['近三年的现金利润比如何？', 'Compare cash and profit over 3 years']) {
    const answer = answerCompanyRules(run, question, 'consolidated');
    assert.match(answer.text, /2023–2025/);
    assert.match(answer.text, /缺失|missing/);
    assert.doesNotMatch(answer.text, /60\.00%|2026/);
    assert.ok(answer.citations.every((citation) => !/fixture-2026/.test(citation.url)));
  }
});

test('explicit complete three-year questions sum exactly the selected window and use its actual sources', () => {
  const run = research();
  run.context!.financials.push(
    annual(2023, '20000.00', '10000.00'),
    annual(2026, '999999.00', '0.00')
  );
  const answer = answerCompanyRules(
    run,
    'Compare profit and cash over three consecutive years',
    'consolidated'
  );
  assert.match(answer.text, /2023–2025/);
  assert.match(answer.text, /Consolidated net profit total CNY 200000\.00/);
  assert.match(answer.text, /operating cash total CNY 140000\.00/);
  assert.match(answer.text, /70\.00%/);
  assert.doesNotMatch(answer.text, /999999|2026/);
  assert.equal(answer.citations.length, 9);
  assert.ok(answer.citations.every((citation) => !/fixture-2026/.test(citation.url)));
});

test('ordinary cash comparison requires profit and operating cash, not an unrelated revenue field', () => {
  const run = research();
  run.context!.financials[1]!.amounts.revenue = null;
  assert.match(answerCompanyRules(run, '利润与现金差额', 'consolidated').text, /60\.00%/);
});

test('missing three-year revenue withholds only the ratio while supported profit-cash difference remains', () => {
  const run = research();
  run.context!.financials.push(annual(2023, '20000.00', '10000.00'));
  run.context!.financials[0]!.amounts.revenue = null;
  const answer = answerCompanyRules(run, '近三年的利润与经营现金差异', 'consolidated');
  assert.match(answer.text, /净利润合计 200000\.00 元/);
  assert.match(answer.text, /经营现金净额合计 140000\.00 元/);
  assert.match(answer.text, /差额 60000\.00 元/);
  assert.match(answer.text, /现金利润比暂不计算/);
  assert.doesNotMatch(answer.text, /差额与现金利润比暂不计算|70\.00%/);
});

test('selected-period missing, conflicting, and duplicate-unknown cash stays unknown while independent profit remains', () => {
  for (const scenario of [
    'missing',
    'source-conflict',
    'duplicate-conflict',
    'duplicate-missing',
  ] as const) {
    const run = research();
    if (scenario === 'missing') run.context!.financials[1]!.amounts.ocf = null;
    if (scenario === 'source-conflict')
      run.context!.comparisons.push({
        period: '2025-12-31',
        field: 'ocf',
        primary: '60000.00',
        secondary: '61000.00',
        difference: '-1000.00',
        matches: false,
      });
    if (scenario.startsWith('duplicate'))
      run.context!.financials.push(annual(2025, '100000.00', '61000.00'));
    if (scenario === 'duplicate-missing') run.context!.financials.at(-1)!.amounts.ocf = null;
    const answer = answerCompanyRules(run, '利润与经营现金差异', 'consolidated');
    assert.match(answer.text, /合并净利润 100000\.00 元/);
    assert.match(answer.text, /经营现金净额 未知/);
    assert.match(answer.text, /差额 未知/);
    assert.doesNotMatch(answer.text, /60\.00%|61\.00%/);
  }
});

test('an earlier source conflict does not suppress an independent selected-year comparison', () => {
  const run = research();
  run.context!.comparisons.push({
    period: '2024-12-31',
    field: 'ocf',
    primary: '70000.00',
    secondary: '71000.00',
    difference: '-1000.00',
    matches: false,
  });
  assert.match(answerCompanyRules(run, '利润与经营现金差异', 'consolidated').text, /60\.00%/);
});

test('parent basis uses attributable profit explicitly without substituting consolidated profit', () => {
  const run = research();
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'netProfit',
    primary: '100000.00',
    secondary: '110000.00',
    difference: '-10000.00',
    matches: false,
  });
  const parent = answerCompanyRules(run, '利润与经营现金差异', 'parent');
  assert.match(parent.text, /归母净利润 80000\.00 元/);
  assert.match(parent.text, /合并经营现金净额 60000\.00 元/);
  assert.match(parent.text, /差额 20000\.00 元/);
  assert.match(parent.text, /经营现金 \/ 归母净利润参考比 75\.00%/);
  const consolidated = answerCompanyRules(run, '利润与经营现金差异', 'consolidated');
  assert.match(consolidated.text, /合并净利润 未知/);
  assert.doesNotMatch(consolidated.text, /60\.00%|75\.00%/);
});

test('zero operating cash is retained, while nonpositive profit never produces a cash-to-profit ratio', () => {
  const run = research();
  run.context!.financials[1]!.amounts.ocf = '0.00';
  assert.match(
    answerCompanyRules(run, '利润与经营现金差异', 'consolidated').text,
    /现金利润比 0\.00%/
  );
  for (const profit of ['0.00', '-100000.00']) {
    run.context!.financials[1]!.amounts.netProfit = profit;
    const answer = answerCompanyRules(run, '利润与经营现金差异', 'consolidated');
    assert.match(answer.text, /利润非正，现金利润比不适用/);
    assert.doesNotMatch(answer.text, /NaN|Infinity|现金利润比 [\d-]/);
  }
});

test('missing selected year or foreign snapshot never borrows other financial periods', () => {
  for (const scenario of ['year', 'entity'] as const) {
    const run = research();
    if (scenario === 'year') run.input.year = 2023;
    else run.context!.orgId = 'different-org';
    const answer = answerCompanyRules(run, '利润与经营现金差异', 'consolidated');
    assert.match(answer.text, /净利润 未知/);
    assert.match(answer.text, /经营现金净额 未知/);
    assert.equal(answer.citations.length, 0);
  }
});

test('default profit, debt, inventory and ratio questions use the selected annual year', () => {
  const run = research();
  run.input.year = 2024;
  const newer = run.context!.financials[1]!;
  Object.assign(newer.amounts, {
    cash: '999999.00',
    shortLoan: '333333.00',
    inventory: '222222.00',
    receivables: '111111.00',
    totalLiabilities: '800000.00',
  });
  newer.ratios.grossMargin = 50;
  for (const question of [
    '公司利润多少？',
    '短债覆盖多少？',
    '应收与存货情况？',
    '毛利率和负债率如何？',
  ]) {
    const answer = answerCompanyRules(run, question, 'consolidated');
    assert.match(answer.text, /2024/);
    assert.doesNotMatch(answer.text, /999999|333333|222222|111111|2025/);
    assert.ok(answer.citations.every((citation) => /fixture-2024/.test(citation.url)));
  }
});

test('latest interim questions still expose the requested interim period separately from the selected annual year', () => {
  const run = research();
  run.input.year = 2024;
  const interim = annual(2026, '1234.00', '5678.00');
  interim.period = '2026-06-30';
  interim.annual = false;
  run.context!.financials.push(interim);
  const answer = answerCompanyRules(run, '最新半年报现金情况？', 'consolidated');
  assert.match(answer.text, /2026-06-30 最新非年报快照/);
  assert.match(answer.text, /5678\.00 元/);
});

test('negative short-debt components cannot cancel each other into a reassuring zero total', () => {
  const run = research();
  Object.assign(run.context!.financials[1]!.amounts, {
    shortLoan: '-50000.00',
    currentPortionDebt: '50000.00',
  });
  const answer = answerCompanyRules(run, '短债覆盖多少？', 'consolidated');
  assert.match(answer.text, /短债分项存在负值异常/);
  assert.match(answer.text, /暂停合计与覆盖计算/);
  assert.match(answer.text, /货币资金 300000\.00 元/);
  assert.doesNotMatch(answer.text, /合计为零|覆盖倍数/);
  assert.ok(answer.citations.length > 0);
  assert.ok(answer.citations.every((source) => /fixture-2025/.test(source.url)));
});

test('independently valid zero short-debt components retain the explicit limited-scope zero result', () => {
  const run = research();
  Object.assign(run.context!.financials[1]!.amounts, {
    shortLoan: '0.00',
    currentPortionDebt: '0.00',
  });
  const answer = answerCompanyRules(run, '短债覆盖多少？', 'consolidated');
  assert.match(answer.text, /两项短债字段合计为零/);
  assert.match(answer.text, /不代表没有其他负债/);
  assert.doesNotMatch(answer.text, /负值异常|覆盖倍数/);
});
