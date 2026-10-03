/** A local, read-only review framework, not an invented record of Agent execution. */
import type { CompanyResearchRun } from './contracts.js';
import type { AssessmentJudgment, AssessmentText } from './company-assessment.js';
import { readDiscussionPostExcerpt, readNewsMediaExcerpt } from './company-assessment.js';
import { deriveCompanyResearchProgress } from './company-research-view.js';
import { companyReviewSummary } from './company-review.js';
import { contextFen } from './company-analysis.js';
import type { ContextAmountField } from './company-workspace.js';

export const researchGoalTemplates = [
  {
    id: 'cash-quality',
    label: ['现金质量', 'Cash quality'],
    goal: [
      '核对同年度合并净利润与经营现金净额的差异，查找原件依据和支持、反向解释，列出尚未取得的期后回款与存货资料。',
      'Compare same-year consolidated profit and operating cash, trace original evidence and competing explanations, and identify missing subsequent collections and inventory records.',
    ],
  },
  {
    id: 'before-payment',
    label: ['付款前核查', 'Before payment'],
    goal: [
      '梳理公开财务与经营线索，区分上市主体、签约主体和收款主体；列出仍需直接核对的履约、退款及付款条款。历史报表不证明当前付款安全。',
      'Review public financial and operating clues, distinguish the listed entity, contracting party and payment recipient, and identify performance, refund and payment terms needing direct verification. Historical statements do not establish current payment safety.',
    ],
  },
  {
    id: 'operating-change',
    label: ['经营变化', 'Operating changes'],
    goal: [
      '对照相邻年度同口径收入、经营现金、应收与存货，核对相关公告原文和变化时点；区分实际经营变化、计划事项与尚未证实的原因。',
      'Compare revenue, operating cash, receivables and inventory across adjacent annual periods, check original disclosures and dates, and distinguish operating changes, plans and unconfirmed causes.',
    ],
  },
  {
    id: 'counter-evidence',
    label: ['反方依据', 'Contrary evidence'],
    goal: [
      '针对重要判断查找最强的竞争解释与反向依据，核对原文、转载关系和资料缺口，说明哪些新证据会改变判断；未检索到反证不等于没有风险。',
      'Find the strongest competing explanations and contrary evidence for key judgments, check originals, repost relationships and gaps, and identify evidence that would change the judgment. Finding no contrary evidence does not establish that no risk exists.',
    ],
  },
] as const;

export type ResearchQuestionState = 'basis' | 'clues' | 'missing' | 'conflict' | 'blocked';
export const researchQuestionLabels: Record<ResearchQuestionState, AssessmentText> = {
  basis: ['可对照资料', 'Basis available'],
  clues: ['有待核线索', 'Clues to verify'],
  missing: ['资料不足', 'Insufficient evidence'],
  conflict: ['来源冲突', 'Source conflict'],
  blocked: ['暂停判断', 'Judgment paused'],
};

export interface ResearchPlanQuestion {
  id: string;
  question: AssessmentText;
  state: ResearchQuestionState;
  detail: AssessmentText;
  nextEvidence: AssessmentText;
}
export interface ResearchPlanSource {
  id: string;
  label: AssessmentText;
  /** Unknown counts stay null; this is not a count of independent corroborating sources. */
  catalog: number | null;
  read: number | null;
  note: AssessmentText;
}
export interface ResearchPlanCondition {
  judgment: AssessmentJudgment;
  references: { label: string; url?: string }[];
}
export interface ResearchPlanView {
  title: AssessmentText;
  explanation: AssessmentText;
  issuer: string;
  securityCode: string;
  year: number;
  goal: AssessmentText;
  scope: AssessmentText[];
  snapshot: ReturnType<typeof deriveCompanyResearchProgress>['snapshot'];
  sourceSnapshot: string | null;
  conditionSnapshot: string | null;
  questions: ResearchPlanQuestion[];
  sources: ResearchPlanSource[];
  sourceAttempts: number | null;
  sourceFailures: number | null;
  completionRequirements: readonly AssessmentText[];
  distinguishingEvidence: readonly AssessmentText[];
  changeConditions: ResearchPlanCondition[];
  notes: AssessmentText[];
}

const completionRequirements: readonly AssessmentText[] = [
  [
    '主体、年度、合并范围与币种可核对；缺失或冲突的字段暂停相关比较。',
    'Verify the entity, annual period, consolidated scope and currency; missing or conflicting fields pause dependent comparisons.',
  ],
  [
    '重要判断能回到具体金额、公式或已读来源；标题和媒体观点保留其范围。',
    'Trace key judgments to amounts, formulas or retrieved sources; retain the limits of headlines and media opinions.',
  ],
  [
    '支持与竞争解释分别有依据，未取得的材料和未完成的步骤继续明确列出。',
    'Keep the basis for supporting and competing explanations separate, with missing materials and incomplete steps visible.',
  ],
];
const distinguishingEvidence: readonly AssessmentText[] = [
  [
    '期后回款、应收账龄与对应合同：区分结算时点和持续未收回。',
    'Subsequent collections, receivable aging and related contracts: distinguish settlement timing from persistent noncollection.',
  ],
  [
    '存货结构、库龄、减值与期后销售：区分正常备货和去化压力。',
    'Inventory mix, aging, impairment and subsequent sales: distinguish normal stocking from sell-through pressure.',
  ],
  [
    '受限资金、债务到期表与实际偿付安排：核对当前可用资金及义务。',
    'Restricted funds, debt maturities and actual repayment arrangements: verify currently available funds and obligations.',
  ],
  [
    '签约与收款主体关系、履约及退款条款：为具体付款条件提供直接依据。',
    'The contracting-party/payment-recipient relationship, performance and refund terms: provide direct evidence for specific payment conditions.',
  ],
];

function safeUrl(url: string): string | undefined {
  try {
    const value = new URL(url);
    return ['http:', 'https:'].includes(value.protocol) &&
      !value.username &&
      !value.password &&
      !value.port
      ? value.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function deriveResearchPlan(run: CompanyResearchRun): ResearchPlanView {
  const progress = deriveCompanyResearchProgress(run);
  const blocked =
    progress.snapshot === 'mismatch' ||
    !!run.informationGap ||
    (!!run.identity && !['sse', 'szse'].includes(run.identity.exchange)) ||
    !/^\d{6}$/.test(run.input.securityCode) ||
    run.agent?.financialContext?.status === 'unsupported' ||
    /银行|证券|保险|多元金融/.test(run.context?.profile?.industry || '') ||
    !!run.context?.warnings.some((warning) =>
      warning.includes('金融机构或来源主体未通过通用行业口径检查')
    );
  const context = blocked ? undefined : run.context;
  const assessment = blocked ? undefined : run.assessment;
  const review = context ? companyReviewSummary(run) : { relation: 'missing' as const };
  const identity = blocked ? undefined : run.identity;
  const hasIdentity =
    !!identity &&
    identity.securityCode === run.input.securityCode &&
    identity.orgId === run.input.orgId &&
    !!safeUrl(identity.sourceUrl);
  const goal = run.assessmentFocus?.trim() || assessment?.research?.goal.trim();
  const period = `${run.input.year}-12-31`;
  const priorPeriod = `${run.input.year - 1}-12-31`;
  const comparisonFields: ContextAmountField[] = ['revenue', 'ocf', 'receivables', 'inventory'];
  const changeConflict =
    context?.comparisons.some(
      (item) =>
        [period, priorPeriod].includes(item.period) &&
        comparisonFields.includes(item.field) &&
        !item.matches
    ) ||
    [period, priorPeriod].some((date) =>
      comparisonFields.some((field) => {
        const values =
          context?.financials
            .filter((row) => row.annual && row.period === date)
            .map((row) => contextFen(row.amounts[field]))
            .filter((value) => value !== null) || [];
        return values.some((value) => value !== values[0]);
      })
    );
  const changeBasis = [period, priorPeriod].every((date) => {
    const rows = context?.financials.filter((row) => row.annual && row.period === date) || [];
    return (
      rows.length > 0 &&
      rows.every((row) =>
        comparisonFields.every((field) => contextFen(row.amounts[field]) !== null)
      )
    );
  });
  const disclosureReads = context?.announcements.filter(
    ({ excerpt }) =>
      excerpt &&
      excerpt.quote.trim() &&
      /^[a-f\d]{64}$/i.test(excerpt.sha256) &&
      Number.isInteger(excerpt.page) &&
      excerpt.page >= 1 &&
      Number.isInteger(excerpt.pagesRead) &&
      excerpt.pagesRead >= excerpt.page &&
      safeUrl(excerpt.url)
  ).length;
  const changeConditions =
    assessment?.narrative?.changeConditions
      .filter(
        (item) =>
          item.metricIds.length + item.evidenceIds.length > 0 &&
          item.metricIds.every((id) => assessment.metrics.some((metric) => metric.id === id)) &&
          item.evidenceIds.every((id) =>
            assessment.evidence.some((evidence) => evidence.id === id)
          ) &&
          (item.evidenceIds.length > 0 ||
            item.metricIds.some((id) =>
              assessment.metrics.some(
                (metric) =>
                  metric.id === id &&
                  metric.status === 'available' &&
                  metric.evidenceIds.some((evidenceId) =>
                    assessment.evidence.some((evidence) => evidence.id === evidenceId)
                  )
              )
            ))
      )
      .map((judgment) => ({
        judgment: {
          text: { ...judgment.text },
          metricIds: [...judgment.metricIds],
          evidenceIds: [...judgment.evidenceIds],
        },
        references: [
          ...assessment.metrics
            .filter((metric) => judgment.metricIds.includes(metric.id))
            .map((metric) => ({ label: `${metric.label[0]} / ${metric.label[1]}` })),
          ...assessment.evidence
            .filter((evidence) => judgment.evidenceIds.includes(evidence.id))
            .map((evidence) => ({ label: evidence.label, url: safeUrl(evidence.url) })),
        ],
      })) || [];
  const notes: AssessmentText[] = [];
  if (blocked)
    notes.push([
      '主体或分析范围尚未通过核对，相关判断保持暂停。',
      'The entity or analysis scope has not passed verification; dependent judgments remain paused.',
    ]);
  if (!context)
    notes.push([
      '这份记录尚无可用于本框架的公开资料快照，来源数量保持未知。',
      'This record has no usable public-source snapshot for this framework; source counts remain unknown.',
    ]);
  if (progress.snapshot === 'previous')
    notes.push([
      '来源覆盖对应新资料快照；下方改判条件仍来自上一份报告，尚未采用新资料。',
      'Source coverage uses the updated snapshot; the change conditions below still belong to the previous report and have not adopted the new sources.',
    ]);
  if (run.contextStatus === 'loading')
    notes.push([
      '公开资料正在更新，框架暂列已保存资料。',
      'Public sources are updating; the framework lists saved information for now.',
    ]);
  if (run.assessmentStatus === 'loading')
    notes.push([
      '新研究进行中，已有报告条件保留，执行情况以研究过程记录为准。',
      'New research is running; saved report conditions remain available. Consult recorded research steps for execution status.',
    ]);
  if (run.assessmentStatus === 'failed' || run.contextStatus === 'failed')
    notes.push([
      '本次更新未完成，已保存资料保留；不能将失败理解为没有风险。',
      'This update did not complete; saved information remains available. Failure does not establish that no risk exists.',
    ]);
  const unavailable: AssessmentText = [
    '需取得同主体、同期间资料后再核对。',
    'Obtain evidence for the same entity and period before reviewing.',
  ];
  const question = (
    id: string,
    text: AssessmentText,
    state: ResearchQuestionState,
    detail: AssessmentText,
    nextEvidence: AssessmentText
  ): ResearchPlanQuestion => ({
    id,
    question: text,
    state: blocked ? 'blocked' : state,
    detail: blocked ? unavailable : detail,
    nextEvidence,
  });
  return {
    title: ['核查框架', 'Review framework'],
    explanation: [
      '按本记录组织核查问题与资料缺口；实际检索和复核见研究过程。',
      'Review questions and evidence gaps for this record; consult the research process for actual retrieval and review.',
    ],
    issuer:
      identity?.companyName ||
      identity?.shortName ||
      context?.companyName ||
      run.input.securityCode,
    securityCode: run.input.securityCode,
    year: run.input.year,
    goal: goal
      ? [goal, goal]
      : [
          '核对经营现金、财务变化与公开重要事项，保留反向解释和未知。',
          'Review operating cash, financial changes and material public events, retaining competing explanations and unknowns.',
        ],
    scope: [
      [
        `财务比较要求：${run.input.year} 年度 · 合并财务 · 人民币`,
        `Financial comparison requires: ${run.input.year} annual period · Consolidated statements · CNY`,
      ],
      [
        '公开网页字段、已读公告节选和原件采用分别核对；网页资料不自动成为已确认原件。',
        'Keep public web fields, retrieved disclosure excerpts and adopted originals separate; web data does not automatically become confirmed original evidence.',
      ],
      [
        '历史报表不能证明当前可用现金、实际履约或付款安全；具体条件需直接材料。',
        'Historical statements do not establish currently available cash, actual performance or payment safety; specific conditions require direct evidence.',
      ],
    ],
    snapshot: progress.snapshot,
    sourceSnapshot: context?.fetchedAt || null,
    conditionSnapshot: changeConditions.length ? assessment?.snapshotFetchedAt || null : null,
    questions: [
      question(
        'entity',
        ['研究主体与资料主体是否一致？', 'Does the evidence belong to the selected entity?'],
        hasIdentity ? 'basis' : 'missing',
        hasIdentity
          ? [
              '已保存主体标识；这不证明品牌、门店、签约和收款主体间的关系。',
              'Entity identifiers are recorded; they do not establish the relationship between a brand, outlet, contracting party and payment recipient.',
            ]
          : ['尚缺可核对的主体确认记录。', 'A verifiable entity-confirmation record is missing.'],
        [
          '主体原件、签约及收款关系依据。',
          'Original entity records and contracting/payment-recipient relationship evidence.',
        ]
      ),
      question(
        'cash',
        [
          '本年度利润与经营现金能否同口径比较？',
          'Can this year’s profit and operating cash be compared on the same basis?',
        ],
        review.relation === 'conflict'
          ? 'conflict'
          : review.relation === 'missing'
            ? 'missing'
            : 'basis',
        review.relation === 'conflict'
          ? [
              '金额来源冲突，相关比较暂停。',
              'Amounts conflict across sources; dependent comparisons are paused.',
            ]
          : review.relation === 'missing'
            ? [
                '所选年度所需金额未齐，不能以零补缺。',
                'Required amounts for the selected year are incomplete; missing amounts are not zero-filled.',
              ]
            : review.relation === 'nonpositive'
              ? [
                  '金额可核对；利润非正，不形成通常的现金利润比解释。',
                  'Amounts can be reviewed; nonpositive profit does not support the usual cash-to-profit interpretation.',
                ]
              : [
                  '取得可比较金额；差异原因仍需原件与经营材料核对。',
                  'Comparable amounts are available; their causes still require original and operating evidence.',
                ],
        [
          '同年度合并原件、现金流补充资料及支持差异原因的明细。',
          'Same-year consolidated originals, cash-flow supplements and records supporting the explanation.',
        ]
      ),
      question(
        'changes',
        [
          '经营变化是实际发生、计划还是推断？',
          'Are operating changes observed facts, plans or inferences?',
        ],
        changeConflict ? 'conflict' : changeBasis ? 'basis' : 'missing',
        changeConflict
          ? [
              '相邻年度所需字段存在冲突，不组合为变化解释。',
              'Required fields across adjacent annual periods conflict; they are not combined into a change explanation.',
            ]
          : changeBasis
            ? [
                '相邻年度字段可对照；余额变化本身不能确证原因。',
                'Adjacent annual fields can be compared; balance changes alone do not establish causes.',
              ]
            : [
                '相邻年度收入、现金、应收或存货字段尚不齐。',
                'Revenue, cash, receivable or inventory fields are incomplete across adjacent annual periods.',
              ],
        [
          '相关公告原文、实际订单、期后销售及回款资料。',
          'Original disclosures, actual orders, subsequent sales and collections.',
        ]
      ),
      question(
        'originals',
        [
          '重要公告线索是否已读原文？',
          'Have material disclosure clues been checked against originals?',
        ],
        disclosureReads ? 'clues' : 'missing',
        disclosureReads
          ? [
              '已有公告节选；节选不等于完整原件，也不证明所有线索已核实。',
              'Disclosure excerpts are available; excerpts are not full originals and do not establish that all clues are verified.',
            ]
          : [
              '本快照没有可核对的已读公告节选，标题仍是线索。',
              'This snapshot has no verifiable retrieved disclosure excerpt; headlines remain clues.',
            ],
        [
          '对应公告原件、页码与完整上下文。',
          'Relevant original disclosures, page references and full context.',
        ]
      ),
      question(
        'counter',
        [
          '哪种竞争解释或新证据会改变判断？',
          'Which competing explanation or new evidence would change the judgment?',
        ],
        changeConditions.length ? 'clues' : 'missing',
        changeConditions.length
          ? [
              '保留下方报告的来源绑定条件；它们是待验证条件，不是未来事实。',
              'The source-bound report conditions below are retained; they are conditions to test, not future facts.',
            ]
          : [
              '尚无可回到本报告依据的改判条件；未见反证不等于没有风险。',
              'No source-bound change condition is recorded for this report; finding no contrary evidence does not establish that no risk exists.',
            ],
        [
          '支持与反向原文，以及能区分两种解释的直接材料。',
          'Supporting and contrary originals, plus direct evidence distinguishing the explanations.',
        ]
      ),
    ],
    sources: [
      {
        id: 'financials',
        label: ['所选年度网页财务', 'Selected-year web financials'],
        catalog: context
          ? context.financials.filter((row) => row.annual && row.period === period).length
          : null,
        read: null,
        note: [
          '保留网页字段范围，原件需另行采用。',
          'Retain the web-field scope; originals require separate adoption.',
        ],
      },
      {
        id: 'disclosures',
        label: ['公告目录与节选', 'Disclosures and excerpts'],
        catalog: context?.announcements.length ?? null,
        read: disclosureReads ?? null,
        note: [
          '已读数为保存的节选，不代表全文。',
          'Retrieved counts refer to saved excerpts, not full documents.',
        ],
      },
      {
        id: 'media',
        label: ['媒体条目与节选', 'Media items and excerpts'],
        catalog: context?.news.length ?? null,
        read: context ? context.news.filter((row) => readNewsMediaExcerpt(row)).length : null,
        note: [
          '转载不是独立确认，报道仍需核对。',
          'Reposts do not provide independent confirmation; reporting still requires verification.',
        ],
      },
      {
        id: 'discussion',
        label: ['公众帖子与节选', 'Public posts and excerpts'],
        catalog: context?.discussions?.length ?? null,
        read: context?.discussions
          ? context.discussions.filter((row) =>
              readDiscussionPostExcerpt(row, run.input.securityCode)
            ).length
          : null,
        note: [
          '当前样本中的未核实观点，不代表全部公众。',
          'Unverified opinions in the current sample, not the views of all people.',
        ],
      },
    ],
    sourceAttempts: context?.sources.length ?? null,
    sourceFailures: context
      ? context.sources.filter((source) => source.status === 'error').length
      : null,
    completionRequirements,
    distinguishingEvidence,
    changeConditions,
    notes,
  };
}

/** Export the visible framework only, without private previews, plans, materials or account fields. */
export function researchPlanText(plan: ResearchPlanView, locale: 'zh' | 'en'): string {
  const pick = (text: AssessmentText) => text[locale === 'en' ? 1 : 0];
  const unknown = locale === 'en' ? 'Unknown' : '未知';
  const number = (value: number | null) => (value === null ? unknown : String(value));
  return [
    pick(plan.title),
    `${plan.issuer} (${plan.securityCode}) · ${plan.year}`,
    pick(plan.explanation),
    '',
    `${locale === 'en' ? 'Goal' : '目标'}: ${pick(plan.goal)}`,
    ...plan.scope.map(pick),
    `${locale === 'en' ? 'Source snapshot' : '来源快照'}: ${plan.sourceSnapshot || unknown}`,
    '',
    ...plan.questions.map(
      (item) =>
        `${pick(item.question)} [${pick(researchQuestionLabels[item.state])}]\n${pick(item.detail)}\n${pick(item.nextEvidence)}`
    ),
    '',
    ...plan.sources.map(
      (source) =>
        `${pick(source.label)}: ${number(source.catalog)}; ${source.id === 'financials' ? (locale === 'en' ? 'Web fields' : '网页字段') : `${locale === 'en' ? 'excerpts' : '节选'} ${number(source.read)}`}. ${pick(source.note)}`
    ),
    `${locale === 'en' ? 'Source attempt records / retrieval failed' : '来源尝试记录 / 读取失败'}: ${number(plan.sourceAttempts)} / ${number(plan.sourceFailures)}`,
    '',
    locale === 'en' ? 'Requirements for a supported judgment' : '形成有依据判断的条件',
    ...plan.completionRequirements.map(pick),
    '',
    locale === 'en' ? 'Direct evidence to verify' : '需要直接核对的区分材料',
    ...plan.distinguishingEvidence.map(pick),
    ...(plan.changeConditions.length
      ? [
          '',
          `${locale === 'en' ? 'Report change conditions; snapshot' : '报告中的改判条件；快照'}: ${plan.conditionSnapshot || unknown}`,
          ...plan.changeConditions.flatMap((item) => [
            item.judgment.text[locale],
            ...item.references.map(
              (reference) => `${reference.label}${reference.url ? `: ${reference.url}` : ''}`
            ),
          ]),
        ]
      : []),
    ...plan.notes.map(pick),
  ].join('\n');
}
