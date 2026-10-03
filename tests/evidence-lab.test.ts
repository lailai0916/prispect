import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompanyEvidenceLab,
  buildExampleEvidenceLab,
  buildReportEvidenceLab,
  evidenceLabSourceHref,
  evaluateEvidenceLab,
  highlightEvidenceLab,
  type EvidenceLabGraph,
} from '../shared/evidence-lab.js';
import type { CompanyResearchRun, Material, Report } from '../shared/contracts.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';

const samples = await seeds(process.cwd());
const songyuan = samples.materials[0]!;
function report(
  material: Material = songyuan,
  excludedMetrics: Parameters<typeof analyze>[0]['excludedMetrics'] = []
): Report {
  return analyze(
    {
      company: material.company,
      title: 'Evidence trial',
      year: 2025,
      materialIds: [material.id],
      excludedMetrics,
    },
    [material]
  );
}
function row(
  year: number,
  values: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      netProfit: '200.00',
      ocf: '20.00',
      revenue: year === 2025 ? '1200.00' : '1000.00',
      inventory: year === 2025 ? '150.00' : '100.00',
      receivables: year === 2025 ? '130.00' : '100.00',
      ...values,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [`https://datacenter.eastmoney.com/report?year=${year}`],
    originalUrl: `https://static.cninfo.com.cn/finalpage/${year}.PDF`,
  };
}
function company(): CompanyResearchRun {
  return {
    id: 'run-not-to-copy',
    input: { securityCode: '300893', orgId: 'gssz0300893', year: 2025 },
    identity: {
      securityCode: '300893',
      orgId: 'gssz0300893',
      shortName: '松原安全',
      companyName: songyuan.company,
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'gssz0300893',
      companyName: songyuan.company,
      fetchedAt: '2026-10-03T00:00:00.000Z',
      status: 'partial',
      financials: [row(2024), row(2025)],
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
function node(graph: EvidenceLabGraph, id: string) {
  const item = graph.nodes.find((item) => item.id === id);
  assert.ok(item, `node ${id} exists`);
  return item;
}

test('company lab fixes issuer, selected annual consolidated scope and exact public amounts', () => {
  const run = company();
  run.context!.financials.push(row(2026, { netProfit: '9999.00' }), {
    ...row(2025, { netProfit: '7777.00' }),
    period: '2025-09-30',
    annual: false,
  });
  run.context!.financials.find((item) => item.period === '2025-12-31')!.amounts.parentProfit =
    '999.00';
  const graph = buildCompanyEvidenceLab(run);
  assert.equal(graph.year, 2025);
  assert.equal(graph.basis, 'consolidated');
  assert.equal(graph.origin, 'public-web');
  assert.equal(node(graph, 'fact-2025-netProfit').value, '200.00');
  assert.equal(node(graph, 'fact-2025-ocf').value, '20.00');
  assert.equal(node(graph, 'calc-cash-profit').value, '10.00');
  assert.equal(node(graph, 'calc-profit-cash-gap').value, '180.00');
  assert.equal(node(graph, 'calc-revenue-growth').value, '20.00');
  assert.equal(node(graph, 'calc-inventory-balance-change').value, '50.00');
  assert.equal(node(graph, 'calc-receivables-balance-change').value, '30.00');
  assert.match(node(graph, 'calc-inventory-balance-change').detail[0], /不是现金流补充表/);
  assert.ok(
    graph.nodes
      .filter((item) => item.kind === 'fact')
      .every((item) => item.sourceRefs.every((ref) => ref.sourceQuality === 'web'))
  );
  assert.equal(
    graph.nodes.some((item) => item.id === 'calc-cash-bridge'),
    false
  );
});

test('withdrawing inventory pauses only its dependent paths and leaves independent collection facts readable', () => {
  const baseline = buildCompanyEvidenceLab(company());
  const original = JSON.stringify(baseline);
  const trial = evaluateEvidenceLab(baseline, ['fact-2025-inventory']);
  assert.equal(node(trial, 'fact-2025-inventory').state, 'withdrawn');
  assert.equal(node(trial, 'fact-2025-inventory').value, null);
  assert.equal(node(trial, 'calc-inventory-balance-change').state, 'paused');
  assert.equal(node(trial, 'calc-inventory-balance-change').value, null);
  assert.equal(node(trial, 'hypothesis-expansion').state, 'paused');
  assert.equal(node(trial, 'hypothesis-inventory-pressure').state, 'paused');
  assert.equal(node(trial, 'hypothesis-collection-pressure').state, 'available');
  assert.equal(node(trial, 'fact-2025-receivables').value, '130.00');
  assert.equal(node(trial, 'calc-cash-profit').value, '10.00');
  const material = trial.nodes.find(
    (item) => item.kind === 'material' && item.hypothesisId === 'expansion'
  )!;
  assert.equal(material.materialStatus, 'needed');
  assert.equal(material.state, 'available');
  assert.equal(trial.edges.find((edge) => edge.to === material.id)!.state, 'paused');
  assert.equal(JSON.stringify(baseline), original);
  assert.deepEqual(evaluateEvidenceLab(trial, []), baseline);
});

test('withdrawing profit pauses ratios, cash differences and hypotheses without removing inventory balances', () => {
  const graph = evaluateEvidenceLab(buildCompanyEvidenceLab(company()), ['fact-2025-netProfit']);
  for (const id of [
    'calc-cash-profit',
    'calc-profit-cash-gap',
    'hypothesis-expansion',
    'hypothesis-inventory-pressure',
    'hypothesis-collection-pressure',
  ]) {
    assert.equal(node(graph, id).state, 'paused');
    assert.equal(node(graph, id).value, null);
  }
  assert.equal(node(graph, 'calc-inventory-balance-change').value, '50.00');
  assert.equal(node(graph, 'calc-revenue-growth').value, '20.00');
  assert.match(node(graph, 'calc-cash-profit').reason![0], /净利润/);
});

test('missing and source conflicts remain unknown after trial withdrawal and restoration', () => {
  const run = company();
  run.context!.financials[0]!.amounts.inventory = null;
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'ocf',
    primary: '20.00',
    secondary: '21.00',
    difference: '-1.00',
    matches: false,
  });
  const baseline = buildCompanyEvidenceLab(run);
  assert.equal(node(baseline, 'calc-inventory-balance-change').state, 'missing');
  assert.equal(node(baseline, 'fact-2025-ocf').state, 'conflict');
  assert.equal(node(baseline, 'calc-cash-profit').value, null);
  const restored = evaluateEvidenceLab(evaluateEvidenceLab(baseline, ['fact-2025-ocf']), []);
  assert.equal(node(restored, 'fact-2025-ocf').state, 'conflict');
  assert.equal(node(restored, 'calc-inventory-balance-change').value, null);
  assert.deepEqual(restored, baseline);
});

test('nonpositive bases preserve exact amount differences but withhold ratios', () => {
  const run = company();
  Object.assign(run.context!.financials[1]!.amounts, { netProfit: '0.00', ocf: '-3.00' });
  run.context!.financials[0]!.amounts.revenue = '-1000.00';
  const graph = buildCompanyEvidenceLab(run);
  assert.equal(node(graph, 'calc-cash-profit').state, 'not-applicable');
  assert.equal(node(graph, 'calc-cash-profit').value, null);
  assert.equal(node(graph, 'calc-revenue-growth').state, 'not-applicable');
  assert.equal(node(graph, 'calc-profit-cash-gap').value, '3.00');
  for (const item of graph.nodes.filter((item) => item.kind === 'hypothesis')) {
    assert.equal(item.state, 'not-applicable');
    assert.match(item.detail[0], /未形成正利润/);
    assert.doesNotMatch(item.reason![0], /分母/);
  }
});

test('cash at or above positive profit makes low-cash hypotheses inapplicable without hiding material requests', () => {
  for (const cash of ['200.00', '200.01']) {
    const run = company();
    run.context!.financials[1]!.amounts.ocf = cash;
    const graph = buildCompanyEvidenceLab(run);
    for (const item of graph.nodes.filter((item) => item.kind === 'hypothesis')) {
      assert.equal(item.state, 'not-applicable');
      assert.match(item.detail[0], /未形成正利润/);
      assert.doesNotMatch(item.detail[0], /待检验解释/);
    }
    assert.ok(
      graph.nodes
        .filter((item) => item.kind === 'material')
        .every((item) => item.materialStatus === 'needed' && item.state === 'available')
    );
    assert.equal(node(graph, 'calc-profit-cash-gap').value, cash === '200.00' ? '0.00' : '-0.01');
    const withdrawn = evaluateEvidenceLab(graph, ['fact-2025-netProfit']);
    assert.equal(node(withdrawn, 'hypothesis-expansion').state, 'paused');
    assert.deepEqual(evaluateEvidenceLab(withdrawn, []), graph);
  }
  const oneCentLower = company();
  oneCentLower.context!.financials[1]!.amounts.ocf = '199.99';
  const applicable = buildCompanyEvidenceLab(oneCentLower);
  assert.equal(node(applicable, 'calc-cash-profit').value, '100.00');
  assert.equal(node(applicable, 'hypothesis-expansion').state, 'available');
});

test('original strong-cash and nonpositive-profit reports never claim low-cash causes', () => {
  const strong = buildReportEvidenceLab(report(samples.materials[1]!));
  assert.equal(node(strong, 'calc-cash-profit').value, '164.18');
  assert.ok(
    strong.nodes
      .filter((item) => item.kind === 'hypothesis')
      .every((item) => item.state === 'not-applicable' && item.detail[0].includes('未形成正利润'))
  );
  for (const profit of ['0.00', '-100.00']) {
    const original = structuredClone(songyuan);
    for (const observation of original.observations.filter((item) => item.year === 2025)) {
      if (observation.key === 'netProfit') observation.value = profit;
      if (observation.key === 'operatingCashFlow') observation.value = '-200.00';
      observation.quote = `Synthetic scope fixture: 2025 ${observation.key} ${observation.value} CNY.`;
    }
    const graph = buildReportEvidenceLab(report(original));
    assert.equal(
      node(graph, 'calc-profit-cash-gap').value,
      profit === '0.00' ? '200.00' : '100.00'
    );
    assert.equal(node(graph, 'calc-cash-profit').state, 'not-applicable');
    assert.ok(
      graph.nodes
        .filter((item) => item.kind === 'hypothesis')
        .every((item) => item.state === 'not-applicable')
    );
  }
});

test('one-cent differences above floating-point safe precision remain exact', () => {
  const run = company();
  run.context!.financials[1]!.amounts.inventory = '90071992547409.92';
  run.context!.financials[0]!.amounts.inventory = '90071992547409.91';
  assert.equal(node(buildCompanyEvidenceLab(run), 'calc-inventory-balance-change').value, '0.01');
});

test('foreign issuer, unsupported financial institutions and invalid sources cannot supply adopted facts', () => {
  const wrong = company();
  wrong.context!.securityCode = '600000';
  wrong.context!.companyName = '另一家公司的名字';
  const graph = buildCompanyEvidenceLab(wrong);
  assert.equal(graph.company, songyuan.company);
  assert.ok(
    graph.nodes.filter((item) => item.kind === 'fact').every((item) => item.value === null)
  );
  assert.equal(node(graph, 'fact-2025-netProfit').state, 'conflict');
  const bank = company();
  bank.context!.profile.industry = '银行';
  assert.equal(node(buildCompanyEvidenceLab(bank), 'fact-2025-netProfit').value, null);
  const invalid = company();
  invalid.context!.financials.forEach(
    (period) => (period.sourceUrls = ['javascript:alert(1)', 'https://user:password@example.com/'])
  );
  assert.equal(node(buildCompanyEvidenceLab(invalid), 'fact-2025-netProfit').state, 'missing');
});

test('public graph excludes run IDs, user notes, uploaded previews, questions and model narrative', () => {
  const run = company() as CompanyResearchRun & { ownerNote: string };
  run.ownerNote = 'DO_NOT_COPY_PRIVATE_NOTE';
  run.questions = [
    {
      question: 'DO_NOT_COPY_PRIVATE_QUESTION',
      text: 'private',
      citations: [],
      mode: 'rules',
      createdAt: run.createdAt,
      snapshotFetchedAt: run.createdAt,
    },
  ];
  const result = JSON.stringify(buildCompanyEvidenceLab(run));
  assert.doesNotMatch(result, /DO_NOT_COPY|run-not-to-copy/);
});

test('original report lab uses exact signed adjustments, original pages and checked cash bridge', () => {
  const graph = buildReportEvidenceLab(report());
  assert.equal(graph.origin, 'original-report');
  assert.equal(node(graph, 'fact-2025-netProfit').value, '366373098.93');
  assert.equal(node(graph, 'fact-2025-ocf').value, '26197123.70');
  assert.equal(node(graph, 'calc-cash-profit').value, '7.15');
  assert.equal(node(graph, 'calc-profit-cash-gap').value, '340175975.23');
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').value, '-321030062.96');
  assert.equal(node(graph, 'fact-2025-receivablesAdjustment').value, '-514221076.54');
  assert.equal(node(graph, 'calc-cash-bridge').value, '0.00');
  assert.equal(node(graph, 'calc-netProfit-growth').value, '40.70');
  assert.equal(node(graph, 'calc-ocf-growth').value, '-81.22');
  assert.equal(node(graph, 'fact-2025-netProfit').sourceRefs[0]!.page, 190);
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').sourceRefs[0]!.page, 191);
  assert.ok(
    node(graph, 'calc-cash-bridge').sourceRefs.some((ref) => ref.quote?.includes('合并净利润'))
  );
  assert.ok(
    node(graph, 'calc-cash-bridge').sourceRefs.some((ref) =>
      ref.quote?.includes('经营活动产生的现金流量净额')
    )
  );
  assert.ok(
    node(graph, 'calc-cash-bridge').sourceRefs.some((ref) => ref.quote?.includes('资产减值准备'))
  );
  assert.ok(node(graph, 'fact-2024-ocf').sourceRefs.every((ref) => ref.quote?.includes('2024')));
  assert.ok(
    graph.nodes
      .filter((item) => item.kind === 'hypothesis')
      .every((item) => item.detail[0].includes('待检验') && item.value === null)
  );
});

function retainedUpload(): Material {
  const material = structuredClone(songyuan);
  material.id = 'owned-material-001';
  material.uploadId = 'owned-upload-001';
  material.filename = 'retained-original.json';
  material.origin = 'user-upload';
  delete material.sourceUrl;
  delete material.rawSourceId;
  return material;
}

test('saved checks can cite the retained owning-account original without fabricating a public URL', () => {
  const saved = report(retainedUpload());
  const before = JSON.stringify(saved);
  const graph = buildReportEvidenceLab(saved);
  const fact = node(graph, 'fact-2025-netProfit');
  assert.equal(fact.value, '366373098.93');
  assert.equal(node(graph, 'calc-cash-bridge').value, '0.00');
  assert.equal(fact.sourceRefs[0]!.url, '/api/materials/owned-material-001/file');
  assert.deepEqual(fact.sourceRefs[0]!.retainedOriginal, { kind: 'upload', isPdf: false });
  assert.match(fact.sourceRefs[0]!.quote!, /合并净利润/);
  assert.equal(
    evidenceLabSourceHref(fact.sourceRefs[0]!),
    '/api/materials/owned-material-001/file'
  );
  assert.equal(JSON.stringify(saved), before);
  const trial = evaluateEvidenceLab(graph, ['fact-2025-netProfit']);
  assert.equal(node(trial, 'calc-profit-cash-gap').state, 'paused');
  assert.equal(node(trial, 'fact-2025-ocf').value, '26197123.70');
});

test('a retained locator needs matching saved material, company, upload and digest; it never re-adopts raw observations', () => {
  const original = report(retainedUpload());
  for (const update of [
    (saved: Report) => {
      saved.snapshot = [];
    },
    (saved: Report) => {
      saved.snapshot[0]!.id = 'different-material';
    },
    (saved: Report) => {
      saved.snapshot[0]!.company = 'Different issuer';
    },
    (saved: Report) => {
      delete saved.snapshot[0]!.uploadId;
    },
    (saved: Report) => {
      saved.snapshot[0]!.sha256 = 'missing-digest';
    },
    (saved: Report) => {
      saved.snapshot[0]!.uploadId = '../foreign-upload';
    },
  ]) {
    const saved = structuredClone(original);
    update(saved);
    assert.equal(node(buildReportEvidenceLab(saved), 'fact-2025-netProfit').state, 'missing');
  }
  const excluded = buildReportEvidenceLab(report(retainedUpload(), ['inventoryAdjustment']));
  assert.equal(node(excluded, 'fact-2025-inventoryAdjustment').value, null);
  assert.equal(node(excluded, 'calc-cash-bridge').value, null);
  const conflicting = structuredClone(original);
  conflicting.checks.find((check) => check.id === 'subject')!.status = 'fail';
  assert.equal(node(buildReportEvidenceLab(conflicting), 'fact-2025-netProfit').state, 'conflict');
  const noExcerpt = structuredClone(original);
  noExcerpt.checks.find((check) => check.id === '2025-netProfit')!.sourceRefs[0]!.quote = '';
  assert.equal(node(buildReportEvidenceLab(noExcerpt), 'fact-2025-netProfit').value, null);
});

test('original source links restrict local endpoints and add PDF pages without interpreting uploads as public sources', () => {
  const material = retainedUpload();
  material.filename = 'retained-original.pdf';
  const source = node(buildReportEvidenceLab(report(material)), 'fact-2025-netProfit')
    .sourceRefs[0]!;
  assert.equal(evidenceLabSourceHref(source), '/api/materials/owned-material-001/file#page=190');
  for (const url of [
    '//example.org/api/materials/owned-material-001/file',
    '/api/materials/../foreign/file',
    '/api/materials/owned-material-001/file?redirect=https://example.org',
    '/api/materials/owned-material-001/file#page=1',
    '/api/sources/foreign/pdf',
    'https://example.org/api/materials/owned-material-001/file',
    'javascript:alert(1)',
  ])
    assert.equal(evidenceLabSourceHref({ ...source, url }), undefined, url);
  assert.equal(evidenceLabSourceHref({ ...source, retainedOriginal: undefined }), undefined);
  assert.equal(
    evidenceLabSourceHref({ ...source, page: -1 }),
    '/api/materials/owned-material-001/file'
  );
  assert.equal(
    evidenceLabSourceHref({ ...source, page: 1.5 }),
    '/api/materials/owned-material-001/file'
  );
  const publicSource = node(buildReportEvidenceLab(report()), 'fact-2025-netProfit').sourceRefs[0]!;
  assert.match(evidenceLabSourceHref(publicSource)!, /^https:\/\/.+#page=190$/);
  assert.equal(
    evidenceLabSourceHref({ ...publicSource, url: 'https://user:password@example.org/' }),
    undefined
  );
});

test('withdrawing original inventory suspends its bridge and two explanations while independent receivables remain', () => {
  const graph = evaluateEvidenceLab(buildReportEvidenceLab(report()), [
    'fact-2025-inventoryAdjustment',
  ]);
  assert.equal(node(graph, 'calc-cash-bridge').state, 'paused');
  assert.equal(node(graph, 'hypothesis-expansion').state, 'paused');
  assert.equal(node(graph, 'hypothesis-inventory-pressure').state, 'paused');
  assert.equal(node(graph, 'hypothesis-collection-pressure').state, 'available');
  assert.equal(node(graph, 'fact-2025-receivablesAdjustment').value, '-514221076.54');
  assert.equal(node(graph, 'calc-cash-profit').value, '7.15');
});

test('original report excludes unadopted metrics and does not restore them from its preserved snapshot', () => {
  const selected = report(songyuan, ['inventoryAdjustment']);
  assert.ok(selected.snapshot[0]!.observations.some((item) => item.key === 'inventoryAdjustment'));
  const graph = buildReportEvidenceLab(selected);
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').state, 'missing');
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').value, null);
  assert.equal(node(graph, 'calc-cash-bridge').value, null);
  assert.equal(node(evaluateEvidenceLab(graph, []), 'hypothesis-expansion').state, 'missing');
});

test('original scope conflicts and failed grouped-original checks withhold the relevant facts and bridge', () => {
  const invalid = structuredClone(songyuan);
  invalid.observations.find((item) => item.key === 'netProfit' && item.year === 2025)!.scope =
    'parent';
  const graph = buildReportEvidenceLab(report(invalid));
  assert.equal(node(graph, 'fact-2025-netProfit').state, 'conflict');
  assert.equal(node(graph, 'calc-cash-profit').value, null);
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').value, '-321030062.96');
  const grouped = structuredClone(songyuan);
  grouped.observations.find(
    (item) => item.key === 'otherAdjustments' && item.year === 2025
  )!.components![0]!.value = '1.00';
  const failure = buildReportEvidenceLab(report(grouped));
  assert.equal(node(failure, 'fact-2025-otherAdjustments').state, 'conflict');
  assert.equal(node(failure, 'calc-cash-bridge').value, null);
});

test('saved issuer and annual checks permit original quotes without a repeated year while missing issuer checks withhold facts', () => {
  const checked = report();
  checked.checks.find((item) => item.id === '2025-inventoryAdjustment')!.sourceRefs[0]!.quote =
    '存货的减少（增加以负号填列）';
  assert.equal(
    node(buildReportEvidenceLab(checked), 'fact-2025-inventoryAdjustment').value,
    '-321030062.96'
  );
  checked.checks = checked.checks.filter((item) => item.id !== 'subject');
  assert.equal(node(buildReportEvidenceLab(checked), 'fact-2025-netProfit').state, 'missing');
  assert.equal(node(buildReportEvidenceLab(checked), 'calc-cash-profit').value, null);
});

test('a numerically wrong bridge never becomes available from retained successful checks', () => {
  const forged = report();
  forged.metrics.find((item) => item.key === 'netProfit')!.value = '366373099.93';
  assert.equal(node(buildReportEvidenceLab(forged), 'calc-cash-bridge').state, 'conflict');
});

test('legacy public examples without adjustments keep those facts missing instead of parsing source prose', () => {
  const original = report();
  const graph = buildExampleEvidenceLab({
    company: songyuan.company,
    year: 2025,
    metrics: original.metrics.filter((item) =>
      ['netProfit', 'operatingCashFlow', 'cashConversion', 'profitGrowth', 'cashGrowth'].includes(
        item.key
      )
    ),
    source: {
      url: songyuan.sourceUrl!,
      title: songyuan.title,
      documentDate: songyuan.documentDate,
      sha256: songyuan.sha256,
    },
  });
  assert.equal(node(graph, 'fact-2025-netProfit').value, '366373098.93');
  assert.equal(node(graph, 'fact-2025-inventoryAdjustment').state, 'missing');
  assert.equal(node(graph, 'calc-cash-bridge').value, null);
  assert.equal(node(graph, 'hypothesis-expansion').state, 'missing');
});

test('public example missing annual/consolidated provenance or safe source refs is withheld', () => {
  const original = report();
  const example = {
    company: songyuan.company,
    year: 2025,
    metrics: original.metrics,
    source: {
      url: songyuan.sourceUrl!,
      title: '2025 母公司报表',
      documentDate: songyuan.documentDate,
      sha256: songyuan.sha256,
    },
  };
  assert.equal(node(buildExampleEvidenceLab(example), 'fact-2025-netProfit').value, null);
  example.source.title = '2025 合并第一季度报表';
  assert.equal(node(buildExampleEvidenceLab(example), 'fact-2025-netProfit').value, null);
  const unsafe = report();
  unsafe.checks
    .find((item) => item.id === '2025-netProfit')!
    .sourceRefs.forEach((ref) => (ref.sourceUrl = 'javascript:alert(1)'));
  assert.equal(node(buildReportEvidenceLab(unsafe), 'fact-2025-netProfit').state, 'missing');
});

test('path highlighting follows ancestors and descendants without adding unrelated sibling facts', () => {
  const graph = buildCompanyEvidenceLab(company());
  const selection = highlightEvidenceLab(graph, 'fact-2025-inventory');
  assert.ok(selection.nodeIds.includes('calc-inventory-balance-change'));
  assert.ok(selection.nodeIds.includes('hypothesis-expansion'));
  assert.ok(selection.nodeIds.includes('hypothesis-inventory-pressure'));
  assert.equal(selection.nodeIds.includes('fact-2025-receivables'), false);
  assert.equal(selection.nodeIds.includes('hypothesis-collection-pressure'), false);
  assert.equal(selection.nodeIds.includes('fact-2024-inventory'), false);
  assert.ok(selection.edgeIds.length > 0);
  assert.deepEqual(highlightEvidenceLab(graph, 'does-not-exist'), { nodeIds: [], edgeIds: [] });
});

test('invalid or nonfact trial selections cannot disable claims or manufacture missing values', () => {
  const graph = buildCompanyEvidenceLab(company());
  assert.deepEqual(
    evaluateEvidenceLab(graph, ['does-not-exist', 'hypothesis-expansion', 'calc-cash-profit']),
    graph
  );
});
