import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFinancialCandidates, issuerCodeEvidence } from '../server/company-extraction.js';
import type { CompanyAnnouncement, CompanyIdentity } from '../shared/contracts.js';

test('an unsupported US identity cannot bind A-share labels or produce candidates from a numeric issuer code', () => {
  const pages = [
    {
      page: 1,
      text: [
        '测试发行人股份有限公司',
        '2025年年度报告',
        '证券代码：300750',
        '合并利润表',
        '单位：人民币元',
        '项目2025年度2024年度',
        '五、净利润 100.00 80.00',
        '合并现金流量表',
        '单位：人民币元',
        '项目2025年度2024年度',
        '经营活动产生的现金流量净额 70.00 60.00',
      ].join('\n'),
    },
  ];
  const identity: CompanyIdentity = {
    securityCode: '300750',
    orgId: '300750',
    shortName: '测试发行人',
    companyName: '测试发行人股份有限公司',
    exchange: 'us',
    sourceUrl: 'https://www.sec.gov/',
  };
  const announcement: CompanyAnnouncement = {
    id: 'issuer-scope-fixture',
    title: '2025年年度报告',
    publishedAt: '2026-02-01T00:00:00Z',
    sourceUrl: 'https://www.sec.gov/Archives/fixture.htm',
    category: 'annual',
    reportYear: 2025,
  };
  assert.deepEqual(issuerCodeEvidence(pages, 'us'), []);
  const preview = extractFinancialCandidates(
    identity,
    announcement,
    { pages, total: 1, sha256: 'a'.repeat(64) },
    2025
  );
  assert.deepEqual(preview.material.observations, []);
  assert.equal(preview.checks.find((check) => check.id === 'source-issuer-code')?.status, 'fail');
});
