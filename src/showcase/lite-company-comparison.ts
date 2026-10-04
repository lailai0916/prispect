import type { CompanyResearchRun } from '../../shared/contracts';
import { contextFen, contextYuan, type CompanyReadingBasis } from '../../shared/company-analysis';
import { deriveCompanyFinancialOverview } from '../../shared/company-financial-overview';
import { companyEvidenceSourceUrls } from '../../shared/company-source-evidence';
import { assessmentSourceHref } from '../../shared/source-excerpt-focus';
import {
  liteAmountDisplay,
  liteAmountScale,
  type LiteAmountDisplay,
  type LiteAmountScale,
} from './lite-amount-display';

export type FinancialBasis = CompanyReadingBasis;
export type LiteComparisonText = readonly [string, string];
export type LiteComparisonMetricId = 'revenue' | 'netProfit' | 'ocf' | 'cash';
export type LiteComparisonReasonCode =
  | 'missing-company'
  | 'same-company'
  | 'different-year'
  | 'scope-mismatch'
  | 'unsupported'
  | 'identity-unverified'
  | 'missing-annual'
  | 'missing-value'
  | 'source-conflict'
  | 'source-unverified';
export interface LiteComparisonReason {
  code: LiteComparisonReasonCode;
  text: LiteComparisonText;
}
export interface LiteComparisonAmount {
  exactYuan: string;
  display: { zh: LiteAmountDisplay; en: LiteAmountDisplay };
}
export interface LiteComparisonSource {
  provider: 'primary' | 'secondary';
  url: string;
  period: string;
  field: 'revenue' | 'netProfit' | 'parentProfit' | 'ocf' | 'cash';
}
export interface LiteComparisonValue {
  status: 'available' | 'missing' | 'conflict' | 'unverified';
  amount: LiteComparisonAmount | null;
  sources: LiteComparisonSource[];
}
export interface LiteComparisonCompany {
  runId: string;
  securityCode: string;
  orgId: string;
  companyName: string;
  year: number;
  basis: FinancialBasis;
  currency: 'CNY' | null;
  state: 'available' | 'missing' | 'mismatch' | 'unsupported' | 'identity-unverified';
  snapshotFetchedAt: string | null;
  period: string | null;
}
export interface LiteComparisonBar {
  start: number;
  width: number;
}
export interface LiteCompanyComparisonRow {
  id: LiteComparisonMetricId;
  field: LiteComparisonSource['field'];
  label: LiteComparisonText;
  left: LiteComparisonValue;
  right: LiteComparisonValue;
  /** Left minus right, never a rating or a measure of which company is better. */
  delta: LiteComparisonAmount | null;
  comparable: boolean;
  reason: LiteComparisonReason | null;
  scale: { zh: LiteAmountScale; en: LiteAmountScale };
  bars: {
    signed: boolean;
    zero: number;
    left: LiteComparisonBar | null;
    right: LiteComparisonBar | null;
    delta: LiteComparisonBar | null;
  };
}
export interface LiteCompanyComparison {
  state: 'empty' | 'single' | 'same-company' | 'incompatible' | 'ready';
  basis: FinancialBasis;
  left: LiteComparisonCompany | null;
  right: LiteComparisonCompany | null;
  sameCompany: boolean;
  comparable: boolean;
  reasons: LiteComparisonReason[];
  rows: LiteCompanyComparisonRow[];
}

const reasonText: Record<LiteComparisonReasonCode, LiteComparisonText> = {
  'missing-company': ['请选择两家已有资料的公司。', 'Select two companies with saved materials.'],
  'same-company': [
    '两份记录属于同一主体，保留各自数据，不计算公司差额。',
    'Both records belong to one issuer. Their data is retained without a company difference.',
  ],
  'different-year': [
    '年度不同，分别保留金额，不计算差额。',
    'The annual periods differ. Amounts remain separate and no difference is calculated.',
  ],
  'scope-mismatch': [
    '主体或机构代码不匹配，相关金额暂不采用。',
    'Issuer or organization codes do not match. Dependent amounts are withheld.',
  ],
  unsupported: [
    '当前比较仅采用已核对的沪深人民币年度网页字段。',
    'Comparison uses verified Shanghai/Shenzhen annual public fields in CNY.',
  ],
  'identity-unverified': [
    '主体尚未核对，已有字段仅供阅读，不计算公司差额。',
    'The issuer has not been verified. Acquired fields remain readable without a company difference.',
  ],
  'missing-annual': [
    '所选年度资料尚未取得，不借用其他年度金额。',
    'The selected annual data was not acquired. Other years are not substituted.',
  ],
  'missing-value': [
    '本项资料不足，不计算差额。',
    'This metric lacks an input; no difference is calculated.',
  ],
  'source-conflict': [
    '本项来源有冲突，保留未知，不计算差额。',
    'Metric sources disagree. The value remains unknown and no difference is calculated.',
  ],
  'source-unverified': [
    '本项缺少可核对的字段出处，不计算差额。',
    'A verifiable field source is missing; no difference is calculated.',
  ],
};
const reason = (code: LiteComparisonReasonCode): LiteComparisonReason => ({
  code,
  text: reasonText[code],
});
const absolute = (value: bigint) => (value < 0n ? -value : value);

function verifiedIdentity(run: CompanyResearchRun): boolean {
  const identity = run.identity;
  if (
    !identity ||
    identity.securityCode !== run.input.securityCode ||
    identity.orgId !== run.input.orgId
  )
    return false;
  try {
    const source = new URL(identity.sourceUrl);
    return (
      source.protocol === 'https:' &&
      !source.username &&
      !source.password &&
      !source.port &&
      source.hostname === 'www.cninfo.com.cn' &&
      source.pathname === '/new/snapshot/companyDetailCn' &&
      source.searchParams.get('code') === run.input.securityCode
    );
  } catch {
    return false;
  }
}

function projectCompany(run: CompanyResearchRun | null, basis: FinancialBasis) {
  if (!run) return null;
  const snapshot = run.context;
  const overview = deriveCompanyFinancialOverview(run, basis);
  const identityMismatch =
    !!run.identity &&
    (run.identity.securityCode !== run.input.securityCode ||
      run.identity.orgId !== run.input.orgId);
  const unsupported =
    !/^\d{6}$/.test(run.input.securityCode) ||
    (!!run.identity && !['sse', 'szse'].includes(run.identity.exchange));
  const mismatch = identityMismatch || overview.state === 'mismatch';
  const verified = !unsupported && !mismatch && verifiedIdentity(run);
  const annual = !unsupported && !mismatch ? overview.annual : null;
  const sameSnapshot =
    snapshot?.securityCode === run.input.securityCode && snapshot.orgId === run.input.orgId;
  const sameIdentity =
    run.identity?.securityCode === run.input.securityCode && run.identity.orgId === run.input.orgId;
  const company: LiteComparisonCompany = {
    runId: run.id,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    companyName:
      (sameIdentity && (run.identity?.shortName || run.identity?.companyName)) ||
      (sameSnapshot && snapshot?.companyName) ||
      run.input.securityCode,
    year: run.input.year,
    basis,
    // This DTO is CNY by contract: collection rejects non-CNY rows before publication.
    // Original candidates/material currencies are a separate evidence boundary.
    currency: annual && !unsupported && !mismatch ? 'CNY' : null,
    state: mismatch
      ? 'mismatch'
      : unsupported
        ? 'unsupported'
        : !annual
          ? 'missing'
          : !verified
            ? 'identity-unverified'
            : 'available',
    snapshotFetchedAt: sameSnapshot ? snapshot?.fetchedAt || null : null,
    period: annual?.period || null,
  };
  return { run, company, annual };
}

function sourceValues(
  side: ReturnType<typeof projectCompany>,
  field: LiteComparisonSource['field']
) {
  const unavailable = { value: null, sources: [], status: 'missing' } as const;
  if (!side || !side.annual)
    return {
      ...unavailable,
      status:
        side && ['mismatch', 'unsupported'].includes(side.company.state)
          ? ('unverified' as const)
          : ('missing' as const),
    };
  const { run, annual } = side;
  const conflict = run.context?.comparisons.some(
    (check) => check.period === annual.period && check.field === field && !check.matches
  );
  const parsed = contextFen(annual.amounts[field]);
  if (parsed === null)
    return {
      value: null,
      sources: [],
      status: conflict ? ('conflict' as const) : ('missing' as const),
    };
  const actualProvider =
    annual.fieldSources[field] === '东方财富'
      ? 'primary'
      : annual.fieldSources[field] === '新浪财经'
        ? 'secondary'
        : null;
  const sources = (['primary', 'secondary'] as const).flatMap((provider) =>
    companyEvidenceSourceUrls(run.context, annual, field, provider).flatMap((url) => {
      const receipt = run.context?.sources.find((source) => source.url === url);
      const safe = assessmentSourceHref(url);
      return safe &&
        provider === actualProvider &&
        sourceIssuerMatches(url, run) &&
        receipt &&
        ['available', 'partial'].includes(receipt.status)
        ? [{ provider, url: safe, period: annual.period, field }]
        : [];
    })
  );
  return { value: parsed, sources, status: 'available' as const };
}

/** A table URL alone cannot identify a company; require its recorded issuer query. */
function sourceIssuerMatches(value: string, run: CompanyResearchRun): boolean {
  const url = new URL(value);
  if (url.hostname === 'quotes.sina.cn')
    return (
      url.searchParams.get('paperCode') ===
      `${run.identity?.exchange === 'sse' ? 'sh' : 'sz'}${run.input.securityCode}`
    );
  if (url.hostname !== 'datacenter.eastmoney.com') return false;
  const matches = [
    ...(url.searchParams.get('filter') || '').matchAll(
      /\b(SECUCODE|SECURITY_CODE)\s*=\s*["']([^"']+)["']/g
    ),
  ];
  return (
    matches.length > 0 &&
    matches.every(
      (match) =>
        match[2] ===
        (match[1] === 'SECURITY_CODE'
          ? run.input.securityCode
          : `${run.input.securityCode}.${run.identity?.exchange === 'sse' ? 'SH' : 'SZ'}`)
    )
  );
}

/** Exact computed deltas may gain one digit beyond the provider input bound. */
function displayAmount(
  value: bigint,
  language: 'zh' | 'en',
  scale: LiteAmountScale
): LiteAmountDisplay {
  const exactYuan = contextYuan(value);
  const locale = language === 'en' ? 'en' : 'zh-Hans';
  const ordinary = liteAmountDisplay(exactYuan, locale, { scale });
  if (ordinary) return ordinary;
  const [integer, fraction] = exactYuan.split('.');
  const exact = `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
  // Only an arithmetic difference can reach this branch; it always exceeds the top scale.
  const divisor = 100_000_000_000_000n;
  const rounded = (absolute(value) * 100n + divisor / 2n) / divisor;
  const digits = `${value < 0n ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
  return {
    exactYuan,
    exactText: language === 'en' ? `CNY ${exact}` : `${exact} 元`,
    text: language === 'en' ? `approx CNY ${digits}T` : `约${digits}万亿元`,
    approximate: true,
    scale,
    unit: language === 'en' ? 'CNY T' : '万亿元',
  };
}

/** Compare already-owned records locally. No retrieval, model, score, rank or persistence. */
export function buildLiteCompanyComparison(
  left: CompanyResearchRun | null,
  right: CompanyResearchRun | null,
  basis: FinancialBasis = 'consolidated'
): LiteCompanyComparison {
  const a = projectCompany(left, basis),
    b = projectCompany(right, basis);
  const sameCompany =
    !!left &&
    !!right &&
    (left.input.securityCode === right.input.securityCode ||
      (!!left.input.orgId && left.input.orgId === right.input.orgId));
  const reasons: LiteComparisonReason[] = [];
  const add = (code: LiteComparisonReasonCode) => {
    if (!reasons.some((item) => item.code === code)) reasons.push(reason(code));
  };
  if (!a || !b) add('missing-company');
  if (sameCompany) add('same-company');
  if (a && b && a.company.year !== b.company.year) add('different-year');
  for (const side of [a, b]) {
    if (!side) continue;
    if (side.company.state === 'mismatch') add('scope-mismatch');
    else if (side.company.state === 'unsupported') add('unsupported');
    else if (side.company.state === 'identity-unverified') add('identity-unverified');
    else if (side.company.state === 'missing') add('missing-annual');
  }
  const comparable =
    reasons.length === 0 && a?.company.currency === 'CNY' && b?.company.currency === 'CNY';
  const fields: {
    id: LiteComparisonMetricId;
    field: LiteComparisonSource['field'];
    label: LiteComparisonText;
  }[] = [
    { id: 'revenue', field: 'revenue', label: ['营业收入', 'Revenue'] },
    {
      id: 'netProfit',
      field: basis === 'parent' ? 'parentProfit' : 'netProfit',
      label:
        basis === 'parent'
          ? ['归母净利润', 'Attributable net profit']
          : ['合并净利润', 'Consolidated net profit'],
    },
    { id: 'ocf', field: 'ocf', label: ['经营现金净额', 'Operating cash flow'] },
    { id: 'cash', field: 'cash', label: ['货币资金', 'Monetary funds'] },
  ];
  const rows = fields.map(({ id, field, label }): LiteCompanyComparisonRow => {
    const l = sourceValues(a, field),
      r = sourceValues(b, field);
    const rowReason = !comparable
      ? reasons[0] || reason('source-unverified')
      : l.status === 'conflict' || r.status === 'conflict'
        ? reason('source-conflict')
        : l.value === null || r.value === null
          ? reason('missing-value')
          : !l.sources.length || !r.sources.length
            ? reason('source-unverified')
            : null;
    const deltaValue =
      !rowReason && l.value !== null && r.value !== null ? l.value - r.value : null;
    const values = [l.value, r.value, deltaValue];
    const yuan = values.map((value) => (value === null ? null : contextYuan(value)));
    const scale = { zh: liteAmountScale(yuan, 'zh-Hans'), en: liteAmountScale(yuan, 'en') };
    const amount = (value: bigint | null): LiteComparisonAmount | null =>
      value === null
        ? null
        : {
            exactYuan: contextYuan(value),
            display: {
              zh: displayAmount(value, 'zh', scale.zh),
              en: displayAmount(value, 'en', scale.en),
            },
          };
    const maximum = values.reduce<bigint>(
      (max, value) => (value !== null && absolute(value) > max ? absolute(value) : max),
      0n
    );
    const signed = values.some((value) => value !== null && value < 0n);
    const bar = (value: bigint | null): LiteComparisonBar | null => {
      if (value === null) return null;
      const percent = maximum ? Number((absolute(value) * 10_000n) / maximum) / 100 : 0;
      const width = signed ? percent / 2 : percent;
      return { width, start: signed ? (value < 0n ? 50 - width : 50) : 0 };
    };
    return {
      id,
      field,
      label,
      left: { status: l.status, amount: amount(l.value), sources: [...l.sources] },
      right: { status: r.status, amount: amount(r.value), sources: [...r.sources] },
      delta: amount(deltaValue),
      comparable: !rowReason,
      reason: rowReason,
      scale,
      bars: {
        signed,
        zero: signed ? 50 : 0,
        left: bar(l.value),
        right: bar(r.value),
        delta: bar(deltaValue),
      },
    };
  });
  return {
    state:
      !left && !right
        ? 'empty'
        : !left || !right
          ? 'single'
          : sameCompany
            ? 'same-company'
            : comparable
              ? 'ready'
              : 'incompatible',
    basis,
    left: a?.company || null,
    right: b?.company || null,
    sameCompany,
    comparable,
    reasons,
    rows,
  };
}
