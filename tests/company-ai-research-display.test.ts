import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type {
  AssessmentJudgment,
  AssessmentResearchStep,
  CompanyAssessment,
} from '../shared/company-assessment.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyAIResearchStatus } from '../src/CompanyAIResearchStatus.js';
import { CompanyAICoreReport } from '../src/CompanyAICoreReport.js';

const fetchedAt = '2026-10-03T00:00:00.000Z';
const generatedAt = '2026-10-03T00:03:00.000Z';
const summaryText =
  '2025年经营现金净额为2619.71万元，合并净利润3.66亿元，现金利润比仅7.15%。现金兑现明显落后于账面盈利，但现有资料不足以区分扩张备货与回款压力。应优先核对期后主要客户回款、存货去化及应收账款变化，并结合公告验证差异原因；后续回款改善或持续库存积压，都可能改变当前判断。';
const summary: AssessmentJudgment = {
  text: {
    zh: summaryText,
    en: 'Operating cash was 26.1971 million CNY against 366 million CNY profit, a cash-to-profit ratio of 7.15%. Verify subsequent collections and inventory movements before deciding whether expansion or collection pressure explains the difference.',
  },
  metricIds: ['cash-to-profit'],
  evidenceIds: ['financial-2025'],
};
const step = (
  tool: string,
  status: AssessmentResearchStep['status'] = 'completed'
): AssessmentResearchStep => ({
  id: `${tool}-${status}`,
  tool,
  label:
    tool === 'queue'
      ? '等待可用研究时隙'
      : tool === 'synthesize'
        ? '正在形成分析判断'
        : '读取已取得资料',
  status,
  startedAt: fetchedAt,
  ...(status === 'running' ? {} : { finishedAt: generatedAt }),
  summary: '',
});

function fixture(withAssessment = true): CompanyResearchRun {
  const assessment: CompanyAssessment = {
    version: 1,
    year: 2025,
    basis: 'consolidated',
    snapshotFetchedAt: fetchedAt,
    generatedAt,
    grade: 'C',
    score: 50,
    methodologyVersion: 'financial-screen-v1',
    dimensions: [
      {
        id: 'cash',
        label: ['经营现金', 'Operating cash'],
        score: 25,
        status: 'pressure',
        metricIds: ['cash-to-profit'],
        ruleSummary: ['经营现金低于合并净利润。', 'Operating cash is below consolidated profit.'],
      },
    ],
    metrics: [
      {
        id: 'cash-to-profit',
        label: ['现金利润比', 'Cash-to-profit'],
        value: '7.15',
        display: ['7.15%', '7.15%'],
        unit: 'percent',
        status: 'available',
        evidenceIds: ['financial-2025'],
        formula: ['经营现金净额 ÷ 合并净利润', 'Operating cash / consolidated profit'],
      },
    ],
    evidence: [
      {
        id: 'financial-2025',
        kind: 'financial',
        label: '2025年度合并财务',
        url: 'https://datacenter.eastmoney.com/finance',
        period: '2025-12-31',
        sourceQuality: 'web',
      },
    ],
    coverage: {
      fields: 13,
      requiredFields: 13,
      years: 6,
      sources: 8,
      news: 12,
      disclosures: 4,
      excerpts: 2,
      peers: 5,
    },
    gaps: [],
    narrative: {
      summary: structuredClone(summary),
      summaryHighlights: { zh: ['7.15%', '回款压力'], en: ['7.15%', 'collection pressure'] },
      suggestedQuestions: [
        {
          ...summary,
          text: { zh: '为什么利润高但现金低？', en: 'Why is cash low despite high profit?' },
        },
        {
          ...summary,
          text: {
            zh: '哪些回款资料可以验证判断？',
            en: 'Which collection records could verify the judgment?',
          },
        },
      ],
      dimensions: [{ ...summary, dimensionId: 'cash' }],
      strengths: [],
      risks: [],
      actions: [],
      changeConditions: [],
    },
    model: { status: 'completed', name: 'fixture-server-model' },
    research: {
      goal: '',
      steps: [step('collect_public_signals'), step('planning'), step('synthesize'), step('review')],
      modelCalls: 3,
      toolCalls: 4,
    },
  };
  return {
    id: 'fixture-ai-record',
    input: { securityCode: '300893', orgId: 'fixture-org', year: 2025, researchMode: 'financial' },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: generatedAt,
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
    contextStatus: 'ready',
    assessmentStatus: withAssessment ? 'ready' : undefined,
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: 'AI报告界面样本',
      fetchedAt,
      status: 'available',
      financials: [],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
    ...(withAssessment ? { assessment } : {}),
  };
}

function render(element: ReactElement, locale: 'zh-Hans' | 'en' = 'zh-Hans', signedIn = true) {
  const value = {
    locale,
    t: (zh: string, en: string) => (locale === 'en' ? en : zh),
    user: signedIn
      ? {
          id: 'fixture-owner',
          name: 'Fixture',
          email: 'fixture@example.invalid',
          createdAt: fetchedAt,
        }
      : null,
  } as AppContextValue;
  return load(renderToStaticMarkup(createElement(AppContext.Provider, { value }, element)));
}

test('API-ready records show acquired sources without claiming AI completion', () => {
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(
      createElement(CompanyAIResearchStatus, { run: fixture(false), onStart: () => undefined }),
      locale
    );
    assert.equal($('.company-ai-stages > li').length, 4);
    assert.equal($('[data-stage="sources"]').attr('data-status'), 'completed');
    assert.equal($('[data-stage="synthesize"]').attr('data-status'), 'not-started');
    assert.equal($('.company-ai-status-actions a').length, 0);
    assert.doesNotMatch($('.company-ai-current').text(), /AI 研究已完成|AI research complete/);
  }
});

test('initial API retrieval is not described as running AI analysis', () => {
  const run = fixture(false);
  run.contextStatus = 'loading';
  const $ = render(createElement(CompanyAIResearchStatus, { run }));
  assert.match($('.company-ai-current').text(), /正在获取基础资料/);
  assert.doesNotMatch($('.company-ai-current').text(), /AI 研究进行中/);
  assert.equal($('[data-stage="sources"]').attr('data-status'), 'running');
});

test('queued jobs retain real stage state and expose cancellation without invented progress', () => {
  const run = fixture(false);
  run.assessmentStatus = 'loading';
  run.assessmentRevision = 0;
  run.assessmentTrace = [step('queue', 'running')];
  const $ = render(createElement(CompanyAIResearchStatus, { run, onCancel: () => undefined }));
  assert.match($('.company-ai-current-action').text(), /正在排队/);
  assert.equal($('[data-stage="investigate"]').attr('data-status'), 'not-started');
  assert.equal($('[data-stage="synthesize"]').attr('data-status'), 'not-started');
  assert.match($('.company-ai-status-actions button').text(), /取消本轮研究/);
  assert.doesNotMatch($.root().text(), /\d+%|预计.*秒|剩余.*秒/);
});

test('synthesis and review bars follow actual recorded steps in both locales', () => {
  for (const locale of ['zh-Hans', 'en'] as const) {
    const run = fixture(false);
    run.assessmentStatus = 'loading';
    run.assessmentTrace = [
      step('collect_public_signals'),
      step('planning'),
      step('synthesize', 'running'),
    ];
    const $ = render(createElement(CompanyAIResearchStatus, { run }), locale);
    assert.equal($('[data-stage="sources"]').attr('data-status'), 'completed');
    assert.equal($('[data-stage="investigate"]').attr('data-status'), 'completed');
    assert.equal($('[data-stage="synthesize"]').attr('aria-current'), 'step');
    assert.equal($('[data-stage="review"]').attr('data-status'), 'not-started');
    assert.match($('.company-ai-current-action').text(), /正在形成分析判断/);
  }
});

test('completed reports have a report link and a failed rerun retains the previous report', () => {
  const run = fixture();
  let $ = render(createElement(CompanyAIResearchStatus, { run }));
  assert.equal($('.company-ai-research-status').attr('data-mode'), 'model');
  assert.match($('.company-ai-status-actions a').attr('href') || '', /report=ai/);
  assert.match($('.company-ai-status-actions a').text(), /查看 AI 报告/);
  run.assessmentStatus = 'failed';
  run.assessmentError = '合成故障样本';
  run.assessmentTrace = [step('synthesize', 'failed')];
  $ = render(createElement(CompanyAIResearchStatus, { run, onStart: () => undefined }));
  assert.match($('.company-ai-status-actions a').text(), /查看上一份报告/);
  assert.match($('.company-ai-status-actions button').text(), /重试 AI 分析/);
  assert.equal($('[role="alert"]').text(), run.assessmentError);
});

test('unconfigured or failed model results remain explicitly incomplete', () => {
  for (const status of ['not-configured', 'failed'] as const) {
    const run = fixture();
    run.assessment!.model.status = status;
    delete run.assessment!.narrative;
    const $ = render(createElement(CompanyAIResearchStatus, { run, onStart: () => undefined }));
    assert.equal($('.company-ai-research-status').attr('data-mode'), 'rules');
    assert.match($('.company-ai-current').text(), /AI 分析未完成/);
    assert.match($('.company-ai-status-actions a').text(), /查看规则结果/);
    assert.match($('.company-ai-status-actions button').text(), /重试 AI 分析/);
    assert.doesNotMatch($('.company-ai-current').text(), /AI 研究已完成/);
  }
});

test('core report preserves the complete AI summary and highlights exact fragments without HTML injection', () => {
  assert.ok([...summaryText].length >= 100 && [...summaryText].length <= 200);
  const run = fixture();
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(
      createElement(CompanyAICoreReport, { run, onInspect: () => undefined }),
      locale
    );
    assert.equal($('.company-ai-core-summary').text(), summary.text[locale === 'en' ? 'en' : 'zh']);
    assert.equal($('.company-ai-core-summary strong').first().text(), '7.15%');
    assert.equal($('.company-ai-core-grade strong').text(), 'C');
    assert.equal($('.company-ai-question').length, 2);
    assert.equal($('.company-ai-question:disabled').length, 0);
    assert.equal($('.company-ai-core-meta button').length, 1);
    assert.equal($('.company-ai-core-mode').text(), locale === 'en' ? 'AI analysis' : 'AI 分析');
  }
  run.assessment!.narrative!.summary.text.zh = '原始文本 <img src=x onerror=alert(1)> 7.15%';
  const $ = render(createElement(CompanyAICoreReport, { run }));
  assert.equal($('.company-ai-core-summary img').length, 0);
  assert.match($('.company-ai-core-summary').text(), /<img src=x onerror=alert\(1\)>/);
});

test('unverified cached reports and anonymous readers retain text but cannot send recommended questions', () => {
  const run = fixture();
  for (const [disabled, signedIn] of [
    [true, true],
    [false, false],
  ] as const) {
    const $ = render(createElement(CompanyAICoreReport, { run, disabled }), 'zh-Hans', signedIn);
    assert.equal($('.company-ai-core-summary').text(), summaryText);
    assert.equal($('.company-ai-question:disabled').length, 2);
  }
});

test('previous-snapshot summaries keep their own date and mismatched issuer reports show no judgment or actions', () => {
  const run = fixture();
  run.context!.fetchedAt = '2026-10-03T01:00:00.000Z';
  let $ = render(createElement(CompanyAICoreReport, { run }));
  assert.match($('.company-ai-core-meta').text(), /上一份资料快照/);
  assert.match($('.company-ai-core-meta').text(), /2026\/10\/03 08:00/);
  run.context!.securityCode = '600519';
  $ = render(createElement(CompanyAICoreReport, { run }));
  assert.equal($('.company-ai-core-summary').length, 0);
  assert.equal($('.company-ai-question').length, 0);
  assert.equal($('.company-ai-core-grade').length, 0);
  assert.equal($('.company-ai-core-report').attr('data-mode'), 'none');
});
