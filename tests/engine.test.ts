import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';
import { fenToYuan, moneyToFen, validateMaterial } from '../server/validation.js';
import { explainWithModel as applyModel, type ModelConfig } from '../server/model.js';
import type { Material } from '../shared/contracts.js';
const fixture = await seeds(process.cwd());
const explainWithModel = (
  report: ReturnType<typeof analyze>,
  config: ModelConfig,
  excludedMetrics: Parameters<typeof analyze>[0]['excludedMetrics'] = []
) => applyModel(report, config, excludedMetrics, true);
function run(
  material: Material,
  excludedMetrics: Parameters<typeof analyze>[0]['excludedMetrics'] = []
) {
  return analyze(
    {
      company: material.company,
      title: '测试',
      year: 2025,
      materialIds: [material.id],
      excludedMetrics,
    },
    [material]
  );
}
const metric = (report: ReturnType<typeof analyze>, key: string) =>
  report.metrics.find((item) => item.key === key)!;

test('two real cases recompute amounts, independent remaining rows and percentages', () => {
  const song = run(fixture.materials[0]!);
  assert.equal(song.verdict, 'attention');
  assert.equal(metric(song, 'cashConversion').value, '7.15');
  assert.equal(metric(song, 'profitGrowth').value, '40.70');
  assert.equal(metric(song, 'cashGrowth').value, '-81.22');
  assert.equal(song.bridge?.length, 6);
  assert.equal(song.checks.find((item) => item.id === 'group-sum')?.status, 'pass');
  const hik = run(fixture.materials[1]!);
  assert.equal(hik.verdict, 'supported');
  assert.equal(metric(hik, 'cashConversion').value, '164.18');
  assert.equal(hik.bridge?.length, 6);
  assert.equal(metric(hik, 'netProfit').value, '15433655239.83');
});
test('paired real-year movement and working-capital adjustments produce a sourced, reversible cross-signal', () => {
  const material = fixture.materials[0]!;
  const complete = run(material);
  const signal = complete.crossSignals?.find((item) => item.id === 'profit-cash-working-capital');
  assert.ok(signal);
  assert.equal(signal.facts.length, 6);
  assert.ok(signal.facts.every((fact) => fact.sourceRefs.length > 0));
  assert.match(signal.reading.zh, /不是违约或造假的证据/);
  assert.ok(signal.nextEvidence.external.zh.includes('收款主体'));
  assert.ok(signal.nextEvidence.handover.zh.includes('期后回款'));
  assert.equal(run(fixture.materials[1]!).crossSignals?.length, 0);

  for (const key of [
    'netProfit',
    'operatingCashFlow',
    'receivablesAdjustment',
    'inventoryAdjustment',
  ] as const) {
    const withdrawn = run(material, [key]);
    assert.equal(
      withdrawn.crossSignals?.some((item) => item.id === signal.id),
      false,
      `${key} withdrawal must remove the dependent combination`
    );
  }
  assert.ok(run(material).crossSignals?.some((item) => item.id === signal.id));
  const conflict = structuredClone(material);
  conflict.observations.push({ ...conflict.observations[0]!, id: 'cross-conflict', value: '1.00' });
  assert.equal(run(conflict).crossSignals?.length, 0);
});
test('profitable company with negative operating cash yields a question, not a fraud verdict', () => {
  const material = structuredClone(fixture.materials[0]!);
  const cash = material.observations.find(
    (item) => item.year === 2025 && item.key === 'operatingCashFlow'
  )!;
  const other = material.observations.find(
    (item) => item.year === 2025 && item.key === 'otherAdjustments'
  )!;
  const delta = -100000000n - moneyToFen(cash.value, cash.unit);
  cash.value = fenToYuan(-100000000n);
  other.value = fenToYuan(moneyToFen(other.value, other.unit) + delta);
  other.components![0]!.value = fenToYuan(
    moneyToFen(other.components![0]!.value, other.unit) + delta
  );
  const report = run(material);
  assert.ok(report.bridge);
  const signal = report.crossSignals?.find((item) => item.id === 'profit-with-cash-outflow');
  assert.ok(signal);
  assert.equal(signal.facts.length, 2);
  assert.match(signal.reading.zh, /不能单独说明原因/);
  assert.equal(run(material, ['operatingCashFlow']).crossSignals?.length, 0);
});
test('a zero aggregate receivables adjustment does not claim a cash release', () => {
  const material = structuredClone(fixture.materials[0]!);
  const receivables = material.observations.find(
    (item) => item.year === 2025 && item.key === 'receivablesAdjustment'
  )!;
  const cash = material.observations.find(
    (item) => item.year === 2025 && item.key === 'operatingCashFlow'
  )!;
  receivables.value = '0.00';
  receivables.quote = 'Synthetic fixture: receivables cash-flow adjustment is zero.';
  cash.value = '540418200.24';
  cash.quote = 'Synthetic fixture: operating cash flow reflects the zero adjustment.';
  const report = run(material);
  assert.equal(report.bridge?.length, 6);
  assert.equal(metric(report, 'receivablesAdjustment').value, '0.00');
  assert.equal(
    report.findings.find((item) => item.id === 'receivables')?.label,
    '经营性应收调整为零'
  );
  assert.equal(
    report.questions.some((item) => item.id === 'collections'),
    false
  );
});
test('artificially missing material never borrows hidden consolidated profit', () => {
  const report = run(fixture.materials[2]!);
  assert.equal(report.verdict, 'insufficient');
  assert.equal(report.bridge, null);
  assert.equal(metric(report, 'cashConversion').value, null);
  assert.equal(metric(report, 'operatingCashFlow').value, '26197123.70');
  assert.ok(report.questions.find((item) => item.id === 'supplement'));
  assert.equal(
    report.findings.some((item) => item.id === 'receivables'),
    false
  );
});
test('stress removal preserves provided headers, removes explanations and bridge', () => {
  const report = run(fixture.materials[0]!, [
    'inventoryAdjustment',
    'receivablesAdjustment',
    'payablesAdjustment',
    'otherAdjustments',
  ]);
  assert.equal(report.verdict, 'insufficient');
  assert.equal(report.bridge, null);
  assert.equal(metric(report, 'cashConversion').value, '7.15');
  assert.equal(
    report.findings.some((item) => item.id === 'management'),
    false
  );
});
test('parent/consolidated, subject, currency and conflicting values stop calculations', () => {
  const scope = run(fixture.materials[3]!);
  assert.equal(scope.verdict, 'conflict');
  assert.equal(metric(scope, 'cashConversion').value, null);
  assert.equal(scope.bridge, null);
  const m = structuredClone(fixture.materials[0]!);
  m.observations.push({ ...m.observations[0]!, id: 'conflicting', value: '999.00' });
  assert.equal(run(m).verdict, 'conflict');
  assert.equal(metric(run(m), 'netProfit').value, null);
  const currency = structuredClone(fixture.materials[0]!);
  currency.observations[0]!.currency = 'USD';
  assert.equal(run(currency).verdict, 'conflict');
  const subject = analyze(
    { title: '混主体', company: '其他公司', year: 2025, materialIds: [m.id] },
    [m]
  );
  assert.equal(subject.verdict, 'conflict');
  assert.equal(metric(subject, 'cashConversion').value, null);
});
test('wan and yi convert exactly, sub-fen precision is rejected', () => {
  assert.equal(moneyToFen('1.234567', 'wan'), 1234567n);
  assert.equal(moneyToFen('0.0000000001', 'yi'), 1n);
  assert.throws(() => moneyToFen('0.001', 'yuan'));
  const converted = structuredClone(fixture.materials[0]!);
  for (const observation of converted.observations) {
    observation.value = (Number(observation.value) / 10000).toFixed(6);
    observation.unit = 'wan';
    for (const component of observation.components || [])
      component.value = (Number(component.value) / 10000).toFixed(6);
  }
  assert.equal(metric(run(converted), 'cashConversion').value, '7.15');
  assert.equal(run(converted).bridge?.length, 6);
});
test('zero and negative bases return no conventional ratio or growth', () => {
  const m = structuredClone(fixture.materials[0]!);
  m.observations.find((item) => item.key === 'netProfit' && item.year === 2025)!.value = '-1.00';
  m.observations.find((item) => item.key === 'netProfit' && item.year === 2024)!.value = '0.00';
  assert.equal(metric(run(m), 'cashConversion').value, null);
  assert.equal(metric(run(m), 'profitGrowth').value, null);
});
test('real changed input recomputes and missing raw adjustment rows stop bridge', () => {
  const m = structuredClone(fixture.materials[0]!);
  m.observations.find((item) => item.key === 'operatingCashFlow' && item.year === 2025)!.value =
    '52394247.40';
  assert.equal(metric(run(m), 'cashConversion').value, '14.30');
  assert.equal(run(m).verdict, 'conflict');
  const missing = structuredClone(fixture.materials[0]!);
  missing.observations.find(
    (item) => item.key === 'otherAdjustments' && item.year === 2025
  )!.components = undefined;
  assert.equal(run(missing).bridge, null);
  assert.equal(run(missing).verdict, 'insufficient');
});
test('a nonzero sourced bridge difference remains visible without discarding comparable profit and cash', () => {
  const material = structuredClone(fixture.materials[0]!);
  const cash = material.observations.find(
    (item) => item.key === 'operatingCashFlow' && item.year === 2025
  )!;
  cash.value = '26199123.70';
  cash.quote =
    'Synthetic fixture: disclosed cash differs from the unchanged adjustment sum by 2000 yuan.';
  const report = run(material);
  const check = report.checks.find((item) => item.id === 'bridge-balance')!;
  assert.equal(report.verdict, 'conflict');
  assert.equal(report.bridge, null);
  assert.match(check.message, /合计 26197123\.70 元/);
  assert.match(check.message, /经营现金 26199123\.70 元/);
  assert.match(check.message, /经营现金−合计）2000\.00 元/);
  assert.ok(check.sourceRefs.some((ref) => ref.quote === cash.quote));
  assert.equal(metric(report, 'netProfit').value, '366373098.93');
  assert.equal(metric(report, 'operatingCashFlow').value, '26199123.70');
  assert.equal(
    report.findings.some((finding) => finding.id === 'receivables'),
    false
  );
});
test('invalid material identifiers, scope and precision are rejected', () => {
  assert.throws(() => validateMaterial({ ...fixture.materials[0], filename: '../evil.json' }));
  assert.throws(() =>
    validateMaterial({
      ...fixture.materials[0],
      observations: [{ ...fixture.materials[0]!.observations[0], value: '1.001' }],
    })
  );
});
test('model absent, HTTP failure, forged references and invented amounts preserve deterministic report', async () => {
  const report = run(fixture.materials[0]!);
  assert.equal(
    (await explainWithModel(structuredClone(report), {})).model.status,
    'not-configured'
  );
  const failed = await explainWithModel(structuredClone(report), {
    apiKey: 'test-only',
    fetch: async () => new Response('{}', { status: 503 }),
  });
  assert.equal(failed.model.status, 'failed');
  assert.equal(metric(failed, 'cashConversion').value, '7.15');
  const output = (text: string, citations: string[]) =>
    new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ explanations: [{ text, citations }] }) } },
        ],
      }),
      { status: 200 }
    );
  const forged = await explainWithModel(structuredClone(report), {
    apiKey: 'test-only',
    fetch: async () => output('现金核查', ['nonexistent']),
  });
  assert.equal(forged.model.status, 'failed');
  const invented = await explainWithModel(structuredClone(report), {
    apiKey: 'test-only',
    fetch: async () => output('现金为999999元', [report.snapshot[0]!.observations[0]!.id]),
  });
  assert.equal(invented.model.status, 'failed');
  const accepted = await explainWithModel(structuredClone(report), {
    apiKey: 'test-only',
    fetch: async () =>
      output('本期金额需要结合期后回款材料核查，不能裁定坏账。', [
        report.snapshot[0]!.observations[0]!.id,
      ]),
  });
  assert.equal(accepted.model.status, 'completed');
});

test('same year with interim/unknown period stops annual computations; declining profit is not growth', () => {
  const interim = structuredClone(fixture.materials[0]!);
  interim.observations[0]!.period = 'interim';
  assert.equal(run(interim).verdict, 'conflict');
  assert.equal(metric(run(interim), 'cashConversion').value, null);
  const unknown = structuredClone(fixture.materials[0]!);
  unknown.observations[0]!.period = undefined;
  assert.equal(run(unknown).verdict, 'insufficient');
  assert.equal(metric(run(unknown), 'cashConversion').value, null);
  const declining = structuredClone(fixture.materials[0]!);
  declining.observations.find((item) => item.key === 'netProfit' && item.year === 2024)!.value =
    '500000000.00';
  assert.doesNotMatch(run(declining).headline, /利润增长/);
});
test('model receives only included evidence; abort timeout preserves report', async () => {
  const excluded = [
    'receivablesAdjustment',
    'inventoryAdjustment',
    'payablesAdjustment',
    'otherAdjustments',
  ] as const;
  const report = run(fixture.materials[0]!, [...excluded]);
  let sentKeys: string[] = [];
  const response = await explainWithModel(
    report,
    {
      apiKey: 'test-only',
      fetch: async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        const provided = JSON.parse(body.messages[1].content);
        sentKeys = provided.evidence.map((item: { key: string }) => item.key);
        return new Response('{}', { status: 500 });
      },
    },
    [...excluded]
  );
  assert.equal(
    sentKeys.some((key) => excluded.includes(key as (typeof excluded)[number])),
    false
  );
  assert.equal(response.bridge, null);
  const timeout = await explainWithModel(run(fixture.materials[0]!), {
    apiKey: 'test-only',
    timeoutMs: 20,
    fetch: (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      }),
  });
  assert.equal(timeout.model.status, 'failed');
  assert.match(timeout.model.error!, /超时/);
  assert.equal(metric(timeout, 'cashConversion').value, '7.15');
});

test('questions bind actual trigger facts; conflicted and unused observations never reach the model', async () => {
  const report = run(fixture.materials[0]!);
  const question = report.questions.find((item) => item.id === 'collections')!;
  assert.equal(question.trigger?.year, 2025);
  assert.equal(question.trigger?.amount, '-514221076.54');
  assert.equal(question.trigger?.sourceRefs[0]?.page, 191);
  let called = false;
  const conflict = await explainWithModel(run(fixture.materials[3]!), {
    apiKey: 'test-only',
    fetch: async () => {
      called = true;
      return new Response('{}');
    },
  });
  assert.equal(called, false);
  assert.match(conflict.model.error!, /未调用/);
  let sent: { id: string }[] = [];
  await explainWithModel(run(fixture.materials[2]!), {
    apiKey: 'test-only',
    fetch: async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      sent = JSON.parse(body.messages[1].content).evidence;
      return new Response('{}', { status: 503 });
    },
  });
  assert.equal(
    sent.some((item) => item.id.includes('netProfit')),
    false
  );
  assert.equal(moneyToFen('9007199254740993.01', 'yuan'), 900719925474099301n);
});

test('configured provider requires an explicit per-task choice and discloses actual endpoint/model', async () => {
  let calls = 0;
  const config: ModelConfig = {
    apiKey: 'test-only',
    baseUrl: 'https://provider.example/v1',
    model: 'gpt-6.1-sol',
    fetch: async (_url, options) => {
      calls++;
      assert.doesNotMatch(String(options?.body), /PRIVATE_SOURCE_SENTINEL/);
      return new Response('{}', { status: 503 });
    },
  };
  const defaultReport = await applyModel(run(fixture.materials[0]!), config);
  assert.equal(calls, 0);
  assert.equal(defaultReport.model.status, 'not-requested');
  assert.equal(defaultReport.model.enabled, false);
  assert.equal(defaultReport.model.provider, 'provider.example');
  assert.equal(defaultReport.model.name, 'gpt-6.1-sol');
  const withPrivateLink = structuredClone(fixture.materials[0]!);
  withPrivateLink.sourceUrl = 'https://private.example/doc?token=PRIVATE_SOURCE_SENTINEL';
  const requestedReport = await applyModel(run(withPrivateLink), config, [], true);
  assert.equal(calls, 1);
  assert.equal(requestedReport.model.status, 'failed');
  assert.equal(
    requestedReport.metrics.find((item) => item.key === 'cashConversion')?.value,
    '7.15'
  );
});
