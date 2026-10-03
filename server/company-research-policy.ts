import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AssessmentDimensionId } from '../shared/company-assessment.js';
import { buildAssessmentPublicPayload } from '../shared/company-assessment.js';
import { officialPdfUrl } from './company-sources.js';

const coreDimensions = ['cash', 'solvency', 'workingCapital', 'profitability'] as const;
const dimensionQuestions: Record<
  (typeof coreDimensions)[number],
  { topics: string[]; alternatives: string[]; question: string }
> = {
  cash: {
    topics: ['回款', '现金', '存货', '应收', '经营'],
    alternatives: ['备货或结算时点造成的暂时占用', '回款或存货去化压力'],
    question: '哪些公开材料能区分暂时占用与持续回款压力？',
  },
  solvency: {
    topics: ['债务', '借款', '偿还', '归还', '授信', '担保', '受限'],
    alternatives: ['已取得的续贷或已完成的偿还安排', '未落实的偿付安排或受限资金'],
    question: '偿付安排已经完成还是仍待落实，货币资金是否可自由使用？',
  },
  workingCapital: {
    topics: ['存货', '应收', '回款', '备货', '减值', '订单'],
    alternatives: ['订单或备货增长引起的营运占用', '逾期回款或积压减值引起的占用'],
    question: '订单、期后回款和去化披露能否区分两种占用解释？',
  },
  profitability: {
    topics: ['营收', '利润', '订单', '业绩', '成本', '毛利'],
    alternatives: ['一次性项目或收入确认时点变化', '主营收入或经营成本发生持续变化'],
    question: '变化来自一次性事项还是主营业务，是否有同口径披露？',
  },
};
const alternativeTitle = /澄清|回复|更正|撤销|解除|结清|归还|未发生|不存在|改善|否认/;

export function validCompanyResearchExcerpt(
  row: NonNullable<CompanyResearchRun['context']>['announcements'][number]
): boolean {
  try {
    return (
      !!row.excerpt &&
      row.excerpt.url === officialPdfUrl(row.url) &&
      /^[a-f0-9]{64}$/i.test(row.excerpt.sha256) &&
      row.excerpt.page >= 1 &&
      row.excerpt.page <= 3 &&
      row.excerpt.pagesRead >= 1 &&
      row.excerpt.pagesRead <= 3 &&
      row.excerpt.quote.trim().length >= 40
    );
  } catch {
    return false;
  }
}

/** An acquisition agenda, not a causal conclusion or a second financial score. */
export function buildCompanyResearchAgenda(run: CompanyResearchRun) {
  const scope =
    '备选解释仅是待检验假设。公告标题用于定位原件，缺失或未取得的反向材料不证明原判断正确。';
  if (
    !run.context ||
    run.informationGap ||
    run.context.securityCode !== run.input.securityCode ||
    run.context.orgId !== run.input.orgId ||
    run.identity?.securityCode !== run.input.securityCode ||
    run.identity?.orgId !== run.input.orgId
  )
    return { issues: [], officialChecks: [], scope };
  const assessment = buildAssessmentPublicPayload(run);
  const issues = coreDimensions
    .flatMap((id) => {
      const dimension = assessment.dimensions.find((row) => row.id === id);
      if (
        !dimension ||
        !['pressure', 'high-pressure', 'conflict', 'unknown'].includes(dimension.status)
      )
        return [];
      const uncertain = ['conflict', 'unknown'].includes(dimension.status);
      const template = dimensionQuestions[id];
      const metricIds = dimension.metricIds.slice(0, 4);
      const evidenceIds = [
        ...new Set(
          assessment.metrics
            .filter((metric) => metricIds.includes(metric.id))
            .flatMap((metric) => metric.evidenceIds)
        ),
      ].slice(0, 6);
      return [
        {
          dimensionId: id as AssessmentDimensionId,
          status: dimension.status,
          observation: dimension.ruleSummary[0].slice(0, 240),
          metricIds,
          evidenceIds,
          alternatives: uncertain ? [] : template.alternatives,
          question: uncertain
            ? '先核对缺失或冲突的期间、口径与原文；不能据此推断经营原因。'
            : template.question,
          topics: template.topics,
        },
      ];
    })
    .slice(0, 3);
  const announcements = (run.context?.announcements || []).slice(0, 1200);
  const idCounts = new Map<string, number>();
  for (const row of announcements) idCounts.set(row.id, (idCounts.get(row.id) || 0) + 1);
  const candidates = announcements
    .flatMap((row) => {
      if (!row.id || idCounts.get(row.id) !== 1) return [];
      const text = `${row.title} ${row.category}`;
      const matching = issues.filter((issue) => issue.topics.some((word) => text.includes(word)));
      const important = ['high', 'medium'].includes(row.attention);
      if (!matching.length && !important) return [];
      // The title only determines which original to inspect. It never establishes a rebuttal.
      const alternative = alternativeTitle.test(text);
      return [
        {
          id: row.id,
          dimensionIds: matching.map((issue) => issue.dimensionId),
          purpose: alternative ? ('check-alternative' as const) : ('check-basis' as const),
          hasExcerpt: validCompanyResearchExcerpt(row),
          rank: matching.length * 4 + (alternative ? 3 : 0) + (row.attention === 'high' ? 2 : 0),
          date: row.date,
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map(({ rank: _rank, date: _date, ...candidate }) => candidate);
  return {
    issues,
    officialChecks: candidates,
    scope,
  };
}

/** At a proposed stop, inspect relevant acquired IDs the planner has left unread. */
export function selectCompanyReviewDisclosures(
  run: CompanyResearchRun,
  attemptedIds: ReadonlySet<string>,
  maximum = 2
): string[] {
  return buildCompanyResearchAgenda(run)
    .officialChecks.filter((row) => !row.hasExcerpt && !attemptedIds.has(row.id))
    .slice(0, Math.max(0, Math.min(maximum, 2)))
    .map((row) => row.id);
}

/** Same-job identity only; separate retries deliberately receive a fresh cache. */
export function companyResearchRequestKey(name: string, args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const value = args as Record<string, unknown>;
  if (
    ['collect_public_signals', 'get_market_quote'].includes(name) &&
    Object.keys(value).length === 0
  )
    return name;
  if (name === 'search_news' && Object.keys(value).length === 1 && typeof value.topic === 'string')
    return `${name}:${value.topic.trim().replace(/\s+/g, ' ')}`;
  if (
    ['read_news', 'read_discussion', 'read_disclosure'].includes(name) &&
    Object.keys(value).length === 1 &&
    typeof value.id === 'string'
  )
    return `${name}:${value.id}`;
  return null;
}
