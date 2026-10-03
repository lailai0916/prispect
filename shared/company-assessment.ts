/** Public-data analysis. This never adopts report candidates or sends private working papers. */
import type { CompanyResearchRun } from './contracts.js';
import type {
  CompanyDiscussion,
  CompanyNews,
  CompanyPublicExcerpt,
  ContextAmountField,
} from './company-workspace.js';
import { contextAmountFields } from './company-workspace.js';
import { contextFen, contextYuan, contextFieldLabels } from './company-analysis.js';

export type AssessmentText = readonly [string, string];
export type AssessmentDimensionId =
  | 'profitability'
  | 'cash'
  | 'solvency'
  | 'workingCapital'
  | 'industry'
  | 'events';
export type AssessmentStatus =
  | 'strong'
  | 'balanced'
  | 'pressure'
  | 'high-pressure'
  | 'unknown'
  | 'conflict';
export interface AssessmentMetric {
  id: string;
  label: AssessmentText;
  value: string | null;
  display: AssessmentText;
  unit: 'CNY' | 'percent' | 'times' | 'percentage-points' | 'count';
  status: 'available' | 'missing' | 'conflict' | 'not-applicable';
  evidenceIds: string[];
  formula: AssessmentText;
}
export interface AssessmentEvidence {
  id: string;
  kind: 'financial' | 'industry' | 'disclosure' | 'news' | 'discussion' | 'profile';
  label: string;
  url: string;
  period?: string;
  quote?: string;
  page?: number;
  sourceQuality: 'web' | 'excerpt' | 'headline' | 'opinion';
}
export interface AssessmentDimension {
  id: AssessmentDimensionId;
  label: AssessmentText;
  score: number | null;
  status: AssessmentStatus;
  metricIds: string[];
  ruleSummary: AssessmentText;
}
export interface AssessmentJudgment {
  text: { zh: string; en: string };
  metricIds: string[];
  evidenceIds: string[];
}
export interface AssessmentNarrative {
  summary: AssessmentJudgment;
  dimensions: (AssessmentJudgment & { dimensionId: AssessmentDimensionId })[];
  strengths: AssessmentJudgment[];
  risks: AssessmentJudgment[];
  actions: AssessmentJudgment[];
  changeConditions: AssessmentJudgment[];
}
export interface AssessmentResearchStep {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  summary: string;
}
export interface CompanyAssessment {
  version: 1;
  year: number;
  basis: 'consolidated';
  snapshotFetchedAt: string;
  generatedAt: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'NR';
  score: number | null;
  ratingConstraints?: AssessmentText[];
  methodologyVersion: 'financial-screen-v1';
  dimensions: AssessmentDimension[];
  metrics: AssessmentMetric[];
  evidence: AssessmentEvidence[];
  coverage: {
    fields: number;
    requiredFields: number;
    years: number;
    sources: number;
    news: number;
    discussions?: number;
    mediaBodies?: number;
    discussionBodies?: number;
    disclosures: number;
    excerpts: number;
    peers: number;
  };
  gaps: AssessmentText[];
  narrative?: AssessmentNarrative;
  research?: {
    goal: string;
    steps: AssessmentResearchStep[];
    modelCalls: number;
    toolCalls: number;
  };
  model: {
    status: 'completed' | 'not-configured' | 'failed' | 'not-called';
    name?: string;
    provider?: string;
    warning?: string;
    calls?: number;
  };
}

export const ASSESSMENT_METHODOLOGY_VERSION = 'financial-screen-v1' as const;
export const ASSESSMENT_METHODOLOGY: readonly AssessmentText[] = [
  [
    '析光财务评级反映所选年度通用行业财务筛选，使用合并报表口径；不属于评级机构的信用等级。',
    'Prispect financial grades screen the selected annual consolidated financials of general-industry issuers; they are not credit-agency ratings.',
  ],
  [
    '盈利成长、经营现金、偿付杠杆、营运占用各占 25%；同行和事件提供定性判断，不机械扣分。',
    'Profitability, operating cash, solvency and working-capital pressure each carry 25%; industry and events add qualitative context without automatic deductions.',
  ],
  [
    '四个核心维度均具备关键数据且无冲突才评分；不补零、不重分配缺失权重。',
    'All four core dimensions need their key data without conflicts. Missing data is not zero-filled and weights are not redistributed.',
  ],
  [
    'A：80 分及以上；B：60–79.99；C：40–59.99；D：低于 40；NR：暂不评级。阈值为透明筛选参考，未经行业风险认证。',
    'A: at least 80; B: 60–79.99; C: 40–59.99; D: below 40; NR: not rated. These transparent screening thresholds are not calibrated industry risk certifications.',
  ],
  [
    '最终等级同时受均分和弱项上限约束：一个核心维度低于 40 分，最高 C；两个及以上低于 40 分，最高 D。均分仍原样保留，触发原因单独显示，避免强项掩盖弱项；该上限也是未校准的筛选规则。',
    'The final grade uses both the arithmetic score and weak-dimension caps: one core dimension below 40 caps the grade at C; two or more cap it at D. The arithmetic score is retained and triggers are shown separately so strengths cannot conceal weaknesses. This cap is also an uncalibrated screening rule.',
  ],
  [
    '盈利成长：盈利且营收不降为 100，营收下降不超过 10% 为 60，下降超过 10% 为 25；零利润为 25，亏损为 0。同比仅在上年营收为正时计算。',
    'Profitability: positive profit with nondeclining revenue scores 100; revenue decline up to 10% scores 60; larger decline scores 25. Zero profit scores 25 and loss scores 0. Growth requires positive prior revenue.',
  ],
  [
    '经营现金：正利润下现金利润比至少 100% 为 100，至少 70% 为 60，低于 70% 为 25，负现金为 0；非正利润下不计算比例，正现金为 60，零现金为 25，负现金为 0。',
    'Operating cash: with positive profit, cash-to-profit of at least 100% scores 100, at least 70% scores 60, below 70% scores 25, and negative cash scores 0. With nonpositive profit the ratio is inapplicable: positive cash scores 60, zero scores 25 and negative cash scores 0.',
  ],
  [
    '偿付杠杆：现金覆盖两项短债至少 1 倍/0.5 倍/低于 0.5 倍，分别 100/60/25；负债率至多 50%/70%/90%/超过 90%，分别 100/60/25/0。两者等权；两项短债为零时只采用负债率。',
    'Solvency: monetary funds covering the two short-debt fields at least 1x/0.5x/below 0.5x scores 100/60/25; liabilities-to-assets at most 50%/70%/90%/above 90% scores 100/60/25/0. The signals are equally weighted; zero debt in both fields uses leverage alone.',
  ],
  [
    '营运占用：（应收账款 + 存货）÷ 营收；较上年不升为 100，增加不超过 10 个百分点为 60，超过为 25。它不是坏账率或现金转换周期。',
    'Working capital: (receivables + inventory) / revenue. A nonincrease scores 100; an increase up to 10 percentage points scores 60; a larger increase scores 25. This is neither a bad-debt rate nor a cash-conversion cycle.',
  ],
  [
    '金额以整数分计算；阈值比较使用未四舍五入的分数，显示比例保留两位小数。历史货币资金不等于当前可用现金，短债只包括两个明确字段。',
    'Amounts use integer cents and threshold tests use unrounded fractions. Display ratios have two decimals. Historical monetary funds are not current available cash; short debt includes only the two named fields.',
  ],
];

const labels: Record<AssessmentDimensionId, AssessmentText> = {
  profitability: ['盈利成长', 'Profitability and growth'],
  cash: ['经营现金质量', 'Operating cash quality'],
  solvency: ['偿付杠杆', 'Solvency and leverage'],
  workingCapital: ['营运占用', 'Working-capital pressure'],
  industry: ['同行位置', 'Industry position'],
  events: ['事件与治理', 'Events and governance'],
};
const requiredFields: ContextAmountField[] = [
  'revenue',
  'netProfit',
  'ocf',
  'cash',
  'shortLoan',
  'currentPortionDebt',
  'totalAssets',
  'totalLiabilities',
  'receivables',
  'inventory',
];
const previousFields: ContextAmountField[] = ['revenue', 'receivables', 'inventory'];
const statusFromScore = (score: number | null): AssessmentStatus =>
  score === null
    ? 'unknown'
    : score >= 80
      ? 'strong'
      : score >= 60
        ? 'balanced'
        : score >= 40
          ? 'pressure'
          : 'high-pressure';
/** The grade cap is separate from the reproducible arithmetic score. */
export function resolveAssessmentRating(
  score: number | null,
  core: readonly Pick<AssessmentDimension, 'id' | 'score'>[]
): Pick<CompanyAssessment, 'grade' | 'ratingConstraints'> {
  if (score === null) return { grade: 'NR', ratingConstraints: [] };
  const numericalGrade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  const weak = core.filter((item) => item.score !== null && item.score < 40);
  if (!weak.length) return { grade: numericalGrade, ratingConstraints: [] };
  const maximum = weak.length >= 2 ? 'D' : 'C';
  const grade = numericalGrade === 'D' || maximum === 'D' ? 'D' : 'C';
  return {
    grade,
    ratingConstraints: [
      [
        `${weak.map((item) => labels[item.id][0]).join('、')}低于核心维度筛选阈值，最终等级最高为 ${maximum}；均分不因此改写。`,
        `${weak.map((item) => labels[item.id][1]).join(' and ')} ${weak.length > 1 ? 'are' : 'is'} below the core-dimension screening threshold, capping the final grade at ${maximum}; the arithmetic score is unchanged.`,
      ],
    ],
  };
}
const safeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 8000) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** These Chinese public providers publish zone-less dates in Asia/Shanghai. */
const publicDateInstant = (value: string): number => {
  const normalized = value.replace(' ', 'T');
  return Date.parse(
    normalized.length === 10
      ? `${normalized}T00:00:00+08:00`
      : /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
        ? normalized
        : `${normalized}+08:00`
  );
};
const validPublicDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 40) return false;
  const match =
    /^(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      value
    );
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    (!match[4] || Number(match[4]) < 24) &&
    (!match[5] || Number(match[5]) < 60) &&
    (!match[6] || Number(match[6]) < 60) &&
    Number.isFinite(publicDateInstant(value)) &&
    date.getTime() <= Date.now() + 24 * 60 * 60 * 1000
  );
};
const articleUrl = (value: unknown): URL | null => {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.port || url.search || url.hash) return null;
  url.protocol = 'https:';
  return url;
};
function validExcerpt(
  row: { date: string; url: string; excerpt?: CompanyPublicExcerpt },
  expectedUrl: URL
): CompanyPublicExcerpt | null {
  const excerpt = row.excerpt;
  if (
    !excerpt ||
    typeof excerpt.text !== 'string' ||
    !excerpt.text.trim() ||
    !/^[a-f\d]{64}$/i.test(excerpt.sha256) ||
    typeof excerpt.readAt !== 'string' ||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      excerpt.readAt
    ) ||
    !validPublicDate(excerpt.readAt) ||
    !validPublicDate(row.date) ||
    !Number.isFinite(Date.parse(excerpt.readAt)) ||
    Date.parse(excerpt.readAt) > Date.now() + 5 * 60 * 1000 ||
    Date.parse(excerpt.readAt) < publicDateInstant(row.date) - 5 * 60 * 1000
  )
    return null;
  const actual = safeUrl(excerpt.url);
  if (!actual || new URL(actual).protocol !== 'https:' || actual !== expectedUrl.href) return null;
  return {
    text: excerpt.text.trim().slice(0, 12_000),
    url: actual,
    sha256: excerpt.sha256,
    readAt: excerpt.readAt,
  };
}

/** Only the two media sources whose article readers are implemented count as read bodies. */
export function readNewsMediaExcerpt(row: CompanyNews): CompanyPublicExcerpt | null {
  if (row.contentScope !== 'media-excerpt') return null;
  const url = articleUrl(row.url);
  if (
    !url ||
    (!(url.hostname === 'finance.eastmoney.com' && /^\/a\/\d{14,24}\.html$/.test(url.pathname)) &&
      !(
        url.hostname === 'finance.sina.com.cn' &&
        /^\/(?:stock|roll)\/(?:[a-zA-Z0-9_-]+\/)*doc-[a-zA-Z0-9]+\.shtml$/.test(url.pathname)
      ))
  )
    return null;
  return validExcerpt(row, url);
}

/** Stable source IDs reuse collector URL hashes; legacy snapshots keep their numeric news IDs. */
export function assessmentNewsEvidenceId(row: CompanyNews, index: number): string {
  const id = row.id;
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id)) return `news-${index + 1}`;
  const hash = /^public-news-([a-f\d]{24})$/i.exec(id)?.[1];
  if (hash) return `news-${hash}`;
  return id.startsWith('news-') ? id : `news-${/^\d+$/.test(id) ? 'id-' : ''}${id}`;
}

/** A forum source must belong to this exact board and its URL-bound public post ID. */
export function assessmentDiscussionEvidenceId(
  row: CompanyDiscussion,
  securityCode: string
): string | null {
  if (
    !/^\d{6}$/.test(securityCode) ||
    row.securityCode !== securityCode ||
    !validPublicDate(row.date) ||
    typeof row.title !== 'string' ||
    !row.title.trim()
  )
    return null;
  const safe = safeUrl(row.url);
  if (!safe) return null;
  const url = new URL(safe);
  const path = /^\/news,(\d{6}),(\d{1,20})\.html$/.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'guba.eastmoney.com' ||
    url.port ||
    url.search ||
    url.hash ||
    !path ||
    path[1] !== securityCode ||
    (row.id !== path[2] && row.id !== `guba-${path[2]}`)
  )
    return null;
  return `guba-${path[2]}`;
}

export function readDiscussionPostExcerpt(
  row: CompanyDiscussion,
  securityCode: string
): CompanyPublicExcerpt | null {
  if (row.textScope !== 'post-excerpt' || !assessmentDiscussionEvidenceId(row, securityCode))
    return null;
  return validExcerpt(row, new URL(row.url));
}
interface Fraction {
  numerator: bigint;
  denominator: bigint;
}
/** Ratios and threshold tests remain rational until the display boundary. */
function fraction(numerator: bigint | null, denominator: bigint | null): Fraction | null {
  return numerator !== null && denominator !== null && denominator > 0n
    ? { numerator, denominator }
    : null;
}
function compareRatio(value: Fraction, numerator: bigint, denominator = 1n): number {
  const difference = value.numerator * denominator - numerator * value.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
function decimal(value: Fraction, multiplier = 1n): string {
  const scaled = value.numerator * multiplier * 100n;
  const absolute = scaled < 0n ? -scaled : scaled;
  const rounded = (absolute + value.denominator / 2n) / value.denominator;
  return `${scaled < 0n && rounded > 0n ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
}
interface FieldValue {
  value: bigint | null;
  status: AssessmentMetric['status'];
  evidenceIds: string[];
}

export function deriveCompanyAssessment(run: CompanyResearchRun): CompanyAssessment {
  const year = run.input.year;
  const snapshot = run.context;
  const sameEntity =
    !!snapshot &&
    snapshot.securityCode === run.input.securityCode &&
    snapshot.orgId === run.input.orgId;
  const unsupported =
    !!run.informationGap ||
    (!!run.identity && !['sse', 'szse'].includes(run.identity.exchange)) ||
    !!snapshot?.warnings.some((warning) => warning.includes('来源主体或机构类型存在冲突'));
  const evidence: AssessmentEvidence[] = [];
  const metrics: AssessmentMetric[] = [];
  const gaps: AssessmentText[] = [];
  const publicRows =
    sameEntity && !unsupported
      ? (snapshot?.financials || [])
          .filter(
            (row) =>
              row.annual &&
              /^20\d{2}-12-31$/.test(row.period) &&
              Number(row.period.slice(0, 4)) <= year
          )
          .sort((a, b) => a.period.localeCompare(b.period))
          .slice(-6)
      : [];
  const addEvidence = (item: AssessmentEvidence): string | null => {
    const url = safeUrl(item.url);
    if (!url) return null;
    if (!evidence.some((existing) => existing.id === item.id)) evidence.push({ ...item, url });
    return item.id;
  };
  if (sameEntity) {
    for (const source of snapshot!.sources.slice(0, 40)) {
      if (source.status === 'manual') continue;
      // Forum listing receipts are coverage metadata, not individually validated public posts.
      if (/股吧|公开讨论|帖子/.test(source.dimension)) continue;
      const kind = /财务/.test(source.dimension)
        ? 'financial'
        : /公告/.test(source.dimension)
          ? 'disclosure'
          : /新闻/.test(source.dimension)
            ? 'news'
            : 'profile';
      addEvidence({
        id: `source-${source.id}`,
        kind,
        label: `${source.provider} · ${source.dimension} · ${source.status}`,
        url: source.url,
        quote: source.note.slice(0, 1000),
        sourceQuality: 'web',
      });
    }
  }
  const values = new Map<string, FieldValue>();
  const read = (periodYear: number, field: ContextAmountField): FieldValue => {
    const id = `${periodYear}-${field}`;
    const cached = values.get(id);
    if (cached) return cached;
    const rows = publicRows.filter((row) => row.period === `${periodYear}-12-31`);
    const parsed = rows.map((row) => contextFen(row.amounts[field]));
    const known = parsed.filter((amount): amount is bigint => amount !== null);
    const conflict =
      (!!snapshot && !sameEntity) ||
      !!snapshot?.comparisons.some(
        (check) => check.period === `${periodYear}-12-31` && check.field === field && !check.matches
      ) ||
      known.some((amount) => amount !== known[0]);
    const result: FieldValue = {
      value: null,
      status: conflict ? 'conflict' : 'missing',
      evidenceIds: [],
    };
    if (!conflict && known.length && parsed.every((amount) => amount !== null)) {
      for (const row of rows) {
        const provider = row.fieldSources[field];
        const table = [
          'revenue',
          'netProfit',
          'parentProfit',
          'deductedProfit',
          'operatingProfit',
          'totalProfit',
          'financeExpense',
        ].includes(field)
          ? 'income'
          : ['ocf', 'investingCash', 'financingCash', 'salesCash'].includes(field)
            ? 'cashflow'
            : 'balance';
        const receipt = snapshot!.sources.find((source) =>
          provider === '新浪财经'
            ? source.id === `sina-${table}`
            : provider === '东方财富'
              ? source.id === `em-${table}`
              : false
        );
        if (receipt && !['available', 'partial'].includes(receipt.status)) continue;
        const url =
          safeUrl(receipt?.url) || row.sourceUrls.map(safeUrl).find((item) => item !== null);
        if (!url) continue;
        const evidenceId = addEvidence({
          id: `financial-${id}`,
          kind: 'financial',
          label: `${row.period} · ${contextFieldLabels[field][0]} · ${provider || '网页报表字段'}`,
          url,
          period: row.period,
          quote: `${contextFieldLabels[field][0]}：${contextYuan(known[0]!)} 元；第三方网页字段，尚未逐项核对官方原件。`,
          sourceQuality: 'web',
        });
        if (evidenceId && !result.evidenceIds.includes(evidenceId))
          result.evidenceIds.push(evidenceId);
      }
      if (result.evidenceIds.length) {
        result.value = known[0]!;
        result.status = 'available';
      }
    }
    values.set(id, result);
    return result;
  };
  const amountMetric = (periodYear: number, field: ContextAmountField) => {
    const id = `${periodYear}-${field}`;
    const existing = metrics.find((metric) => metric.id === id);
    if (existing) return existing;
    const input = read(periodYear, field);
    const value = input.value === null ? null : contextYuan(input.value);
    const item: AssessmentMetric = {
      id,
      label: [
        `${periodYear} ${contextFieldLabels[field][0]}`,
        `${periodYear} ${contextFieldLabels[field][1]}`,
      ],
      value,
      display:
        value === null
          ? [
              input.status === 'conflict' ? '来源冲突' : '未取得',
              input.status === 'conflict' ? 'Source conflict' : 'Unavailable',
            ]
          : [`${value} 元`, `CNY ${value}`],
      unit: 'CNY',
      status: input.status,
      evidenceIds: [...input.evidenceIds],
      formula: ['该年度人民币合并报表网页字段', 'Annual CNY consolidated web-report field'],
    };
    metrics.push(item);
    return item;
  };
  // Include historical public amounts with their field-level provenance, never raw run data.
  for (const periodYear of [...new Set(publicRows.map((row) => Number(row.period.slice(0, 4))))]) {
    for (const field of contextAmountFields) amountMetric(periodYear, field);
  }
  for (const field of requiredFields) amountMetric(year, field);
  for (const field of previousFields) amountMetric(year - 1, field);
  const amount = (field: ContextAmountField, periodYear = year) => read(periodYear, field).value;
  const deps = (references: { year: number; field: ContextAmountField }[]) =>
    references.map((reference) => amountMetric(reference.year, reference.field));
  const ratioMetric = (
    id: string,
    label: AssessmentText,
    value: Fraction | null,
    references: { year: number; field: ContextAmountField }[],
    formula: AssessmentText,
    unit: AssessmentMetric['unit'] = 'percent'
  ): AssessmentMetric => {
    const inputs = deps(references);
    const status: AssessmentMetric['status'] = inputs.some((item) => item.status === 'conflict')
      ? 'conflict'
      : inputs.some((item) => item.status !== 'available')
        ? 'missing'
        : value === null
          ? 'not-applicable'
          : 'available';
    const numeric =
      status === 'available' && value
        ? decimal(value, unit === 'percent' || unit === 'percentage-points' ? 100n : 1n)
        : null;
    const suffix = unit === 'percent' ? '%' : unit === 'times' ? ' 倍' : ' 个百分点';
    const item: AssessmentMetric = {
      id,
      label,
      value: numeric,
      display:
        numeric === null
          ? [
              status === 'conflict'
                ? '来源冲突'
                : status === 'not-applicable'
                  ? '不适用'
                  : '未取得',
              status === 'conflict'
                ? 'Source conflict'
                : status === 'not-applicable'
                  ? 'Not applicable'
                  : 'Unavailable',
            ]
          : [
              `${numeric}${suffix}`,
              `${numeric}${unit === 'percent' ? '%' : unit === 'times' ? 'x' : ' pp'}`,
            ],
      unit,
      status,
      evidenceIds: [...new Set(inputs.flatMap((input) => input.evidenceIds))],
      formula,
    };
    metrics.push(item);
    return item;
  };
  const refs = (...fields: ContextAmountField[]) => fields.map((field) => ({ year, field }));
  const revenue = amount('revenue'),
    profit = amount('netProfit'),
    cashFlow = amount('ocf'),
    priorRevenue = amount('revenue', year - 1);
  const growth = fraction(
    revenue !== null && priorRevenue !== null ? revenue - priorRevenue : null,
    priorRevenue
  );
  const cashRatio = fraction(cashFlow, profit);
  const funds = amount('cash'),
    shortLoan = amount('shortLoan'),
    currentDebt = amount('currentPortionDebt');
  const shortDebt =
    shortLoan !== null && currentDebt !== null && shortLoan >= 0n && currentDebt >= 0n
      ? shortLoan + currentDebt
      : null;
  const debtRatio = fraction(funds !== null && funds >= 0n ? funds : null, shortDebt);
  const assets = amount('totalAssets'),
    liabilities = amount('totalLiabilities');
  const leverage = fraction(liabilities !== null && liabilities >= 0n ? liabilities : null, assets);
  const working = (periodYear: number): Fraction | null => {
    const receivables = amount('receivables', periodYear),
      inventory = amount('inventory', periodYear);
    return fraction(
      receivables !== null && inventory !== null && receivables >= 0n && inventory >= 0n
        ? receivables + inventory
        : null,
      amount('revenue', periodYear)
    );
  };
  const occupation = working(year),
    priorOccupation = working(year - 1);
  const occupationChange: Fraction | null =
    occupation && priorOccupation
      ? {
          numerator:
            occupation.numerator * priorOccupation.denominator -
            priorOccupation.numerator * occupation.denominator,
          denominator: occupation.denominator * priorOccupation.denominator,
        }
      : null;
  ratioMetric(
    'revenue-growth',
    ['营收同比变化', 'Revenue growth'],
    growth,
    [...refs('revenue'), { year: year - 1, field: 'revenue' }],
    [
      '（本年营收 − 上年营收）÷ 上年营收；上年营收必须为正',
      '(Current revenue − prior revenue) / positive prior revenue',
    ]
  );
  ratioMetric(
    'cash-profit',
    ['现金利润比', 'Cash-to-profit ratio'],
    cashRatio,
    refs('ocf', 'netProfit'),
    [
      '年度合并经营现金净额 ÷ 正的合并净利润',
      'Annual consolidated operating cash / positive consolidated net profit',
    ]
  );
  ratioMetric(
    'cash-short-debt',
    ['现金覆盖两项短债', 'Cash / two short-debt fields'],
    debtRatio,
    refs('cash', 'shortLoan', 'currentPortionDebt'),
    [
      '货币资金 ÷（短期借款 + 一年内到期非流动负债）；历史余额，未扣受限资金',
      'Monetary funds / (short-term borrowing + current portion of noncurrent liabilities); historical balances without restricted-fund adjustment',
    ],
    'times'
  );
  ratioMetric(
    'liabilities-assets',
    ['资产负债率', 'Liabilities / assets'],
    leverage,
    refs('totalLiabilities', 'totalAssets'),
    ['总负债 ÷ 正的总资产', 'Total liabilities / positive total assets']
  );
  ratioMetric(
    'working-capital-revenue',
    ['应收与存货占营收', 'Receivables and inventory / revenue'],
    occupation,
    refs('receivables', 'inventory', 'revenue'),
    [
      '（应收账款 + 存货）÷ 正的年度营收',
      '(Accounts receivable + inventory) / positive annual revenue',
    ]
  );
  ratioMetric(
    'working-capital-change',
    ['营运占用变化', 'Change in working-capital occupation'],
    occupationChange,
    [
      ...refs('receivables', 'inventory', 'revenue'),
      ...previousFields.map((field) => ({ year: year - 1, field })),
    ],
    [
      '本年（应收 + 存货）/营收 − 上年同口径比率；单位为百分点',
      'Current (receivables + inventory) / revenue minus prior-year ratio; percentage points',
    ],
    'percentage-points'
  );
  const currentAssets = amount('currentAssets');
  const currentLiabilities = amount('currentLiabilities');
  const inventory = amount('inventory');
  ratioMetric(
    'current-ratio',
    ['流动比率', 'Current ratio'],
    fraction(
      currentAssets !== null && currentAssets >= 0n ? currentAssets : null,
      currentLiabilities
    ),
    refs('currentAssets', 'currentLiabilities'),
    [
      '流动资产 ÷ 正的流动负债；余额不等于可立即变现的资金',
      'Current assets / positive current liabilities; balances are not immediately available funds',
    ],
    'times'
  );
  ratioMetric(
    'quick-ratio',
    ['速动比率参考值', 'Quick-ratio proxy'],
    fraction(
      currentAssets !== null && inventory !== null && currentAssets >= inventory && inventory >= 0n
        ? currentAssets - inventory
        : null,
      currentLiabilities
    ),
    refs('currentAssets', 'inventory', 'currentLiabilities'),
    [
      '（流动资产 − 存货）÷ 正的流动负债；未进一步扣除预付等项目',
      '(Current assets − inventory) / positive current liabilities; prepayments and other items are not further deducted',
    ],
    'times'
  );
  const salesCash = amount('salesCash');
  ratioMetric(
    'sales-cash-revenue',
    ['销售现金 / 营收参考值', 'Sales cash / revenue reference'],
    fraction(salesCash !== null && salesCash >= 0n ? salesCash : null, revenue),
    refs('salesCash', 'revenue'),
    [
      '销售商品及服务收到的现金 ÷ 年度营收；含税与时点不同，不是销售收款率',
      'Cash received from sales / annual revenue; tax and timing differ, so this is not a collection rate',
    ]
  );
  ratioMetric(
    'net-profit-margin',
    ['合并净利率', 'Consolidated net margin'],
    fraction(profit, revenue),
    refs('netProfit', 'revenue'),
    ['合并净利润 ÷ 正的年度营收', 'Consolidated net profit / positive annual revenue']
  );
  const ratioReceipt = sameEntity
    ? snapshot!.sources.find(
        (source) =>
          source.id === 'em-ratios' &&
          ['available', 'partial'].includes(source.status) &&
          safeUrl(source.url)
      )
    : undefined;
  for (const [key, label] of Object.entries({
    grossMargin: ['毛利率', 'Gross margin'],
    roe: ['加权净资产收益率', 'Weighted ROE'],
  } as const)) {
    const rows = publicRows.filter((row) => row.period === `${year}-12-31`);
    const numbers = rows.map((row) => row.ratios[key as 'grossMargin' | 'roe']);
    const known = numbers.filter(
      (value): value is number => value !== null && Number.isFinite(value)
    );
    const conflict = known.some((value) => value !== known[0]);
    if (
      !ratioReceipt ||
      !known.length ||
      numbers.some((value) => value === null || !Number.isFinite(value))
    )
      continue;
    const evidenceId = conflict
      ? null
      : addEvidence({
          id: `financial-${year}-${key}`,
          kind: 'financial',
          label: `${year}-12-31 · ${label[0]} · 东方财富网页指标`,
          url: ratioReceipt.url,
          period: `${year}-12-31`,
          quote: `${label[0]}：${known[0]!.toFixed(2)}%；第三方公开指标，未逐项核对原件。`,
          sourceQuality: 'web',
        });
    const numeric = conflict ? null : known[0]!.toFixed(2);
    metrics.push({
      id: `${year}-${key}`,
      label: [`${year} ${label[0]}`, `${year} ${label[1]}`],
      value: numeric,
      display: numeric === null ? ['来源冲突', 'Source conflict'] : [`${numeric}%`, `${numeric}%`],
      unit: 'percent',
      status: conflict ? 'conflict' : 'available',
      evidenceIds: evidenceId ? [evidenceId] : [],
      formula: [
        '来源提供的同年度合并报表公开指标，保留其计算口径；不纳入核心机械评分',
        'Same-year consolidated public ratio supplied by the source; its calculation basis is retained and it is excluded from the core mechanical score',
      ],
    });
  }
  const threeYears = [year - 2, year - 1, year];
  const threeProfit = threeYears.map((periodYear) => amount('netProfit', periodYear));
  const threeCash = threeYears.map((periodYear) => amount('ocf', periodYear));
  const three =
    threeProfit.every((value) => value !== null) && threeCash.every((value) => value !== null);
  ratioMetric(
    'three-year-cash-profit',
    ['连续三年现金利润比', 'Three consecutive years cash / profit'],
    three
      ? fraction(
          threeCash.reduce<bigint>((sum, value) => sum + value!, 0n),
          threeProfit.reduce<bigint>((sum, value) => sum + value!, 0n)
        )
      : null,
    threeYears.flatMap((periodYear) => [
      { year: periodYear, field: 'netProfit' as const },
      { year: periodYear, field: 'ocf' as const },
    ]),
    [
      '所选年度及前两年经营现金合计 ÷ 正的合并净利润合计；三个年度必须连续齐全',
      'Operating cash for the selected and prior two consecutive years / positive aggregate consolidated net profit; all three years required',
    ]
  );
  const dimension = (
    id: AssessmentDimensionId,
    score: number | null,
    metricIds: string[],
    summary: AssessmentText
  ): AssessmentDimension => ({
    id,
    label: labels[id],
    score,
    status: metricIds.some(
      (metricId) => metrics.find((metric) => metric.id === metricId)?.status === 'conflict'
    )
      ? 'conflict'
      : statusFromScore(score),
    metricIds,
    ruleSummary: summary,
  });
  const profitScore =
    profit !== null && revenue !== null && revenue > 0n && growth
      ? profit < 0n
        ? 0
        : profit === 0n
          ? 25
          : compareRatio(growth, 0n) >= 0
            ? 100
            : compareRatio(growth, -1n, 10n) >= 0
              ? 60
              : 25
      : null;
  const cashScore =
    profit !== null && cashFlow !== null
      ? cashFlow < 0n
        ? 0
        : profit <= 0n
          ? cashFlow > 0n
            ? 60
            : 25
          : cashRatio && compareRatio(cashRatio, 1n) >= 0
            ? 100
            : cashRatio && compareRatio(cashRatio, 7n, 10n) >= 0
              ? 60
              : 25
      : null;
  const leverageScore = leverage
    ? compareRatio(leverage, 1n, 2n) <= 0
      ? 100
      : compareRatio(leverage, 7n, 10n) <= 0
        ? 60
        : compareRatio(leverage, 9n, 10n) <= 0
          ? 25
          : 0
    : null;
  const coverScore = debtRatio
    ? compareRatio(debtRatio, 1n) >= 0
      ? 100
      : compareRatio(debtRatio, 1n, 2n) >= 0
        ? 60
        : 25
    : null;
  const solvencyScore =
    shortDebt !== null && funds !== null && funds >= 0n && leverageScore !== null
      ? shortDebt === 0n
        ? leverageScore
        : coverScore !== null
          ? (coverScore + leverageScore) / 2
          : null
      : null;
  const occupationScore = occupationChange
    ? compareRatio(occupationChange, 0n) <= 0
      ? 100
      : compareRatio(occupationChange, 1n, 10n) <= 0
        ? 60
        : 25
    : null;
  const dimensions = [
    dimension(
      'profitability',
      profitScore,
      [`${year}-netProfit`, 'revenue-growth'],
      profitScore === null
        ? [
            '利润或可比营收不足，盈利成长暂不判断。',
            'Profit or comparable revenue is unavailable; profitability and growth are not assessed.',
          ]
        : profit !== null && profit < 0n
          ? [
              '所选年度合并亏损，盈利能力承压。',
              'A consolidated loss in the selected year indicates profitability pressure.',
            ]
          : profitScore >= 80
            ? [
                '本期盈利且营收未下降，盈利成长筛选较强。',
                'Positive profit with nondeclining revenue gives a strong profitability screen.',
              ]
            : [
                '盈利表现或营收变化承压，需要结合利润来源判断持续性。',
                'Profitability or revenue movement is under pressure; persistence depends on the source of earnings.',
              ]
    ),
    dimension(
      'cash',
      cashScore,
      [`${year}-netProfit`, `${year}-ocf`, 'cash-profit'],
      cashScore === null
        ? [
            '利润或经营现金缺失，暂停现金质量判断。',
            'Missing profit or operating cash prevents a cash-quality assessment.',
          ]
        : cashFlow !== null && cashFlow < 0n
          ? [
              '经营活动净流出，现金质量筛选承压；不等于销售回款为负。',
              'Operating activities have a net outflow, pressuring the cash-quality screen; this does not mean negative sales receipts.',
            ]
          : profit !== null && profit <= 0n
            ? [
                '利润非正，不解释现金利润比；现金方向与亏损同时保留。',
                'Nonpositive profit makes cash-to-profit inapplicable; the cash direction and loss remain separate signals.',
              ]
            : cashScore >= 80
              ? [
                  '经营现金不低于合并利润，现金质量筛选较强；需要核对持续性。',
                  'Operating cash is at least consolidated profit, giving a strong cash-quality screen; persistence still needs review.',
                ]
              : [
                  '经营现金低于合并利润，现金实现程度偏弱，不能仅凭比例认定成因。',
                  'Operating cash trails consolidated profit, indicating weaker cash realization; the ratio alone does not establish a cause.',
                ]
    ),
    dimension(
      'solvency',
      solvencyScore,
      ['cash-short-debt', 'liabilities-assets'],
      solvencyScore === null
        ? [
            '现金、短债或资产负债字段不足，偿付杠杆暂不判断。',
            'Missing funds, debt or balance-sheet fields prevent a solvency assessment.',
          ]
        : shortDebt === 0n
          ? [
              '两项短债余额为零，筛选仅采用负债率；不代表没有其他偿付责任。',
              'Both selected short-debt fields are zero, so only leverage is screened; other repayment obligations may exist.',
            ]
          : solvencyScore >= 80
            ? [
                '历史现金覆盖与杠杆筛选较强；受限资金及后续到期责任未纳入。',
                'Historical cash coverage and leverage screen strongly; restricted funds and subsequent obligations are not included.',
              ]
            : [
                '历史现金覆盖或负债率存在压力，需要核对当前可用资金与到期结构。',
                'Historical coverage or leverage indicates pressure; current available funds and maturities need review.',
              ]
    ),
    dimension(
      'workingCapital',
      occupationScore,
      ['working-capital-revenue', 'working-capital-change'],
      occupationScore === null
        ? [
            '两年应收、存货或正营收不足，暂停可比占用判断。',
            'Missing two-year receivables, inventory or positive revenue prevents an occupation comparison.',
          ]
        : occupationScore >= 80
          ? [
              '应收与存货相对营收的占用未上升，营运占用筛选较强。',
              'Receivables and inventory have not increased relative to revenue, giving a strong occupation screen.',
            ]
          : [
              '应收与存货相对营收的占用上升；尚不能据此认定坏账或滞销。',
              'Receivables and inventory have increased relative to revenue; this alone establishes neither bad debt nor obsolescence.',
            ]
    ),
  ];
  const industry = sameEntity ? run.industry?.[`${year}-12-31`] : undefined;
  const validIndustry =
    industry?.securityCode === run.input.securityCode &&
    industry.period === `${year}-12-31` &&
    industry.peerCount >= 5 &&
    industry.minimumSamples >= 5
      ? industry
      : undefined;
  const industryIds: string[] = [];
  if (validIndustry) {
    const sourceIds = validIndustry.sources
      .slice(0, 20)
      .map((source, index) =>
        addEvidence({
          id: `industry-source-${index + 1}`,
          kind: 'industry',
          label: `${validIndustry.period} · ${validIndustry.industry} · 同年度同行样本`,
          url: source.url,
          period: validIndustry.period,
          sourceQuality: 'web',
        })
      )
      .filter((id): id is string => id !== null);
    for (const [key, label] of Object.entries({
      grossMargin: ['毛利率', 'Gross margin'],
      roe: ['净资产收益率', 'ROE'],
      ocfToRevenue: ['经营现金 / 营收', 'Operating cash / revenue'],
      assetLiabilityRatio: ['资产负债率', 'Liabilities / assets'],
      receivableToRevenue: ['应收 / 营收', 'Receivables / revenue'],
      revenueGrowth: ['营收同比', 'Revenue growth'],
    } as const)) {
      const item = validIndustry.metrics[key as keyof typeof validIndustry.metrics];
      if (
        item.count < 5 ||
        item.company === null ||
        item.median === null ||
        !Number.isFinite(item.company) ||
        !Number.isFinite(item.median) ||
        !sourceIds.length
      )
        continue;
      // Block peer comparisons that depend on conflicted company fields.
      const dependent: ContextAmountField[] =
        key === 'ocfToRevenue'
          ? ['ocf', 'revenue']
          : key === 'assetLiabilityRatio'
            ? ['totalAssets', 'totalLiabilities']
            : key === 'receivableToRevenue'
              ? ['receivables', 'revenue']
              : key === 'revenueGrowth'
                ? ['revenue']
                : [];
      if (
        dependent.some((field) => read(year, field).status === 'conflict') ||
        (key === 'revenueGrowth' && read(year - 1, 'revenue').status === 'conflict')
      )
        continue;
      for (const [suffix, value, description] of [
        ['company', item.company, '企业'],
        ['median', item.median, '同行中位数'],
      ] as const) {
        const id = `industry-${key}-${suffix}`;
        const numeric = value.toFixed(2);
        metrics.push({
          id,
          label: [
            `${label[0]} · ${description}`,
            `${label[1]} · ${suffix === 'company' ? 'company' : 'peer median'}`,
          ],
          value: numeric,
          display: [`${numeric}%`, `${numeric}%`],
          unit: 'percent',
          status: 'available',
          evidenceIds: [...sourceIds],
          formula: [
            '同年度、同细分行业第三方样本；中位数剔除目标公司，每项有效同行不少于五家',
            'Same-year, same-industry third-party samples; target excluded from medians, with at least five valid peers per metric',
          ],
        });
        industryIds.push(id);
      }
    }
  }
  dimensions.push(
    dimension(
      'industry',
      null,
      industryIds,
      industryIds.length
        ? [
            '已取得同年度同行指标，需按指标方向与业务差异综合判断；不纳入机械评分。',
            'Same-year peer metrics are available for judgment in their business context; they do not enter the mechanical score.',
          ]
        : [
            '同年度有效同行样本不足，同行位置暂不判断。',
            'Insufficient valid same-year peers prevent an industry-position judgment.',
          ]
    )
  );
  const disclosures = sameEntity
    ? snapshot!.announcements
        .filter((row) => safeUrl(row.url))
        .sort(
          (a, b) =>
            Number(!!b.excerpt) - Number(!!a.excerpt) ||
            Number(b.attention === 'high') - Number(a.attention === 'high') ||
            b.date.localeCompare(a.date)
        )
        .slice(0, 20)
    : [];
  for (const row of disclosures)
    addEvidence({
      id: `disclosure-${row.id}`,
      kind: 'disclosure',
      label: `${row.date} · ${row.title.slice(0, 300)}`,
      url: row.excerpt?.url || row.url,
      period: row.date,
      ...(row.excerpt
        ? { quote: row.excerpt.quote.slice(0, 2400), page: row.excerpt.page }
        : { quote: `${row.meaning.slice(0, 500)}；仅标题线索，未据此认定事实。` }),
      sourceQuality: row.excerpt ? 'excerpt' : 'headline',
    });
  const news: { row: CompanyNews; sourceId: string; body: CompanyPublicExcerpt | null }[] = [];
  const signalIds = new Set<string>(),
    signalUrls = new Set<string>();
  if (sameEntity) {
    const candidates = snapshot!.news.filter((row) => safeUrl(row.url));
    for (const [index, row] of candidates.entries()) {
      if (news.length >= 180) break;
      if (!validPublicDate(row.date) || typeof row.title !== 'string' || !row.title.trim())
        continue;
      const url = new URL(row.url);
      url.protocol = 'https:';
      url.hash = '';
      const sourceId = assessmentNewsEvidenceId(row, index);
      if (signalIds.has(sourceId) || signalUrls.has(url.href)) continue;
      signalIds.add(sourceId);
      signalUrls.add(url.href);
      news.push({ row, sourceId, body: readNewsMediaExcerpt(row) });
    }
  }
  for (const { row, sourceId, body } of news) {
    addEvidence({
      id: sourceId,
      kind: 'news',
      label: `${row.date} · ${row.title.slice(0, 300)} · ${row.media.slice(0, 100)}`,
      url: row.url,
      period: row.date,
      ...(body ? { quote: body.text } : row.digest ? { quote: row.digest.slice(0, 1600) } : {}),
      // A read media body remains a research lead, never an official-disclosure excerpt.
      sourceQuality: 'headline',
    });
  }
  const discussions: {
    row: CompanyDiscussion;
    sourceId: string;
    body: CompanyPublicExcerpt | null;
  }[] = [];
  if (sameEntity) {
    for (const row of snapshot!.discussions || []) {
      if (discussions.length >= 240) break;
      const sourceId = assessmentDiscussionEvidenceId(row, run.input.securityCode);
      if (!sourceId || signalIds.has(sourceId) || signalUrls.has(row.url)) continue;
      signalIds.add(sourceId);
      signalUrls.add(row.url);
      discussions.push({
        row,
        sourceId,
        body: readDiscussionPostExcerpt(row, run.input.securityCode),
      });
    }
  }
  for (const { row, sourceId, body } of discussions) {
    addEvidence({
      id: sourceId,
      kind: 'discussion',
      label: `${row.date} · ${row.title.slice(0, 300)} · 股吧公开观点`,
      url: row.url,
      period: row.date,
      quote: body
        ? `未核实的公开讨论观点：${body.text}`
        : `仅公开讨论标题，观点尚未核实：${row.title.slice(0, 300)}`,
      sourceQuality: 'opinion',
    });
  }
  dimensions.push(
    dimension(
      'events',
      null,
      [],
      disclosures.some((row) => row.excerpt)
        ? [
            '已读公告片段可用于判断具体事项，新闻仅提供核查线索，公开讨论始终是未经核实的观点；不按条数或舆论扣分。',
            'Read disclosure excerpts support assessment of specific events. News provides leads, and public discussions remain unverified opinions; counts and sentiment do not reduce scores.',
          ]
        : [
            '公告和新闻仅提供线索，公开讨论不构成事实认定；未取得的司法、监管记录不视为没有风险，不按舆论扣分。',
            'Announcements and news provide leads; public discussions cannot establish facts. Missing legal or regulatory records do not indicate absence of risk, and sentiment does not reduce scores.',
          ]
    )
  );
  const fieldCount =
    requiredFields.filter((field) => read(year, field).status === 'available').length +
    previousFields.filter((field) => read(year - 1, field).status === 'available').length;
  const coverage: CompanyAssessment['coverage'] = {
    fields: fieldCount,
    requiredFields: requiredFields.length + previousFields.length,
    years: new Set(publicRows.map((row) => row.period)).size,
    sources: sameEntity
      ? snapshot!.sources.filter(
          (source) => ['available', 'partial'].includes(source.status) && !!safeUrl(source.url)
        ).length
      : 0,
    news: news.length,
    discussions: discussions.length,
    mediaBodies: news.filter((item) => item.body).length,
    discussionBodies: discussions.filter((item) => item.body).length,
    disclosures: disclosures.length,
    excerpts: disclosures.filter((row) => !!row.excerpt).length,
    peers: industryIds.length ? validIndustry!.peerCount : 0,
  };
  metrics.push({
    id: 'scope-year',
    label: ['分析年度', 'Analysis year'],
    value: String(year),
    display: [`${year} 年`, String(year)],
    unit: 'count',
    status: 'available',
    evidenceIds: [],
    formula: ['查询所选完整年度', 'Selected full annual period'],
  });
  metrics.push({
    id: 'available-field-count',
    label: ['已取得核心字段', 'Available core fields'],
    value: String(fieldCount),
    display: [
      `${fieldCount}/${coverage.requiredFields} 项`,
      `${fieldCount}/${coverage.requiredFields} fields`,
    ],
    unit: 'count',
    status: 'available',
    evidenceIds: evidence.filter((item) => item.kind === 'financial').map((item) => item.id),
    formula: [
      '所选年度十项字段，加上一年营收、应收与存货三项',
      'Ten selected-year fields plus prior-year revenue, receivables and inventory',
    ],
  });
  if (!snapshot)
    gaps.push([
      '尚未取得公开企业快照，暂不评级。',
      'No public company snapshot is available; no grade is assigned.',
    ]);
  else if (!sameEntity)
    gaps.push([
      '来源主体与查询主体不一致，已停止使用该快照。',
      'The snapshot issuer does not match the requested issuer; the snapshot is excluded.',
    ]);
  if (unsupported)
    gaps.push([
      '主体或来源范围尚未核对，暂不评级。',
      'The issuer or source scope is unconfirmed; no grade is assigned.',
    ]);
  if (!publicRows.some((row) => row.period === `${year}-12-31`))
    gaps.push([
      '没有取得所选年度合并报表，不使用其他年度或季报替代。',
      'The selected annual consolidated period is unavailable; other years or interim reports do not replace it.',
    ]);
  for (const metric of metrics.filter(
    (item) =>
      (requiredFields.some((field) => item.id === `${year}-${field}`) ||
        previousFields.some((field) => item.id === `${year - 1}-${field}`)) &&
      item.status !== 'available'
  ))
    gaps.push([
      `${metric.label[0]}：${metric.display[0]}。`,
      `${metric.label[1]}: ${metric.display[1]}.`,
    ]);
  if (
    dimensions.slice(0, 4).some((item) => item.score === null) &&
    fieldCount === coverage.requiredFields
  )
    gaps.push([
      '核心指标存在非正分母或异常余额，未强行计算评级。',
      'A core metric has a nonpositive denominator or invalid balance; no grade is forced.',
    ]);
  if (!industryIds.length)
    gaps.push([
      '同行比较缺少所选年度、同细分行业的有效样本。',
      'Same-year valid peers in the same industry are unavailable.',
    ]);
  gaps.push([
    '历史资金余额未扣除受限资金；新闻与已读片段不构成完整司法、监管或审计核查，公开讨论是未经核实的观点。',
    'Historical funds are not adjusted for restrictions; news and read excerpts are not comprehensive legal, regulatory or audit checks, and public discussions are unverified opinions.',
  ]);
  const core = dimensions.slice(0, 4);
  const score =
    sameEntity &&
    !unsupported &&
    fieldCount === coverage.requiredFields &&
    core.every((item) => item.score !== null && item.status !== 'conflict')
      ? Math.round((core.reduce((sum, item) => sum + item.score!, 0) / 4) * 100) / 100
      : null;
  return {
    version: 1,
    year,
    basis: 'consolidated',
    snapshotFetchedAt: snapshot?.fetchedAt || '',
    generatedAt: new Date().toISOString(),
    ...resolveAssessmentRating(score, core),
    score,
    methodologyVersion: ASSESSMENT_METHODOLOGY_VERSION,
    dimensions,
    metrics,
    evidence,
    coverage,
    gaps,
    model: { status: 'not-called', calls: 0 },
  };
}

/** Explicit public whitelist: candidate previews, account IDs, uploaded observations and plans are never copied. */
export function buildAssessmentPublicPayload(
  run: CompanyResearchRun,
  assessment = deriveCompanyAssessment(run)
) {
  return {
    company:
      run.context?.securityCode === run.input.securityCode && run.context.orgId === run.input.orgId
        ? run.context.companyName
        : run.identity?.shortName || '',
    securityCode: run.input.securityCode,
    year: assessment.year,
    basis: assessment.basis,
    snapshotFetchedAt: assessment.snapshotFetchedAt,
    publicObservationDates: {
      latestFinancialPeriod:
        run.context?.securityCode === run.input.securityCode &&
        run.context.orgId === run.input.orgId
          ? run.context.financials
              .map((row) => row.period)
              .sort()
              .at(-1) || null
          : null,
      latestDisclosureDate:
        assessment.evidence
          .filter((item) => item.kind === 'disclosure')
          .map((item) => item.period || '')
          .sort()
          .at(-1) || null,
      latestNewsDate:
        assessment.evidence
          .filter((item) => item.kind === 'news')
          .map((item) => item.period || '')
          .sort()
          .at(-1) || null,
      latestDiscussionDate:
        assessment.evidence
          .filter((item) => item.kind === 'discussion')
          .map((item) => item.period || '')
          .sort()
          .at(-1) || null,
    },
    grade: assessment.grade,
    ratingConstraints: assessment.ratingConstraints,
    score: assessment.score,
    methodologyVersion: assessment.methodologyVersion,
    methodology: ASSESSMENT_METHODOLOGY,
    dimensions: assessment.dimensions,
    metrics: assessment.metrics,
    evidence: assessment.evidence,
    coverage: assessment.coverage,
    gaps: assessment.gaps,
  };
}
