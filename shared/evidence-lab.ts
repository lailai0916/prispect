/** A local evidence trial. It never adopts sources or rewrites the saved analysis. */
import type {
  CompanyResearchRun,
  ComputedMetric,
  EvidenceRef,
  Material,
  Report,
} from './contracts.js';
import {
  deriveCompanyAssessment,
  type AssessmentEvidence,
  type AssessmentText,
} from './company-assessment.js';
import { contextFen, contextYuan } from './company-analysis.js';
import { companyChallengeDefinitions } from './company-challenge.js';

export const labHypothesisIds = ['expansion', 'inventory-pressure', 'collection-pressure'] as const;
export type LabHypothesisId = (typeof labHypothesisIds)[number];
export type LabBaseState = 'available' | 'missing' | 'conflict' | 'not-applicable';
export type LabNodeState = LabBaseState | 'withdrawn' | 'paused';
export interface LabSource {
  id: string;
  label: string;
  url: string;
  page?: number;
  quote?: string;
  sourceQuality: AssessmentEvidence['sourceQuality'];
  /** An owning-account retained upload, never a public-source URL or model input. */
  retainedOriginal?: { kind: 'upload'; isPdf: boolean };
}
export interface LabNode {
  id: string;
  kind: 'fact' | 'calculation' | 'hypothesis' | 'material';
  label: AssessmentText;
  detail: AssessmentText;
  baseState: LabBaseState;
  state: LabNodeState;
  /** Values are decimal strings; a paused or withdrawn node exposes no adopted value. */
  baseValue: string | null;
  value: string | null;
  unit: 'CNY' | 'percent' | null;
  sourceRefs: LabSource[];
  dependsOn: string[];
  blockers: string[];
  metricIds: string[];
  formula?: AssessmentText;
  reason?: AssessmentText;
  hypothesisId?: LabHypothesisId;
  challengeFocus?: string;
  /** A material node is a request, not a representation that the document was acquired. */
  materialStatus?: 'needed';
}
export interface LabEdge {
  id: string;
  from: string;
  to: string;
  relation: 'calculates' | 'motivates' | 'tests';
  state: 'active' | 'paused';
  reason?: AssessmentText;
}
export interface EvidenceLabGraph {
  version: 1;
  origin: 'public-web' | 'original-report';
  company: string;
  year: number;
  basis: 'consolidated';
  snapshotFetchedAt?: string;
  sourceNotice: AssessmentText;
  nodes: LabNode[];
  edges: LabEdge[];
  defaultSelectionId: string;
  withdrawnFactIds: string[];
}
/** Structural compatibility with the public example API, without importing client/server code. */
export interface EvidenceLabExample {
  company: string;
  shortName?: string;
  year: number;
  metrics: ComputedMetric[];
  source: { url: string; title: string; documentDate: string; sha256: string };
  checks?: Report['checks'];
  bridge?: Report['bridge'];
}

const rawFact = (
  id: string,
  label: AssessmentText,
  value: string | null,
  state: LabBaseState,
  sources: LabSource[],
  detail: AssessmentText,
  metricIds: string[] = []
): LabNode => ({
  id,
  kind: 'fact',
  label,
  detail,
  baseState: state,
  state,
  baseValue: state === 'available' ? value : null,
  value: state === 'available' ? value : null,
  unit: 'CNY',
  sourceRefs: sources,
  dependsOn: [],
  blockers: [],
  metricIds,
});
const safeUrl = (value: string | undefined): string | null => {
  try {
    if (!value || value.length > 8000) return null;
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
/** Private original links are restricted to the existing owning-account file endpoint. */
export function evidenceLabSourceHref(source: LabSource): string | undefined {
  if (source.retainedOriginal) {
    if (!/^\/api\/materials\/[a-zA-Z0-9_-]{1,200}\/file$/.test(source.url)) return;
    const page =
      source.retainedOriginal.isPdf &&
      source.page &&
      Number.isSafeInteger(source.page) &&
      source.page > 0
        ? `#page=${source.page}`
        : '';
    return `${source.url}${page}`;
  }
  const safe = safeUrl(source.url);
  if (!safe) return;
  const url = new URL(safe);
  if (source.page && Number.isSafeInteger(source.page) && source.page > 0)
    url.hash = `page=${source.page}`;
  return url.href;
}
const percentage = (numerator: bigint, denominator: bigint): string | null => {
  if (denominator <= 0n) return null;
  const scaled = numerator * 10_000n;
  const absolute = scaled < 0n ? -scaled : scaled;
  const rounded = (absolute + denominator / 2n) / denominator;
  return `${scaled < 0n && rounded > 0n ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
};
function calculation(
  nodes: LabNode[],
  id: string,
  label: AssessmentText,
  dependsOn: string[],
  operation: (values: bigint[]) => string | null,
  unit: LabNode['unit'],
  formula: AssessmentText,
  detail: AssessmentText
): LabNode {
  const inputs = dependsOn.map((dependency) => nodes.find((node) => node.id === dependency));
  const values = inputs.map((node) => contextFen(node?.baseValue));
  const state: LabBaseState = inputs.some((node) => node?.baseState === 'conflict')
    ? 'conflict'
    : inputs.some((node) => !node || node.baseState !== 'available') ||
        values.some((v) => v === null)
      ? 'missing'
      : 'available';
  const value = state === 'available' ? operation(values as bigint[]) : null;
  const baseState = state === 'available' && value === null ? 'not-applicable' : state;
  return {
    id,
    kind: 'calculation',
    label,
    detail,
    baseState,
    state: baseState,
    baseValue: value,
    value,
    unit,
    sourceRefs: [
      ...new Map(inputs.flatMap((node) => node?.sourceRefs || []).map((s) => [s.id, s])).values(),
    ],
    dependsOn,
    blockers: dependsOn.filter((_, index) => inputs[index]?.baseState !== 'available'),
    metricIds: [...new Set(inputs.flatMap((node) => node?.metricIds || []))],
    formula,
  };
}
function commonCalculations(nodes: LabNode[], year: number) {
  const profit = `fact-${year}-netProfit`,
    cash = `fact-${year}-ocf`;
  nodes.push(
    calculation(
      nodes,
      'calc-cash-profit',
      ['现金利润比', 'Cash-to-profit ratio'],
      [cash, profit],
      ([cashValue, profitValue]) => percentage(cashValue!, profitValue!),
      'percent',
      [
        '经营现金净额 ÷ 正的合并净利润 × 100%',
        'Operating cash / positive consolidated net profit × 100%',
      ],
      [
        '这不是销售回款率；利润为零或负时不计算这个比例。',
        'This is not a sales collection rate. The ratio is withheld when profit is nonpositive.',
      ]
    ),
    calculation(
      nodes,
      'calc-profit-cash-gap',
      ['利润与经营现金差额', 'Profit less operating cash'],
      [profit, cash],
      ([profitValue, cashValue]) => contextYuan(profitValue! - cashValue!),
      'CNY',
      ['合并净利润 − 经营现金净额', 'Consolidated net profit − operating cash'],
      [
        '差额只说明金额反差，不证明库存、回款或其他经营原因。',
        'The difference describes the amounts; it does not establish inventory, collection or other business causes.',
      ]
    )
  );
}
function explanations(
  nodes: LabNode[],
  dependencies: Record<LabHypothesisId, string[]>,
  year: number
) {
  const profitNode = nodes.find((node) => node.id === `fact-${year}-netProfit`);
  const cashNode = nodes.find((node) => node.id === `fact-${year}-ocf`);
  const profit = contextFen(profitNode?.baseValue);
  const cash = contextFen(cashNode?.baseValue);
  const cashBasis: LabBaseState = [profitNode, cashNode].some(
    (node) => node?.baseState === 'conflict'
  )
    ? 'conflict'
    : [profitNode, cashNode].some((node) => node?.baseState !== 'available') ||
        profit === null ||
        cash === null
      ? 'missing'
      : profit <= 0n || cash >= profit
        ? 'not-applicable'
        : 'available';
  for (const id of labHypothesisIds) {
    const definition = companyChallengeDefinitions[id];
    // When the low-cash pattern is absent, only its NP/CFO basis is relevant.
    const dependsOn = cashBasis === 'not-applicable' ? ['calc-profit-cash-gap'] : dependencies[id];
    const inputs = dependsOn.map((dependency) => nodes.find((node) => node.id === dependency));
    const baseState: LabBaseState =
      cashBasis !== 'available'
        ? cashBasis
        : inputs.some((node) => node?.baseState === 'conflict')
          ? 'conflict'
          : inputs.some((node) => !node || node.baseState !== 'available')
            ? 'missing'
            : 'available';
    nodes.push({
      id: `hypothesis-${id}`,
      kind: 'hypothesis',
      label: definition.title,
      detail:
        cashBasis === 'not-applicable'
          ? [
              '所选年度未形成正利润且经营现金低于利润的组合，暂不检验这类低经营现金原因。金额及材料请求仍保留。',
              'The selected year does not combine positive profit with operating cash below profit. These low-cash causes are inapplicable; amounts and material requests remain available.',
            ]
          : cashBasis !== 'available'
            ? [
                '利润或经营现金尚不能采用，无法确认正利润低经营现金组合。先补齐或核对依据，不把缺口写成经营原因。',
                'Profit or operating cash cannot yet be adopted, so the positive-profit/low-cash pattern is unknown. Obtain or reconcile the evidence before investigating its causes.',
              ]
            : [
                `待检验解释。${definition.explanation[0]}${definition.competingExplanation[0]}现有金额不能确认原因。`,
                `Untested explanation. ${definition.explanation[1]} ${definition.competingExplanation[1]} The amounts do not establish a cause.`,
              ],
      baseState,
      state: baseState,
      baseValue: null,
      value: null,
      unit: null,
      sourceRefs: [
        ...new Map(
          inputs.flatMap((node) => node?.sourceRefs || []).map((source) => [source.id, source])
        ).values(),
      ],
      dependsOn,
      blockers: dependsOn.filter((_, index) => inputs[index]?.baseState !== 'available'),
      metricIds: [...new Set(inputs.flatMap((node) => node?.metricIds || []))],
      hypothesisId: id,
      challengeFocus: definition.researchGoal,
    });
    for (const material of definition.materials) {
      nodes.push({
        id: `material-${id}-${material.id}`,
        kind: 'material',
        label: material.label,
        detail: [
          `尚未取得。${material.purpose[0]}公开披露仅可提供补查线索。`,
          `Not obtained. ${material.purpose[1]} Public disclosures can only provide research clues.`,
        ],
        baseState: 'available',
        state: 'available',
        baseValue: null,
        value: null,
        unit: null,
        sourceRefs: [],
        // The requirement remains readable even when its motivating hypothesis is paused.
        dependsOn: [],
        blockers: [],
        metricIds: [],
        hypothesisId: id,
        materialStatus: 'needed',
      });
    }
  }
}
function finishGraph(
  graph: Omit<EvidenceLabGraph, 'edges' | 'withdrawnFactIds'>
): EvidenceLabGraph {
  const edges: LabEdge[] = graph.nodes.flatMap((node) =>
    node.dependsOn.map((dependency) => ({
      id: `edge-${dependency}-${node.id}`,
      from: dependency,
      to: node.id,
      relation: node.kind === 'hypothesis' ? 'motivates' : 'calculates',
      state: 'active',
    }))
  );
  for (const node of graph.nodes.filter((item) => item.kind === 'material')) {
    edges.push({
      id: `edge-hypothesis-${node.hypothesisId}-${node.id}`,
      from: `hypothesis-${node.hypothesisId}`,
      to: node.id,
      relation: 'tests',
      state: 'active',
    });
  }
  return evaluateEvidenceLab({ ...graph, edges, withdrawnFactIds: [] }, []);
}

/** Reuses assessment's issuer/period/provenance/conflict checks; no private run fields are copied. */
export function buildCompanyEvidenceLab(run: CompanyResearchRun): EvidenceLabGraph {
  const seed = deriveCompanyAssessment(run);
  const year = run.input.year;
  const nodes: LabNode[] = [];
  for (const [periodYear, field] of [
    [year, 'netProfit'],
    [year, 'ocf'],
    [year, 'revenue'],
    [year - 1, 'revenue'],
    [year, 'inventory'],
    [year - 1, 'inventory'],
    [year, 'receivables'],
    [year - 1, 'receivables'],
  ] as const) {
    const metricId = `${periodYear}-${field}`;
    const metric = seed.metrics.find((item) => item.id === metricId)!;
    const sources = metric.evidenceIds.flatMap((id) => {
      const source = seed.evidence.find((item) => item.id === id);
      return source ? [{ ...source }] : [];
    });
    nodes.push(
      rawFact(
        `fact-${metricId}`,
        metric.label,
        metric.value,
        metric.status,
        sources,
        [
          '第三方网页合并报表字段，尚未逐项采用官方原件。',
          'Third-party consolidated web-report field; not adopted from an official original.',
        ],
        [metricId]
      )
    );
  }
  commonCalculations(nodes, year);
  nodes.push(
    calculation(
      nodes,
      'calc-revenue-growth',
      ['营收同比变化', 'Revenue growth'],
      [`fact-${year}-revenue`, `fact-${year - 1}-revenue`],
      ([current, prior]) => percentage(current! - prior!, prior!),
      'percent',
      [
        '（本年营收 − 上年营收）÷ 正的上年营收 × 100%',
        '(Current revenue − prior revenue) / positive prior revenue × 100%',
      ],
      [
        '营收变化不是订单执行或实际回款的证明。',
        'Revenue changes do not prove order execution or actual collections.',
      ]
    )
  );
  for (const [field, label] of [
    ['inventory', ['存货余额变动', 'Inventory balance change']],
    ['receivables', ['应收账款余额变动', 'Receivables balance change']],
  ] as const) {
    nodes.push(
      calculation(
        nodes,
        `calc-${field}-balance-change`,
        label,
        [`fact-${year}-${field}`, `fact-${year - 1}-${field}`],
        ([current, prior]) => contextYuan(current! - prior!),
        'CNY',
        ['本年年末余额 − 上年年末余额', 'Current year-end balance − prior year-end balance'],
        [
          '余额变化不是现金流补充表的经营性调整项，也不能直接证明积压或坏账。',
          'Balance changes are not cash-flow reconciliation adjustments and do not establish inventory backlog or bad debt.',
        ]
      )
    );
  }
  explanations(
    nodes,
    {
      expansion: ['calc-profit-cash-gap', 'calc-inventory-balance-change', 'calc-revenue-growth'],
      'inventory-pressure': ['calc-profit-cash-gap', 'calc-inventory-balance-change'],
      'collection-pressure': ['calc-profit-cash-gap', 'calc-receivables-balance-change'],
    },
    year
  );
  return finishGraph({
    version: 1,
    origin: 'public-web',
    company:
      run.identity?.companyName ||
      (run.context?.securityCode === run.input.securityCode && run.context.orgId === run.input.orgId
        ? run.context.companyName
        : '') ||
      run.input.securityCode,
    year,
    basis: 'consolidated',
    snapshotFetchedAt: run.context?.fetchedAt,
    sourceNotice: [
      '公开网页数据；本地试验不改写原报告、评级或已采用证据。',
      'Public web data. Local trials do not rewrite the report, grade or adopted evidence.',
    ],
    nodes,
    defaultSelectionId: 'hypothesis-expansion',
  });
}

const originalLabels: Record<string, AssessmentText> = {
  netProfit: ['合并净利润', 'Consolidated net profit'],
  operatingCashFlow: ['经营现金净额', 'Operating cash flow'],
  inventoryAdjustment: ['存货调整', 'Inventory adjustment'],
  receivablesAdjustment: ['经营性应收调整', 'Operating receivables adjustment'],
  payablesAdjustment: ['经营性应付调整', 'Operating payables adjustment'],
  otherAdjustments: ['其余已披露调整', 'Other disclosed adjustments'],
};
const originalRefs = (
  refs: EvidenceRef[],
  year: number,
  fallback?: EvidenceLabExample['source'],
  annualChecked = false,
  metricKey = 'amount',
  retainedMaterials: readonly Material[] = [],
  company?: string
): LabSource[] =>
  refs.flatMap((ref, index) => {
    // Locate only the source already referenced by saved checks; never re-adopt snapshot observations.
    const retained = retainedMaterials.find(
      (material) =>
        material.id === ref.materialId &&
        material.company === company &&
        /^[a-zA-Z0-9_-]{1,200}$/.test(material.id) &&
        /^[a-zA-Z0-9_-]{1,200}$/.test(material.uploadId || '') &&
        /^[a-f\d]{64}$/i.test(material.sha256)
    );
    const url = retained
      ? `/api/materials/${retained.id}/file`
      : safeUrl(ref.sourceUrl || fallback?.url);
    if (
      !url ||
      !ref.quote.trim() ||
      (!annualChecked && !new RegExp(`(?:^|\\D)${year}(?:年|\\D|$)`).test(ref.quote))
    )
      return [];
    return [
      {
        id: `original-${ref.materialId}-${year}-${metricKey}-${ref.page ?? 'unknown'}-${index}`,
        label: retained?.title || fallback?.title || '原表摘录 · Original-report excerpt',
        url,
        ...(ref.page !== null ? { page: ref.page } : {}),
        quote: ref.quote,
        sourceQuality: 'excerpt' as const,
        ...(retained
          ? {
              retainedOriginal: {
                kind: 'upload' as const,
                isPdf: retained.filename.toLowerCase().endsWith('.pdf'),
              },
            }
          : {}),
      },
    ];
  });

function originalGraph(input: {
  company: string;
  year: number;
  metrics: ComputedMetric[];
  checks?: Report['checks'];
  bridge?: Report['bridge'];
  source?: EvidenceLabExample['source'];
  retainedMaterials?: readonly Material[];
}): EvidenceLabGraph {
  const { year } = input;
  const nodes: LabNode[] = [];
  for (const [periodYear, key] of [
    [year, 'netProfit'],
    [year, 'operatingCashFlow'],
    [year - 1, 'netProfit'],
    [year - 1, 'operatingCashFlow'],
    [year, 'inventoryAdjustment'],
    [year, 'receivablesAdjustment'],
    [year, 'payablesAdjustment'],
    [year, 'otherAdjustments'],
  ] as const) {
    const metric = input.metrics.find((item) => item.key === key);
    const check = input.checks?.find((item) => item.id === `${periodYear}-${key}`);
    const subjectCheck = input.checks?.find((item) => item.id === 'subject');
    const subjectConflict = subjectCheck?.status === 'fail';
    const subjectMissing = input.checks && subjectCheck?.status !== 'pass';
    const sourceScopeMissing =
      !input.checks &&
      (!input.source ||
        !/^[a-f\d]{64}$/i.test(input.source.sha256) ||
        !/合并|consolidated/i.test(input.source.title) ||
        !/年度|annual/i.test(input.source.title) ||
        !new RegExp(String(year)).test(input.source.title));
    const grouped =
      key === 'otherAdjustments'
        ? input.checks?.find((item) => item.id === 'group-sum')
        : undefined;
    const value =
      metric?.unit === 'CNY' ? (periodYear === year ? metric.value : metric.previousValue) : null;
    const refs = check?.sourceRefs || metric?.sourceRefs || [];
    const sources = originalRefs(
      refs,
      periodYear,
      input.source,
      check?.status === 'pass',
      key,
      input.retainedMaterials,
      input.company
    );
    const conflict = subjectConflict || check?.status === 'fail' || grouped?.status === 'fail';
    const baseState: LabBaseState = conflict
      ? 'conflict'
      : subjectMissing ||
          sourceScopeMissing ||
          (input.checks && check?.status !== 'pass') ||
          (key === 'otherAdjustments' && grouped?.status !== 'pass') ||
          contextFen(value) === null ||
          !sources.length
        ? 'missing'
        : 'available';
    const labKey = key === 'operatingCashFlow' ? 'ocf' : key;
    const label = originalLabels[key]!;
    nodes.push(
      rawFact(
        `fact-${periodYear}-${labKey}`,
        [`${periodYear} ${label[0]}`, `${periodYear} ${label[1]}`],
        value ?? null,
        baseState,
        sources,
        [
          '年度人民币合并原表金额；摘录与声明口径不等于原件真实性认证。',
          'Annual CNY consolidated report amount. Excerpts and declared scope do not authenticate the document.',
        ],
        [`${periodYear}-${key}`]
      )
    );
  }
  commonCalculations(nodes, year);
  for (const [key, label] of [
    ['netProfit', ['净利润同比变化', 'Profit growth']],
    ['ocf', ['经营现金同比变化', 'Operating cash growth']],
  ] as const) {
    nodes.push(
      calculation(
        nodes,
        `calc-${key}-growth`,
        label,
        [`fact-${year}-${key}`, `fact-${year - 1}-${key}`],
        ([current, prior]) => percentage(current! - prior!, prior!),
        'percent',
        [
          '（本年 − 上年）÷ 正的上年金额 × 100%',
          '(Current − prior) / positive prior amount × 100%',
        ],
        [
          '上年金额为零或负时，不显示常规同比比例。',
          'Conventional growth is withheld for zero or negative prior amounts.',
        ]
      )
    );
  }
  for (const [key, label] of [
    ['inventoryAdjustment', ['存货调整所示占用', 'Inventory cash adjustment']],
    ['receivablesAdjustment', ['经营性应收调整所示占用', 'Operating receivables cash adjustment']],
  ] as const) {
    nodes.push(
      calculation(
        nodes,
        `calc-${key}`,
        label,
        [`fact-${year}-${key}`],
        ([value]) => contextYuan(value!),
        'CNY',
        [
          '原表补充资料调整项，保持原符号',
          'Cash-flow reconciliation adjustment, retaining the original sign',
        ],
        [
          '负值表示该补充表分项减少经营现金；不是年末余额变化，也不证明经营原因。',
          'A negative adjustment reduces operating cash in the reconciliation. It is not a year-end balance change and does not establish a business cause.',
        ]
      )
    );
  }
  const bridgeInputs = [
    `fact-${year}-netProfit`,
    `fact-${year}-inventoryAdjustment`,
    `fact-${year}-receivablesAdjustment`,
    `fact-${year}-payablesAdjustment`,
    `fact-${year}-otherAdjustments`,
    `fact-${year}-ocf`,
  ];
  const bridge = calculation(
    nodes,
    'calc-cash-bridge',
    ['现金桥核对', 'Cash-bridge reconciliation'],
    bridgeInputs,
    (values) =>
      contextYuan(values.slice(0, -1).reduce((total, value) => total + value, 0n) - values.at(-1)!),
    'CNY',
    [
      '净利润 + 四组已披露调整 − 经营现金；通过时差额为零',
      'Profit + four disclosed adjustment groups − operating cash; zero means reconciled',
    ],
    [
      '不以残差补数。完整原始分组与范围核对通过，才能采用现金桥。',
      'No residual zero-fill. A bridge requires complete original groups and scope checks.',
    ]
  );
  // A numeric sum cannot replace the engine's grouped-original-row and scope checks.
  if (
    bridge.baseState === 'available' &&
    (bridge.baseValue !== '0.00' ||
      !input.bridge ||
      input.checks?.some((check) => check.status === 'fail'))
  ) {
    const conflict =
      bridge.baseValue !== '0.00' || input.checks?.some((check) => check.status === 'fail');
    bridge.baseState = conflict ? 'conflict' : 'missing';
    bridge.state = bridge.baseState;
    bridge.value = bridge.baseValue = null;
  }
  nodes.push(bridge);
  explanations(
    nodes,
    {
      expansion: ['calc-profit-cash-gap', 'calc-inventoryAdjustment', 'calc-netProfit-growth'],
      'inventory-pressure': ['calc-profit-cash-gap', 'calc-inventoryAdjustment'],
      'collection-pressure': ['calc-profit-cash-gap', 'calc-receivablesAdjustment'],
    },
    year
  );
  return finishGraph({
    version: 1,
    origin: 'original-report',
    company: input.company,
    year,
    basis: 'consolidated',
    sourceNotice: [
      '原表金额与现金流补充资料；本地试验不修改保存的核查。',
      'Original-report amounts and cash-flow reconciliation. Local trials do not alter the saved review.',
    ],
    nodes,
    defaultSelectionId: 'hypothesis-expansion',
  });
}
/** The saved engine checks remain authoritative. No raw observation is re-adopted while rendering. */
export function buildReportEvidenceLab(report: Report): EvidenceLabGraph {
  return originalGraph({ ...report, retainedMaterials: report.snapshot });
}
/** Public API examples contain exact report metrics, never a fabricated web snapshot. */
export function buildExampleEvidenceLab(example: EvidenceLabExample): EvidenceLabGraph {
  return originalGraph(example);
}

/** Pure, reversible dependency withdrawal. Only fact IDs can be withdrawn. */
export function evaluateEvidenceLab(
  graph: EvidenceLabGraph,
  withdrawnFactIds: readonly string[]
): EvidenceLabGraph {
  const result = structuredClone(graph);
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  const withdrawn = new Set(withdrawnFactIds.filter((id) => byId.get(id)?.kind === 'fact'));
  result.withdrawnFactIds = [...withdrawn];
  const completed = new Set<string>(),
    visiting = new Set<string>();
  const apply = (node: LabNode): LabNode => {
    if (completed.has(node.id)) return node;
    node.value = node.baseValue;
    node.state = node.baseState;
    node.reason = undefined;
    node.blockers = [];
    if (withdrawn.has(node.id)) {
      node.state = 'withdrawn';
      node.value = null;
      node.reason = [
        '本地试验已撤回这条事实；原件与保存记录仍保留。',
        'Withdrawn in this local trial; the original and saved record remain.',
      ];
    } else if (visiting.has(node.id)) {
      node.state = 'paused';
      node.value = null;
      node.reason = ['依赖关系存在循环，暂停计算。', 'A dependency cycle pauses calculation.'];
      completed.add(node.id);
      return node;
    } else {
      visiting.add(node.id);
      for (const id of node.dependsOn) {
        const dependency = byId.get(id);
        if (!dependency || apply(dependency).state !== 'available') node.blockers.push(id);
      }
      visiting.delete(node.id);
      if (
        node.blockers.length &&
        (node.baseState === 'available' ||
          (node.baseState === 'not-applicable' &&
            node.blockers.some((id) =>
              ['withdrawn', 'paused'].includes(byId.get(id)?.state || '')
            )))
      ) {
        node.state = 'paused';
        node.value = null;
        const labels = node.blockers.map((id) => byId.get(id)?.label || [id, id]);
        node.reason = [
          `依赖的${labels.map((label) => label[0]).join('、')}不可采用，暂停本节点。`,
          `Paused because ${labels.map((label) => label[1]).join(', ')} cannot be adopted.`,
        ];
      } else if (node.baseState !== 'available') {
        node.value = null;
        node.reason =
          node.baseState === 'conflict'
            ? [
                '来源或口径冲突，不选择数值继续计算。',
                'Source or scope conflict; no value is selected for calculation.',
              ]
            : node.baseState === 'not-applicable'
              ? node.kind === 'hypothesis'
                ? [
                    '本年未形成正利润低经营现金组合，这类原因检验不适用。',
                    'The positive-profit/low-operating-cash pattern is absent; this cause test is inapplicable.',
                  ]
                : [
                    '分母为零或负值，比例不适用。',
                    'The ratio is inapplicable because its denominator is nonpositive.',
                  ]
              : [
                  '所需同年度、同口径数据或有效来源尚未取得，不填零。',
                  'Required same-period, same-scope data or a valid source is missing; no zero-fill.',
                ];
      }
    }
    completed.add(node.id);
    return node;
  };
  for (const node of result.nodes) apply(node);
  for (const edge of result.edges) {
    edge.state =
      byId.get(edge.from)?.state === 'available' && byId.get(edge.to)?.state === 'available'
        ? 'active'
        : 'paused';
    edge.reason =
      edge.state === 'paused'
        ? [
            '关联依据不可采用，暂停这条关系。',
            'The linked evidence is unavailable; this relationship is paused.',
          ]
        : undefined;
  }
  return result;
}

/** Ancestors and descendants of the selection; sibling claims are not highlighted as dependencies. */
export function highlightEvidenceLab(
  graph: EvidenceLabGraph,
  selectedId: string
): { nodeIds: string[]; edgeIds: string[] } {
  if (!graph.nodes.some((node) => node.id === selectedId)) return { nodeIds: [], edgeIds: [] };
  const nodes = new Set<string>([selectedId]),
    edges = new Set<string>();
  const walk = (forward: boolean) => {
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const edge of graph.edges.filter((item) => (forward ? item.from : item.to) === id)) {
        const next = forward ? edge.to : edge.from;
        edges.add(edge.id);
        nodes.add(next);
        visit(next);
      }
    };
    visit(selectedId);
  };
  walk(false);
  walk(true);
  return { nodeIds: [...nodes], edgeIds: [...edges] };
}
