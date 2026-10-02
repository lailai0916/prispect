import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFinancialCandidates,
  issuerCodeEvidence,
  type CompanyPdfText,
} from '../server/company-extraction.js';
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
const cover = '测试股份有限公司\n股票代码：300750\n2025年年度报告\n报告金额以人民币元、千元列示';

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

test('official-code binding cannot adopt the amounts in another issuer report even when year and consolidated tables match', () => {
  const wrongIssuer = extractFinancialCandidates(
    identity,
    announcement,
    pdf([
      cover.replace('300750', '000001') +
        '\n合并利润表\n单位：人民币元\n项目2025年度2024年度\n五、净利润 1000.00 800.00\n合并现金流量表\n单位：人民币元\n项目2025年度2024年度\n经营活动产生的现金流量净额 700.00 600.00',
    ]),
    2025
  );
  assert.equal(wrongIssuer.material.observations.length, 0);
  assert.equal(
    wrongIssuer.checks.find((check) => check.id === 'source-issuer-code')?.status,
    'fail'
  );
  assert.ok(wrongIssuer.warnings.some((warning) => warning.includes('证券代码')));
});

test('an explicit same-page stock-information table binds only its A-share code column and official exchange', () => {
  // Public factual issuer row: Yili 2025 annual report, PDF p6 (printed p2).
  // https://static.cninfo.com.cn/finalpage/2026-04-30/1225259562.PDF
  // This report was a stopped holdout before this generic layout repair and is now a development sample.
  const stockHeader = '股票种类\t股票上市交易所\t股票简称\t股票代码\t变更前股票简称';
  const stockRow = 'A股\t上海证券交易所\t伊利股份\t600887\t/';
  const stockPage = `五、公司股票简况\n公司股票简况\n${stockHeader}\n${stockRow}`;
  assert.deepEqual(issuerCodeEvidence([{ page: 6, text: stockPage }], 'sse'), [
    { code: '600887', page: 6, quote: `${stockHeader}\n${stockRow}` },
  ]);
  const yili: CompanyIdentity = {
    ...identity,
    securityCode: '600887',
    orgId: 'gssh0600887',
    shortName: '伊利股份',
    companyName: '内蒙古伊利实业集团股份有限公司',
    exchange: 'sse',
  };
  const financialText =
    '合并利润表\n单位：元 币种：人民币\n项目2025年度2024年度\n五、净利润 100.00 80.00';
  const reportPages: CompanyPdfText = {
    ...pdf([]),
    pages: [
      { page: 1, text: '内蒙古伊利实业集团股份有限公司\n2025年年度报告' },
      { page: 6, text: stockPage },
      { page: 86, text: financialText },
    ],
    total: 259,
  };
  const result = extractFinancialCandidates(yili, announcement, reportPages, 2025);
  assert.equal(result.material.observations.length, 2);
  const sourceCheck = result.checks.find((check) => check.id === 'source-issuer-code')!;
  assert.equal(sourceCheck.status, 'pass');
  assert.equal(sourceCheck.sourceRefs?.[0]?.page, 6);
  assert.equal(sourceCheck.sourceRefs?.[0]?.quote, `${stockHeader}\n${stockRow}`);
  const wrongCode = extractFinancialCandidates(
    { ...yili, securityCode: '600886' },
    announcement,
    reportPages,
    2025
  );
  assert.equal(wrongCode.material.observations.length, 0);
  assert.equal(wrongCode.checks.find((check) => check.id === 'source-issuer-code')?.status, 'fail');
  const reordered =
    '公司股票简况\n股票代码  股票简称  股票种类  股票上市交易所\n600887  伊利股份  A股  上海证券交易所';
  assert.equal(issuerCodeEvidence([{ page: 6, text: reordered }], 'sse')[0]?.code, '600887');
});

test('issuer-table evidence rejects wrong cells, titles, page joins, markets, non-A shares and stray numbers', () => {
  const header = '股票种类\t股票上市交易所\t股票简称\t股票代码\t变更前股票简称';
  const row = 'A股\t上海证券交易所\t伊利股份\t600887\t/';
  const table = `公司股票简况\n${header}\n${row}`;
  const rejects = [
    {
      label: 'code in the short-name cell',
      pages: [{ page: 6, text: table.replace(row, 'A股\t上海证券交易所\t600887\t/\t/') }],
      exchange: 'sse',
    },
    {
      label: 'stock table without its title',
      pages: [{ page: 6, text: `${header}\n${row}` }],
      exchange: 'sse',
    },
    {
      label: 'header and row on different pages',
      pages: [
        { page: 6, text: `公司股票简况\n${header}` },
        { page: 7, text: row },
      ],
      exchange: 'sse',
    },
    {
      label: 'title on the preceding page',
      pages: [
        { page: 5, text: '公司股票简况' },
        { page: 6, text: `${header}\n${row}` },
      ],
      exchange: 'sse',
    },
    { label: 'wrong official exchange', pages: [{ page: 6, text: table }], exchange: 'szse' },
    {
      label: 'H-share row',
      pages: [
        { page: 6, text: table.replace(row, 'H股\t香港联合交易所有限公司\t伊利股份\t600887\t/') },
      ],
      exchange: 'sse',
    },
    {
      label: 'B-share row',
      pages: [{ page: 6, text: table.replace(row, 'B股\t上海证券交易所\t伊利股份\t600887\t/') }],
      exchange: 'sse',
    },
    {
      label: 'missing cell cannot shift columns',
      pages: [{ page: 6, text: table.replace(row, 'A股\t上海证券交易所\t600887\t/') }],
      exchange: 'sse',
    },
    {
      label: 'an unrelated later number',
      pages: [{ page: 1, text: '应收款项 600887' }],
      exchange: 'sse',
    },
    {
      label: 'a late-page code is not issuer basics',
      pages: [{ page: 16, text: '股票代码：600887' }],
      exchange: 'sse',
    },
    {
      label: 'inline label cannot join pages',
      pages: [
        { page: 1, text: '股票代码' },
        { page: 2, text: '600887' },
      ],
      exchange: 'sse',
    },
    {
      label: 'seven digits are not a code',
      pages: [{ page: 1, text: '股票代码：6008871' }],
      exchange: 'sse',
    },
    {
      label: 'inline H-share suffix',
      pages: [{ page: 1, text: '股票代码：600887（H股）' }],
      exchange: 'sse',
    },
    {
      label: 'inline H-share prefix',
      pages: [{ page: 1, text: 'H股股票代码：600887' }],
      exchange: 'sse',
    },
  ] as const;
  for (const item of rejects) {
    assert.deepEqual(issuerCodeEvidence([...item.pages], item.exchange), [], item.label);
  }
  assert.equal(
    issuerCodeEvidence(
      [{ page: 8, text: '股票简称 美的集团 股票代码 000333（A 股）、0300（H 股）' }],
      'szse'
    )[0]?.code,
    '000333',
    'an explicit inline A-share code remains supported without adopting its H-share code'
  );
});

test('a cold issuer cash supplement accepts explicit declarative units and signed increases, excluding years and mixed company columns', () => {
  // Public factual rows: Midea 2025 annual report, PDF p234 (printed p233),
  // https://static.cninfo.com.cn/finalpage/2026-03-31/1225065145.PDF
  // sha256 16f95f70527db59dcf2736f276a9479cf7ee917e5f71e4f6cbbe83acbad9f4b6.
  // Runtime extraction has no issuer whitelist or fixture path for this report.
  const midea: CompanyIdentity = {
    ...identity,
    securityCode: '000333',
    orgId: '9900005965',
    shortName: '美的集团',
    companyName: '美的集团股份有限公司',
  };
  const source: CompanyAnnouncement = {
    ...announcement,
    id: '1225065145',
    publishedAt: '2026-03-30T16:00:00Z',
    sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-03-31/1225065145.PDF',
  };
  const header =
    '美的集团股份有限公司\n2025 年度财务报表附注\n(除特别注明外，金额单位为人民币千元)\n233\n四 合并财务报表项目附注(续)\n(64) 现金流量表项目附注(续)\n(h) 现金流量表补充资料\n将净利润调节为经营活动现金流量如下：\n2025 年度 2024 年度';
  const rows = [
    '净利润 44,520,196 38,757,214',
    '加：资产减值损失 1,156,469 1,008,107',
    '信用减值损失 355,860 4,595',
    '折旧和摊销 9,339,695 7,823,840',
    '资产处置损失/(收益) 76,024 (214,895)',
    '公允价值变动收益 (782,358) (1,302,145)',
    '财务收入 (4,396,660) (4,025,866)',
    '投资收益 (1,694,661) (1,442,940)',
    '递延所得税资产的增加 (372,141) (1,556,421)',
    '递延所得税负债的(减少)/增加 (1,017,814) 64,839',
    '存货的减少/(增加) 2,075,064 (15,794,154)',
    '经营性应收项目的增加 (8,112,158) (14,349,722)',
    '经营性应付项目的增加 11,316,620 50,345,636',
    '股份支付及其他 881,794 1,193,484',
    '经营活动产生的现金流量净额 53,345,930 60,511,572',
  ];
  const prefixes = [
    { page: 1, text: '美的集团股份有限公司 2025 年年度报告全文' },
    { page: 8, text: '股票简称 美的集团 股票代码 000333（A 股）、0300（H 股）' },
    {
      page: 135,
      text: '2025 年度合并及公司利润表\n(除特别注明外，金额单位为人民币千元)\n项目 附注 2025年度 2024年度 2025年度 2024年度\n合并 合并 公司 公司\n四、净利润 44,520,196 38,757,214 29,415,131 28,517,064',
    },
  ];
  const candidateFor = (pages: CompanyPdfText['pages']) =>
    extractFinancialCandidates(
      midea,
      source,
      {
        pages: [...prefixes, ...pages],
        total: 276,
        sha256: '16f95f70527db59dcf2736f276a9479cf7ee917e5f71e4f6cbbe83acbad9f4b6',
      },
      2025
    );
  const result = candidateFor([{ page: 234, text: `${header}\n${rows.join('\n')}` }]);
  const metric = (key: string, year = 2025) =>
    result.material.observations.find((row) => row.key === key && row.year === year)!;
  assert.equal(result.material.observations.length, 12);
  assert.equal(metric('netProfit').value, '44520196000.00');
  assert.equal(metric('netProfit', 2024).value, '38757214000.00');
  assert.equal(metric('operatingCashFlow').value, '53345930000.00');
  assert.equal(metric('operatingCashFlow', 2024).value, '60511572000.00');
  assert.equal(metric('receivablesAdjustment').value, '-8112158000.00');
  assert.equal(metric('otherAdjustments').value, '3546208000.00');
  assert.equal(
    metric('otherAdjustments').components?.length,
    10,
    'years are column metadata, not adjustment amounts'
  );
  assert.ok(
    result.material.observations.every(
      (row) => row.page === 234 && row.scope === 'consolidated' && row.unit === 'yuan'
    )
  );
  assert.equal(
    result.checks.find((row) => row.id === 'source-row-reconciliation-2025')?.status,
    'pass'
  );
  assert.equal(
    result.checks.find((row) => row.id === 'source-row-reconciliation-2024')?.status,
    'pass'
  );
  // Perturb the same factual rows into a continuation to verify the boundary.
  // This is a test layout, not a claim that the original p234 spans two pages.
  const continuation = candidateFor([
    { page: 234, text: `${header}\n${rows.slice(0, 8).join('\n')}` },
    {
      page: 235,
      text: `美的集团股份有限公司\n2025 年度财务报表附注\n(除特别注明外，金额单位为人民币千元)\n234\n四 合并财务报表项目附注(续)\n(64) 现金流量表项目附注(续)\n${rows.slice(8).join('\n')}`,
    },
  ]);
  assert.equal(continuation.material.observations.length, 12);
  assert.equal(
    continuation.material.observations.find(
      (row) => row.key === 'operatingCashFlow' && row.year === 2025
    )?.page,
    235
  );
  assert.equal(
    continuation.material.observations.find(
      (row) => row.key === 'otherAdjustments' && row.year === 2025
    )?.components?.length,
    10
  );
  assert.equal(continuation.checks.find((row) => row.id === 'bridge-balance')?.status, 'pass');
  const reversed = candidateFor([
    {
      page: 234,
      text: `${header.replace('2025 年度 2024 年度', '2024 年度 2025 年度')}\n${rows.join('\n')}`,
    },
  ]);
  assert.equal(reversed.material.observations.length, 0);
  const leaked = candidateFor([
    {
      page: 234,
      text: `${header.replace('(64) 现金流量表项目附注(续)', '此前无关的销量表')}\n${rows.join('\n')}`,
    },
  ]);
  assert.equal(
    leaked.material.observations.length,
    0,
    'declarative units in an unrelated table remain unusable'
  );
});
