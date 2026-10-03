import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext, type AppContextValue } from '../../../../src/context';
import { CompanyResearchReport } from '../../../../src/CompanyResearchReport';
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
    id: mode === 'other-record' ? 'fixture-second-report' : 'fixture-report',
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
  assessment.generatedAt = time;
  assessment.ratingConstraints = [['合成验收：弱项上限依据。', 'Synthetic acceptance: core dimension cap.']];
  run.assessment = assessment;
  run.context!.sources = [{ id: 'fixture-source', dimension: '合成财务来源记录', provider: 'Fixture provider', url: 'https://example.com/fixture-source', status: 'available', fetchedAt: time, latestDate: '2025-12-31', count: 2, note: '合成响应，不含真实企业数据', responseHashes: [] }];
  run.context!.news = [{ title: '合成未读新闻标题', url: 'https://example.com/fixture-headline', date: time, media: 'Fixture media', provider: 'Fixture media', digest: '', contentScope: 'headline' }];
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
  if (mode === 'other-year') run.input.year = 2024;
  if (mode === 'other-issuer') run.input.securityCode = '000002';
  return run;
}
function Preview() {
  const [mode, setMode] = useState('current');
  const [locale, setLocale] = useState<'zh-Hans' | 'en'>('zh-Hans');
  const [refreshCount, setRefreshCount] = useState(0);
  const run = fixture(mode);
  const value: AppContextValue = {
    locale, t: (zh, en) => locale === 'en' ? en : zh,
    workspace: null, cases: [], user: null, registrationEnabled: false,
    refresh: async () => {}, navigate: () => {}, execute: async (action) => action(),
    confirm: () => {}, showEvidence: () => {}, busy: false,
  };
  return <AppContext value={value}><main style={{ maxWidth: 960, margin: '20px auto', padding: 16 }}>
    <h1 style={{fontSize: 18}}>报告核验控件验收夹具 · 非真实查询</h1>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
      <label>场景 <select aria-label="场景" value={mode} onChange={e => setMode(e.target.value)}>
        {['current','previous','other-record','other-year','other-issuer','missing'].map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>语言 <select aria-label="语言" value={locale} onChange={e => setLocale(e.target.value as 'zh-Hans'|'en')}>
        <option value="zh-Hans">中文</option><option value="en">English</option>
      </select></label>
      <button type="button" onClick={() => document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light':'dark'}>切换主题</button>
      <span data-testid="refresh-count">研究调用 {refreshCount}</span>
    </div>
    <details id="external-same-class" className="research-grade-limits"><summary>报告外同类核验折叠</summary><p>外部内容</p></details>
    <details id="company-full-report"><summary>报告外完整分析</summary><p>外部完整分析内容</p></details>
    <details id="company-public-signals"><summary>报告外公开讨论</summary><p>外部讨论内容</p></details>
    <output hidden data-testid="run-json">{JSON.stringify(run)}</output>
    <CompanyResearchReport run={run} onRefresh={() => setRefreshCount(c => c + 1)} refreshing={false}/>
  </main></AppContext>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
