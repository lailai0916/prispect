import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Material, AnalysisTask } from '../shared/contracts.js';
import { analyze } from '../server/engine.js';
import type {
  DecisionEvidence,
  DecisionInput,
  DecisionVersion,
  DatedCashInput,
} from '../shared/decision-contracts.js';
import {
  evaluateDecision,
  validateDecisionInput,
  correctEvidenceScope,
  resolveCorrectedScopeIssues,
} from '../server/decision-engine.js';

const entity = '测试公司';
const date = '2026-10-02';
function external(): DecisionInput {
  return {
    title: '虚构预付款',
    purpose: 'external',
    transactionEntity: entity,
    reportTaskId: null,
    promise: '对方承诺退款，但这不代表已发生',
    datedCash: null,
    external: {
      asOf: date,
      totalAmount: '100000',
      payeeEntity: entity,
      refundEntity: entity,
      alreadyPaid: '0',
      deliveredAmount: '0',
      actualRefund: '0',
      proposedAmount: '100000',
      alternativeAmount: '20000',
      exposureLimit: '20000',
    },
  };
}
function dated(): DatedCashInput {
  return {
    asOf: date,
    openingCash: '120000',
    cashFloor: '0',
    proposedAmount: '60000',
    proposedDay: 5,
    alternativeDay: 26,
    flows: [
      {
        id: 'pay10',
        label: '必要支出一',
        direction: 'out',
        day: 10,
        amount: '100000',
        flexibility: 'fixed',
      },
      {
        id: 'pay40',
        label: '必要支出二',
        direction: 'out',
        day: 40,
        amount: '100000',
        flexibility: 'fixed',
      },
      {
        id: 'pay70',
        label: '必要支出三',
        direction: 'out',
        day: 70,
        amount: '100000',
        flexibility: 'fixed',
      },
      {
        id: 'collect25',
        label: '预计回款一',
        direction: 'in',
        day: 25,
        amount: '200000',
        flexibility: 'fixed',
      },
      {
        id: 'collect55',
        label: '预计回款二',
        direction: 'in',
        day: 55,
        amount: '120000',
        flexibility: 'fixed',
      },
      {
        id: 'collect85',
        label: '预计回款三',
        direction: 'in',
        day: 85,
        amount: '120000',
        flexibility: 'fixed',
      },
    ],
  };
}
function evidence(
  id: string,
  slot: DecisionEvidence['slot'],
  quote: string,
  values: DecisionEvidence['values'],
  extra: Partial<DecisionEvidence> = {}
): DecisionEvidence {
  return {
    id,
    slot,
    quote,
    values,
    kind: 'source-record',
    entity,
    asOf: date,
    sourceLabel: id,
    materialId: 'records',
    page: 1,
    state: 'active',
    createdAt: '2026-10-02T00:00:00Z',
    ...extra,
  };
}
function material(records: DecisionEvidence[], id = 'records'): Material {
  return {
    id,
    company: entity,
    shortName: entity,
    title: '用户提供的虚构记录',
    filename: 'record.json',
    origin: 'user-upload',
    documentDate: date,
    sha256: 'a'.repeat(64),
    createdAt: '2026-10-02T00:00:00Z',
    observations: [],
    notes: ['用户记录，未鉴真'],
    excerpts: [{ page: 1, text: records.map((record) => record.quote).join('\n') }],
  };
}
const version = (
  input: DecisionInput,
  records: DecisionEvidence[] = [],
  revision = 1
): DecisionVersion => ({
  revision,
  input,
  evidence: records,
  createdAt: '2026-10-02T00:00:00Z',
  reason: 'created',
});
const evaluate = (input: DecisionInput, records: DecisionEvidence[] = []) =>
  evaluateDecision(version(input, records), { tasks: [], materials: [material(records)] });
const gate = (result: ReturnType<typeof evaluate>, id: string) =>
  result.gates.find((gate) => gate.id === id)!;

test('external alternatives retain a 100000 versus 20000 exposure and do not turn arithmetic or recorded fields into payment approval', () => {
  const input = external();
  const records = ['paid', 'delivered', 'refunded'].map((slot) =>
    evidence(slot, slot as DecisionEvidence['slot'], `${entity}截至${date}${slot}实际金额0元。`, {
      amount: '0',
    })
  );
  const result = evaluate(input, records);
  assert.deepEqual(
    result.external?.assumptionScenarios.map((item) => [item.exposure, item.withinLimit]),
    [
      ['100000.00', false],
      ['20000.00', true],
    ]
  );
  assert.deepEqual(
    result.external?.recordScenarios.map((item) => [item.exposure, item.withinLimit]),
    [
      ['100000.00', false],
      ['20000.00', true],
    ]
  );
  assert.equal(gate(result, 'terms').status, 'unknown');
  assert.equal(gate(result, 'identity-contract').status, 'unknown');
  assert.match(gate(result, 'exposure-condition').summary, /不是支付批准/);
  assert.ok(result.nextActions.length);
});

test('unbound transcription, mismatched original, promised/future refunds and refund greater than paid cannot reduce a recorded exposure', () => {
  const input = external();
  input.external!.alreadyPaid = '100000';
  input.external!.actualRefund = '20000';
  const cases = [
    evidence(
      'transcribed',
      'refunded',
      `${entity}截至${date}实际退款20000元。`,
      { amount: '20000' },
      { materialId: undefined }
    ),
    evidence(
      'wrong-source',
      'refunded',
      `${entity}截至${date}实际退款20000元。`,
      { amount: '20000' },
      { materialId: 'other' }
    ),
    evidence('promise', 'refunded', `${entity}截至${date}承诺退款20000元，尚未到账。`, {
      amount: '20000',
    }),
    evidence(
      'future',
      'refunded',
      `${entity}截至2026-10-10实际退款20000元。`,
      { amount: '20000' },
      { asOf: '2026-10-10' }
    ),
  ];
  for (const record of cases) {
    const result = evaluateDecision(version(input, [record]), {
      tasks: [],
      materials: [material([record]), material([], 'other')],
    });
    assert.notEqual(gate(result, 'refunded').status, 'matched', record.id);
    assert.equal(result.external?.recordScenarios[0]?.exposure, null);
  }
  const inconsistent = external();
  inconsistent.external!.actualRefund = '80000';
  const result = evaluate(inconsistent);
  assert.equal(gate(result, 'refunded').status, 'conflict');
  assert.equal(result.external?.assumptionScenarios[0]?.exposure, null);
  assert.equal(result.external?.recordScenarios[0]?.exposure, null);
});

test('located planned refunds remain unknown actual events, while a planned cash flow remains a conditional input', () => {
  const input = external();
  input.external!.alreadyPaid = '100000';
  input.external!.actualRefund = '20000';
  input.external!.proposedAmount = '0';
  input.external!.alternativeAmount = '0';
  const actualRecords = [
    evidence('paid', 'paid', `${entity}截至${date}已付100000元。`, { amount: '100000' }),
    evidence('delivered', 'delivered', `${entity}截至${date}交付对应金额0元。`, { amount: '0' }),
  ];
  for (const quote of [
    `${entity}截至${date}计划退款20000元。`,
    `${entity} as of ${date} will refund CNY20000.`,
  ]) {
    const refund = evidence('refund', 'refunded', quote, { amount: '20000' });
    const result = evaluate(input, [...actualRecords, refund]);
    const refundGate = gate(result, 'refunded');
    assert.equal(refundGate.status, 'unknown', quote);
    assert.equal(refundGate.dependencies[0]?.binding, 'source-located');
    assert.equal(result.external?.recordScenarios[0]?.exposure, null);
    assert.equal(result.external?.assumptionScenarios[0]?.exposure, '80000.00');
  }
  const cashInput: DecisionInput = {
    ...external(),
    purpose: 'handover',
    external: null,
    datedCash: { ...dated(), proposedAmount: '0', flows: [dated().flows[0]!] },
  };
  const cashRecords = [
    evidence('opening', 'opening-cash', `${entity}截至${date}可用余额120000元。`, {
      amount: '120000',
    }),
    evidence(
      'planned-payment',
      'cash-flow',
      `${entity}截至${date}计划D10付款100000元。`,
      { amount: '100000', day: 10 },
      { flowId: 'pay10' }
    ),
  ];
  const cashResult = evaluate(cashInput, cashRecords);
  assert.equal(gate(cashResult, 'flow-pay10').status, 'matched');
  assert.equal(gate(cashResult, 'flow-pay10').dependencies[0]?.binding, 'source-located');
  assert.equal(cashResult.recordedCash?.primary.status, 'known');
  assert.equal(cashResult.recordedCash?.primary.minimumBalance, '20000.00');
});

test('dates, negative money and wrong role fields cannot become positive amounts, day numbers or the declared payee', () => {
  const input = external();
  input.external!.alreadyPaid = '2026';
  let records = [evidence('year', 'paid', `${entity}截至${date}已付100元。`, { amount: '2026' })];
  assert.notEqual(gate(evaluate(input, records), 'paid').status, 'matched');
  const cashInput = external();
  cashInput.purpose = 'handover';
  cashInput.datedCash = { ...dated(), openingCash: '100', flows: [], proposedAmount: '0' };
  records = [
    evidence('negative', 'opening-cash', `${entity}截至${date}可用余额-100元。`, { amount: '100' }),
  ];
  let result = evaluate(cashInput, records);
  assert.notEqual(gate(result, 'opening-cash').status, 'matched');
  assert.equal(result.recordedCash?.primary.minimumBalance, null);
  records = [
    evidence('identity', 'identity', `${entity}合同指定另一公司收款。`, {
      entity: '另一公司',
      role: 'payee',
    }),
  ];
  assert.equal(gate(evaluate(external(), records), 'identity-payee').status, 'out-of-scope');
  cashInput.datedCash = {
    ...cashInput.datedCash!,
    openingCash: '0',
    flows: [
      { id: 'in', label: '收款', direction: 'in', day: 2, amount: '100', flexibility: 'fixed' },
    ],
  };
  records = [
    evidence(
      'calendar',
      'cash-flow',
      `${entity}截至${date}预计2026-10-25收款100元。`,
      { amount: '100', day: 2 },
      { flowId: 'in' }
    ),
  ];
  result = evaluate(cashInput, records);
  assert.notEqual(gate(result, 'flow-in').status, 'matched');
  assert.equal(result.recordedCash?.primary.status, 'unknown');
});

test('dated-plan records are conditional, and withdrawal of necessary outflow evidence cannot silently delete that event to improve the payment limit', () => {
  const plan = dated(),
    input = { ...external(), purpose: 'handover' as const, datedCash: plan };
  const records = [
    evidence('opening', 'opening-cash', `${entity}截至${date}可用余额120000元。`, {
      amount: '120000',
    }),
    ...plan.flows.map((flow) =>
      evidence(
        flow.id,
        'cash-flow',
        `${entity}截至${date}计划D${flow.day}${flow.direction === 'in' ? '收款' : '付款'}${flow.amount}元。`,
        { amount: flow.amount, day: flow.day },
        { flowId: flow.id }
      )
    ),
  ];
  let result = evaluate(input, records);
  assert.equal(result.cash?.primary.firstShortfallDay, 10);
  assert.equal(result.recordedCash?.primary.firstShortfallDay, 10);
  assert.equal(result.cash?.primary.maximumAdditionalPayment, '20000.00');
  assert.deepEqual(
    result.cash?.primary.periodEnds.map((item) => item.balance),
    ['160000.00', '180000.00', '200000.00']
  );
  const withdrawn = structuredClone(records);
  withdrawn.find((record) => record.id === 'pay10')!.state = 'withdrawn';
  result = evaluate(input, withdrawn);
  assert.equal(result.recordedCash?.primary.status, 'unknown');
  assert.equal(result.recordedCash?.primary.maximumAdditionalPayment, null);
  assert.equal(
    result.cash?.primary.maximumAdditionalPayment,
    '20000.00',
    'independent user scenario remains explicitly separate'
  );
  assert.equal(gate(result, 'flow-pay10').status, 'withdrawn');
  assert.match(gate(result, 'alternative-terms').summary, /供应商同意延期/);
});

test('known same-record conflicts survive evidence withdrawal and restoring the earlier input, while a simple corrected input does not acquire a permanent conflict', () => {
  const input = external();
  input.purpose = 'handover';
  input.datedCash = { ...dated(), flows: [] };
  const a = evidence('A', 'opening-cash', `${entity}截至${date}可用余额120000元。`, {
    amount: '120000',
  });
  const b = evidence('B', 'opening-cash', `${entity}截至${date}可用余额130000元。`, {
    amount: '130000',
  });
  const conflict = evaluateDecision(version(input, [a, b], 2), {
    tasks: [],
    materials: [material([a, b])],
  });
  assert.equal(gate(conflict, 'opening-cash').status, 'conflict');
  assert.equal(conflict.knownConflicts.length, 1);
  for (const records of [[a, { ...b, state: 'withdrawn' as const }], [a]]) {
    const next = evaluateDecision(version(input, records, 3), {
      tasks: [],
      materials: [material([a, b])],
      knownConflicts: conflict.knownConflicts,
    });
    assert.equal(gate(next, 'opening-cash').status, 'conflict');
    assert.equal(next.recordedCash?.primary.minimumBalance, null);
  }
  const typo = structuredClone(input);
  typo.datedCash!.openingCash = '140000';
  const mismatched = evaluate(typo, [a]);
  assert.equal(gate(mismatched, 'opening-cash').status, 'conflict');
  assert.equal(mismatched.knownConflicts.length, 0);
  assert.equal(gate(evaluate(input, [a]), 'opening-cash').status, 'matched');
});

test('validation rejects impossible dates, repeated cash event ids and negative inputs before any evaluation', () => {
  assert.throws(
    () =>
      validateDecisionInput({
        ...external(),
        external: { ...external().external!, asOf: '2026-02-30' },
      }),
    /日期/
  );
  assert.throws(
    () =>
      validateDecisionInput({
        ...external(),
        datedCash: { ...dated(), flows: [dated().flows[0]!, dated().flows[0]!] },
      }),
    /不得重复/
  );
  assert.throws(() =>
    validateDecisionInput({
      ...external(),
      external: { ...external().external!, proposedAmount: '-1' },
    })
  );
});

test('unknown upper limits leave exposure computable, and amount-range errors invalidate only the affected alternatives', () => {
  const input = external();
  input.external!.exposureLimit = null;
  const result = evaluate(input);
  assert.deepEqual(
    result.external!.assumptionScenarios.map((item) => [item.exposure, item.withinLimit]),
    [
      ['100000.00', null],
      ['20000.00', null],
    ]
  );
  assert.equal(gate(result, 'exposure-condition').status, 'unknown');
  input.external!.alreadyPaid = '50000';
  assert.deepEqual(
    evaluate(input).external!.assumptionScenarios.map((item) => item.exposure),
    [null, '70000.00']
  );
  input.external!.deliveredAmount = '200000';
  const invalid = evaluate(input);
  assert.equal(gate(invalid, 'payment-range').status, 'conflict');
  assert.ok(invalid.external!.assumptionScenarios.every((item) => item.exposure === null));
});

test('negative words and currency signs, English unreceived promises and ambiguous or reversed cash directions cannot support calculations', () => {
  for (const phrase of ['负100元', '-￥100', '(100元)']) {
    const record = evidence('cash', 'opening-cash', `${entity}截至${date}可用余额${phrase}。`, {
      amount: '100',
    });
    const input = {
      ...external(),
      purpose: 'handover' as const,
      external: null,
      datedCash: { ...dated(), openingCash: '100' },
    };
    assert.equal(gate(evaluate(input, [record]), 'opening-cash').status, 'unknown');
  }
  const refund = evidence(
    'refund',
    'refunded',
    `${entity} as of ${date} promised refund CNY20000, not yet received.`,
    { amount: '20000' }
  );
  const refundInput = external();
  refundInput.external!.actualRefund = '20000';
  refundInput.external!.alreadyPaid = '100000';
  assert.equal(gate(evaluate(refundInput, [refund]), 'refunded').status, 'unknown');
  for (const phrase of ['付款', '收付款', '事件']) {
    const input = {
      ...external(),
      purpose: 'handover' as const,
      external: null,
      datedCash: { ...dated(), flows: [{ ...dated().flows[0]!, direction: 'in' as const }] },
    };
    const record = evidence(
      'flow',
      'cash-flow',
      `${entity}截至${date}计划D10${phrase}100000元。`,
      { amount: '100000', day: 10 },
      { flowId: 'pay10' }
    );
    assert.equal(gate(evaluate(input, [record]), 'flow-pay10').status, 'unknown');
  }
  const input = {
    ...external(),
    purpose: 'handover' as const,
    external: null,
    datedCash: { ...dated(), flows: [dated().flows[0]!] },
  };
  const payment = evidence(
    'flow',
    'cash-flow',
    `${entity} as of ${date} D10 payment CNY100000.`,
    { amount: '100000', day: 10 },
    { flowId: 'pay10' }
  );
  assert.equal(gate(evaluate(input, [payment]), 'flow-pay10').status, 'matched');
});

test('scope correction preserves conflicts in earlier revisions and reopening a conflicting old version does not launder counterevidence', () => {
  const input = external();
  input.external!.alreadyPaid = '10';
  input.external!.proposedAmount = '0';
  const a = evidence('a', 'paid', `${entity}截至${date}已付10元。`, { amount: '10' });
  const b = evidence('b', 'paid', `${entity}截至2026-10-01已付20元，2026-10-02归档。`, {
    amount: '20',
  });
  const materials = [material([a, b])];
  const conflicted = evaluateDecision(version(input, [a, b], 3), { tasks: [], materials });
  assert.equal(gate(conflicted, 'paid').status, 'conflict');
  const corrected = correctEvidenceScope(b, { entity, asOf: '2026-10-01' }, materials);
  const revised = version(input, [a, corrected], 4);
  const ledger = resolveCorrectedScopeIssues(
    conflicted.knownConflicts,
    revised,
    'b',
    '原文该记录属于前一日',
    materials
  );
  const result = evaluateDecision(revised, { tasks: [], materials, knownConflicts: ledger });
  assert.equal(gate(result, 'paid').status, 'matched');
  assert.equal(result.knownConflicts[0]!.resolvedRevision, 4);
  assert.equal(corrected.quote, b.quote);
  assert.deepEqual(corrected.values, b.values);
  const historical = evaluateDecision(version(input, [a, b], 3), {
    tasks: [],
    materials,
    knownConflicts: result.knownConflicts,
  });
  assert.equal(gate(historical, 'paid').status, 'conflict');
  assert.equal(historical.knownConflicts[0]!.resolvedRevision, undefined);
  const restored = evaluateDecision(version(input, [a, b], 5), {
    tasks: [],
    materials,
    knownConflicts: result.knownConflicts,
  });
  assert.equal(gate(restored, 'paid').status, 'conflict');
  assert.equal(restored.knownConflicts[0]!.resolutionEvents!.at(-1)!.state, 'reopened');
  assert.throws(
    () => correctEvidenceScope(b, { entity: '另一公司', asOf: date }, materials),
    /未在原绑定/
  );
  assert.throws(
    () =>
      correctEvidenceScope(
        { ...b, materialId: undefined },
        { entity, asOf: '2026-10-01' },
        materials
      ),
    /未在原绑定/
  );
});

test('actual historical adjustment evidence motivates a named inflow investigation but withdrawing it does not change private cash assumptions or support cash records', async () => {
  const source: Material = {
    ...JSON.parse(await readFile('data/cases/songyuan-2025.json', 'utf8')),
    id: 'public-source',
    createdAt: '2026-10-02T00:00:00Z',
  };
  const taskInput = {
    title: '公开年报背景',
    company: source.company,
    year: 2025,
    materialIds: [source.id],
  };
  const task: AnalysisTask = {
    ...taskInput,
    id: 'financial-report',
    excludedMetrics: [],
    status: 'completed',
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    stages: [],
    report: analyze(taskInput, [source]),
  };
  const input: DecisionInput = {
    ...external(),
    purpose: 'handover',
    transactionEntity: source.company,
    reportTaskId: task.id,
    external: null,
    datedCash: dated(),
  };
  const current = evaluateDecision(version(input), { tasks: [task], materials: [source] });
  const action = current.nextActions.find(
    (item) => item.id === 'investigate-collections-collect25'
  );
  assert.ok(action);
  for (const fact of ['collect25', 'D25', '200000元', source.company, date])
    assert.ok(action.requestedEvidence.includes(fact));
  assert.ok(
    action.dependencies.some(
      (dependency) => dependency.kind === 'financial' && dependency.relation === 'motivates'
    )
  );
  assert.ok(
    action.dependencies.every(
      (dependency) => dependency.kind !== 'financial' || dependency.relation !== 'supports'
    )
  );
  assert.equal(current.recordedCash?.primary.status, 'unknown');
  const withdrawnTask: AnalysisTask = {
    ...task,
    excludedMetrics: ['receivablesAdjustment', 'inventoryAdjustment'],
    report: analyze(
      { ...taskInput, excludedMetrics: ['receivablesAdjustment', 'inventoryAdjustment'] },
      [source]
    ),
  };
  const withdrawn = evaluateDecision(version(input), {
    tasks: [withdrawnTask],
    materials: [source],
  });
  assert.ok(!withdrawn.nextActions.some((item) => item.id.startsWith('investigate-')));
  assert.deepEqual(withdrawn.cash, current.cash);
  const unrelated = evaluateDecision(version({ ...input, transactionEntity: '该集团另一子公司' }), {
    tasks: [task],
    materials: [source],
  });
  assert.ok(!unrelated.nextActions.some((item) => item.id.startsWith('investigate-')));
  assert.equal(gate(unrelated, 'historical-scope').status, 'out-of-scope');
});
