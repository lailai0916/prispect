import type { CompanyIdentity } from './contracts.js';

export type CompanyFinancialSourceId = 'income' | 'cashflow' | 'balance';

/** The income catalog covers all issuer types; balance/cash tables have industry schemas. */
export function financialStatementTables(organizationType = '') {
  const prefix = /银行/.test(organizationType)
    ? 'B'
    : /保险/.test(organizationType)
      ? 'I'
      : /证券/.test(organizationType)
        ? 'S'
        : 'G';
  return {
    income: 'RPT_F10_FINANCE_GINCOME',
    cashflow: `RPT_F10_FINANCE_${prefix}CASHFLOW`,
    balance: `RPT_F10_FINANCE_${prefix}BALANCE`,
  };
}

export function financialMethodNote(...descriptions: (string | null | undefined)[]) {
  return /银行|证券|保险|信托|多元金融/.test(descriptions.filter(Boolean).join(' '))
    ? ([
        '金融机构：展示披露金额与计算比例，通用筛选仅作参考；存贷款、客户资金与保险业务需结合行业口径解释。',
        'Financial institution: disclosed amounts and formula-based ratios are shown; the general screen is a reference. Interpret deposits, lending, client funds and insurance operations in their industry context.',
      ] as const)
    : undefined;
}

/** Third-party web fields in CNY yuan; null is unavailable, never an assumed zero. */
export const FINANCIAL_FIELD_SOURCES = {
  revenue: { sourceId: 'income', field: 'TOTAL_OPERATE_INCOME' },
  netProfit: { sourceId: 'income', field: 'NETPROFIT' },
  operatingCashFlow: { sourceId: 'cashflow', field: 'NETCASH_OPERATE' },
  investingCashFlow: { sourceId: 'cashflow', field: 'NETCASH_INVEST' },
  financingCashFlow: { sourceId: 'cashflow', field: 'NETCASH_FINANCE' },
  monetaryFunds: { sourceId: 'balance', field: 'MONETARYFUNDS' },
  shortLoans: { sourceId: 'balance', field: 'SHORT_LOAN' },
  currentPortionDebt: { sourceId: 'balance', field: 'NONCURRENT_LIAB_1YEAR' },
  receivables: { sourceId: 'balance', field: 'ACCOUNTS_RECE' },
  inventory: { sourceId: 'balance', field: 'INVENTORY' },
  totalAssets: { sourceId: 'balance', field: 'TOTAL_ASSETS' },
  totalLiabilities: { sourceId: 'balance', field: 'TOTAL_LIABILITIES' },
} as const satisfies Record<string, { sourceId: CompanyFinancialSourceId; field: string }>;

export type CompanyFinancialMetric = keyof typeof FINANCIAL_FIELD_SOURCES;

export interface CompanyFinancialYear {
  year: number;
  reportDate: string;
  amounts: Record<CompanyFinancialMetric, string | null>;
  sourceIds: Partial<Record<CompanyFinancialSourceId, string>>;
  sourceDates?: Partial<
    Record<CompanyFinancialSourceId, { noticeDate: string | null; updatedAt: string | null }>
  >;
  warnings?: string[];
}

/** Stable product messages let clients translate saved diagnostics without inferring a result. */
export const COMPANY_MARKET_WARNINGS = {
  scope: {
    zh: '第三方网页财务字段未核对原件合并口径，不自动用于现金桥或企业评级。',
    en: 'Third-party web fields have not been checked against original consolidated statements. They do not enter cash bridges or company ratings automatically.',
  },
  hash: {
    zh: '此哈希属于网页响应，不是PDF原件哈希或认证。',
    en: 'This hash identifies a web response, not a PDF original or its authentication.',
  },
  liquidity: {
    zh: '货币资金是历史报表字段，不等于当前可用现金；两项负债字段不代表全部负债。',
    en: 'Historical monetary funds are not current available cash. The two liability fields do not represent all liabilities.',
  },
  partial: {
    zh: '部分表未完成取数，保留已通过主体、年度和币种检查的表。',
    en: 'Some tables could not be retrieved. Tables passing entity, annual-period and currency checks are retained.',
  },
  amount: {
    zh: '部分网页金额缺失或不能精确表示到人民币分，保留未知。',
    en: 'Some web amounts are missing or cannot be represented as exact CNY cents; they remain unknown.',
  },
  identity: {
    zh: '网页表中的主体或机构代码冲突，停止组合所有金额。',
    en: 'Entity or organization codes conflict between web tables. No amounts are combined.',
  },
  industry: {
    zh: '当前网页财务取数仅覆盖沪深 A 股，其他市场保留原始记录。',
    en: 'Public financial retrieval currently covers Shanghai/Shenzhen A shares. Records from other markets remain preserved.',
  },
  duplicate: {
    zh: '同一年度的网页记录存在重复金额冲突，该表该年度字段未采用。',
    en: 'Duplicate web records disagree for the same year. That table’s fields for the year were withheld.',
  },
  profitConflict: {
    zh: '利润表与现金流量表的净利润字段不一致，该年度利润与经营现金比较已停止。',
    en: 'Net-profit fields disagree between the income and cash-flow tables. Profit and operating-cash comparisons for that year were withheld.',
  },
  profitUnchecked: {
    zh: '部分年度未取得两表净利润字段，无法交叉核对网页口径。',
    en: 'Both tables’ net-profit fields are not available for some years, so their web scope could not be cross-checked.',
  },
  requestedYear: {
    zh: '请求年度没有取得网页年报字段，历史年度仅供参考。',
    en: 'No annual web fields were retrieved for the requested year. Older years are retained for reference only.',
  },
} as const;

export interface CompanyFinancialSource {
  id: CompanyFinancialSourceId;
  status: 'available' | 'empty' | 'failed' | 'unsupported';
  requestUrl: string;
  /** Hash of the retrieved response bytes, not a retained or authenticated PDF. */
  sha256?: string;
  retrievedAt: string;
  errorCode?: string;
}

export interface CompanyFinancialContext {
  source: 'eastmoney-public-web';
  status: 'available' | 'partial' | 'unavailable' | 'unsupported';
  securityCode: string;
  exchange: CompanyIdentity['exchange'];
  requestedYear: number;
  retrievedAt: string;
  identity: {
    status: 'matched' | 'unconfirmed' | 'conflict';
    organizationCode: string | null;
    organizationType: string | null;
  };
  years: CompanyFinancialYear[];
  sources: CompanyFinancialSource[];
  warnings: string[];
}
