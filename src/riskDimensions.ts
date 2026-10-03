import type { EvidenceRef, Report } from '../shared/contracts';
import { reportCurrencyView } from '../shared/report-currency-view';
import { metricValue, type Locale } from './format';

/**
 * Read-only review states for saved original-report evidence.
 * Input conflicts pause interpretation; they are not adverse company events.
 *
 * - 财务：净利润 / 经营现金 / 现金利润比（来自引擎计算）
 * - 证据来源：披露记录的可溯源性（来源、页码覆盖、文件哈希记录）
 * - 口碑：本份原件报告的范围，不在渲染时另取新闻
 * - 核查事项：现金桥结论、证据冲突、未决问题、检查项
 */

export type RiskStatus = 'good' | 'warn' | 'bad' | 'unknown';

export type LocaleText = { zh: string; en: string };

export interface RiskMetric {
  label: LocaleText;
  value: string;
  tone: RiskStatus | 'plain';
  refs: EvidenceRef[];
  link?: { url: string; label: LocaleText };
}

export interface RiskDimension {
  key: 'finance' | 'credit' | 'reputation' | 'risk';
  label: LocaleText;
  plain: LocaleText;
  status: RiskStatus;
  summary: LocaleText;
  metrics: RiskMetric[];
}

export interface RiskPerspective {
  overall: {
    status: RiskStatus;
    title: LocaleText;
    subtitle: LocaleText;
    scope: LocaleText;
  };
  dimensions: RiskDimension[];
}

export const riskStatusText: Record<RiskStatus, LocaleText> = {
  good: { zh: '已核对', en: 'Checked' },
  warn: { zh: '待核对', en: 'Needs review' },
  bad: { zh: '需关注', en: 'Attention' },
  unknown: { zh: '暂不能判断', en: 'Not assessed' },
};

export function deriveRiskPerspective(savedReport: Report, locale: Locale): RiskPerspective {
  const currencyView = reportCurrencyView(savedReport);
  const report = currencyView.report;
  const metric = (key: string) => report.metrics.find((item) => item.key === key);
  const net = metric('netProfit');
  const cash = metric('operatingCashFlow');
  const conversion = metric('cashConversion');
  const numberOf = (value: string | null | undefined) => {
    if (value == null || !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const conversionNumber = numberOf(conversion?.value);
  const netNumber = numberOf(net?.value);
  const cashNumber = numberOf(cash?.value);
  const snapshot = report.snapshot ?? [];
  const checks = report.checks ?? [];
  const failChecks = checks.filter((item) => item.status === 'fail');
  const warnChecks = checks.filter((item) => item.status === 'warn');
  const passChecks = checks.filter((item) => item.status === 'pass');
  const issuerMatches = (company: string) =>
    company.trim().toLowerCase() === report.company.trim().toLowerCase();
  const financialObservations = snapshot.flatMap((material) =>
    material.observations.filter(
      (observation) =>
        observation.year === report.year &&
        ['netProfit', 'operatingCashFlow'].includes(observation.key)
    )
  );
  const financialScopeConflict =
    snapshot.some((material) => !issuerMatches(material.company)) ||
    financialObservations.some(
      (observation) =>
        observation.scope === 'parent' ||
        (observation.period != null && !['annual', 'unknown'].includes(observation.period))
    );
  const inputConflict =
    report.verdict === 'conflict' || failChecks.length > 0 || financialScopeConflict;
  // Adjustment/bridge and prior-year checks cannot invalidate independently
  // confirmed current-year profit and cash. Unknown failed checks stay blocked.
  const financialInputConflict =
    financialScopeConflict ||
    (savedReport.verdict === 'conflict' &&
      failChecks.length === 0 &&
      !currencyView.bridgeBlocked) ||
    failChecks.some(
      (check) =>
        !['group-sum', 'bridge-balance'].includes(check.id) &&
        !/^\d{4}-(inventoryAdjustment|receivablesAdjustment|payablesAdjustment|otherAdjustments)$/.test(
          check.id
        ) &&
        ![`${report.previousYear}-netProfit`, `${report.previousYear}-operatingCashFlow`].includes(
          check.id
        )
    );
  const unsupportedCurrency = currencyView.currentTotalsBlocked;
  const confirmedFinancialScope =
    snapshot.length > 0 &&
    snapshot.every((material) => issuerMatches(material.company)) &&
    ['netProfit', 'operatingCashFlow'].every((key) =>
      financialObservations.some((observation) => observation.key === key)
    ) &&
    financialObservations.every(
      (observation) =>
        observation.scope === 'consolidated' &&
        observation.period === 'annual' &&
        observation.currency === 'CNY'
    );
  const financialAvailable =
    !financialInputConflict &&
    !unsupportedCurrency &&
    confirmedFinancialScope &&
    netNumber != null &&
    cashNumber != null;
  const ratioAvailable =
    financialAvailable && netNumber! > 0 && conversionNumber != null && conversion?.unit === '%';
  const incomplete =
    report.verdict === 'insufficient' ||
    !financialAvailable ||
    (netNumber! > 0 && !ratioAvailable) ||
    report.coverage.present < report.coverage.total;

  // ---------- 财务维度 ----------
  const financeStatus: RiskStatus =
    inputConflict ||
    !financialAvailable ||
    report.verdict === 'insufficient' ||
    (netNumber! > 0 && !ratioAvailable)
      ? 'unknown'
      : netNumber! <= 0 || conversionNumber! < 100
        ? 'warn'
        : 'good';
  const finance: RiskDimension = {
    key: 'finance',
    label: { zh: '财务', en: 'Finance' },
    plain: { zh: '经营现金与利润是否匹配', en: 'How does operating cash compare with profit?' },
    status: financeStatus,
    summary: financialInputConflict
      ? {
          zh: '材料主体、期间、币种或数值存在待核对项，暂停财务解读',
          en: 'Issuer, period, currency or amount checks need review; financial interpretation is paused',
        }
      : unsupportedCurrency
        ? {
            zh: '本项核查采用人民币年度合并口径；其他币种的历史比例暂不解读',
            en: 'This review uses annual consolidated CNY evidence; historical ratios in other currencies are not interpreted',
          }
        : inputConflict
          ? {
              zh: '部分材料或现金桥待核对；保留独立支持的核心金额与比例，暂停现金桥归因',
              en: 'Some evidence or cash-bridge checks remain; independently supported core amounts and ratios are retained while bridge attribution is paused',
            }
          : !financialAvailable ||
              report.verdict === 'insufficient' ||
              (netNumber! > 0 && !ratioAvailable)
            ? {
                zh: '同年度合并口径或所需材料尚未齐备，已记录金额不代表核查完成',
                en: 'Matching annual consolidated scope or required metrics are incomplete; no assessment is available',
              }
            : netNumber! <= 0
              ? {
                  zh: '合并净利润非正，现金利润比不适用，请直接核对两项金额',
                  en: 'Consolidated profit is nonpositive; review the two amounts directly instead of a cash-to-profit ratio',
                }
              : financeStatus === 'good'
                ? {
                    zh: '经营现金净额不低于合并净利润',
                    en: 'Operating cash is at least consolidated net profit',
                  }
                : financeStatus === 'warn'
                  ? {
                      zh: '经营现金净额低于合并净利润，需要关注',
                      en: 'Operating cash is below consolidated net profit',
                    }
                  : { zh: '财务指标数据不足', en: 'Financial metrics are insufficient' },
    metrics: [
      {
        label: { zh: '合并净利润', en: 'Net profit' },
        value: metricValue(net, locale),
        tone: 'plain',
        refs: net?.sourceRefs ?? [],
      },
      {
        label: { zh: '经营现金净额', en: 'Operating cash flow' },
        value: metricValue(cash, locale),
        tone: 'plain',
        refs: cash?.sourceRefs ?? [],
      },
      {
        label: { zh: '现金利润比', en: 'Cash-to-profit ratio' },
        value: ratioAvailable ? metricValue(conversion, locale) : '—',
        tone: ratioAvailable ? financeStatus : 'unknown',
        refs: conversion?.sourceRefs ?? [],
      },
    ],
  };

  // ---------- 证据来源维度（披露记录可溯源性） ----------
  const official = snapshot.filter((item) => item.origin === 'public-report');
  const withSourceUrl = snapshot.filter((item) => Boolean(item.sourceUrl));
  const withSha = snapshot.filter((item) => Boolean(item.sha256));
  const observationTotal = snapshot.reduce((sum, item) => sum + item.observations.length, 0);
  const observationWithPage = snapshot.reduce(
    (sum, item) => sum + item.observations.filter((obs) => obs.page != null).length,
    0
  );
  const creditStatus: RiskStatus =
    snapshot.length === 0
      ? 'unknown'
      : official.length === snapshot.length &&
          withSourceUrl.length === snapshot.length &&
          withSha.length === snapshot.length &&
          observationTotal > 0 &&
          observationWithPage === observationTotal
        ? 'good'
        : official.length > 0
          ? 'warn'
          : 'unknown';
  const firstOfficial = official[0];
  const credit: RiskDimension = {
    key: 'credit',
    label: { zh: '证据来源', en: 'Evidence sources' },
    plain: { zh: '来源、页码与哈希是否有记录', en: 'Are sources, pages and hashes recorded?' },
    status: creditStatus,
    summary:
      creditStatus === 'good'
        ? {
            zh: '全部材料记录为公开披露，来源链接、页码与文件哈希齐备',
            en: 'All materials are recorded as public disclosures, with source links, pages and file hashes',
          }
        : creditStatus === 'warn'
          ? {
              zh: '部分材料缺少公开披露记录、来源链接、页码或文件哈希',
              en: 'Some materials lack disclosure records, source links, pages or file hashes',
            }
          : creditStatus === 'unknown'
            ? { zh: '尚未核对披露来源', en: 'No disclosure source checked yet' }
            : { zh: '来源无法核实', en: 'Sources cannot be verified' },
    metrics: [
      {
        label: { zh: '公开披露记录', en: 'Public-disclosure records' },
        value: `${official.length}/${snapshot.length}`,
        tone: creditStatus,
        refs: [],
        link:
          firstOfficial?.sourceUrl != null
            ? {
                url: firstOfficial.sourceUrl,
                label: { zh: '打开年报原文', en: 'Open annual report' },
              }
            : undefined,
      },
      {
        label: { zh: '页码覆盖', en: 'Page coverage' },
        value: observationTotal > 0 ? `${observationWithPage}/${observationTotal}` : '—',
        tone:
          observationTotal === 0
            ? 'unknown'
            : observationWithPage === observationTotal
              ? 'good'
              : 'warn',
        refs: [],
      },
      {
        label: { zh: '文件哈希记录', en: 'File hash records' },
        value:
          snapshot.length === 0
            ? '—'
            : withSha.length === snapshot.length
              ? locale === 'en'
                ? 'Complete'
                : '完整'
              : locale === 'en'
                ? 'Partial'
                : '部分',
        tone:
          snapshot.length === 0 ? 'unknown' : withSha.length === snapshot.length ? 'good' : 'warn',
        refs: [],
      },
    ],
  };

  // ---------- 本份原件报告未纳入媒体与讨论快照 ----------
  const reputation: RiskDimension = {
    key: 'reputation',
    label: { zh: '口碑', en: 'Reputation' },
    plain: { zh: '本报告是否纳入公开报道', en: 'Does this report include public coverage?' },
    status: 'unknown',
    summary: {
      zh: '本份原件报告未纳入媒体与讨论快照；可在企业研究中查看已有来源和分析',
      en: 'This original-report review has no media or discussion snapshot; existing sources and analysis are available in company research',
    },
    metrics: [
      {
        label: { zh: '媒体报道', en: 'Media coverage' },
        value: locale === 'en' ? 'Not included' : '未纳入',
        tone: 'unknown',
        refs: [],
      },
    ],
  };

  // ---------- 核查事项 ----------
  const findings = report.findings ?? [];
  const attentionFindings = findings.filter((item) => item.severity === 'attention');
  const openQuestions = (report.questions ?? []).filter((item) => item.status === 'open');
  const riskStatus: RiskStatus =
    inputConflict || incomplete || checks.length === 0 || !report.bridge
      ? 'unknown'
      : warnChecks.length > 0 ||
          attentionFindings.length > 0 ||
          openQuestions.length > 0 ||
          report.verdict === 'attention'
        ? 'warn'
        : 'good';
  const risk: RiskDimension = {
    key: 'risk',
    label: { zh: '核查事项', en: 'Review matters' },
    plain: { zh: '材料与计算是否完成核对', en: 'Are evidence and calculations checked?' },
    status: riskStatus,
    summary: inputConflict
      ? {
          zh: '材料或计算口径待核对，现金桥归因暂停；这不证明企业存在负面事件',
          en: 'Evidence or calculation scope needs review and bridge attribution is paused; this does not establish an adverse company event',
        }
      : riskStatus === 'good'
        ? { zh: '现金桥核对通过，未发现冲突', en: 'Cash bridge reconciled with no conflicts' }
        : riskStatus === 'unknown'
          ? {
              zh: '材料或核查记录尚未齐备，保留已记录金额，暂停没有依据的解读',
              en: 'Evidence or review records are incomplete; recorded amounts are retained and unsupported interpretation is paused',
            }
          : { zh: '存在待核实的信号', en: 'Signals need further verification' },
    metrics: [
      {
        label: { zh: '检查项', en: 'Checks' },
        value:
          checks.length === 0
            ? '—'
            : `${passChecks.length}/${checks.length} ${locale === 'en' ? 'checked' : '已核对'}`,
        tone:
          checks.length === 0 || incomplete || inputConflict
            ? 'unknown'
            : warnChecks.length > 0
              ? 'warn'
              : 'good',
        refs: [],
      },
      {
        label: { zh: '证据冲突', en: 'Conflicts' },
        value:
          failChecks.length > 0
            ? `${failChecks.length} ${locale === 'en' ? 'checks' : '处'}`
            : inputConflict
              ? locale === 'en'
                ? 'Needs review'
                : '待核对'
              : checks.length === 0
                ? '—'
                : `0 ${locale === 'en' ? 'checks' : '处'}`,
        tone: inputConflict ? 'warn' : checks.length === 0 || incomplete ? 'unknown' : 'good',
        refs: failChecks.flatMap((item) => item.sourceRefs),
      },
      {
        label: { zh: '未决问题', en: 'Open questions' },
        value: `${openQuestions.length} ${locale === 'en' ? 'items' : '项'}`,
        tone:
          openQuestions.length > 0
            ? 'warn'
            : incomplete || checks.length === 0
              ? 'unknown'
              : 'good',
        refs: openQuestions.flatMap((item) =>
          item.trigger?.sourceRefs ? item.trigger.sourceRefs : []
        ),
      },
    ],
  };

  // ---------- 总览结论 ----------
  const dimensions: RiskDimension[] = [finance, credit, reputation, risk];
  const overallStatus: RiskStatus =
    inputConflict || incomplete
      ? 'unknown'
      : financeStatus === 'warn' || riskStatus === 'warn' || creditStatus === 'warn'
        ? 'warn'
        : riskStatus === 'good'
          ? 'good'
          : 'unknown';
  const overall: RiskPerspective['overall'] = {
    status: overallStatus,
    title: unsupportedCurrency
      ? { zh: '币种口径待核对', en: 'Currency scope needs review' }
      : inputConflict
        ? { zh: '材料口径待核对', en: 'Evidence scope needs review' }
        : incomplete
          ? { zh: '材料待补充', en: 'More evidence is needed' }
          : overallStatus === 'warn'
            ? { zh: '有待核查事项', en: 'Review matters remain' }
            : overallStatus === 'unknown'
              ? { zh: '部分事项暂不能判断', en: 'Some matters cannot be assessed yet' }
              : { zh: '已完成所列财务核查', en: 'Listed financial checks completed' },
    subtitle: inputConflict
      ? {
          zh: '先核对材料主体、年度、合并范围、币种与数值；输入冲突不等于企业风险',
          en: 'Check issuer, annual period, consolidation, currency and amounts first; input conflicts are not company risk',
        }
      : unsupportedCurrency
        ? {
            zh: '历史金额与来源保持原样，本项人民币核查暂不采用其他币种的比例或归因',
            en: 'Historical amounts and sources remain unchanged; this CNY review withholds ratios and attribution in other currencies',
          }
        : overallStatus === 'warn'
          ? {
              zh: '结合原文与所需材料继续核对，不从历史信号直接判断本次安排可靠性',
              en: 'Review the originals and required records; historical signals do not establish the reliability of a current arrangement',
            }
          : overallStatus === 'unknown'
            ? {
                zh: '缺少或未确认的材料不作通过处理，公开报道不在本份原件报告范围内',
                en: 'Missing or unconfirmed evidence is not a passed check; public coverage is outside this original-report review',
              }
            : {
                zh: '仅说明本报告所列金额与现金桥核对完成，公开报道仍需另看企业研究',
                en: 'Only the listed amounts and cash bridge have been checked; public coverage remains part of company research',
              },
    scope: {
      zh: `${report.company} · ${report.year} 年报 · 覆盖率 ${report.coverage.present}/${report.coverage.total}`,
      en: `${report.company} · FY${report.year} · coverage ${report.coverage.present}/${report.coverage.total}`,
    },
  };

  return { overall, dimensions };
}
