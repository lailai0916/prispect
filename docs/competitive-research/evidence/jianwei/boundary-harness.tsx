import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext, type AppContextValue } from '../../../../src/context';
import { DecisionEntityPath } from '../../../../src/DecisionEntityPath';
import { PaymentBoundary } from '../../../../src/PaymentBoundary';
import type { DecisionDetail } from '../../../../shared/decision-contracts';
import '../../../../src/styles.css';
import '../../../../src/decision.css';
const base: DecisionDetail = {
  decision: {
    id: 'fixture',
    title: '受控核查：非真实付款',
    purpose: 'external',
    transactionEntity: '样例合同企业甲',
    currentRevision: 1,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  },
  version: {
    revision: 1,
    createdAt: '2026-10-03T00:00:00Z',
    reason: 'created',
    input: {
      title: '受控核查',
      purpose: 'external',
      transactionEntity: '样例合同企业甲',
      tradingName: '样例门店乙',
      reportTaskId: null,
      promise: '受控样例承诺，不代表真实退款',
      datedCash: null,
      external: {
        asOf: '2026-10-03',
        totalAmount: '1000',
        payeeEntity: '样例合同企业甲',
        refundEntity: '样例合同企业甲',
        alreadyPaid: '300',
        deliveredAmount: '100',
        actualRefund: '20',
        proposedAmount: null,
        alternativeAmount: null,
        exposureLimit: '250',
      },
    },
    evidence: ['paid', 'delivered', 'refunded'].map((slot, index) => ({
      id: slot,
      slot: slot as 'paid' | 'delivered' | 'refunded',
      kind: 'source-record',
      entity: '样例合同企业甲',
      asOf: '2026-10-03',
      values: { amount: ['300', '100', '20'][index] },
      quote: '受控交互样例字段，无真实材料',
      sourceLabel: '受控模拟材料',
      materialId: slot,
      state: 'active',
      createdAt: '2026-10-03T00:00:00Z',
    })),
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
    ].map((id) => ({
      id,
      label: id,
      status: 'matched',
      summary: '受控门槛',
      neededSlots: [],
      dependencies: [
        { kind: 'evidence', id, state: 'matched', label: '受控来源', binding: 'source-located' },
      ],
    })),
    nextActions: [],
    external: { assumptionScenarios: [], recordScenarios: [] },
    cash: null,
    recordedCash: null,
    explanations: [],
    limitations: [],
  },
  revisions: [],
};
for (const role of ['contract', 'payee', 'refund'] as const)
  base.version.evidence.push({
    id: `identity-${role}`,
    slot: 'identity',
    kind: 'source-record',
    entity: '样例合同企业甲',
    asOf: '2026-10-03',
    values: { entity: '样例合同企业甲', role },
    quote: '受控模拟角色文本，不是真实材料',
    sourceLabel: '受控角色材料',
    materialId: 'fixture-roles',
    state: 'active',
    createdAt: '2026-10-03T00:00:00Z',
  });
base.version.evidence.push({
  id: 'terms',
  slot: 'terms',
  kind: 'source-record',
  entity: '样例合同企业甲',
  asOf: '2026-10-03',
  values: { terms: '受控条款仅测试交互' },
  quote: '受控条款仅测试交互',
  sourceLabel: '受控条款材料',
  materialId: 'fixture-roles',
  state: 'active',
  createdAt: '2026-10-03T00:00:00Z',
});
function Harness() {
  const [state, setState] = useState('known'),
    [locale, setLocale] = useState<'zh-Hans' | 'en'>('zh-Hans'),
    [theme, setTheme] = useState('light'),
    [action, setAction] = useState('');
  const detail = structuredClone(base);
  if (state === 'missing') detail.version.input.external!.actualRefund = null;
  if (state === 'above') detail.version.input.external!.exposureLimit = '100';
  if (state === 'withdrawn') {
    detail.version.evidence.find((r) => r.id === 'refunded')!.state = 'withdrawn';
    detail.evaluation.gates.find((g) => g.id === 'refunded')!.status = 'withdrawn';
  }
  if (state === 'conflict')
    detail.evaluation.gates.find((g) => g.id === 'paid')!.status = 'conflict';
  if (state === 'mismatch') {
    detail.version.input.external!.payeeEntity = '另一个未核对主体丙';
    detail.evaluation.gates.find((g) => g.id === 'identity-payee')!.status = 'out-of-scope';
  }
  document.documentElement.dataset.theme = theme;
  const context = {
    locale,
    t: (zh: string, en: string) => (locale === 'en' ? en : zh),
    workspace: null,
  } as AppContextValue;
  return (
    <AppContext.Provider value={context}>
      <main className="decisions-page" style={{ padding: '24px' }}>
        <p>受控组件验收：虚构输入与模拟门槛；不是真实资料、付款或用户效果研究。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <label>
            状态{' '}
            <select value={state} onChange={(e) => setState(e.target.value)}>
              {['known', 'missing', 'above', 'withdrawn', 'conflict', 'mismatch', 'readonly'].map(
                (s) => (
                  <option key={s}>{s}</option>
                )
              )}
            </select>
          </label>
          <label>
            语言{' '}
            <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
              <option value="zh-Hans">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            主题{' '}
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option>light</option>
              <option>dark</option>
            </select>
          </label>
        </div>
        <DecisionEntityPath
          detail={detail}
          onAddEvidence={
            state === 'readonly' ? undefined : (slot, role) => setAction(`${slot}:${role}`)
          }
          onEvidence={(id) => setAction(id)}
        />
        <p role="status">{action}</p>
        <PaymentBoundary detail={detail} />
      </main>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
