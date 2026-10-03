import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext, type AppContextValue } from '../../../../src/context';
import { ResearchPlan, ResearchGoalTemplates } from '../../../../src/ResearchPlan';
import '../../../../src/styles.css';
import {
  contextAmountFields,
  type CompanyContextPeriod,
} from '../../../../shared/company-workspace';
import type { CompanyResearchRun } from '../../../../shared/contracts';
import { deriveCompanyAssessment } from '../../../../shared/company-assessment';

const time = '2026-10-01T02:00:00.000Z';
function annual(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: '2026-04-20',
    amounts: {
      ...(Object.fromEntries(
        contextAmountFields.map((field) => [field, null])
      ) as CompanyContextPeriod['amounts']),
      revenue: '1000.00',
      netProfit: '100.00',
      ocf: '50.00',
      receivables: '0.00',
      inventory: '20.00',
      totalAssets: '1000.00',
      totalLiabilities: '200.00',
      cash: '400.00',
      shortLoan: '0.00',
      currentPortionDebt: '0.00',
      currentAssets: '500.00',
      currentLiabilities: '200.00',
    },
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://datacenter.eastmoney.com/'],
    originalUrl: null,
  };
}
function fixture(mode: string): CompanyResearchRun {
  const run: CompanyResearchRun = {
    id: `fixture-${mode}`,
    input: { securityCode: '300893', orgId: 'fixtureorg', year: 2025 },
    identity: {
      securityCode: '300893',
      orgId: 'fixtureorg',
      shortName: '验收企业',
      companyName: '核查框架验收夹具股份有限公司（合成示例）',
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixtureorg',
      companyName: '验收企业',
      fetchedAt: time,
      status: 'available',
      financials: [annual(2024), annual(2025)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
  const assessment = deriveCompanyAssessment(run);
  const metric = assessment.metrics.find(
    (item) => item.status === 'available' && item.evidenceIds.length
  )!;
  const condition = {
    text: {
      zh: '期后回款及账龄材料可能改变回款压力的解释（合成验收文案）。',
      en: 'Subsequent collections and aging evidence may change the explanation (synthetic acceptance copy).',
    },
    metricIds: [metric.id],
    evidenceIds: [metric.evidenceIds[0]],
  };
  assessment.narrative = {
    summary: condition,
    dimensions: [],
    strengths: [],
    risks: [],
    actions: [],
    changeConditions: [condition],
  };
  run.assessment = assessment;
  if (mode === 'missing') {
    delete run.context;
    delete run.assessment;
    delete run.identity;
  }
  if (mode === 'conflict')
    run.context!.comparisons.push({
      period: '2025-12-31',
      field: 'netProfit',
      primary: '100.00',
      secondary: '101.00',
      difference: '1.00',
      matches: false,
    });
  if (mode === 'mismatch') run.context!.securityCode = '000001';
  if (mode === 'previous') run.context!.fetchedAt = '2026-10-03T00:00:00.000Z';
  if (mode === 'failed') run.assessmentStatus = 'failed';
  return run;
}
function Preview() {
  const [mode, setMode] = useState('current');
  const [goal, setGoal] = useState('');
  const [locale, setLocale] = useState<'zh-Hans' | 'en'>('zh-Hans');
  const run = fixture(mode);
  if (goal) run.assessmentFocus = goal;
  const value: AppContextValue = {
    locale,
    t: (zh, en) => (locale === 'en' ? en : zh),
    workspace: null,
    cases: [],
    user: null,
    registrationEnabled: false,
    refresh: async () => {},
    navigate: () => {},
    execute: async (action) => action(),
    confirm: () => {},
    showEvidence: () => {},
    busy: false,
  };
  return (
    <AppContext value={value}>
      <main style={{ maxWidth: 900, margin: '20px auto', padding: 16 }}>
        <h1 style={{ fontSize: 18 }}>组件验收夹具 · 非真实企业研究</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
          <label>
            场景{' '}
            <select aria-label="场景" value={mode} onChange={(e) => setMode(e.target.value)}>
              {['current', 'missing', 'conflict', 'mismatch', 'previous', 'failed'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            语言{' '}
            <select
              aria-label="语言"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'zh-Hans' | 'en')}
            >
              <option value="zh-Hans">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              (document.documentElement.dataset.theme =
                document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
            }
          >
            切换主题
          </button>
        </div>
        <label htmlFor="test-goal">当前目标</label>
        <textarea
          id="test-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          style={{ width: '100%' }}
        />
        <ResearchGoalTemplates onSelect={setGoal} />
        <ResearchPlan run={run} />
      </main>
    </AppContext>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
