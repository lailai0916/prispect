import type {
  CompanyContextSnapshot,
  CompanyContextPeriod,
  ContextAmountField,
} from './company-workspace.js';

export const contextFieldLabels: Record<ContextAmountField, readonly [string, string]> = {
  revenue: ['营业总收入', 'Revenue'],
  netProfit: ['合并净利润', 'Consolidated net profit'],
  parentProfit: ['归母净利润', 'Profit attributable to owners'],
  deductedProfit: ['扣非归母净利润', 'Attributable profit excluding nonrecurring items'],
  operatingProfit: ['营业利润', 'Operating profit'],
  totalProfit: ['利润总额', 'Profit before tax'],
  financeExpense: ['财务费用', 'Finance expense'],
  ocf: ['经营现金净额', 'Operating cash flow'],
  investingCash: ['投资现金净额', 'Investing cash flow'],
  financingCash: ['筹资现金净额', 'Financing cash flow'],
  salesCash: ['销售商品及服务收到的现金', 'Cash received from sales'],
  cash: ['货币资金', 'Monetary funds'],
  shortLoan: ['短期借款', 'Short-term borrowing'],
  currentPortionDebt: ['一年内到期非流动负债', 'Current portion of noncurrent liabilities'],
  receivables: ['应收账款', 'Accounts receivable'],
  notesReceivable: ['应收票据', 'Notes receivable'],
  inventory: ['存货', 'Inventory'],
  totalAssets: ['总资产', 'Total assets'],
  totalLiabilities: ['总负债', 'Total liabilities'],
  currentAssets: ['流动资产', 'Current assets'],
  currentLiabilities: ['流动负债', 'Current liabilities'],
  equity: ['归母净资产', 'Equity attributable to owners'],
};
export function contextFen(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string' || !/^-?\d{1,20}(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -amount : amount;
}
export function contextYuan(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function contextSum(values: (string | null | undefined)[]): string | null {
  const amounts = values.map(contextFen);
  if (!values.length || amounts.some((value) => value === null)) return null;
  return contextYuan(amounts.reduce<bigint>((sum, value) => sum + value!, 0n));
}
/** Four decimal places, rounded using integers; the denominator must be positive. */
export function contextRatio(numerator: string | null, denominator: string | null): number | null {
  const a = contextFen(numerator),
    b = contextFen(denominator);
  if (a === null || b === null || b <= 0n) return null;
  const absolute = a < 0n ? -a : a;
  const scaled = (absolute * 10_000n + b / 2n) / b;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return (Number(scaled) / 10_000) * (a < 0n ? -1 : 1);
}
export type CompanyReadingBasis = 'parent' | 'consolidated';
export interface CompanyContextAnalysis {
  annuals: CompanyContextPeriod[];
  latestAnnual: CompanyContextPeriod | null;
  latestInterim: CompanyContextPeriod | null;
  profitField: 'parentProfit' | 'netProfit';
  threeYear: {
    periods: string[];
    profit: string | null;
    cash: string | null;
    revenue: string | null;
    ratio: number | null;
    complete: boolean;
    thinProfit: boolean;
  };
  shortDebt: string | null;
  debtCoverage: number | null;
  debtGap: string | null;
  assetLiabilityRatio: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  receivableToRevenue: number | null;
  ocfToRevenue: number | null;
  financeExpenseRatio: number | null;
  lossYears: number;
  negativeCashYears: number;
  missing: ContextAmountField[];
}
export function analyzeCompanyContext(
  snapshot: CompanyContextSnapshot,
  basis: CompanyReadingBasis
): CompanyContextAnalysis {
  const annuals = snapshot.financials
    .filter((row) => row.annual)
    .sort((a, b) => a.period.localeCompare(b.period));
  const latestAnnual = annuals.at(-1) || null;
  const latestInterim =
    snapshot.financials
      .filter((row) => !row.annual)
      .sort((a, b) => b.period.localeCompare(a.period))[0] || null;
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const three = annuals.slice(-3);
  const consecutive =
    three.length === 3 &&
    three.every(
      (row, index) =>
        index === 0 ||
        Number(row.period.slice(0, 4)) === Number(three[index - 1]!.period.slice(0, 4)) + 1
    );
  const profit = contextSum(three.map((row) => row.amounts[profitField]));
  const cash = contextSum(three.map((row) => row.amounts.ocf));
  const revenue = contextSum(three.map((row) => row.amounts.revenue));
  const complete = consecutive && profit !== null && cash !== null && revenue !== null;
  const profitShare = contextRatio(profit, revenue);
  const thinProfit = complete && profitShare !== null && Math.abs(profitShare) < 0.02;
  const shortDebt = latestAnnual
    ? contextSum([latestAnnual.amounts.shortLoan, latestAnnual.amounts.currentPortionDebt])
    : null;
  const funds = latestAnnual?.amounts.cash ?? null;
  const a = latestAnnual?.amounts;
  const debtGap =
    contextFen(funds) !== null && contextFen(shortDebt) !== null
      ? contextYuan(contextFen(funds)! - contextFen(shortDebt)!)
      : null;
  const quickAssets =
    a && contextFen(a.currentAssets) !== null && contextFen(a.inventory) !== null
      ? contextYuan(contextFen(a.currentAssets)! - contextFen(a.inventory)!)
      : null;
  const financeProfit = a ? contextSum([a.totalProfit, a.financeExpense]) : null;
  const required: ContextAmountField[] = [
    'revenue',
    profitField,
    'ocf',
    'cash',
    'shortLoan',
    'currentPortionDebt',
  ];
  return {
    annuals,
    latestAnnual,
    latestInterim,
    profitField,
    threeYear: {
      periods: three.map((row) => row.period),
      profit,
      cash,
      revenue,
      ratio: complete && !thinProfit ? contextRatio(cash, profit) : null,
      complete,
      thinProfit,
    },
    shortDebt,
    debtCoverage: contextRatio(funds, shortDebt),
    debtGap,
    assetLiabilityRatio: contextRatio(a?.totalLiabilities ?? null, a?.totalAssets ?? null),
    currentRatio: contextRatio(a?.currentAssets ?? null, a?.currentLiabilities ?? null),
    quickRatio: contextRatio(quickAssets, a?.currentLiabilities ?? null),
    receivableToRevenue: contextRatio(a?.receivables ?? null, a?.revenue ?? null),
    ocfToRevenue: contextRatio(a?.ocf ?? null, a?.revenue ?? null),
    financeExpenseRatio: contextRatio(financeProfit, a?.financeExpense ?? null),
    lossYears: annuals.filter((row) => {
      const value = contextFen(row.amounts[profitField]);
      return value !== null && value < 0n;
    }).length,
    negativeCashYears: annuals.filter((row) => {
      const value = contextFen(row.amounts.ocf);
      return value !== null && value < 0n;
    }).length,
    missing: required.filter((field) => !a || a[field] === null),
  };
}
export interface CompanyCheckPriority {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  title: readonly [string, string];
  fields: ContextAmountField[];
  materials: readonly [string, string];
  question: readonly [string, string];
  disclosures: string[];
}
export function companyCheckPriorities(
  snapshot: CompanyContextSnapshot,
  analysis: CompanyContextAnalysis
): CompanyCheckPriority[] {
  const result: CompanyCheckPriority[] = [];
  const disclosures = (categories: string[]) =>
    snapshot.announcements
      .filter((row) => categories.includes(row.category))
      .slice(0, 3)
      .map((row) => row.id);
  if (analysis.debtCoverage !== null && analysis.debtCoverage < 1)
    result.push({
      id: 'debt',
      priority: 'P0',
      title: ['核对债务到期结构与偿付来源', 'Check debt maturity and repayment sources'],
      fields: ['cash', 'shortLoan', 'currentPortionDebt'],
      materials: [
        '银行授信、借款台账、抵质押与担保清单、未来十二个月到期安排',
        'Credit facilities, loan schedules, collateral, guarantees and twelve-month maturities',
      ],
      question: [
        '偿付依赖哪些确定回款或融资？资金是否受限？',
        'Which confirmed receipts or financing support repayment? Are funds restricted?',
      ],
      disclosures: disclosures(['偿债', '融资', '担保']),
    });
  if (analysis.lossYears || (analysis.threeYear.ratio !== null && analysis.threeYear.ratio < 0.9))
    result.push({
      id: 'profit-cash',
      priority: analysis.lossYears ? 'P0' : 'P1',
      title: ['拆解利润与现金变化', 'Investigate profit and cash changes'],
      fields: [analysis.profitField, 'ocf', 'inventory', 'receivables'],
      materials: [
        '现金流补充资料、账龄、期后回款、存货明细、减值底稿',
        'Cash-flow reconciliation, ageing, subsequent collections, inventory and impairment schedules',
      ],
      question: [
        '哪些原表分项解释差额？一次性事项与经营变化各有多少？',
        'Which original-report items explain the difference? What is recurring or nonrecurring?',
      ],
      disclosures: disclosures(['经营', '财报']),
    });
  if (
    analysis.latestAnnual?.auditOpinion &&
    analysis.latestAnnual.auditOpinion !== '标准无保留意见'
  )
    result.push({
      id: 'audit',
      priority: 'P0',
      title: ['阅读审计意见对应原文', 'Read the original audit opinion'],
      fields: [],
      materials: [
        '审计报告原文、持续经营与期后事项说明',
        'Original audit report, going-concern and subsequent-event notes',
      ],
      question: [
        '意见与相关段落分别说明什么？适用期间和范围是什么？',
        'What do the opinion and relevant paragraphs say, and what period and scope do they cover?',
      ],
      disclosures: disclosures(['财报']),
    });
  if (snapshot.announcements.some((row) => row.attention === 'high'))
    result.push({
      id: 'disclosures',
      priority: 'P1',
      title: ['核实司法、监管与偿债线索', 'Verify legal, regulatory and repayment disclosures'],
      fields: [],
      materials: [
        '案件与担保台账、事项进展、履行记录、或有负债说明',
        'Case and guarantee registers, progress, performance records and contingent liabilities',
      ],
      question: [
        '公司在事项中的角色、涉及金额和当前进展是什么？',
        'What is the company’s role, the amount involved and the current status?',
      ],
      disclosures: disclosures(['司法', '监管', '偿债']),
    });
  result.push({
    id: 'coverage',
    priority: 'P2',
    title: ['补齐当前来源覆盖之外的材料', 'Collect evidence beyond current source coverage'],
    fields: analysis.missing,
    materials: [
      '征信、当前登记、银行流水、纳税记录和关键合同；由企业或授权渠道提供',
      'Credit records, current registration, bank statements, tax records and key contracts from the company or authorised sources',
    ],
    question: [
      '公开披露与内部资料能否对齐？未取得的信息应如何补齐？',
      'Do disclosures align with internal records? How can missing evidence be obtained?',
    ],
    disclosures: [],
  });
  return result.sort((a, b) => a.priority.localeCompare(b.priority));
}
