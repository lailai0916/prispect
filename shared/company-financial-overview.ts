import type { CompanyResearchRun } from './contracts.js';
import {
  analyzeCompanyContext,
  contextFen,
  contextRatio,
  contextSum,
  contextYuan,
  type CompanyContextAnalysis,
  type CompanyReadingBasis,
} from './company-analysis.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
  type ContextAmountField,
} from './company-workspace.js';
import { companyEvidenceSourceUrls } from './company-source-evidence.js';

type OverviewText = readonly [string, string];
export type CompanyOverviewStatus = 'good' | 'watch' | 'risk' | 'unknown';
export interface CompanyOverviewMeasure {
  label: OverviewText;
  value: string | number | null;
  kind: 'amount' | 'times' | 'percent';
}
export interface CompanyOverviewEvidence {
  periods: string[];
  fields: ContextAmountField[];
  sourceIds: string[];
  formula: OverviewText;
}
export interface CompanyOverviewCard {
  id: 'earn' | 'cash' | 'debt';
  question: OverviewText;
  status: CompanyOverviewStatus;
  judgment: OverviewText;
  detail: OverviewText;
  primary: CompanyOverviewMeasure;
  measures: CompanyOverviewMeasure[];
  evidence: CompanyOverviewEvidence;
}
export interface CompanyOverviewFinding {
  id: string;
  status: 'risk' | 'watch';
  title: OverviewText;
  detail: OverviewText;
  measure?: CompanyOverviewMeasure;
  nextCheck: OverviewText;
  evidence: CompanyOverviewEvidence;
}
export interface CompanyFinancialOverview {
  year: number;
  basis: CompanyReadingBasis;
  state: 'available' | 'missing' | 'mismatch';
  annual: CompanyContextPeriod | null;
  interim: CompanyContextPeriod | null;
  analysis: CompanyContextAnalysis | null;
  cards: CompanyOverviewCard[];
  findings: CompanyOverviewFinding[];
  nextCheck: OverviewText | null;
}

const cashFields: ContextAmountField[] = ['cash', 'shortLoan', 'currentPortionDebt'];
const profitLabel = (basis: CompanyReadingBasis): OverviewText =>
  basis === 'parent'
    ? ['归母净利润', 'Profit attributable to owners']
    : ['合并净利润', 'Consolidated net profit'];
const amount = (label: OverviewText, value: string | null): CompanyOverviewMeasure => ({
  label,
  value,
  kind: 'amount',
});
const times = (label: OverviewText, value: number | null): CompanyOverviewMeasure => ({
  label,
  value,
  kind: 'times',
});
/** Acquired inputs use contextFen's bound; exact sums may grow by one digit. */
function computedFen(value: string | null | undefined): bigint | null {
  const parsed = contextFen(value);
  if (parsed !== null || typeof value !== 'string' || !/^-?\d{21,22}(?:\.\d{1,2})?$/.test(value))
    return parsed;
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const absolute = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return value.startsWith('-') ? -absolute : absolute;
}
function computedRatio(a: string | null, b: string | null): number | null {
  const ordinary = contextRatio(a, b);
  if (ordinary !== null) return ordinary;
  const x = computedFen(a),
    y = computedFen(b);
  if (x === null || y === null || y <= 0n) return null;
  const scaled = ((x < 0n ? -x : x) * 10_000n + y / 2n) / y;
  return scaled > BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : (Number(scaled) / 10_000) * (x < 0n ? -1 : 1);
}
const lessThan = (a: string | null, b: string | null, numerator: bigint, denominator: bigint) => {
  const x = computedFen(a),
    y = computedFen(b);
  return x !== null && y !== null && y > 0n && x * denominator < y * numerator;
};
const greaterThan = (
  a: string | null,
  b: string | null,
  numerator: bigint,
  denominator: bigint
) => {
  const x = computedFen(a),
    y = computedFen(b);
  return x !== null && y !== null && y > 0n && x * denominator > y * numerator;
};
function usableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
function periodProvenance(snapshot: CompanyContextSnapshot, row: CompanyContextPeriod): boolean {
  return (
    !!(row.originalUrl && usableUrl(row.originalUrl)) ||
    row.sourceUrls.some((url) => {
      if (!usableUrl(url)) return false;
      const source = snapshot.sources.find((candidate) => candidate.url === url);
      return !source || ['available', 'partial'].includes(source.status);
    })
  );
}
/** Scope the drawer to the fields and years behind the opened judgment. */
export function companyOverviewEvidencePeriods(
  snapshot: CompanyContextSnapshot | undefined,
  evidence: CompanyOverviewEvidence
): CompanyContextPeriod[] {
  return (snapshot?.financials || [])
    .filter((row) => row.annual && evidence.periods.includes(row.period))
    .map((row) => ({
      ...row,
      sourceUrls: evidence.fields.length
        ? [
            ...new Set(
              evidence.fields.flatMap((field) =>
                (['primary', 'secondary'] as const).flatMap((provider) =>
                  companyEvidenceSourceUrls(snapshot, row, field, provider)
                )
              )
            ),
          ]
        : row.sourceUrls,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function table(field: ContextAmountField): string {
  if (
    [
      'revenue',
      'netProfit',
      'parentProfit',
      'deductedProfit',
      'operatingProfit',
      'totalProfit',
      'financeExpense',
    ].includes(field)
  )
    return 'income';
  return ['ocf', 'investingCash', 'financingCash', 'salesCash'].includes(field)
    ? 'cashflow'
    : 'balance';
}

/** Merge equal duplicates once; conflicting, invalid and missing fields stay unknown. */
function usablePeriods(snapshot: CompanyContextSnapshot): CompanyContextPeriod[] {
  const grouped = new Map<string, CompanyContextPeriod[]>();
  for (const row of snapshot.financials) {
    if (
      !/^20\d{2}-(?:03-31|06-30|09-30|12-31)$/.test(row.period) ||
      (row.annual && !row.period.endsWith('-12-31'))
    )
      continue;
    const key = `${row.annual}:${row.period}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return [...grouped.values()].map((rows) => {
    const row = rows[0]!;
    const amounts = { ...row.amounts };
    for (const field of contextAmountFields) {
      const parsed = rows.map((candidate) => contextFen(candidate.amounts[field]));
      const conflict = snapshot.comparisons.some(
        (check) => check.period === row.period && check.field === field && !check.matches
      );
      const failedSource = rows.some((candidate) => {
        const provider = candidate.fieldSources[field];
        const id =
          provider === '东方财富'
            ? `em-${table(field)}`
            : provider === '新浪财经'
              ? `sina-${table(field)}`
              : null;
        const source = id && snapshot.sources.find((receipt) => receipt.id === id);
        return (
          (source && !['available', 'partial'].includes(source.status)) ||
          ![...(source ? [source.url] : []), ...candidate.sourceUrls].some(usableUrl)
        );
      });
      amounts[field] =
        conflict || failedSource || parsed.some((value) => value === null || value !== parsed[0])
          ? null
          : contextYuan(parsed[0]!);
    }
    const auditOpinions = new Set(rows.map((candidate) => candidate.auditOpinion));
    return {
      ...row,
      amounts,
      auditOpinion:
        auditOpinions.size === 1 && rows.every((candidate) => periodProvenance(snapshot, candidate))
          ? row.auditOpinion
          : null,
      sourceUrls: [...new Set(rows.flatMap((candidate) => candidate.sourceUrls))],
    };
  });
}

/** F's three questions, computed from acquired context without requiring synthesis. */
export function deriveCompanyFinancialOverview(
  run: CompanyResearchRun,
  basis: CompanyReadingBasis
): CompanyFinancialOverview {
  const year = run.input.year;
  const snapshot = run.context;
  const state = !snapshot
    ? 'missing'
    : snapshot.securityCode !== run.input.securityCode ||
        snapshot.orgId !== run.input.orgId ||
        !!run.informationGap ||
        !!snapshot.warnings.some((warning) => warning.includes('来源主体或机构类型存在冲突'))
      ? 'mismatch'
      : 'available';
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const profitName = profitLabel(basis);
  const safeRows = state === 'available' ? usablePeriods(snapshot!) : [];
  const annuals = safeRows
    .filter((row) => row.annual && Number(row.period.slice(0, 4)) <= year)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6);
  const annual = annuals.find((row) => row.period === `${year}-12-31`) || null;
  const interim =
    safeRows.filter((row) => !row.annual).sort((a, b) => b.period.localeCompare(a.period))[0] ||
    null;
  const three = [year - 2, year - 1, year].flatMap((periodYear) =>
    annuals.filter((row) => row.period === `${periodYear}-12-31`)
  );
  const analysis =
    snapshot && state === 'available'
      ? analyzeCompanyContext(
          { ...snapshot, financials: [...annuals, ...(interim ? [interim] : [])] },
          basis
        )
      : null;
  if (analysis) {
    const profit =
      three.length === 3 ? contextSum(three.map((row) => row.amounts[profitField])) : null;
    const cash = three.length === 3 ? contextSum(three.map((row) => row.amounts.ocf)) : null;
    const revenue = three.length === 3 ? contextSum(three.map((row) => row.amounts.revenue)) : null;
    const p = computedFen(profit),
      c = computedFen(cash),
      r = computedFen(revenue);
    const complete = three.length === 3 && p !== null && c !== null && r !== null && r > 0n;
    const thinProfit =
      complete && p !== null && r !== null && r > 0n && (p < 0n ? -p : p) * 100n < r * 2n;
    analysis.threeYear = {
      periods: three.map((row) => row.period),
      profit,
      cash,
      revenue,
      complete,
      thinProfit,
      ratio: complete && !thinProfit ? computedRatio(cash, profit) : null,
    };
    analysis.latestAnnual = annual;
    analysis.missing = (
      ['revenue', profitField, 'ocf', ...cashFields] as ContextAmountField[]
    ).filter((field) => {
      const value = contextFen(annual?.amounts[field]);
      return value === null || (cashFields.includes(field) && value < 0n);
    });
    // Negative balance inputs cannot become a no-debt or coverage judgment.
    const debtInputs = cashFields.map((field) => contextFen(annual?.amounts[field]));
    if (!annual || debtInputs.some((value) => value === null || value < 0n)) {
      analysis.shortDebt = analysis.debtCoverage = analysis.debtGap = null;
    } else {
      analysis.shortDebt = contextSum([
        annual.amounts.shortLoan,
        annual.amounts.currentPortionDebt,
      ]);
      analysis.debtCoverage = computedRatio(annual.amounts.cash, analysis.shortDebt);
      analysis.debtGap = contextYuan(debtInputs[0]! - computedFen(analysis.shortDebt)!);
    }
    analysis.financeExpenseRatio = annual
      ? computedRatio(
          contextSum([annual.amounts.totalProfit, annual.amounts.financeExpense]),
          annual.amounts.financeExpense
        )
      : null;
    if (!annual) {
      analysis.assetLiabilityRatio =
        analysis.currentRatio =
        analysis.quickRatio =
        analysis.receivableToRevenue =
        analysis.ocfToRevenue =
        analysis.financeExpenseRatio =
          null;
    }
  }
  const evidence = (
    rows: CompanyContextPeriod[],
    fields: ContextAmountField[],
    formula: OverviewText
  ): CompanyOverviewEvidence => {
    const originals =
      snapshot?.financials.filter((row) =>
        rows.some((chosen) => chosen.period === row.period && chosen.annual === row.annual)
      ) || [];
    const sourceIds = new Set<string>();
    if (!fields.length)
      for (const row of originals)
        for (const source of snapshot?.sources || [])
          if (row.sourceUrls.includes(source.url)) sourceIds.add(source.id);
    for (const row of originals)
      for (const field of fields) {
        const provider = row.fieldSources[field];
        const id =
          provider === '东方财富'
            ? `em-${table(field)}`
            : provider === '新浪财经'
              ? `sina-${table(field)}`
              : null;
        for (const source of snapshot?.sources || [])
          if (
            source.id === id ||
            (['em', 'sina'].some((providerId) => source.id === `${providerId}-${table(field)}`) &&
              row.sourceUrls.includes(source.url))
          )
            sourceIds.add(source.id);
      }
    return { periods: rows.map((row) => row.period), fields, sourceIds: [...sourceIds], formula };
  };
  const a = annual?.amounts;
  const profit = a?.[profitField] ?? null;
  const revenue = a?.revenue ?? null;
  const p = contextFen(profit),
    r = contextFen(revenue);
  const first = annuals[0];
  const firstProfit = contextFen(first?.amounts[profitField]);
  const profitChange =
    p !== null && firstProfit !== null && firstProfit > 0n && first !== annual
      ? computedRatio(contextYuan(p - firstProfit), contextYuan(firstProfit))
      : null;
  let earnStatus: CompanyOverviewStatus = 'unknown';
  let earnJudgment: OverviewText = ['年度盈利数据待补', 'Annual profit data is incomplete'];
  let earnDetail: OverviewText = [
    `核对 ${year} 年营业收入与${profitName[0]}。`,
    `Check ${year} revenue and ${profitName[1].toLowerCase()}.`,
  ];
  if (p !== null && p < 0n) {
    earnStatus = 'risk';
    earnJudgment = ['最近一年亏损', 'The selected year was loss-making'];
    earnDetail = [
      '亏损正在侵蚀盈利积累，需要结合现金和债务一起看。',
      'Losses reduce accumulated earnings; read cash flow and debt together.',
    ];
  } else if (p === 0n) {
    earnStatus = 'watch';
    earnJudgment = ['本年处于盈亏平衡', 'The selected year broke even'];
    earnDetail = [
      '净利润为零，重点看经营现金和后续盈利恢复。',
      'Net profit is zero; check operating cash and the recovery in earnings.',
    ];
  } else if (p !== null && r !== null && r > 0n) {
    earnStatus = 'good';
    earnJudgment = ['收入与利润保持为正', 'Revenue and profit are positive'];
    earnDetail = [
      '本年实现盈利，再看利润是否持续、现金是否跟上。',
      'The company earned a profit; check whether earnings persist and cash keeps pace.',
    ];
    if (firstProfit !== null && firstProfit > 0n && (p - firstProfit) * 10n < -firstProfit * 3n) {
      earnStatus = 'watch';
      earnJudgment = ['赚钱能力在变弱', 'Earnings have weakened'];
      earnDetail = [
        `相比 ${first!.period.slice(0, 4)} 年，净利润下降超过 30%。`,
        `Net profit is down more than 30% from ${first!.period.slice(0, 4)}.`,
      ];
    } else if (firstProfit !== null && firstProfit < 0n) {
      earnJudgment = ['已经扭亏为盈', 'The company returned to profit'];
      earnDetail = [
        `${first!.period.slice(0, 4)} 年亏损，本年净利润已转正。`,
        `The company made a loss in ${first!.period.slice(0, 4)}; profit is now positive.`,
      ];
    }
  } else if (p !== null && p > 0n) {
    earnStatus = r === null ? 'unknown' : 'watch';
    earnJudgment =
      r === null
        ? ['本年盈利，营业收入待补', 'Profitable; revenue is unavailable']
        : ['本年盈利，营业收入不为正', 'Profitable; revenue is not positive'];
  }
  const earn: CompanyOverviewCard = {
    id: 'earn',
    question: ['公司赚得怎么样？', 'How well does the company earn?'],
    status: earnStatus,
    judgment: earnJudgment,
    detail: earnDetail,
    primary: amount(profitName, profit),
    measures: [
      amount(['营业总收入', 'Revenue'], revenue),
      ...(profitChange !== null
        ? [
            {
              label: [
                `较 ${first!.period.slice(0, 4)} 年`,
                `Since ${first!.period.slice(0, 4)}`,
              ] as OverviewText,
              value: profitChange * 100,
              kind: 'percent' as const,
            },
          ]
        : []),
    ],
    evidence: evidence(
      annuals,
      ['revenue', profitField],
      [
        `净利润取利润表「${profitName[0]}」；变动 =（本年净利润 − 起始年净利润）÷ 起始年净利润。`,
        `Profit uses ${profitName[1].toLowerCase()}; change = (selected-year profit − first-year profit) ÷ first-year profit.`,
      ]
    ),
  };

  const threeYear = analysis?.threeYear;
  let cashStatus: CompanyOverviewStatus = 'unknown';
  let cashJudgment: OverviewText = ['现金与利润数据待补', 'Cash and profit data is incomplete'];
  let cashDetail: OverviewText = [
    `需要 ${year - 2}–${year} 年连续三年的利润、经营现金和收入。`,
    `Revenue, profit and operating cash are needed for all three years, ${year - 2}–${year}.`,
  ];
  if (threeYear?.complete) {
    const cash = computedFen(threeYear.cash)!;
    const profit = computedFen(threeYear.profit)!;
    if (threeYear.thinProfit) {
      cashStatus = cash < 0n ? 'risk' : 'watch';
      cashJudgment = ['利润太薄，比率不适用', 'Profit is too thin for a useful ratio'];
      cashDetail = [
        '三年累计净利润绝对额不到收入的 2%，直接看经营现金净额。',
        'Absolute three-year profit is below 2% of revenue; read operating cash directly.',
      ];
    } else if (profit <= 0n) {
      cashStatus = cash < 0n ? 'risk' : 'watch';
      cashJudgment =
        profit === 0n
          ? ['累计利润为零，直接看现金', 'Cumulative profit is zero; read cash directly']
          : cash > 0n
            ? ['在亏损，但现金还在流入', 'Loss-making, with positive operating cash']
            : cash === 0n
              ? ['累计亏损，经营现金为零', 'Cumulative losses, with zero operating cash']
              : ['亏损，且现金也在流出', 'Loss-making, with cash also flowing out'];
      cashDetail =
        cash < 0n
          ? [
              '利润与现金两头都是负的，主业自身造血承压。',
              'Both profit and cash are negative; operating cash generation is under pressure.',
            ]
          : [
              '累计利润不为正，现金含量倍数不适用。',
              'Cumulative profit is not positive, so the cash-to-profit ratio does not apply.',
            ];
    } else if (lessThan(threeYear.cash, threeYear.profit, 6n, 10n)) {
      cashStatus = 'risk';
      cashJudgment = ['利润与现金严重背离', 'Profit and cash diverge sharply'];
      cashDetail = [
        '每一元利润对应的经营现金不足 0.6 元，回款质量需要优先追问。',
        'Each yuan of profit corresponds to less than 0.6 yuan of operating cash; check collections first.',
      ];
    } else if (lessThan(threeYear.cash, threeYear.profit, 9n, 10n)) {
      cashStatus = 'watch';
      cashJudgment = ['一部分利润没有变成现金', 'Some profit has not converted to cash'];
      cashDetail = [
        '每一元利润对应 0.6–0.9 元经营现金，继续看应收和存货。',
        'Each yuan of profit corresponds to 0.6–0.9 yuan of operating cash; inspect receivables and inventory.',
      ];
    } else {
      cashStatus = 'good';
      cashJudgment = lessThan(threeYear.cash, threeYear.profit, 2n, 1n)
        ? ['利润基本都变成了现金', 'Profit has largely converted to cash']
        : ['现金回款远好于账面利润', 'Operating cash far exceeds book profit'];
      cashDetail = lessThan(threeYear.cash, threeYear.profit, 2n, 1n)
        ? [
            '三年经营现金至少覆盖累计利润的九成。',
            'Three-year operating cash covers at least 90% of cumulative profit.',
          ]
        : [
            '经营现金达到累计利润的两倍以上，继续追问利润与现金差额。',
            'Operating cash exceeds twice cumulative profit; check the reasons for the gap.',
          ];
    }
  }
  const cashCard: CompanyOverviewCard = {
    id: 'cash',
    question: ['利润有没有变成现金？', 'Has profit turned into cash?'],
    status: cashStatus,
    judgment: cashJudgment,
    detail: cashDetail,
    primary:
      threeYear?.complete && threeYear.ratio === null
        ? amount(['三年经营现金净额', 'Three-year operating cash'], threeYear.cash)
        : times(['三年现金含量', 'Three-year cash-to-profit'], threeYear?.ratio ?? null),
    measures: [
      amount(['三年累计利润', 'Three-year profit'], threeYear?.profit ?? null),
      ...(threeYear?.ratio !== null
        ? [amount(['三年经营现金', 'Three-year operating cash'], threeYear?.cash ?? null)]
        : []),
    ],
    evidence: evidence(
      three,
      [profitField, 'ocf', 'revenue'],
      [
        `现金含量 = ${year - 2}–${year} 年经营现金净额合计 ÷ 同期${profitName[0]}合计；累计利润不为正或其绝对额不到收入的 2% 时，改看绝对额。`,
        `Cash-to-profit = ${year - 2}–${year} operating cash total ÷ ${profitName[1].toLowerCase()} total; use absolute amounts when profit is nonpositive or its absolute amount is below 2% of revenue.`,
      ]
    ),
  };

  const shortDebt = analysis?.shortDebt ?? null;
  const debt = computedFen(shortDebt);
  let debtStatus: CompanyOverviewStatus = 'unknown';
  let debtJudgment: OverviewText = ['短期偿付数据待补', 'Short-term repayment data is incomplete'];
  let debtDetail: OverviewText = [
    '核对货币资金、短期借款与一年内到期非流动负债。',
    'Check monetary funds, short-term borrowing and current noncurrent liabilities.',
  ];
  if (debt === 0n) {
    debtStatus = 'good';
    debtJudgment = ['没有这两项短期债务', 'Neither short-term debt item is outstanding'];
    debtDetail = [
      '短期借款与一年内到期非流动负债均为零。',
      'Short-term borrowing and current noncurrent liabilities are both zero.',
    ];
  } else if (debt !== null) {
    if (lessThan(a?.cash ?? null, shortDebt, 1n, 1n)) {
      debtStatus = 'risk';
      debtJudgment = ['现金覆盖不了短期债务', 'Cash does not cover short-term debt'];
      debtDetail = [
        '偿付缺口需要后续回款、融资或资产处置补上。',
        'Subsequent receipts, financing or asset sales must cover the repayment gap.',
      ];
    } else if (lessThan(a?.cash ?? null, shortDebt, 15n, 10n)) {
      debtStatus = 'watch';
      debtJudgment = ['现金够还，缓冲很薄', 'Cash covers debt, with a thin buffer'];
      debtDetail = [
        '覆盖倍数在 1–1.5 倍之间，继续核对资金限制和到期节奏。',
        'Coverage is between 1 and 1.5 times; check restrictions on funds and maturity timing.',
      ];
    } else {
      debtStatus = 'good';
      debtJudgment = ['短期偿付压力不大', 'Short-term repayment pressure is limited'];
      debtDetail = [
        '账上货币资金至少覆盖这两项短期债务的 1.5 倍。',
        'Monetary funds cover these two short-term debt items at least 1.5 times.',
      ];
    }
  }
  const debtCard: CompanyOverviewCard = {
    id: 'debt',
    question: ['还债压力大不大？', 'How much pressure comes from debt?'],
    status: debtStatus,
    judgment: debtJudgment,
    detail: debtDetail,
    primary:
      debt === 0n
        ? amount(['两项短期债务合计', 'Two short-term debt items'], shortDebt)
        : times(
            ['现金 ÷ 两项短期债务', 'Cash ÷ two short-term debt items'],
            analysis?.debtCoverage ?? null
          ),
    measures: [
      amount(['货币资金', 'Monetary funds'], a?.cash ?? null),
      ...(debt !== 0n ? [amount(['两项短期债务', 'Two short-term debt items'], shortDebt)] : []),
    ],
    evidence: evidence(annual ? [annual] : [], cashFields, [
      '覆盖倍数 = 货币资金 ÷（短期借款 + 一年内到期非流动负债）。',
      'Coverage = monetary funds ÷ (short-term borrowing + current portion of noncurrent liabilities).',
    ]),
  };

  const findings: CompanyOverviewFinding[] = [];
  const add = (
    finding: Omit<CompanyOverviewFinding, 'evidence'>,
    rows: CompanyContextPeriod[],
    fields: ContextAmountField[],
    formula: OverviewText
  ) => findings.push({ ...finding, evidence: evidence(rows, fields, formula) });
  if (debtStatus === 'risk' && analysis?.debtGap)
    add(
      {
        id: 'debt-gap',
        status: 'risk',
        title: ['短期偿付有资金缺口', 'A cash gap remains for short-term repayment'],
        detail: [
          `${year} 年末，货币资金少于两项短期债务合计。`,
          `At ${year} year-end, monetary funds are below the two short-term debt items.`,
        ],
        measure: amount(
          ['偿付缺口', 'Repayment gap'],
          contextYuan(-computedFen(analysis.debtGap)!)
        ),
        nextCheck: [
          '先核对受限资金、债务到期表与确定的偿付来源。',
          'First check restricted funds, debt maturities and confirmed repayment sources.',
        ],
      },
      [annual!],
      cashFields,
      [
        '缺口 = 短期借款 + 一年内到期非流动负债 − 货币资金。',
        'Gap = short-term borrowing + current noncurrent liabilities − monetary funds.',
      ]
    );
  if (p !== null && p < 0n && analysis)
    add(
      {
        id: 'loss-years',
        status: 'risk',
        title: [
          `已取得年度中有 ${analysis.lossYears} 年亏损`,
          `${analysis.lossYears} acquired annual periods were loss-making`,
        ],
        detail: [
          `${year} 年仍在亏损，继续核对亏损是否持续。`,
          `The company remained loss-making in ${year}; check whether losses persist.`,
        ],
        nextCheck: [
          '对照业务披露、扣非利润与减值明细，拆解亏损来源。',
          'Compare business disclosures, recurring profit and impairment details to investigate losses.',
        ],
      },
      annuals,
      [profitField],
      [
        `统计已取得年度中${profitName[0]}小于零的年度数。`,
        `Count acquired annual periods with negative ${profitName[1].toLowerCase()}.`,
      ]
    );
  if (analysis?.negativeCashYears)
    add(
      {
        id: 'negative-cash',
        status: analysis.negativeCashYears >= 2 ? 'risk' : 'watch',
        title: [
          `${analysis.negativeCashYears} 个年度经营现金净流出`,
          `${analysis.negativeCashYears} annual periods had operating cash outflows`,
        ],
        detail: [
          '主业现金流为负的年度需要外部资金或积累资金填补。',
          'Periods of negative operating cash require external or accumulated funds.',
        ],
        nextCheck: [
          '核对收付款节奏、期后回款、应收账龄和存货去化。',
          'Check payment timing, subsequent collections, receivable ageing and inventory sell-through.',
        ],
      },
      annuals,
      ['ocf'],
      [
        '统计已取得年度中经营现金净额小于零的年度数。',
        'Count acquired annual periods with negative operating cash flow.',
      ]
    );
  if (cashStatus === 'risk' || (cashStatus === 'watch' && threeYear?.complete))
    add(
      {
        id: 'cash-quality',
        status: cashStatus,
        title: cashJudgment,
        detail: cashDetail,
        nextCheck: [
          '取得现金流补充资料，核对利润到经营现金的差额。',
          'Obtain the cash-flow reconciliation and check the gap between profit and operating cash.',
        ],
      },
      three,
      [profitField, 'ocf', 'revenue'],
      cashCard.evidence.formula
    );
  if (annual?.auditOpinion && annual.auditOpinion !== '标准无保留意见')
    add(
      {
        id: 'audit',
        status: 'watch',
        title: ['审计意见需要优先阅读', 'Read the audit opinion first'],
        detail: [annual.auditOpinion, annual.auditOpinion],
        nextCheck: [
          '打开审计报告原文，阅读意见依据与相关段落。',
          'Open the original audit report and read the opinion basis and relevant paragraphs.',
        ],
      },
      [annual],
      [],
      ['取年度报告披露的审计意见。', 'Use the audit opinion disclosed in the annual report.']
    );
  const finance = contextSum([a?.totalProfit, a?.financeExpense]);
  if (annual && lessThan(finance, a?.financeExpense ?? null, 15n, 10n))
    add(
      {
        id: 'finance-expense',
        status: lessThan(finance, a?.financeExpense ?? null, 1n, 1n) ? 'risk' : 'watch',
        title: ['利润对财务费用的覆盖偏低', 'Profit coverage of finance expense is low'],
        detail: [
          '继续核对借款成本、利息费用与资本化利息。',
          'Check borrowing costs, interest expense and capitalised interest.',
        ],
        measure: times(
          ['财务费用覆盖倍数', 'Finance-expense coverage'],
          analysis?.financeExpenseRatio ?? null
        ),
        nextCheck: [
          '阅读借款及利息附注，核对真实融资负担。',
          'Read borrowing and interest notes to check the financing burden.',
        ],
      },
      [annual],
      ['totalProfit', 'financeExpense'],
      [
        '覆盖倍数 =（利润总额 + 财务费用）÷ 财务费用。',
        'Coverage = (profit before tax + finance expense) ÷ finance expense.',
      ]
    );
  if (
    annual &&
    analysis?.assetLiabilityRatio !== null &&
    greaterThan(a?.totalLiabilities ?? null, a?.totalAssets ?? null, 65n, 100n)
  )
    add(
      {
        id: 'leverage',
        status: greaterThan(a?.totalLiabilities ?? null, a?.totalAssets ?? null, 80n, 100n)
          ? 'risk'
          : 'watch',
        title: ['资产负债率偏高', 'The liability-to-asset ratio is high'],
        detail: [
          '负债占资产超过 65%，结合同行与偿付结构继续看。',
          'Liabilities exceed 65% of assets; compare peers and the repayment structure.',
        ],
        measure: {
          label: ['资产负债率', 'Liabilities / assets'],
          value:
            analysis?.assetLiabilityRatio === null || analysis?.assetLiabilityRatio === undefined
              ? null
              : analysis.assetLiabilityRatio * 100,
          kind: 'percent',
        },
        nextCheck: [
          '对照同年同行，核对负债构成和到期结构。',
          'Compare same-year peers and inspect liability composition and maturities.',
        ],
      },
      [annual],
      ['totalLiabilities', 'totalAssets'],
      ['资产负债率 = 总负债 ÷ 总资产。', 'Liabilities / assets = total liabilities ÷ total assets.']
    );
  const cards = [earn, cashCard, debtCard];
  const unknownCards = cards.filter((card) => card.status === 'unknown');
  if (state === 'available' && unknownCards.length)
    add(
      {
        id: 'data-gap',
        status: 'watch',
        title: ['部分年度字段待补或待核对', 'Some annual fields need completing or checking'],
        detail: [
          `${year} 年及前两年的相关报表字段尚不能支持全部三项判断。`,
          `The relevant fields for ${year} and its two preceding years do not yet support all three judgments.`,
        ],
        nextCheck: [
          `补齐 ${year} 年及前两年的相关报表字段，再核对来源差异。`,
          `Complete the relevant fields for ${year} and its two preceding years, then check source differences.`,
        ],
      },
      annuals,
      [...new Set(unknownCards.flatMap((card) => card.evidence.fields))],
      [
        '按所选年度与科目核对已取得字段和来源。',
        'Check acquired fields and sources for the selected annual periods.',
      ]
    );
  findings.sort(
    (left, right) => (left.status === 'risk' ? 0 : 1) - (right.status === 'risk' ? 0 : 1)
  );
  const nextCheck =
    state === 'mismatch'
      ? null
      : findings[0]?.nextCheck ||
        (cards.some((card) => card.status === 'unknown')
          ? ([
              `补齐 ${year} 年及前两年的相关报表字段，再核对来源差异。`,
              `Complete the relevant fields for ${year} and its two preceding years, then check source differences.`,
            ] as OverviewText)
          : null);
  return { year, basis, state, annual, interim, analysis, cards, findings, nextCheck };
}

/** Legacy full-history views keep their scope; an explicit year uses checked F analysis. */
export function companyContextOverviewAnalysis(
  snapshot: CompanyContextSnapshot,
  run: CompanyResearchRun,
  basis: CompanyReadingBasis,
  selectedYear?: number
): CompanyContextAnalysis {
  if (selectedYear === undefined) return analyzeCompanyContext(snapshot, basis);
  return (
    deriveCompanyFinancialOverview(
      { ...run, context: snapshot, input: { ...run.input, year: selectedYear } },
      basis
    ).analysis || analyzeCompanyContext({ ...snapshot, financials: [] }, basis)
  );
}
