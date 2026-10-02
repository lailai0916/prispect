import type { EvidenceRef, Report } from '../shared/contracts';
import { metricValue, money, type Locale } from './format';

/**
 * 四维风险透视 —— 数据映射。
 * 全部状态由报告真实计算结果推导，不引入任何推断值或虚构数据。
 *
 * - 财务：净利润 / 经营现金 / 现金利润比（来自引擎计算）
 * - 信用：披露可溯源性（官方来源、页码覆盖、SHA256 校验）
 * - 口碑：媒体报道与舆论（数据源未接入时如实显示"待接入"）
 * - 风险：现金桥结论、证据冲突、未决问题、检查项（来自引擎核对）
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
  good: { zh: '通过', en: 'Clear' },
  warn: { zh: '关注', en: 'Watch' },
  bad: { zh: '风险', en: 'Risk' },
  unknown: { zh: '待接入', en: 'Pending' },
};

const statusRank: Record<RiskStatus, number> = { bad: 4, warn: 3, unknown: 2, good: 1 };

export function deriveRiskPerspective(report: Report, locale: Locale): RiskPerspective {
  const metric = (key: string) => report.metrics.find((item) => item.key === key);
  const net = metric('netProfit');
  const cash = metric('operatingCashFlow');
  const conversion = metric('cashConversion');
  const conversionNumber = conversion?.value != null ? Number(conversion.value) : null;

  // ---------- 财务维度 ----------
  const netNumber = net?.value != null ? Number(net.value) : null;
  const financeStatus: RiskStatus =
    netNumber != null && netNumber < 0
      ? 'bad'
      : conversionNumber == null
        ? 'unknown'
        : conversionNumber >= 100
          ? 'good'
          : conversionNumber >= 70
            ? 'warn'
            : 'bad';
  const finance: RiskDimension = {
    key: 'finance',
    label: { zh: '财务', en: 'Finance' },
    plain: { zh: '赚的钱真的收到了吗', en: 'Did the profit turn into cash?' },
    status: financeStatus,
    summary:
      netNumber != null && netNumber < 0
        ? { zh: '公司净利润为负，处于亏损状态', en: 'The company reported a net loss' }
        : financeStatus === 'good'
          ? { zh: '收到的现金不低于赚到的钱', en: 'Cash received is at least the reported profit' }
          : financeStatus === 'warn'
            ? { zh: '现金回款低于利润，需要关注', en: 'Cash conversion is below profit' }
            : financeStatus === 'bad'
              ? { zh: '现金回款明显不足', en: 'Cash conversion is significantly weak' }
              : { zh: '财务指标数据不足', en: 'Financial metrics are insufficient' },
    metrics: [
      {
        label: { zh: '合并净利润', en: 'Net profit' },
        value: money(net?.value ?? null, locale),
        tone: 'plain',
        refs: net?.sourceRefs ?? [],
      },
      {
        label: { zh: '经营现金净额', en: 'Operating cash flow' },
        value: money(cash?.value ?? null, locale),
        tone:
          cash?.value != null && Number(cash.value) < 0
            ? 'bad'
            : financeStatus === 'good'
              ? 'good'
              : 'warn',
        refs: cash?.sourceRefs ?? [],
      },
      {
        label: { zh: '现金利润比', en: 'Cash-to-profit ratio' },
        value: metricValue(conversion, locale),
        tone: financeStatus,
        refs: conversion?.sourceRefs ?? [],
      },
    ],
  };

  // ---------- 信用维度（披露可溯源性） ----------
  const snapshot = report.snapshot ?? [];
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
    label: { zh: '信用', en: 'Credibility' },
    plain: { zh: '信息来源可靠吗', en: 'Is the source reliable?' },
    status: creditStatus,
    summary:
      creditStatus === 'good'
        ? {
            zh: '全部材料来自官方披露，页码与校验完整',
            en: 'All materials are official with pages and hashes',
          }
        : creditStatus === 'warn'
          ? {
              zh: '部分材料缺少官方来源或页码，需留意',
              en: 'Some materials lack official sources or pages',
            }
          : creditStatus === 'unknown'
            ? { zh: '尚未核对披露来源', en: 'No disclosure source checked yet' }
            : { zh: '来源无法核实', en: 'Sources cannot be verified' },
    metrics: [
      {
        label: { zh: '官方来源材料', en: 'Official-source materials' },
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
        tone: observationTotal > 0 && observationWithPage === observationTotal ? 'good' : 'warn',
        refs: [],
      },
      {
        label: { zh: 'SHA256 校验', en: 'SHA256 verified' },
        value: withSha.length === snapshot.length && snapshot.length > 0 ? '完整' : '部分',
        tone: withSha.length === snapshot.length && snapshot.length > 0 ? 'good' : 'warn',
        refs: [],
      },
    ],
  };

  // ---------- 口碑维度（暂未接入，如实显示） ----------
  const reputation: RiskDimension = {
    key: 'reputation',
    label: { zh: '口碑', en: 'Reputation' },
    plain: { zh: '大家怎么说', en: 'What does the market say?' },
    status: 'unknown',
    summary: {
      zh: '媒体报道与舆论数据源尚未接入，本维度暂不判断',
      en: 'News and sentiment sources are not connected yet; this dimension is not judged',
    },
    metrics: [
      {
        label: { zh: '媒体报道', en: 'Media coverage' },
        value: '待接入',
        tone: 'unknown',
        refs: [],
      },
    ],
  };

  // ---------- 风险维度 ----------
  const checks = report.checks ?? [];
  const failChecks = checks.filter((item) => item.status === 'fail');
  const warnChecks = checks.filter((item) => item.status === 'warn');
  const passChecks = checks.filter((item) => item.status === 'pass');
  const findings = report.findings ?? [];
  const attentionFindings = findings.filter((item) => item.severity === 'attention');
  const openQuestions = (report.questions ?? []).filter((item) => item.status === 'open');
  const riskStatus: RiskStatus =
    failChecks.length > 0 || report.verdict === 'conflict'
      ? 'bad'
      : warnChecks.length > 0 ||
          attentionFindings.length > 0 ||
          openQuestions.length > 0 ||
          report.verdict === 'attention' ||
          report.verdict === 'insufficient'
        ? 'warn'
        : 'good';
  const risk: RiskDimension = {
    key: 'risk',
    label: { zh: '风险', en: 'Risk' },
    plain: { zh: '有没有可疑信号', en: 'Any suspicious signals?' },
    status: riskStatus,
    summary:
      riskStatus === 'good'
        ? { zh: '现金桥核对通过，未发现冲突', en: 'Cash bridge reconciled with no conflicts' }
        : riskStatus === 'bad'
          ? {
              zh: '发现证据冲突，现金桥已暂停',
              en: 'Evidence conflicts; bridge attribution stopped',
            }
          : { zh: '存在待核实的信号', en: 'Signals need further verification' },
    metrics: [
      {
        label: { zh: '检查项', en: 'Checks' },
        value: `${passChecks.length}/${checks.length} 通过`,
        tone: failChecks.length > 0 ? 'bad' : warnChecks.length > 0 ? 'warn' : 'good',
        refs: [],
      },
      {
        label: { zh: '证据冲突', en: 'Conflicts' },
        value: `${failChecks.length + (report.verdict === 'conflict' ? 1 : 0)} 处`,
        tone: failChecks.length > 0 || report.verdict === 'conflict' ? 'bad' : 'good',
        refs: failChecks.flatMap((item) => item.sourceRefs),
      },
      {
        label: { zh: '未决问题', en: 'Open questions' },
        value: `${openQuestions.length} 项`,
        tone: openQuestions.length > 0 ? 'warn' : 'good',
        refs: openQuestions.flatMap((item) =>
          item.trigger?.sourceRefs ? item.trigger.sourceRefs : []
        ),
      },
    ],
  };

  // ---------- 总览结论 ----------
  const dimensions: RiskDimension[] = [finance, credit, reputation, risk];
  const worst = dimensions.reduce<RiskDimension>(
    (current, item) => (statusRank[item.status] > statusRank[current.status] ? item : current),
    dimensions[0]
  );
  const overallStatus = worst.status;
  const overall: RiskPerspective['overall'] = {
    status: overallStatus,
    title:
      overallStatus === 'bad'
        ? { zh: '发现风险信号', en: 'Risk signals found' }
        : overallStatus === 'warn'
          ? { zh: '需要关注', en: 'Needs attention' }
          : overallStatus === 'unknown'
            ? { zh: '待补充', en: 'Incomplete' }
            : { zh: '低风险', en: 'Low risk' },
    subtitle:
      overallStatus === 'bad'
        ? {
            zh: '部分维度查出风险信号，请查看对应维度',
            en: 'Some dimensions show risk; check the details',
          }
        : overallStatus === 'warn'
          ? { zh: '部分维度需要进一步核实', en: 'Some dimensions need further review' }
          : overallStatus === 'unknown'
            ? { zh: '部分维度数据尚未接入', en: 'Some dimensions are not connected yet' }
            : { zh: '四维核验未发现明显风险', en: 'No obvious risk found across dimensions' },
    scope: {
      zh: `${report.company} · ${report.year} 年报 · 覆盖率 ${report.coverage.present}/${report.coverage.total}`,
      en: `${report.company} · FY${report.year} · coverage ${report.coverage.present}/${report.coverage.total}`,
    },
  };

  return { overall, dimensions };
}
