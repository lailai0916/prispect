import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMPANY_DIRECTORY_SOURCE,
  directoryFromCninfo,
  matchCompanyDirectory,
  parseCompanyDirectory,
  type CompanyDirectory,
} from '../shared/company-directory.js';

const metadata = { retrievedAt: '2026-10-03T03:29:08.818Z', sha256: 'a'.repeat(64) };
const directory: CompanyDirectory = {
  source: 'cninfo',
  sourceUrl: COMPANY_DIRECTORY_SOURCE,
  ...metadata,
  entries: [
    ['300893', '9900039861', '松原安全'],
    ['600926', '9900006251', '杭州银行'],
    ['601009', 'gssh0601009', '南京银行'],
    ['601398', 'gssh0601398', '工商银行'],
  ],
};

test('public catalog retains issuer IDs and excludes invalid, duplicate and unsupported rows', () => {
  const row = { code: '300893', orgId: '9900039861', zwjc: '松原安全', category: 'A股' };
  const built = directoryFromCninfo(
    {
      stockList: [
        row,
        row,
        { ...row, code: '200001', category: 'B股' },
        { ...row, code: '123456' },
        { ...row, code: '600519', orgId: null },
        { ...row, code: '600926', delisted: true },
        { ...row, code: '601009', delisted: 'true' },
      ],
    },
    metadata
  );
  assert.deepEqual(built?.entries, [['300893', '9900039861', '松原安全']]);
  assert.equal(built?.sha256, metadata.sha256);
  assert.equal(built?.retrievedAt, metadata.retrievedAt);
  assert.equal(directoryFromCninfo({ stockList: [{ ...row, category: 'B股' }] }, metadata), null);
});

test('catalog parsing rejects untrusted provenance or malformed issuer entries', () => {
  for (const value of [
    { ...directory, sourceUrl: 'https://example.com/' },
    { ...directory, retrievedAt: 'unknown' },
    { ...directory, sha256: 'unknown' },
    { ...directory, entries: [['AAPL', 'issuer', 'Apple']] },
    { ...directory, entries: [['300893', '../private', '松原安全']] },
    { ...directory, entries: [['300893', '9900039861', '松原\u0000安全']] },
  ]) {
    assert.equal(parseCompanyDirectory(value), null);
  }
});

test('code and Chinese partial-name lookup normalize input and preserve the official selection', () => {
  for (const query of ['松原', '松 原安全', '３００８９３', ' 300893 ']) {
    const candidate = matchCompanyDirectory(directory, query).candidates[0]!;
    assert.equal(candidate.securityCode, '300893');
    assert.equal(candidate.orgId, '9900039861');
    assert.equal(candidate.companyName, null, 'A short name cannot manufacture a registered name');
  }
  assert.equal(matchCompanyDirectory(directory, '6009').candidates[0]?.shortName, '杭州银行');
  assert.equal(matchCompanyDirectory(directory, '银行').candidates.length, 3);
});

test('matching ranks exact names first and retains ambiguity within the twenty-candidate limit', () => {
  const entries: CompanyDirectory['entries'] = Array.from({ length: 25 }, (_, index) => [
    `600${String(index).padStart(3, '0')}`,
    `issuer${index}`,
    `同名测试${index}`,
  ]);
  entries.push(['601398', 'gssh0601398', '同名测试']);
  const response = matchCompanyDirectory({ ...directory, entries }, '同名测试');
  assert.equal(response.candidates.length, 20);
  assert.equal(response.truncated, true);
  assert.equal(response.candidates[0]?.securityCode, '601398');
  assert.equal(response.candidates[1]?.securityCode, '600000');
});

test('Latin input matches supported names without market inference', () => {
  const withLatinName: CompanyDirectory = {
    ...directory,
    entries: [...directory.entries, ['600000', 'fixture600000', 'ST测试']],
  };
  for (const query of ['ST', 'st', 'ＳＴ']) {
    assert.equal(matchCompanyDirectory(withLatinName, query).candidates[0]?.securityCode, '600000');
  }
});

test('unmatched names and codes return empty candidates regardless of input language', () => {
  for (const query of ['浙江松原汽车安全系统股份有限公司', 'abc', '你好', 'AAPL', 'BRK.B']) {
    assert.deepEqual(matchCompanyDirectory(directory, query).candidates, []);
  }
});

test('bundled public catalog carries real source metadata and known issuer mappings', async () => {
  const bundled = parseCompanyDirectory(
    JSON.parse(await readFile(new URL('../data/company-directory.json', import.meta.url), 'utf8'))
  );
  assert.ok(bundled);
  assert.ok(bundled.entries.length > 6000);
  assert.equal(bundled.sourceUrl, COMPANY_DIRECTORY_SOURCE);
  for (const [code, orgId, name] of [
    ['300893', '9900039861', '松原安全'],
    ['300750', 'GD165627', '宁德时代'],
    ['600519', 'gssh0600519', '贵州茅台'],
    ['600926', '9900006251', '杭州银行'],
  ]) {
    assert.deepEqual(
      bundled.entries.find((entry) => entry[0] === code),
      [code, orgId, name]
    );
  }
});
