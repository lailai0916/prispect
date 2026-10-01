import type {
  BridgeStep,
  Check,
  ComputedMetric,
  CreateTaskInput,
  EvidenceRef,
  Finding,
  Material,
  MetricKey,
  Observation,
  Question,
  Report,
} from '../shared/contracts.js';
import { fenToYuan, metricKeys, moneyToFen, percent } from './validation.js';

export const metricLabels: Record<MetricKey, string> = {
  netProfit: '合并净利润',
  operatingCashFlow: '经营现金净额',
  inventoryAdjustment: '存货调整',
  receivablesAdjustment: '经营性应收调整',
  payablesAdjustment: '经营性应付调整',
  otherAdjustments: '其余已披露调整',
};
type Located = { observation: Observation; material: Material };
function evidence(items: Located[]): EvidenceRef[] {
  return items.flatMap(({ observation, material }) => {
    const ref = {
      materialId: material.id,
      page: observation.page,
      quote: observation.quote,
      ...(material.sourceUrl ? { sourceUrl: material.sourceUrl } : {}),
    };
    return observation.key === 'otherAdjustments' && observation.components?.length
      ? [
          ref,
          ...observation.components.map((component) => ({
            materialId: material.id,
            page: component.page,
            quote: component.quote,
            ...(material.sourceUrl ? { sourceUrl: material.sourceUrl } : {}),
          })),
        ]
      : [ref];
  });
}

export function analyze(input: CreateTaskInput, materials: Material[]): Report {
  const excluded = new Set(input.excludedMetrics || []);
  const snapshot = structuredClone(materials);
  const checks: Check[] = [];
  const findings: Finding[] = [];
  const questions: Question[] = [];
  const selected = materials.flatMap((material) =>
    material.observations
      .filter((observation) => !excluded.has(observation.key))
      .map((observation) => ({ observation, material }))
  );
  const subjectMismatch = materials.some((material) => material.company !== input.company);
  checks.push({
    id: 'subject',
    label: '主体一致性',
    status: subjectMismatch ? 'fail' : 'pass',
    message: subjectMismatch
      ? '材料主体与核查公司不一致，停止合并计算。'
      : '采用材料的主体字段一致。',
    sourceRefs: [],
  });
  let conflict = subjectMismatch;
  let insufficient = false;
  const resolved = new Map<
    string,
    { fen: bigint; refs: EvidenceRef[]; observation: Observation }
  >();
  for (const year of [input.year, input.year - 1]) {
    for (const key of metricKeys) {
      const values = selected.filter(
        (item) => item.observation.year === year && item.observation.key === key
      );
      const refs = evidence(values);
      if (!values.length) {
        checks.push({
          id: `${year}-${key}`,
          label: `${year} ${metricLabels[key]}`,
          status: 'warn',
          message: excluded.has(key)
            ? '本次压力测试主动移除了该指标；不从剩余原文补回。'
            : '本次提供的材料没有此项指标，不填零。',
          sourceRefs: [],
        });
        if (year === input.year) insufficient = true;
        continue;
      }
      const badScope = values.some(({ observation }) => observation.scope === 'parent');
      const unknownScope = values.some(({ observation }) => observation.scope === 'unknown');
      const badPeriod = values.some(
        ({ observation }) =>
          observation.period && !['annual', 'unknown'].includes(observation.period)
      );
      const unknownPeriod = values.some(
        ({ observation }) => !observation.period || observation.period === 'unknown'
      );
      const badCurrency = values.some(({ observation }) => observation.currency !== 'CNY');
      const amounts = values.map(({ observation }) =>
        moneyToFen(observation.value, observation.unit)
      );
      const different = new Set(amounts.map(String)).size > 1;
      if (subjectMismatch || badScope || badCurrency || different || badPeriod) {
        conflict = true;
        checks.push({
          id: `${year}-${key}`,
          label: `${year} ${metricLabels[key]}`,
          status: 'fail',
          message: badPeriod
            ? '非年度期间不能与年度材料混用，请提供同年度合并数据。'
            : badScope
              ? '母公司与合并口径不能混用，请补交合并口径材料。'
              : badCurrency
                ? '币种不是人民币；本次不进行汇率转换或混币种计算。'
                : different
                  ? '同一指标存在不同数值，保留双方来源并停止采用，不静默覆盖。'
                  : '主体不一致，不能跨公司计算。',
          sourceRefs: refs,
        });
        continue;
      }
      if (unknownScope || unknownPeriod) {
        insufficient = true;
        checks.push({
          id: `${year}-${key}`,
          label: `${year} ${metricLabels[key]}`,
          status: 'warn',
          message: unknownPeriod
            ? '年度期间未确认；同一个年份不能证明期间相同。'
            : '合并范围未确认；归母净利润不能自动认定为合并净利润。',
          sourceRefs: refs,
        });
        continue;
      }
      const item = values[0]!.observation;
      resolved.set(`${year}-${key}`, { fen: amounts[0]!, refs, observation: item });
      checks.push({
        id: `${year}-${key}`,
        label: `${year} ${metricLabels[key]}`,
        status: 'pass',
        message: '输入声明的主体、年度期间、人民币单位及合并范围一致；这不等于原件真实性已核验。',
        sourceRefs: refs,
      });
    }
  }
  const get = (year: number, key: MetricKey) => resolved.get(`${year}-${key}`);
  const metricAmount = (year: number, key: MetricKey): string | null => {
    const item = get(year, key);
    if (!item) return null;
    if (key === 'otherAdjustments') {
      const components = item.observation.components;
      if (
        !components?.length ||
        components.reduce((sum, row) => sum + moneyToFen(row.value, item.observation.unit), 0n) !==
          item.fen
      )
        return null;
    }
    return fenToYuan(item.fen);
  };
  const metric = (key: MetricKey): ComputedMetric => ({
    key,
    label: metricLabels[key],
    value: metricAmount(input.year, key),
    previousValue: metricAmount(input.year - 1, key),
    unit: 'CNY',
    kind: key === 'otherAdjustments' ? 'calculated' : 'reported',
    formula:
      key === 'otherAdjustments'
        ? '原表其余已披露调整逐行分组求和，另与差额核对'
        : '原表金额 × 单位换算系数；人民币元',
    sourceRefs: [...(get(input.year, key)?.refs || []), ...(get(input.year - 1, key)?.refs || [])],
  });
  const metrics = metricKeys.map(metric);
  const profit = get(input.year, 'netProfit'),
    cash = get(input.year, 'operatingCashFlow');
  const previousProfit = get(input.year - 1, 'netProfit'),
    previousCash = get(input.year - 1, 'operatingCashFlow');
  metrics.push({
    key: 'cashConversion',
    label: '现金利润比',
    value: profit && cash ? percent(cash.fen, profit.fen) : null,
    previousValue:
      previousProfit && previousCash ? percent(previousCash.fen, previousProfit.fen) : null,
    unit: '%',
    kind: 'calculated',
    formula: '经营现金净额 ÷ 合并净利润 × 100%；利润必须为正',
    sourceRefs: [...(profit?.refs || []), ...(cash?.refs || [])],
  });
  for (const [key, label, current, previous] of [
    ['profitGrowth', '净利润同比', profit, previousProfit],
    ['cashGrowth', '经营现金同比', cash, previousCash],
  ] as const) {
    metrics.push({
      key,
      label,
      value: current && previous ? percent(current.fen - previous.fen, previous.fen) : null,
      previousValue: null,
      unit: '%',
      kind: 'calculated',
      formula: '（本年 − 上年）÷ 上年 × 100%；上年基数必须为正',
      sourceRefs: [...(current?.refs || []), ...(previous?.refs || [])],
    });
  }
  if (profit && profit.fen <= 0n)
    checks.push({
      id: 'positive-profit',
      label: '比例适用性',
      status: 'warn',
      message: '净利润为零或负值，不产生通常现金转化比例；请直接查看现金与利润金额。',
      sourceRefs: profit.refs,
    });
  if ([previousProfit, previousCash].some((value) => value && value.fen <= 0n))
    checks.push({
      id: 'growth-base',
      label: '同比基数',
      status: 'warn',
      message: '上年基数为零或负值，不输出常规同比百分比；直接比较两年金额。',
      sourceRefs: [...(previousProfit?.refs || []), ...(previousCash?.refs || [])],
    });
  let bridge: BridgeStep[] | null = null;
  const bridgeKeys = [
    'netProfit',
    'inventoryAdjustment',
    'receivablesAdjustment',
    'payablesAdjustment',
    'otherAdjustments',
  ] as const;
  const full = bridgeKeys.every((key) => get(input.year, key)) && cash;
  let groupedVerified = false;
  if (full) {
    const group = get(input.year, 'otherAdjustments')!;
    const components = group.observation.components;
    groupedVerified =
      !!components?.length &&
      components.reduce((sum, part) => sum + moneyToFen(part.value, group.observation.unit), 0n) ===
        group.fen;
    const total = bridgeKeys.reduce((sum, key) => sum + get(input.year, key)!.fen, 0n);
    const closed = total === cash.fen;
    checks.push({
      id: 'group-sum',
      label: '其余调整逐行核对',
      status: groupedVerified ? 'pass' : components?.length ? 'fail' : 'warn',
      message: groupedVerified
        ? '原始其余调整行求和与分组金额一致；分组不是原表“其他”单行。'
        : components?.length
          ? '原始调整行之和与分组金额不一致，停止现金桥解释。'
          : '未提供其余分组的原始调整行，差额不能当作已有来源的解释。',
      sourceRefs: group.refs,
    });
    checks.push({
      id: 'bridge-balance',
      label: '现金桥闭合',
      status: closed ? 'pass' : 'fail',
      message: closed
        ? '净利润与全部调整之和精确等于经营现金净额，按人民币分核对。'
        : `利润与调整合计 ${fenToYuan(total)} 元，经营现金 ${fenToYuan(cash.fen)} 元；差额（经营现金−合计）${fenToYuan(cash.fen - total)} 元。停止现金桥解释并请求复核，不以残差补数。`,
      sourceRefs: [...bridgeKeys.flatMap((key) => get(input.year, key)!.refs), ...cash.refs],
    });
    if (!groupedVerified || !closed) {
      insufficient = true;
      if (!closed || (components?.length && !groupedVerified)) conflict = true;
    }
    if (closed && groupedVerified && !conflict)
      bridge = [
        ...bridgeKeys.map((key) => ({
          key,
          label: metricLabels[key],
          value: fenToYuan(get(input.year, key)!.fen),
          kind: key === 'netProfit' ? ('total' as const) : ('adjustment' as const),
          sourceRefs: get(input.year, key)!.refs,
          derived: key === 'otherAdjustments',
        })),
        {
          key: 'operatingCashFlow',
          label: metricLabels.operatingCashFlow,
          value: fenToYuan(cash.fen),
          kind: 'total',
          sourceRefs: cash.refs,
          derived: false,
        },
      ];
  } else {
    insufficient = true;
    checks.push({
      id: 'bridge-balance',
      label: '现金桥闭合',
      status: 'warn',
      message: '提供材料不足，无法重建现金桥；不会从样本库或隐藏材料补数。',
      sourceRefs: [],
    });
  }
  const addQuestion = (id: string, text: string, reason: string, requestedEvidence: string) => {
    questions.push({ id, text, reason, requestedEvidence, status: 'open' });
    return id;
  };
  if (insufficient || conflict) {
    addQuestion(
      'supplement',
      '请提供同主体、同期间、同币种的合并现金流量补充资料。',
      '当前口径或材料完整性不满足可重算核查。',
      '完整合并补充表、表头单位与年度列；其余分组的全部原始调整行。'
    );
    findings.push({
      id: 'evidence-gap',
      label: conflict ? '先修复证据冲突' : '证据不足，暂停归因',
      severity: 'insufficient',
      explanation: conflict
        ? '输入口径、数值或现金桥核对存在冲突。保留可单独采用的金额与原始来源，暂停依赖冲突证据的解释；差额不直接证明经营风险。'
        : '保留已采用金额；现有材料不能解释现金差额的经营原因。',
      basis: 'source',
      sourceRefs: [],
      questionIds: ['supplement'],
    });
  }
  if (profit && cash) {
    const ratio = percent(cash.fen, profit.fen);
    const lowCash = profit.fen > 0n && cash.fen < profit.fen;
    findings.push({
      id: 'cash-gap',
      label: lowCash ? '利润尚未等额体现为经营现金' : '本期现金与利润的金额关系',
      severity: lowCash ? 'attention' : 'neutral',
      explanation: ratio
        ? `本期经营现金为净利润的 ${ratio}%；这是历史金额配比，不是信用等级或违约概率。`
        : '利润非正，通常现金转化比例不适用。',
      basis: 'calculation',
      sourceRefs: [...profit.refs, ...cash.refs],
      questionIds: [],
    });
  }
  if (bridge) {
    const receivables = get(input.year, 'receivablesAdjustment')!,
      inventory = get(input.year, 'inventoryAdjustment')!;
    if (receivables.fen < 0n) {
      addQuestion(
        'collections',
        '经营性应收占款对应哪些客户与结算方式？',
        '应收现金桥调整不等于单一应收账款余额变动，也不能直接证明坏账。',
        '客户账龄、票据结算明细、期后回款和逾期款项核对表。'
      );
      questions[questions.length - 1]!.trigger = {
        year: input.year,
        metric: 'receivablesAdjustment',
        amount: fenToYuan(receivables.fen),
        sourceRefs: receivables.refs,
      };
      findings.push({
        id: 'receivables',
        label: '应收项目形成现金占用',
        severity: 'attention',
        explanation:
          '负向调整同时符合业务扩张或结算结构变化，以及回款压力两种可能。公开年报不足以裁定因果，需核查期后回款。',
        basis: 'calculation',
        sourceRefs: receivables.refs,
        questionIds: ['collections'],
      });
    } else
      findings.push({
        id: 'receivables',
        label: receivables.fen === 0n ? '经营性应收调整为零' : '应收项目释放经营现金',
        severity: 'neutral',
        explanation:
          receivables.fen === 0n
            ? '本期经营性应收现金桥调整合计为零。'
            : '正向调整表示本期经营性应收项目的合计现金影响，不代表所有客户均已回款，也不是企业安全结论。',
        basis: 'calculation',
        sourceRefs: receivables.refs,
        questionIds: [],
      });
    if (inventory.fen < 0n) {
      addQuestion(
        'inventory',
        '备货增加能由哪些订单和去化记录支持？',
        '存货负向调整可能来自扩张备货，也可能涉及去化压力；不能直接推断滞销。',
        '订单覆盖、库龄、期后出库与减值测试依据。'
      );
      questions[questions.length - 1]!.trigger = {
        year: input.year,
        metric: 'inventoryAdjustment',
        amount: fenToYuan(inventory.fen),
        sourceRefs: inventory.refs,
      };
      findings.push({
        id: 'inventory',
        label: '存货形成现金占用',
        severity: 'attention',
        explanation: '本期存货调整为负。保留扩张备货与去化压力两种解释，材料尚未证明其中一种。',
        basis: 'calculation',
        sourceRefs: inventory.refs,
        questionIds: ['inventory'],
      });
    }
    const management = materials.find((material) => material.managementExplanation);
    if (management)
      findings.push({
        id: 'management',
        label: '管理层解释待独立验证',
        severity: 'neutral',
        explanation: management.managementExplanation!,
        basis: 'management',
        sourceRefs: [
          {
            materialId: management.id,
            page:
              management.excerpts.find((excerpt) => excerpt.text.includes('管理层说明'))?.page ||
              null,
            quote: management.managementExplanation!,
            ...(management.sourceUrl ? { sourceUrl: management.sourceUrl } : {}),
          },
        ],
        questionIds: ['collections'],
      });
  }
  const verdict = conflict
    ? 'conflict'
    : insufficient
      ? 'insufficient'
      : profit && profit.fen > 0n && cash && cash.fen < profit.fen
        ? 'attention'
        : 'supported';
  const growingProfit = profit && previousProfit && profit.fen > previousProfit.fen;
  const headline = {
    conflict: '口径或数值冲突，先修复材料',
    insufficient: '材料不足，停止没有证据的归因',
    attention: growingProfit ? '利润增长不等于现金兑现' : '本期利润尚未等额兑现为经营现金',
    supported: '现金与利润的核查链条已闭合',
  }[verdict];
  const summary =
    verdict === 'attention'
      ? '本期经营现金低于合并净利润。已按原表重建现金桥；占款原因需要订单、结算及期后回款继续验证。'
      : verdict === 'supported'
        ? '同口径材料可重算并闭合现金桥。这里只支持本期金额与来源核查，不评价企业安全性。'
        : verdict === 'conflict'
          ? '输入存在混用或矛盾，系统保留来源并拒绝无声覆盖。请按问题单修复后再核查。'
          : '保留已采用金额；缺失或口径不一致的项目不参与计算。';
  return {
    verdict,
    headline,
    summary,
    company: input.company,
    year: input.year,
    previousYear: input.year - 1,
    metrics,
    bridge,
    checks,
    findings,
    questions,
    coverage: {
      present: metricKeys.filter((key) => get(input.year, key)).length,
      total: metricKeys.length,
    },
    limitations: [
      '仅为历史年度合并财务线索核查，不作投资、授信或合作决策。',
      '公开年报不能单独证明回款风险、坏账或存货滞销。',
      '公司、期间、单位、币种与合并范围必须一致；空白或缺失不填零。',
      ...(excluded.size ? ['本次压力测试人为限制提供的材料，不能推断发行人未披露。'] : []),
    ],
    model: { enabled: false, status: 'not-configured' },
    snapshot,
  };
}
