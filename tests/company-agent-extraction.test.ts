import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFinancialCandidates, type CompanyPdfText } from '../server/company-extraction.js';
import type { CompanyAnnouncement, CompanyIdentity } from '../shared/contracts.js';

const identity: CompanyIdentity = {
  securityCode: '300750',
  orgId: 'GD165627',
  shortName: '测试公司',
  companyName: null,
  exchange: 'szse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const announcement: CompanyAnnouncement = {
  id: '15',
  title: '2025年年度报告',
  publishedAt: '2026-03-09T16:00:00Z',
  sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-03-10/15.PDF',
  category: 'annual',
  reportYear: 2025,
};
const pdf = (pages: string[]): CompanyPdfText => ({
  pages: pages.map((text, index) => ({ page: index + 1, text })),
  total: pages.length,
  sha256: 'a'.repeat(64),
});
const cover = '测试股份有限公司\n2025年年度报告\n报告金额以人民币元、千元列示';

test('explicit reversed table columns and unrelated preceding units do not acquire invented year or money metadata', () => {
  const reversed = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n合并利润表\n单位：人民币元\n项目 2024年度 2025年度\n五、净利润 1000.00 2000.00\n合并现金流量表\n单位：人民币元\n项目 2024年度 2025年度\n经营活动产生的现金流量净额 1000.00 2000.00`,
    ]),
    2025
  );
  assert.equal(reversed.material.observations.length, 0);
  assert.ok(reversed.warnings.some((warning) => warning.includes('列顺序')));
  const leaked = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n单位：人民币万元\n此前无关的销量表\n合并利润表\n项目 2025年度 2024年度\n五、净利润 1000.00 2000.00`,
    ]),
    2025
  );
  assert.equal(leaked.material.observations.length, 0);
  const wrongCover = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      cover.replace('2025', '2024') +
        '\n合并利润表\n单位：人民币元\n项目2025年度2024年度\n五、净利润 1000.00 2000.00',
    ]),
    2025
  );
  assert.equal(wrongCover.material.observations.length, 0);
});

test('same supplemental table inherits explicit headers across pages and converts original thousand-yuan integer rows exactly', () => {
  const data = pdf([
    cover,
    `七、合并财务报表项目注释\n67、现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10`,
    `存货的减少（增加以负号填列） -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 72 70`,
  ]);
  const candidate = extractFinancialCandidates(identity, announcement, data, 2025);
  assert.equal(candidate.material.documentDate, '2026-03-10');
  assert.equal(candidate.material.observations.length, 12);
  const obs = (key: string, year = 2025) =>
    candidate.material.observations.find((row) => row.key === key && row.year === year)!;
  assert.equal(obs('netProfit').value, '100000.00');
  assert.equal(obs('operatingCashFlow').value, '72000.00');
  assert.equal(obs('operatingCashFlow').page, 3);
  assert.match(obs('netProfit').quote, /原表单位千元/);
  assert.equal(obs('otherAdjustments').value, '10000.00');
  assert.equal(obs('otherAdjustments').components?.[0]?.value, '10000.00');
  const balance = candidate.checks.find((check) => check.id === 'bridge-balance')!;
  assert.equal(balance.status, 'fail');
  assert.match(
    candidate.checks.find((check) => check.id === 'source-row-reconciliation-2025')!.message,
    /200000/
  );
  assert.equal(
    obs('otherAdjustments').value,
    '10000.00',
    'the grouping never becomes a residual to erase the source discrepancy'
  );
});

test('parent statements, missing continuation and missing unit never become consolidated complete evidence', () => {
  const parent = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n母公司财务报表项目注释\n单位：人民币元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 90.00 80.00\n加：折旧 10.00 10.00\n经营活动产生的现金流量净额 100.00 90.00`,
    ]),
    2025
  );
  assert.equal(parent.material.observations.length, 0);
  const unfinished = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n合并财务报表项目注释\n单位：人民币元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 90.00 80.00\n加：折旧 10.00 10.00`,
    ]),
    2025
  );
  assert.equal(
    unfinished.material.observations.some((row) => row.key === 'otherAdjustments'),
    false
  );
  assert.equal(
    unfinished.material.observations.some((row) => row.key === 'operatingCashFlow'),
    false
  );
  const missing = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n合并现金流量表\n项目2025年度2024年度\n经营活动产生的现金流量净额 100.00 90.00`,
    ]),
    2025
  );
  assert.equal(missing.material.observations.length, 0);
});

test('an unparsed original adjustment row or a later unit change cannot be silently excluded to manufacture a complete grouping', () => {
  const unparsed = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n合并财务报表项目注释\n单位：人民币元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100.00 80.00\n加：折旧 10.00 10.00\n特殊调整 1000.00 2000.00 3000.00\n存货的减少 -20.00 -10.00\n经营性应收项目的减少 -30.00 -20.00\n经营性应付项目的增加 10.00 10.00\n经营活动产生的现金流量净额 70.00 70.00`,
    ]),
    2025
  );
  assert.equal(
    unparsed.material.observations.some((row) => row.key === 'otherAdjustments'),
    false
  );
  assert.match(unparsed.warnings.join(' '), /其余调整行不完整/);
  const changedUnit = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      `${cover}\n合并利润表\n单位：人民币元\n项目 2025年度 2024年度\n五、净利润 100.00 80.00\n单位：人民币万元`,
    ]),
    2025
  );
  assert.equal(changedUnit.material.observations.length, 0);
  assert.match(changedUnit.warnings.join(' '), /不同单位/);
});
