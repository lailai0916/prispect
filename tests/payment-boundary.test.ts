import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  DecisionDetail,
  DecisionEvidence,
  DecisionGate,
  ExternalPaymentInput,
} from '../shared/decision-contracts.js';
import {
  calculatePaymentBoundary,
  deriveDecisionEntityPath,
  derivePaymentBoundary,
} from '../shared/payment-boundary.js';

const payment = (patch: Partial<ExternalPaymentInput> = {}): ExternalPaymentInput => ({
  asOf: '2026-10-03',
  totalAmount: '1000',
  payeeEntity: '主体甲',
  refundEntity: '主体甲',
  alreadyPaid: '300',
  deliveredAmount: '100',
  actualRefund: '20',
  proposedAmount: null,
  alternativeAmount: null,
  exposureLimit: '250',
  ...patch,
});
const sourceRecord = (
  slot: 'paid' | 'delivered' | 'refunded',
  amount: string
): DecisionEvidence => ({
  id: slot,
  slot,
  kind: 'source-record',
  entity: '主体甲',
  asOf: '2026-10-03',
  values: { amount },
  quote: '受控记录字段',
  sourceLabel: '受控材料',
  materialId: slot,
  state: 'active',
  createdAt: '2026-10-03T00:00:00Z',
});
const gate = (id: string): DecisionGate => ({
  id,
  label: id,
  status: 'matched',
  summary: '字段定位',
  neededSlots: [],
  dependencies: [{ kind: 'evidence', id, label: id, state: 'matched', binding: 'source-located' }],
});
function detail(): Pick<DecisionDetail, 'version' | 'evaluation'> {
  return {
    version: {
      revision: 1,
      createdAt: '2026-10-03T00:00:00Z',
      reason: 'created',
      input: {
        title: '受控核查',
        purpose: 'external',
        transactionEntity: '主体甲',
        tradingName: '门店名',
        promise: '承诺退款，尚未到账',
        reportTaskId: null,
        external: payment(),
        datedCash: null,
      },
      evidence: [
        sourceRecord('paid', '300'),
        sourceRecord('delivered', '100'),
        sourceRecord('refunded', '20'),
      ],
    },
    evaluation: {
      evaluatedAt: '2026-10-03T00:00:00Z',
      knownConflicts: [],
      gates: [
        'identity-contract',
        'identity-payee',
        'identity-refund',
        'terms',
        'paid',
        'delivered',
        'refunded',
      ].map(gate),
      nextActions: [],
      external: { assumptionScenarios: [], recordScenarios: [] },
      cash: null,
      recordedCash: null,
      explanations: [],
      limitations: [],
    },
  };
}

test('反求不用拟付金额：剩余暴露空间限制本次付款，精确到分', () => {
  const result = calculatePaymentBoundary(payment());
  assert.equal(result.status, 'known');
  assert.equal(result.maximumProposedAmount, '70.00');
  assert.equal(result.currentExposure, '180.00');
  assert.equal(result.remainingContractAmount, '700.00');
  assert.equal(result.bindingConstraint, 'exposure');
  assert.deepEqual(result.missingFields, []);
});
test('合同剩余额是另一约束，已退款不补回合同付款额度', () => {
  const result = calculatePaymentBoundary(payment({ totalAmount: '320', actualRefund: '200' }));
  assert.equal(result.maximumProposedAmount, '20.00');
  assert.equal(result.bindingConstraint, 'contract');
});
test('两项约束相等与零边界是实算值，不是缺失', () => {
  assert.equal(calculatePaymentBoundary(payment({ totalAmount: '370' })).bindingConstraint, 'both');
  assert.equal(
    calculatePaymentBoundary(payment({ totalAmount: '300' })).maximumProposedAmount,
    '0.00'
  );
  assert.equal(
    calculatePaymentBoundary(payment({ alreadyPaid: '100', actualRefund: '0', exposureLimit: '0' }))
      .maximumProposedAmount,
    '0.00'
  );
});
test('当前已经超限必须单独停止，不能把负空间夹成可付0', () => {
  const result = calculatePaymentBoundary(payment({ exposureLimit: '100' }));
  assert.equal(result.status, 'already-above-limit');
  assert.equal(result.maximumProposedAmount, null);
  assert.equal(result.currentExcess, '80.00');
  assert.equal(result.exposureHeadroom, '-80.00');
});
test('每个必要字段缺失独立保留未知，不用0代替', () => {
  for (const field of [
    'totalAmount',
    'alreadyPaid',
    'deliveredAmount',
    'actualRefund',
    'exposureLimit',
  ] as const) {
    const result = calculatePaymentBoundary(payment({ [field]: null }));
    assert.equal(result.status, 'unknown', field);
    assert.equal(result.maximumProposedAmount, null, field);
    assert.ok(result.missingFields.includes(field), field);
  }
});
test('退款大于已付、交付或已付大于交易总额时暂停，不掩盖范围矛盾', () => {
  for (const patch of [
    { actualRefund: '301' },
    { deliveredAmount: '1001' },
    { totalAmount: '299' },
  ]) {
    assert.equal(calculatePaymentBoundary(payment(patch)).status, 'invalid');
    assert.equal(calculatePaymentBoundary(payment(patch)).maximumProposedAmount, null);
  }
});
test('非整数分数值不参与金融计算', () => {
  for (const value of ['-1', '1.001', '1e3', 'NaN', '', ' 0', '100000000000000000000']) {
    const result = calculatePaymentBoundary(payment({ totalAmount: value }));
    assert.equal(result.status, 'invalid', value);
    assert.equal(result.maximumProposedAmount, null, value);
  }
});
test('超Number安全整数仍保留精确分币与有限合同约束', () => {
  const result = calculatePaymentBoundary(
    payment({
      totalAmount: '99999999999999999999.99',
      alreadyPaid: '9007199254740993.01',
      deliveredAmount: '9007199254740993.00',
      actualRefund: '0',
      exposureLimit: '0.02',
    })
  );
  assert.equal(result.maximumProposedAmount, '0.01');
});
test('穷举独立验算小额允许集合：最大值和上限外的一分', () => {
  for (let total = 0; total <= 6; total++)
    for (let paid = 0; paid <= total; paid++)
      for (let delivered = 0; delivered <= total; delivered++)
        for (let refunded = 0; refunded <= paid; refunded++)
          for (let limit = 0; limit <= 4; limit++) {
            const allowable = Array.from(
              { length: total - paid + 1 },
              (_, proposal) => proposal
            ).filter((proposal) => Math.max(0, paid + proposal - delivered - refunded) <= limit);
            const result = calculatePaymentBoundary(
              payment({
                totalAmount: String(total / 100),
                alreadyPaid: String(paid / 100),
                deliveredAmount: String(delivered / 100),
                actualRefund: String(refunded / 100),
                exposureLimit: String(limit / 100),
              })
            );
            if (!allowable.length) assert.equal(result.status, 'already-above-limit');
            else assert.equal(result.maximumProposedAmount, (allowable.at(-1)! / 100).toFixed(2));
          }
});
test('有记录路径取绑定字段；交易总额和自设上限仍为输入条件', () => {
  const value = derivePaymentBoundary(detail());
  assert.equal(value!.records.status, 'known');
  assert.equal(value!.records.maximumProposedAmount, '70.00');
  assert.deepEqual(value!.recordEvidenceIds, ['paid', 'delivered', 'refunded']);
  assert.deepEqual(value!.inputConditionFields, ['totalAmount', 'exposureLimit']);
});
test('输入有实退款而实际记录缺失，记录路径不能借输入扩大边界', () => {
  const d = detail();
  d.version.evidence = d.version.evidence.filter((r) => r.slot !== 'refunded');
  const result = derivePaymentBoundary(d)!;
  assert.equal(result.assumptions.maximumProposedAmount, '70.00');
  assert.equal(result.records.status, 'unknown');
  assert.equal(result.records.maximumProposedAmount, null);
});
test('承诺退款、用户转录、撤回和冲突不进入记录路径', () => {
  for (const state of ['statement', 'transcribed', 'withdrawn', 'conflict'] as const) {
    const d = detail(),
      r = d.version.evidence.find((r) => r.id === 'refunded')!,
      g = d.evaluation.gates.find((g) => g.id === 'refunded')!;
    if (state === 'statement') r.kind = 'counterparty-statement';
    if (state === 'transcribed') g.dependencies[0]!.binding = 'user-transcribed';
    if (state === 'withdrawn') {
      r.state = 'withdrawn';
      g.status = 'withdrawn';
    }
    if (state === 'conflict') g.status = 'conflict';
    assert.equal(derivePaymentBoundary(d)!.records.maximumProposedAmount, null, state);
  }
});
test('已知冲突和重复不同金额即使gate误报matched仍停记录路径', () => {
  const d = detail(),
    g = d.evaluation.gates.find((g) => g.id === 'paid')!;
  const r = { ...sourceRecord('paid', '301'), id: 'paid-2' };
  d.version.evidence.push(r);
  g.dependencies.push({ ...g.dependencies[0]!, id: r.id });
  assert.equal(derivePaymentBoundary(d)!.records.maximumProposedAmount, null);
});
test('恢复相同有效记录重新可计算，旧版本保持不改', () => {
  const d = detail(),
    old = structuredClone(d);
  d.version.evidence.find((r) => r.id === 'refunded')!.state = 'withdrawn';
  assert.equal(derivePaymentBoundary(d)!.records.maximumProposedAmount, null);
  d.version.evidence.find((r) => r.id === 'refunded')!.state = 'active';
  assert.equal(derivePaymentBoundary(d)!.records.maximumProposedAmount, '70.00');
  assert.deepEqual(d, old);
});
test('任一身份或条款门槛未知，记录付款核对仍暂停', () => {
  for (const id of ['identity-contract', 'identity-payee', 'identity-refund', 'terms']) {
    const d = detail();
    d.evaluation.gates.find((g) => g.id === id)!.status = 'unknown';
    assert.equal(derivePaymentBoundary(d)!.records.maximumProposedAmount, null, id);
    assert.ok(derivePaymentBoundary(d)!.missingRecordGateIds.includes(id));
  }
});
test('经营名义或名称相同不证明关系；角色各自忠实呈现原门槛', () => {
  const d = detail();
  d.version.input.tradingName = d.version.input.transactionEntity;
  const nodes = deriveDecisionEntityPath(d)!;
  assert.equal(nodes[0]!.status, 'input-only');
  assert.equal(nodes[0]!.gateId, null);
  assert.equal(nodes[1]!.status, 'matched');
  d.evaluation.gates.find((g) => g.id === 'identity-payee')!.status = 'out-of-scope';
  assert.equal(deriveDecisionEntityPath(d)![2]!.status, 'out-of-scope');
});
test('交接事项没有预付款路径；只读派生不改变版本或评分', () => {
  const d = detail();
  d.version.input.purpose = 'handover';
  d.version.input.external = null;
  const before = structuredClone(d);
  assert.equal(derivePaymentBoundary(d), null);
  assert.equal(deriveDecisionEntityPath(d), null);
  assert.deepEqual(d, before);
});
