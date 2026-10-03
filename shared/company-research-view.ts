/** Read-only presentation of recorded public research; it never starts research or changes a grade. */
import type { CompanyResearchRun } from './contracts.js';
import type {
  AssessmentDimension,
  AssessmentJudgment,
  AssessmentResearchStep,
  AssessmentText,
  CompanyAssessment,
} from './company-assessment.js';
import { readDiscussionPostExcerpt, readNewsMediaExcerpt } from './company-assessment.js';
import type { PublicSignalCoverage } from './company-workspace.js';

export type CompanyResearchStageId = 'sources' | 'investigate' | 'synthesize' | 'review';
export type CompanyResearchViewState =
  | 'not-started'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed';
export type CompanyResearchReportMode = 'model' | 'rules' | 'none';
export type CompanyResearchSnapshotState = 'current' | 'previous' | 'missing' | 'mismatch';

export interface CompanyResearchStageView {
  id: CompanyResearchStageId;
  label: AssessmentText;
  status: CompanyResearchViewState;
  summary: AssessmentText;
  /** Dates come only from actual recorded events. */
  startedAt?: string;
  finishedAt?: string;
  attempts: number;
  failed: number;
}

export interface CompanyResearchProgressView {
  state: CompanyResearchViewState;
  label: AssessmentText;
  goal: AssessmentText;
  stages: CompanyResearchStageView[];
  activeStage: CompanyResearchStageId | null;
  snapshot: CompanyResearchSnapshotState;
  mode: CompanyResearchReportMode;
  previousReportAvailable: boolean;
  counts: {
    /** Full attempt counts are persisted only with a finished assessment. Unknown is not zero. */
    modelCalls: number | null;
    /** Tool executions include cache/local reads; this is not a network-request count. */
    toolCalls: number | null;
    completedSteps: number;
    failedSteps: number;
  };
}

export interface CompanyResearchCoverageView {
  origin: 'report' | 'current-snapshot' | 'unavailable';
  snapshotFetchedAt: string | null;
  fields: number | null;
  requiredFields: number | null;
  years: number;
  sources: number;
  news: number;
  mediaBodies: number | null;
  discussions: number | null;
  discussionBodies: number | null;
  disclosures: number;
  excerpts: number;
  peers: number;
  /** These retain actual pagination, dates and stop reasons, rather than a confidence percentage. */
  newsScope: PublicSignalCoverage | null;
  discussionScope: PublicSignalCoverage | null;
}

export interface CompanyResearchBriefView {
  mode: CompanyResearchReportMode;
  summary: AssessmentJudgment;
  priorities: AssessmentJudgment[];
  nextChecks: AssessmentJudgment[];
  coverage: CompanyResearchCoverageView;
  scope: AssessmentText;
  warnings: AssessmentText[];
}

const labels: Record<CompanyResearchStageId, AssessmentText> = {
  sources: ['取得资料', 'Gather sources'],
  investigate: ['定向补查', 'Targeted research'],
  synthesize: ['形成判断', 'Form judgments'],
  review: ['反向复核', 'Review contrary evidence'],
};
const sourceTools = new Set([
  'collect_public_signals',
  'get_market_quote',
  'get_financial_history',
]);
const coreIds = new Set(['profitability', 'cash', 'solvency', 'workingCapital']);
const emptyJudgment = (text: AssessmentText): AssessmentJudgment => ({
  text: { zh: text[0], en: text[1] },
  metricIds: [],
  evidenceIds: [],
});

function scopeState(run: CompanyResearchRun): CompanyResearchSnapshotState {
  if (
    (run.context &&
      (run.context.securityCode !== run.input.securityCode ||
        run.context.orgId !== run.input.orgId)) ||
    (run.identity &&
      (run.identity.securityCode !== run.input.securityCode ||
        run.identity.orgId !== run.input.orgId)) ||
    (run.assessment &&
      (run.assessment.year !== run.input.year || run.assessment.basis !== 'consolidated'))
  )
    return 'mismatch';
  if (!run.context) return 'missing';
  if (run.assessment && run.assessment.snapshotFetchedAt !== run.context.fetchedAt)
    return 'previous';
  return 'current';
}

function usableAssessment(run: CompanyResearchRun): CompanyAssessment | undefined {
  return scopeState(run) === 'mismatch' || run.informationGap ? undefined : run.assessment;
}

function reportMode(assessment: CompanyAssessment | undefined): CompanyResearchReportMode {
  if (!assessment) return 'none';
  return assessment.model.status === 'completed' && assessment.narrative ? 'model' : 'rules';
}

function activeSteps(run: CompanyResearchRun): AssessmentResearchStep[] {
  // A new/failed job must not borrow the previous report's completed execution history.
  if (run.assessmentStatus === 'loading' || run.assessmentStatus === 'failed')
    return run.assessmentTrace || [];
  if (run.contextStatus === 'loading') return [];
  return run.assessmentTrace || run.assessment?.research?.steps || [];
}

function stageFor(tool: string): CompanyResearchStageId {
  return tool === 'synthesize'
    ? 'synthesize'
    : tool === 'review'
      ? 'review'
      : sourceTools.has(tool)
        ? 'sources'
        : 'investigate';
}

function stageFromSteps(
  id: CompanyResearchStageId,
  steps: AssessmentResearchStep[],
  running: boolean
): CompanyResearchStageView {
  const completed = steps.filter((step) => step.status === 'completed').length;
  const failed = steps.filter((step) => step.status === 'failed').length;
  const unfinished = steps.some((step) => step.status === 'running');
  const status =
    running && unfinished
      ? 'running'
      : failed || unfinished
        ? completed
          ? 'partial'
          : 'failed'
        : completed
          ? 'completed'
          : 'not-started';
  const starts = steps
    .map((step) => step.startedAt)
    .filter(Boolean)
    .sort();
  const finishes = steps.flatMap((step) => (step.finishedAt ? [step.finishedAt] : [])).sort();
  return {
    id,
    label: labels[id],
    status,
    summary:
      status === 'running'
        ? ['正在执行已记录的研究步骤。', 'Recorded research steps are running.']
        : steps.length
          ? [
              `已完成 ${completed} 项步骤${failed ? `，${failed} 项未完成` : ''}。`,
              `${completed} recorded steps completed${failed ? `; ${failed} did not complete` : ''}.`,
            ]
          : ['尚无本阶段的执行记录。', 'No execution is recorded for this stage.'],
    ...(starts.length ? { startedAt: starts[0] } : {}),
    ...(!unfinished && finishes.length ? { finishedAt: finishes.at(-1) } : {}),
    attempts: steps.length,
    failed,
  };
}

/** One truthful phase model for all company views, based on events rather than elapsed-time animation. */
export function deriveCompanyResearchProgress(
  run: CompanyResearchRun
): CompanyResearchProgressView {
  const assessment = usableAssessment(run);
  const mode = reportMode(assessment);
  const snapshot = scopeState(run);
  const steps = activeSteps(run);
  const loading = run.assessmentStatus === 'loading';
  const stages = (['sources', 'investigate', 'synthesize', 'review'] as const).map((id) =>
    stageFromSteps(
      id,
      steps.filter((step) => stageFor(step.tool) === id),
      loading
    )
  );
  const source = stages[0];
  if (snapshot === 'mismatch' || run.informationGap) {
    source.status = 'failed';
    source.summary = [
      '主体或报告范围未确认，未采用这些资料。',
      'The issuer or report scope is unconfirmed; these sources are excluded.',
    ];
  } else if (run.contextStatus === 'loading') {
    source.status = 'running';
    source.summary = run.context
      ? [
          '正在更新公开资料，已有快照仍可查看。',
          'Updating public sources; the saved snapshot remains available.',
        ]
      : ['正在取得公开资料。', 'Retrieving public sources.'];
  } else if (run.contextStatus === 'failed' || run.context?.status === 'unavailable') {
    source.status = run.context?.status === 'partial' ? 'partial' : 'failed';
    source.summary = [
      '资料读取未完整完成，缺失内容保持未知。',
      'Source retrieval did not complete; missing information remains unknown.',
    ];
  } else if (run.context && source.status !== 'running') {
    source.status =
      source.failed || run.context.status === 'partial' || source.status === 'failed'
        ? 'partial'
        : 'completed';
    source.summary = [
      '已取得公开快照；标题、正文节选和缺失来源分别记录。',
      'A public snapshot is available; titles, body excerpts and missing sources remain distinct.',
    ];
  }
  const synthesis = stages[2];
  if (
    assessment &&
    !loading &&
    run.contextStatus !== 'loading' &&
    run.assessmentStatus !== 'failed'
  ) {
    synthesis.status = mode === 'model' ? 'completed' : 'partial';
    synthesis.summary =
      mode === 'model'
        ? ['已形成有引用的分析判断。', 'Source-linked analysis judgments are available.']
        : [
            '已保留规则结果，AI 分析未完整完成。',
            'Rule results are retained; AI analysis did not complete.',
          ];
    if (assessment.model.warning && stages[3].status === 'completed') {
      stages[3].status = 'partial';
      stages[3].summary = ['部分独立复核未完成。', 'Some independent review did not complete.'];
    }
  }
  const failedSteps = steps.filter((step) => step.status === 'failed').length;
  const state: CompanyResearchViewState =
    snapshot === 'mismatch' || run.informationGap
      ? 'failed'
      : loading || run.contextStatus === 'loading'
        ? 'running'
        : run.assessmentStatus === 'failed'
          ? 'failed'
          : assessment
            ? mode !== 'model' ||
              assessment.model.warning ||
              failedSteps ||
              snapshot === 'previous' ||
              stages.some((stage) => ['partial', 'failed'].includes(stage.status))
              ? 'partial'
              : 'completed'
            : run.contextStatus === 'failed' || run.context?.status === 'unavailable'
              ? 'failed'
              : 'not-started';
  const stateLabels: Record<CompanyResearchViewState, AssessmentText> = {
    'not-started': ['研究尚未开始', 'Research has not started'],
    running: ['研究进行中', 'Research in progress'],
    completed: ['分析已完成', 'Analysis complete'],
    partial: ['部分研究结果', 'Partial research results'],
    failed: ['本次研究未完成', 'This research did not complete'],
  };
  const finishedReport =
    !!assessment &&
    !loading &&
    run.contextStatus !== 'loading' &&
    run.assessmentStatus !== 'failed' &&
    snapshot !== 'mismatch';
  return {
    state,
    label: stateLabels[state],
    goal: run.assessmentFocus?.trim()
      ? [run.assessmentFocus.trim(), run.assessmentFocus.trim()]
      : [
          '核对经营、现金、偿付与公开重大事项。',
          'Review operations, cash, solvency and material public events.',
        ],
    stages,
    activeStage: stages.find((stage) => stage.status === 'running')?.id || null,
    snapshot,
    mode,
    previousReportAvailable:
      !!assessment &&
      (loading ||
        run.contextStatus === 'loading' ||
        run.assessmentStatus === 'failed' ||
        snapshot === 'previous'),
    counts: {
      modelCalls: finishedReport ? (assessment.research?.modelCalls ?? null) : null,
      toolCalls: finishedReport ? (assessment.research?.toolCalls ?? null) : null,
      completedSteps: steps.filter((step) => step.status === 'completed').length,
      failedSteps,
    },
  };
}

function dimensionJudgment(
  dimension: AssessmentDimension,
  assessment: CompanyAssessment,
  text = dimension.ruleSummary
): AssessmentJudgment {
  const metricIds = dimension.metricIds.filter((id) =>
    assessment.metrics.some((metric) => metric.id === id && metric.status === 'available')
  );
  return { ...emptyJudgment(text), metricIds };
}

function coverageFor(
  run: CompanyResearchRun,
  assessment: CompanyAssessment | undefined
): CompanyResearchCoverageView {
  const context = scopeState(run) === 'mismatch' || run.informationGap ? undefined : run.context;
  const matchingScope =
    !!context && (!assessment || assessment.snapshotFetchedAt === context.fetchedAt);
  const coverage = assessment?.coverage;
  return {
    origin: assessment ? 'report' : context ? 'current-snapshot' : 'unavailable',
    snapshotFetchedAt: assessment?.snapshotFetchedAt || context?.fetchedAt || null,
    fields: coverage?.fields ?? null,
    requiredFields: coverage?.requiredFields ?? null,
    years:
      coverage?.years ??
      new Set(
        context?.financials
          .filter((row) => row.annual && Number(row.period.slice(0, 4)) <= run.input.year)
          .map((row) => row.period)
      ).size,
    sources:
      coverage?.sources ??
      context?.sources.filter((source) => ['available', 'partial'].includes(source.status))
        .length ??
      0,
    news: coverage?.news ?? context?.news.length ?? 0,
    mediaBodies:
      coverage?.mediaBodies ??
      (!assessment ? context?.news.filter((row) => readNewsMediaExcerpt(row)).length : null) ??
      null,
    discussions:
      coverage?.discussions ?? (!assessment ? context?.discussions?.length : null) ?? null,
    discussionBodies:
      coverage?.discussionBodies ??
      (!assessment
        ? context?.discussions?.filter((row) =>
            readDiscussionPostExcerpt(row, run.input.securityCode)
          ).length
        : null) ??
      null,
    disclosures: coverage?.disclosures ?? context?.announcements.length ?? 0,
    excerpts: coverage?.excerpts ?? context?.announcements.filter((row) => row.excerpt).length ?? 0,
    peers: coverage?.peers ?? 0,
    newsScope: matchingScope && context.publicSignals ? { ...context.publicSignals.news } : null,
    discussionScope:
      matchingScope && context.publicSignals ? { ...context.publicSignals.discussions } : null,
  };
}

const nextChecks: Record<string, AssessmentText> = {
  profitability: [
    '对照财务历史与业务披露，核对营收、利润变化的原因。',
    'Compare financial history with business disclosures to check changes in revenue and profit.',
  ],
  cash: [
    '核对期后回款、应收账龄及存货去化资料。',
    'Check subsequent collections, receivable aging and inventory sell-through records.',
  ],
  solvency: [
    '核对受限资金、债务到期表与后续偿付安排。',
    'Check restricted funds, debt maturities and subsequent repayment arrangements.',
  ],
  workingCapital: [
    '取得应收账龄与存货结构，核对资金占用变化的原因。',
    'Obtain receivable aging and inventory composition to investigate changes in working-capital usage.',
  ],
};

/** A concise reading order for validated judgments, with no new claims or rewritten saved results. */
export function deriveCompanyResearchBrief(run: CompanyResearchRun): CompanyResearchBriefView {
  const assessment = usableAssessment(run);
  const mode = reportMode(assessment);
  const snapshot = scopeState(run);
  const warnings: AssessmentText[] = [];
  if (snapshot === 'previous')
    warnings.push([
      '这份分析对应上一份资料快照，未采用刚更新的资料。',
      'This analysis uses the previous snapshot and has not adopted the updated sources.',
    ]);
  if (run.assessmentStatus === 'loading' && assessment)
    warnings.push([
      '新研究进行中，当前展示上一份报告。',
      'New research is running; the previous report is shown.',
    ]);
  else if (run.contextStatus === 'loading' && assessment)
    warnings.push([
      '公开资料正在更新，当前报告仍对应已有快照。',
      'Public sources are updating; the report still uses the saved snapshot.',
    ]);
  if (run.assessmentStatus === 'failed')
    warnings.push([
      '本次研究未完成；已有报告与公开资料保留。',
      'This research did not complete; saved reports and public sources remain available.',
    ]);
  if (assessment?.model.status === 'not-configured')
    warnings.push([
      'AI 服务尚未配置，当前展示规则结果。',
      'AI is not configured; rule results are shown.',
    ]);
  else if (assessment?.model.status === 'failed')
    warnings.push([
      'AI 分析未完成或未通过来源检查，当前保留规则结果。',
      'AI analysis did not complete or pass source validation; rule results are retained.',
    ]);
  else if (assessment?.model.status === 'not-called')
    warnings.push([
      '本次尚未调用 AI，当前展示规则结果。',
      'AI was not called for this analysis; rule results are shown.',
    ]);
  else if (assessment?.model.warning)
    warnings.push(
      mode === 'model'
        ? [
            '部分独立复核未完成，保留已验证的初稿。',
            'Some independent review did not complete; the validated draft is retained.',
          ]
        : [
            'AI 分析未完整完成，当前保留规则结果。',
            'AI analysis did not complete; rule results are retained.',
          ]
    );
  const core = assessment?.dimensions.filter((dimension) => coreIds.has(dimension.id)) || [];
  const attention = core.filter((dimension) =>
    ['pressure', 'high-pressure', 'unknown', 'conflict'].includes(dimension.status)
  );
  const summary =
    mode === 'model'
      ? structuredClone(assessment!.narrative!.summary)
      : emptyJudgment(
          !assessment
            ? snapshot === 'mismatch' || run.informationGap
              ? [
                  '主体或报告范围未确认，暂不形成分析判断。',
                  'The issuer or report scope is unconfirmed; no analysis judgment is formed.',
                ]
              : [
                  '尚未形成分析，已取得的资料可继续查看。',
                  'Analysis is not yet available; retrieved sources remain accessible.',
                ]
            : assessment.grade === 'NR'
              ? [
                  '关键财务数据未齐或存在冲突，暂不形成综合评级。',
                  'Key financial data is incomplete or conflicting; the overall grade is withheld.',
                ]
              : attention.length
                ? [
                    `${attention.map((dimension) => dimension.label[0]).join('、')}需进一步核查。`,
                    `${attention.map((dimension) => dimension.label[1]).join(', ')} require further checks.`,
                  ]
                : [
                    '核心财务指标处于较强或中等区间，仍需核对后续经营与公开事件。',
                    'Core financial metrics screen as strong or balanced; subsequent operations and public events still need review.',
                  ]
        );
  const priorities =
    mode === 'model'
      ? structuredClone(
          (assessment!.narrative!.risks.length
            ? assessment!.narrative!.risks
            : assessment!.narrative!.dimensions
          ).slice(0, 3)
        )
      : assessment
        ? (attention.length ? attention : core)
            .slice(0, 3)
            .map((dimension) => dimensionJudgment(dimension, assessment))
        : [];
  const actions =
    mode === 'model'
      ? structuredClone(assessment!.narrative!.actions.slice(0, 3))
      : assessment
        ? (attention.length ? attention : core)
            .slice(0, 3)
            .map((dimension) => dimensionJudgment(dimension, assessment, nextChecks[dimension.id]))
        : [];
  return {
    mode,
    summary,
    priorities,
    nextChecks: actions,
    coverage: coverageFor(run, assessment),
    scope: [
      `${run.input.year} 年度 · 合并口径 · 公开资料`,
      `${run.input.year} annual period · Consolidated scope · Public sources`,
    ],
    warnings,
  };
}
