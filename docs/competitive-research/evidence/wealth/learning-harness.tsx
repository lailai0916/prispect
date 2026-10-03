// Isolated synthetic graph for browser state acceptance, not a production user path.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EvidenceLearning } from '/src/EvidenceLearning';
import { AppContext, type AppContextValue } from '/src/context';
import '/src/styles.css';
import '/src/evidence-lab.css';
import type { EvidenceLabGraph, LabNode } from '/shared/evidence-lab';
function node(
  id: string,
  label: [string, string],
  kind: LabNode['kind'],
  dependsOn: string[] = [],
  amount = '100.00'
): LabNode {
  return {
    id,
    label,
    kind,
    dependsOn,
    baseState: 'available',
    state: 'available',
    baseValue: amount,
    value: amount,
    unit: kind === 'hypothesis' ? null : 'CNY',
    sourceRefs: [
      {
        id: 'synthetic-original',
        label: '合成原件工程样例',
        url: 'https://example.org/synthetic',
        sourceQuality: 'excerpt',
      },
    ],
    blockers: [],
    metricIds: [],
    detail: [
      '解释仍需材料检验，金额不能证明经营原因。',
      'This explanation still requires evidence. Amounts do not establish causes.',
    ],
    formula:
      kind === 'calculation' ? ['净利润 − 经营现金', 'Net profit − operating cash'] : undefined,
  };
}
const base: EvidenceLabGraph = {
  version: 1,
  origin: 'original-report',
  company: '合成工程验收主体（非真实企业事实）',
  year: 2025,
  basis: 'consolidated',
  sourceNotice: ['全部金额与来源为合成fixture', 'All amounts and sources are synthetic fixtures'],
  nodes: [
    node('profit', ['净利润', 'Net profit'], 'fact'),
    node('cash', ['经营现金', 'Operating cash'], 'fact', [], '10.00'),
    node('inventory', ['存货', 'Inventory'], 'fact', [], '50.00'),
    node('gap', ['利润与现金差额', 'Profit–cash gap'], 'calculation', ['profit', 'cash'], '90.00'),
    node('independent', ['现金字段核对', 'Cash check'], 'calculation', ['cash'], '10.00'),
    node(
      'explanation',
      ['存货变化解释（待检验）', 'Inventory explanation (untested)'],
      'hypothesis',
      ['gap', 'inventory']
    ),
  ],
  edges: [],
  defaultSelectionId: 'profit',
  withdrawnFactIds: [],
};
function Harness() {
  const [g, setG] = useState(base);
  const [owner, setOwner] = useState('synthetic-owner-a');
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  const [dark, setDark] = useState(false);
  const ctx = {
    locale,
    t: (zh: string, en: string) => (locale === 'zh' ? zh : en),
  } as AppContextValue;
  return (
    <AppContext.Provider value={ctx}>
      <main
        data-theme={dark ? 'dark' : 'light'}
        style={{
          background: 'var(--paper)',
          color: 'var(--ink)',
          minHeight: '100vh',
          padding: '12px',
        }}
      >
        <h1 style={{ fontSize: 16 }}>合成依赖图工程验收 · 不代表真实用户路径</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => {
              setDark(!dark);
              document.documentElement.dataset.theme = dark ? 'light' : 'dark';
            }}
          >
            切换主题
          </button>
          <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>切换语言</button>
          <button
            onClick={() =>
              setOwner(owner === 'synthetic-owner-a' ? 'synthetic-owner-b' : 'synthetic-owner-a')
            }
          >
            换账号范围
          </button>
          <button onClick={() => setG({ ...g, year: g.year === 2025 ? 2024 : 2025 })}>
            换期间
          </button>
          <button
            onClick={() => {
              const v = structuredClone(g);
              v.nodes[0].sourceRefs[0].id += '-new';
              setG(v);
            }}
          >
            换来源
          </button>
          <button
            onClick={() => {
              const v = structuredClone(g);
              v.nodes[0].baseValue = v.nodes[0].value = '101.00';
              setG(v);
            }}
          >
            换金额
          </button>
          <button
            onClick={() => {
              const v = structuredClone(g);
              v.nodes[3].dependsOn = ['cash'];
              setG(v);
            }}
          >
            换依赖
          </button>
          <button
            onClick={() => {
              const v = structuredClone(base);
              for (const n of v.nodes.filter((n) => n.kind === 'fact')) {
                n.baseState = n.state = n.id === 'profit' ? 'conflict' : 'missing';
                n.baseValue = n.value = null;
              }
              setG(v);
            }}
          >
            缺失冲突
          </button>
          <button onClick={() => setG(structuredClone(base))}>正常图</button>
        </div>
        <div
          className="evidence-lab"
          style={{ border: '1px solid var(--line)', maxWidth: 1100, margin: 'auto' }}
        >
          <EvidenceLearning graph={g} scopeKey={owner} />
        </div>
      </main>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
