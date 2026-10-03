import type { DecisionEvaluation, DecisionInput, DecisionVersion } from './decision-contracts.js';
import { contextFen } from './company-analysis.js';
import { derivePaymentBoundary } from './payment-boundary.js';

export interface DecisionChange {
  kind: 'input' | 'evidence' | 'gate' | 'calculation';
  key: string;
  label: readonly [string, string];
  before: string | null;
  after: string | null;
  unit: 'text' | 'CNY' | 'state';
}
export interface DecisionChangeSet {
  fromRevision: number;
  toRevision: number;
  changes: DecisionChange[];
  /** These compare saved inputs under today's rules, not observations of business changes. */
  basis: 'saved-inputs-current-rules';
}
type Row = { value: string | null; label: readonly [string, string]; unit: DecisionChange['unit'] };
type Rows = Map<string, Row>;
const scalar = (value: unknown): string | null =>
  value === undefined || value === null || value === '' ? null : String(value);

function inputs(input: DecisionInput): Rows {
  const rows: Rows = new Map();
  const add = (key: string, value: unknown, label: Row['label'], unit: Row['unit'] = 'text') =>
    rows.set(key, { value: scalar(value), label, unit });
  for (const [key, label] of [
    ['title', ['事项名称', 'Review item name']],
    ['purpose', ['事项类型', 'Review purpose']],
    ['transactionEntity', ['合同责任主体', 'Contract-responsible entity']],
    ['tradingName', ['经营名义', 'Trading name']],
    ['reportTaskId', ['关联历史财报', 'Linked historical review']],
    ['promise', ['事项说明与原话', 'Description and original words']],
  ] as const)
    add(key, input[key], label);
  for (const claim of input.claims || []) {
    add(`claim:${claim.id}:text`, claim.text, ['待核对说法', 'Statement to examine']);
    add(`claim:${claim.id}:target`, claim.target, ['说法核验目标', 'Statement check target']);
    add(`claim:${claim.id}:question`, claim.question, ['具体核查问题', 'Specific review question']);
  }
  const externalLabels = {
    asOf: ['核查基准日', 'Review date'],
    totalAmount: ['合同总额', 'Contract total'],
    payeeEntity: ['收款主体', 'Payee entity'],
    refundEntity: ['退款责任主体', 'Refund-responsible entity'],
    alreadyPaid: ['已付', 'Already paid'],
    deliveredAmount: ['实际交付对应金额', 'Delivered value'],
    actualRefund: ['实际到账退款', 'Actual refund received'],
    proposedAmount: ['方案A拟付', 'Option A proposed payment'],
    alternativeAmount: ['方案B拟付', 'Option B proposed payment'],
    exposureLimit: ['自设敞口上限', 'User-set exposure limit'],
  } as const;
  for (const [key, label] of Object.entries(externalLabels))
    add(
      `external.${key}`,
      input.external?.[key as keyof typeof externalLabels],
      label,
      ['asOf', 'payeeEntity', 'refundEntity'].includes(key) ? 'text' : 'CNY'
    );
  const cashLabels = {
    asOf: ['现金起点日', 'Cash baseline date'],
    openingCash: ['起点可用现金', 'Opening available cash'],
    cashFloor: ['自设现金底线', 'User-set cash floor'],
    proposedAmount: ['拟付款金额', 'Proposed payment'],
    proposedDay: ['方案A付款日', 'Option A payment day'],
    alternativeDay: ['方案B付款日', 'Option B payment day'],
  } as const;
  for (const [key, label] of Object.entries(cashLabels))
    add(
      `datedCash.${key}`,
      input.datedCash?.[key as keyof typeof cashLabels],
      label,
      ['openingCash', 'cashFloor', 'proposedAmount'].includes(key) ? 'CNY' : 'text'
    );
  for (const flow of input.datedCash?.flows || [])
    for (const [key, label] of [
      ['label', ['现金事件名称', 'Cash event name']],
      ['direction', ['现金事件方向', 'Cash event direction']],
      ['day', ['现金事件日', 'Cash event day']],
      ['amount', ['现金事件金额', 'Cash event amount']],
      ['flexibility', ['现金事件约束', 'Cash event constraint']],
    ] as const)
      add(`flow:${flow.id}:${key}`, flow[key], label, key === 'amount' ? 'CNY' : 'text');
  return rows;
}
function evidence(version: DecisionVersion): Rows {
  const rows: Rows = new Map();
  for (const record of version.evidence) {
    const fields: [string, unknown, Row['label'], Row['unit']][] = [
      ['state', record.state, ['材料采用状态', 'Evidence adoption state'], 'state'],
      ['slot', record.slot, ['材料核验目标', 'Evidence target'], 'text'],
      ['kind', record.kind, ['材料性质', 'Evidence kind'], 'text'],
      ['entity', record.entity, ['材料适用主体', 'Evidence entity'], 'text'],
      ['asOf', record.asOf, ['材料适用日', 'Evidence date'], 'text'],
      ['sourceLabel', record.sourceLabel, ['材料来源名称', 'Evidence source label'], 'text'],
      ['quote', record.quote, ['保存摘录', 'Saved quote'], 'text'],
      ['materialId', record.materialId, ['绑定材料', 'Linked material'], 'text'],
      ['observationId', record.observationId, ['绑定观测', 'Linked observation'], 'text'],
      ['page', record.page, ['原件页码', 'Original page'], 'text'],
      ['flowId', record.flowId, ['关联现金事件', 'Linked cash event'], 'text'],
      ['claimId', record.claimId, ['关联问询', 'Linked question'], 'text'],
      ['claimQuestion', record.claimQuestion, ['提交时问题', 'Question at submission'], 'text'],
      ['claimText', record.claimText, ['提交时原话', 'Quotation at submission'], 'text'],
      [
        'claimTarget',
        record.claimTarget,
        ['提交时核验目标', 'Review target at submission'],
        'text',
      ],
      ['amount', record.values.amount, ['记录金额', 'Recorded amount'], 'CNY'],
      ['day', record.values.day, ['记录事件日', 'Recorded event day'], 'text'],
      ['terms', record.values.terms, ['记录条款', 'Recorded terms'], 'text'],
      ['valueEntity', record.values.entity, ['记录主体字段', 'Recorded entity field'], 'text'],
      ['role', record.values.role, ['记录主体角色', 'Recorded entity role'], 'text'],
    ];
    for (const [key, value, label, unit] of fields)
      rows.set(`evidence:${record.id}:${key}`, {
        value: scalar(value),
        label: [`${label[0]} · ${record.sourceLabel}`, `${label[1]} · ${record.sourceLabel}`],
        unit,
      });
  }
  return rows;
}
function results(version: DecisionVersion, evaluation: DecisionEvaluation): Rows {
  const rows: Rows = new Map();
  const add = (key: string, value: unknown, label: Row['label'], unit: Row['unit'] = 'CNY') =>
    rows.set(key, { value: scalar(value), label, unit });
  for (const branch of ['assumptionScenarios', 'recordScenarios'] as const)
    for (const option of evaluation.external?.[branch] || []) {
      const prefix =
        branch === 'assumptionScenarios'
          ? ['按输入', 'Input-based']
          : ['有记录字段', 'Record-field'];
      add(`${branch}:${option.id}:exposure`, option.exposure, [
        `${prefix[0]}方案${option.id}敞口`,
        `${prefix[1]} option ${option.id} exposure`,
      ]);
      add(
        `${branch}:${option.id}:limit`,
        option.withinLimit,
        [
          `${prefix[0]}方案${option.id}上限条件`,
          `${prefix[1]} option ${option.id} limit condition`,
        ],
        'state'
      );
    }
  for (const branch of ['cash', 'recordedCash'] as const)
    for (const option of ['primary', 'alternative'] as const) {
      const result = evaluation[branch]?.[option];
      if (!result) continue;
      const prefix = branch === 'cash' ? ['按输入', 'Input-based'] : ['有记录字段', 'Record-field'];
      const name = option === 'primary' ? 'A' : 'B';
      add(`${branch}:${option}:minimum`, result.minimumBalance, [
        `${prefix[0]}方案${name}最低日末余额`,
        `${prefix[1]} option ${name} minimum day-end balance`,
      ]);
      add(
        `${branch}:${option}:day`,
        result.status === 'known' && result.firstShortfallDay === null
          ? 'no-day-end-shortfall'
          : result.firstShortfallDay,
        [
          `${prefix[0]}方案${name}首次低于底线日`,
          `${prefix[1]} option ${name} first shortfall day`,
        ],
        'state'
      );
      add(`${branch}:${option}:gap`, result.maximumGap, [
        `${prefix[0]}方案${name}最大缺口`,
        `${prefix[1]} option ${name} maximum gap`,
      ]);
      add(`${branch}:${option}:conservativeMinimum`, result.conservativeMinimumBalance, [
        `${prefix[0]}方案${name}最低付款优先余额`,
        `${prefix[1]} option ${name} minimum outflows-first balance`,
      ]);
      add(`${branch}:${option}:conservativeGap`, result.conservativeMaximumGap, [
        `${prefix[0]}方案${name}付款优先最大缺口`,
        `${prefix[1]} option ${name} maximum outflows-first gap`,
      ]);
      add(
        `${branch}:${option}:sameDayOrderSensitive`,
        result.status === 'known'
          ? result.sameDayOrderSensitive
            ? 'order-sensitive'
            : 'not-order-sensitive'
          : null,
        [
          `${prefix[0]}方案${name}同日顺序敏感性`,
          `${prefix[1]} option ${name} same-day order sensitivity`,
        ],
        'state'
      );
      add(`${branch}:${option}:maximumAdditionalPayment`, result.maximumAdditionalPayment, [
        `${prefix[0]}方案${name}拟付款额度`,
        `${prefix[1]} option ${name} proposed-payment threshold`,
      ]);
      add(
        `${branch}:${option}:thresholdStatus`,
        result.thresholdStatus,
        [`${prefix[0]}方案${name}反求状态`, `${prefix[1]} option ${name} threshold state`],
        'state'
      );
      add(
        `${branch}:${option}:minimumCollectionPercent`,
        result.minimumCollectionPercent,
        [
          `${prefix[0]}方案${name}最低回款比例%`,
          `${prefix[1]} option ${name} minimum collection %`,
        ],
        'text'
      );
      add(
        `${branch}:${option}:minimumCollectionStatus`,
        result.minimumCollectionStatus,
        [
          `${prefix[0]}方案${name}回款条件状态`,
          `${prefix[1]} option ${name} collection condition state`,
        ],
        'state'
      );
    }
  const boundary = derivePaymentBoundary({ version, evaluation });
  if (boundary)
    for (const branch of ['assumptions', 'records'] as const) {
      const row = boundary[branch],
        prefix =
          branch === 'assumptions'
            ? ['按输入', 'Input-based']
            : ['定位记录与输入', 'Located records and inputs'];
      add(`paymentBoundary:${branch}:maximum`, row.maximumProposedAmount, [
        `${prefix[0]}本次拟付数学上限`,
        `${prefix[1]} mathematical ceiling`,
      ]);
      add(
        `paymentBoundary:${branch}:status`,
        row.status,
        [`${prefix[0]}反求条件状态`, `${prefix[1]} constraint state`],
        'state'
      );
      add(`paymentBoundary:${branch}:currentExposure`, row.currentExposure, [
        `${prefix[0]}新增付款前暴露`,
        `${prefix[1]} exposure before another payment`,
      ]);
      add(`paymentBoundary:${branch}:currentExcess`, row.currentExcess, [
        `${prefix[0]}超出自设上限金额`,
        `${prefix[1]} excess above your limit`,
      ]);
      add(`paymentBoundary:${branch}:headroom`, row.exposureHeadroom, [
        `${prefix[0]}自设暴露空间`,
        `${prefix[1]} exposure headroom`,
      ]);
      add(`paymentBoundary:${branch}:remaining`, row.remainingContractAmount, [
        `${prefix[0]}交易剩余额`,
        `${prefix[1]} remaining transaction amount`,
      ]);
    }
  return rows;
}

/** Read-only, adjacent version comparison. IDs bind evidence/flows/claims; array order is irrelevant. */
export function deriveDecisionChanges(
  previous: DecisionVersion,
  current: DecisionVersion,
  previousEvaluation: DecisionEvaluation,
  currentEvaluation: DecisionEvaluation
): DecisionChangeSet {
  const changes: DecisionChange[] = [];
  const compare = (kind: DecisionChange['kind'], before: Rows, after: Rows) => {
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const left = before.get(key),
        right = after.get(key),
        row = right || left!;
      const a = left?.value ?? null,
        b = right?.value ?? null;
      if (
        a === b ||
        (row.unit === 'CNY' &&
          a !== null &&
          b !== null &&
          contextFen(a) !== null &&
          contextFen(a) === contextFen(b))
      )
        continue;
      changes.push({ kind, key, label: row.label, before: a, after: b, unit: row.unit });
    }
  };
  compare('input', inputs(previous.input), inputs(current.input));
  compare('evidence', evidence(previous), evidence(current));
  const gates = (evaluation: DecisionEvaluation): Rows =>
    new Map(
      evaluation.gates.map((gate) => [
        gate.id,
        { value: gate.status, label: [gate.label, gate.label], unit: 'state' as const },
      ])
    );
  compare('gate', gates(previousEvaluation), gates(currentEvaluation));
  compare(
    'calculation',
    results(previous, previousEvaluation),
    results(current, currentEvaluation)
  );
  return {
    fromRevision: previous.revision,
    toRevision: current.revision,
    changes,
    basis: 'saved-inputs-current-rules',
  };
}
