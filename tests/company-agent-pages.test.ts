import test from 'node:test';
import assert from 'node:assert/strict';
import { companyEvidencePageCandidates } from '../server/company-agent.js';
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

test('actual late supplemental rows and components survive many low-page keyword decoys before the ten-page budget is sorted', () => {
  const pdf: CompanyPdfText = {
    sha256: 'a'.repeat(64),
    total: 201,
    pages: [
      {
        page: 1,
        text: '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告以人民币千元列示',
      },
      ...Array.from({ length: 25 }, (_, index) => ({
        page: index + 2,
        text: '合并利润表\n这是目录与说明，未给出表头和金额',
      })),
      {
        page: 200,
        text: '此前无关表格\n合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10',
      },
      {
        page: 201,
        text: '存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 72 70',
      },
    ],
  };
  const preview = extractFinancialCandidates(identity, announcement, pdf, 2025);
  assert.equal(preview.material.observations.length, 12);
  assert.deepEqual(preview.tablePages, [200, 201]);
  const candidates = companyEvidencePageCandidates(pdf, preview);
  assert.equal(candidates.length, 10);
  assert.ok(candidates.some((page) => page.id === 'p200'));
  assert.ok(candidates.some((page) => page.id === 'p201'));
  assert.match(candidates.find((page) => page.id === 'p200')!.excerpt, /单位：千元/);
  assert.match(candidates.find((page) => page.id === 'p201')!.excerpt, /存货的减少 -20 -10/);
  assert.ok(candidates.every((page) => page.excerpt.length <= 1800));
  assert.deepEqual(
    candidates.map((page) => page.page),
    candidates.map((page) => page.page).sort((a, b) => a - b)
  );
  assert.equal(
    preview.material.observations.find((row) => row.key === 'otherAdjustments')?.components?.[0]
      ?.page,
    200
  );
  assert.equal(preview.checks.find((check) => check.id === 'bridge-balance')?.status, 'fail');
});

test('evidence-linked short text is anchored to the real financial rows rather than an unrelated early cash keyword', () => {
  const pdf: CompanyPdfText = {
    sha256: 'b'.repeat(64),
    total: 200,
    pages: [
      {
        page: 1,
        text: '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告以人民币千元列示',
      },
      {
        page: 200,
        text: `经营活动产生的现金流量净额（此处是前表的标题）\n${'无关讨论'.repeat(800)}\n合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10\n存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 72 70`,
      },
    ],
  };
  const preview = extractFinancialCandidates(identity, announcement, pdf, 2025);
  const candidates = companyEvidencePageCandidates(pdf, preview);
  assert.equal(candidates.length, 1);
  assert.match(candidates[0]!.excerpt, /净利润 100 80/);
  assert.match(candidates[0]!.excerpt, /单位：千元/);
});
