import type { ComputedMetric, EvidenceRef, MetricKey, Report } from './contracts.js';

const amountKeys: readonly MetricKey[] = [
  'netProfit',
  'operatingCashFlow',
  'inventoryAdjustment',
  'receivablesAdjustment',
  'payablesAdjustment',
  'otherAdjustments',
];
const totalKeys: readonly MetricKey[] = ['netProfit', 'operatingCashFlow'];

export interface ReportCurrencyIssue {
  key: MetricKey;
  year: number;
  value: string;
  unit: string;
  currency: string;
  sourceRefs: EvidenceRef[];
}

/** Only a display projection: saved inputs, model execution and JSON remain unchanged. */
export function reportCurrencyView(original: Report) {
  const issues: ReportCurrencyIssue[] = [];
  const affected = new Set<string>();
  const token = (year: number, key: string) => `${year}-${key}`;
  for (const material of original.snapshot) {
    for (const observation of material.observations) {
      if (
        ![original.year, original.previousYear].includes(observation.year) ||
        (observation.currency === 'CNY' && observation.unit !== 'usd')
      )
        continue;
      affected.add(token(observation.year, observation.key));
      issues.push({
        key: observation.key,
        year: observation.year,
        value: observation.value,
        unit: observation.unit,
        currency: observation.currency,
        sourceRefs: [
          {
            materialId: material.id,
            page: observation.page,
            quote: observation.quote,
            ...(material.sourceUrl ? { sourceUrl: material.sourceUrl } : {}),
          },
        ],
      });
    }
  }
  // Some historical records have metric currency but no original observation.
  for (const metric of original.metrics) {
    if (metric.unit !== 'USD' || !amountKeys.includes(metric.key as MetricKey)) continue;
    for (const [year, value] of [
      [original.year, metric.value],
      [original.previousYear, metric.previousValue],
    ] as const) {
      if (value === null || affected.has(token(year, metric.key))) continue;
      affected.add(token(year, metric.key));
      issues.push({
        key: metric.key as MetricKey,
        year,
        value,
        unit: 'USD',
        currency: 'USD',
        sourceRefs: metric.sourceRefs,
      });
    }
  }
  const isAffected = (year: number, key: string) => affected.has(token(year, key));
  const currentTotalsBlocked = totalKeys.some((key) => isAffected(original.year, key));
  const previousTotalsBlocked = totalKeys.some((key) => isAffected(original.previousYear, key));
  const bridgeBlocked = amountKeys.some((key) => isAffected(original.year, key));
  if (!issues.length)
    return {
      report: original,
      issues,
      currentTotalsBlocked,
      previousTotalsBlocked,
      bridgeBlocked,
      interpretationWithheld: false,
    };

  const warning = '币种或金额单位待核对；相关历史计算暂停展示，原记录与来源保留。';
  const metrics = original.metrics.map((metric): ComputedMetric => {
    let value = metric.value;
    let previousValue = metric.previousValue;
    if (amountKeys.includes(metric.key as MetricKey)) {
      if (isAffected(original.year, metric.key)) value = null;
      if (isAffected(original.previousYear, metric.key)) previousValue = null;
    } else if (metric.key === 'cashConversion') {
      if (currentTotalsBlocked) value = null;
      if (previousTotalsBlocked) previousValue = null;
    } else {
      const dependency = ['profitGrowth', 'profitChange'].includes(metric.key)
        ? 'netProfit'
        : 'operatingCashFlow';
      if (
        isAffected(original.year, dependency) ||
        isAffected(original.previousYear, dependency) ||
        metric.unit === 'USD'
      )
        value = previousValue = null;
    }
    return { ...metric, value, previousValue };
  });
  const findings = original.findings.filter((finding) => {
    if (finding.basis === 'source') return true;
    if (finding.id === 'cash-gap') return !currentTotalsBlocked;
    if (['receivables', 'inventory', 'management'].includes(finding.id)) return !bridgeBlocked;
    return !bridgeBlocked && !previousTotalsBlocked;
  });
  const crossSignalChecks = original.crossSignalChecks?.map((check) => {
    const blocked =
      bridgeBlocked || check.requirements.some((item) => isAffected(item.year, item.metric));
    if (!blocked) return check;
    return {
      ...check,
      status: 'blocked' as const,
      requirements: check.requirements.map((item) =>
        isAffected(item.year, item.metric)
          ? { ...item, state: 'invalid' as const, amount: null }
          : item
      ),
      conditions: check.conditions.map((item) => ({ ...item, status: 'unknown' as const })),
      blockers: [
        ...check.blockers.filter((blocker) => blocker.code !== 'display-currency'),
        {
          code: 'display-currency',
          message: {
            zh: warning,
            en: 'Currency or amount units need review. Dependent historical calculations are withheld; original records and sources remain.',
          },
          sourceRefs: issues.flatMap((issue) => issue.sourceRefs),
        },
      ],
    };
  });
  const checks = original.checks.map((check) =>
    check.status === 'pass' &&
    (affected.has(check.id) ||
      (bridgeBlocked && ['bridge-balance', 'group-sum'].includes(check.id)))
      ? { ...check, status: 'warn' as const, message: warning }
      : check
  );
  const removedAmounts = original.metrics.filter(
    (metric) =>
      amountKeys.includes(metric.key as MetricKey) &&
      metric.value !== null &&
      isAffected(original.year, metric.key)
  ).length;
  const report: Report = {
    ...original,
    verdict: bridgeBlocked ? 'conflict' : original.verdict,
    headline: warning,
    summary: warning,
    metrics,
    bridge: bridgeBlocked ? null : original.bridge,
    checks,
    findings,
    crossSignals: original.crossSignals?.filter(
      (signal) => !bridgeBlocked && !signal.facts.some((fact) => isAffected(fact.year, fact.metric))
    ),
    crossSignalChecks,
    questions: original.questions.map((question) =>
      question.trigger &&
      (isAffected(question.trigger.year, question.trigger.metric) || bridgeBlocked)
        ? { ...question, trigger: undefined }
        : question
    ),
    coverage: {
      ...original.coverage,
      present: Math.max(0, original.coverage.present - removedAmounts),
    },
  };
  return {
    report,
    issues,
    currentTotalsBlocked,
    previousTotalsBlocked,
    bridgeBlocked,
    interpretationWithheld: Boolean(original.model.text?.trim()),
  };
}
