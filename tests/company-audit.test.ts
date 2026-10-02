import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAuditOpinion } from '../server/company-audit.js';
import type { CompanyAnnouncement, CompanyIdentity } from '../shared/contracts.js';
import type { CompanyPdfText } from '../server/company-extraction.js';

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
const cover = '测试股份有限公司\n股票代码：300750\n2025年年度报告';
const audit =
  '一、审计意见\n我们审计了测试股份有限公司（以下简称测试公司）的财务报表，包括2025年12月31日的合并及母公司资产负债表，2025年度的合并及母公司利润表、现金流量表及相关财务报表附注。\n我们认为，后附的财务报表在所有重大方面按照企业会计准则编制，公允反映了相关财务状况。\n二、形成审计意见的基础\n其他文本';
const pdf = (pages: string[]): CompanyPdfText => ({
  pages: pages.map((text, index) => ({ page: index + 1, text })),
  total: pages.length,
  sha256: 'a'.repeat(64),
});
const extract = (pages: string[]) => extractAuditOpinion(identity, announcement, pdf(pages), 2025);

test('formal target-period audit paragraphs retain their original source, hash, PDF page and text without an opinion verdict', () => {
  const source = pdf([cover, audit]);
  const result = extractAuditOpinion(identity, announcement, source, 2025);
  assert.equal(result.status, 'located');
  assert.equal(result.requestedYear, 2025);
  assert.deepEqual(result.scope, {
    issuer: 'matched',
    reportYear: 'matched',
    auditPeriod: 'matched',
  });
  assert.equal(result.evidence.length, 1);
  const evidence = result.evidence[0]!;
  assert.equal(evidence.page, 2);
  assert.equal(evidence.sha256, source.sha256);
  assert.equal(evidence.sourceUrl, announcement.sourceUrl);
  assert.equal(evidence.auditedYear, 2025);
  assert.ok(source.pages[1]!.text.includes(evidence.quote));
  assert.ok(!evidence.quote.includes('其他文本'));
  assert.equal('clean' in result, false);
  assert.equal('opinionType' in result, false);
});

test('titles, directories, internal-control opinions and different audit years cannot stand in for a target audit paragraph', () => {
  for (const misleading of [
    '审计意见类型 标准的无保留意见',
    '目录\n一、审计意见 ...... 20\n二、形成审计意见的基础 ...... 21',
    audit.replace(/财务报表/g, '财务报告内部控制'),
    audit.replace(/2025/g, '2024'),
    audit.replace(/测试股份有限公司/g, '另一主体股份有限公司'),
  ]) {
    const result = extract([cover, misleading]);
    assert.equal(result.status, 'unknown', misleading);
    assert.deepEqual(result.evidence, []);
  }
});

test('contradicting cover period or issuer blocks audit evidence rather than borrowing a similar report', () => {
  for (const mismatched of [cover.replace('300750', '300751'), cover.replace('2025', '2024')]) {
    const result = extract([mismatched, audit]);
    assert.equal(result.status, 'unknown');
    assert.ok(Object.values(result.scope).includes('conflict'));
    assert.deepEqual(result.evidence, []);
  }
});

test('unconfirmed issuer or report year preserves only a candidate, and absent explicit audit periods stay unconfirmed', () => {
  const noCode = extract([cover.replace('股票代码：300750\n', ''), audit]);
  assert.equal(noCode.status, 'candidate');
  assert.equal(noCode.scope.issuer, 'unconfirmed');
  assert.equal(noCode.evidence[0]!.auditedYear, 2025);
  const noCoverPeriod = extract([cover.replace('2025年年度报告', '财务报告'), audit]);
  assert.equal(noCoverPeriod.status, 'candidate');
  assert.equal(noCoverPeriod.scope.reportYear, 'unconfirmed');
  const noAuditPeriod = extract([
    cover,
    audit.replace(/2025年12月31日/g, '期末').replace(/2025年度/g, '本期'),
  ]);
  assert.equal(noAuditPeriod.status, 'candidate');
  assert.equal(noAuditPeriod.scope.auditPeriod, 'unconfirmed');
  assert.equal(noAuditPeriod.evidence[0]!.auditedYear, null);
});

test('adjacent-page audit paragraphs preserve separate exact citations, while multiple sections remain candidates', () => {
  const first = audit.slice(0, audit.indexOf('我们认为'));
  const second = audit.slice(audit.indexOf('我们认为'));
  const result = extract([cover, first, second]);
  assert.equal(result.status, 'located');
  assert.deepEqual(
    result.evidence.map((row) => row.page),
    [2, 3]
  );
  assert.ok(first.includes(result.evidence[0]!.quote));
  assert.ok(second.includes(result.evidence[1]!.quote));
  const repeated = extract([cover, audit, audit]);
  assert.equal(repeated.status, 'candidate');
});

test('a disclaimer is located as its source text without becoming a categorical or safety judgment', () => {
  const source = audit
    .replace('一、审计意见', '一、无法表示意见')
    .replace('我们审计了', '我们接受委托，审计')
    .replace(
      '我们认为，后附的财务报表在所有重大方面按照企业会计准则编制，公允反映了相关财务状况。',
      '我们不对后附的财务报表发表审计意见。'
    );
  const result = extract([cover, source]);
  assert.equal(result.status, 'located');
  assert.match(result.evidence[0]!.quote, /无法表示意见/);
  assert.equal('opinionType' in result, false);
});
