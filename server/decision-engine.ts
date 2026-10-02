import { z } from 'zod';
import type { AnalysisTask, Material, MetricKey } from '../shared/contracts.js';
import type {
  DecisionDependency,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionEvidenceSlot,
  DecisionEvaluation,
  DecisionGate,
  DecisionInput,
  DecisionKnownConflict,
  DecisionVersion,
  ExternalPaymentInput,
  ExternalPaymentScenario,
} from '../shared/decision-contracts.js';
import { compareDatedCash } from '../shared/decision-cash.js';
import { ApiFault, moneyToFen, fenToYuan } from './validation.js';

const amount = z.string().regex(/^\d{1,20}(?:\.\d{1,2})?$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, '日期必须是真实YYYY-MM-DD日历日');
const day = z.number().int().min(1).max(90).nullable();
const text = z.string().trim().min(1).max(200);
export const decisionInputSchema = z
  .object({
    title: text,
    purpose: z.enum(['external', 'handover']),
    transactionEntity: text,
    reportTaskId: z.string().min(1).max(200).nullable(),
    promise: z.string().max(2000),
    external: z
      .object({
        asOf: date,
        totalAmount: amount.nullable(),
        payeeEntity: text.nullable(),
        refundEntity: text.nullable(),
        alreadyPaid: amount.nullable(),
        deliveredAmount: amount.nullable(),
        actualRefund: amount.nullable(),
        proposedAmount: amount.nullable(),
        alternativeAmount: amount.nullable(),
        exposureLimit: amount.nullable(),
      })
      .strict()
      .nullable(),
    datedCash: z
      .object({
        asOf: date,
        openingCash: amount.nullable(),
        cashFloor: amount,
        proposedAmount: amount.nullable(),
        proposedDay: day,
        alternativeDay: day,
        flows: z
          .array(
            z
              .object({
                id: text,
                label: text,
                direction: z.enum(['in', 'out']),
                day,
                amount: amount.nullable(),
                flexibility: z.enum(['fixed', 'proposed']),
              })
              .strict()
          )
          .max(100),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.datedCash &&
      new Set(input.datedCash.flows.map((flow) => flow.id)).size !== input.datedCash.flows.length
    )
      ctx.addIssue({
        code: 'custom',
        message: '收付款事件ID不得重复',
        path: ['datedCash', 'flows'],
      });
  });
export const decisionEvidenceSchema = z
  .object({
    slot: z.enum([
      'identity',
      'terms',
      'paid',
      'delivered',
      'refunded',
      'opening-cash',
      'cash-flow',
      'collections',
      'inventory',
    ]),
    kind: z.enum(['source-record', 'counterparty-statement', 'assumption']),
    entity: text,
    asOf: date.nullable(),
    flowId: text.optional(),
    values: z
      .object({
        amount: amount.nullable().optional(),
        day: day.optional(),
        entity: text.optional(),
        terms: z.string().min(1).max(2000).optional(),
        role: z.enum(['contract', 'payee', 'refund']).optional(),
      })
      .strict(),
    quote: z.string().min(1).max(4000),
    sourceLabel: text,
    materialId: text.optional(),
    observationId: text.optional(),
    page: z.number().int().min(1).max(100000).nullable().optional(),
  })
  .strict();
export function validateDecisionInput(value: unknown): DecisionInput {
  const result = decisionInputSchema.safeParse(value);
  if (!result.success)
    throw new ApiFault(400, 'INVALID_DECISION', result.error.issues[0]?.message || '决定输入无效');
  return result.data;
}
export function validateDecisionEvidence(value: unknown): DecisionEvidenceInput {
  const result = decisionEvidenceSchema.safeParse(value);
  if (!result.success)
    throw new ApiFault(
      400,
      'INVALID_DECISION_EVIDENCE',
      result.error.issues[0]?.message || '材料记录无效'
    );
  return result.data;
}
export const normalizeEntity = (value: string) => value.normalize('NFKC').replace(/\s/g, '');
const normalizedText = (value: string) => value.normalize('NFKC').replace(/[\s,，]/g, '');
const sameMoney = (a: string | null | undefined, b: string | null | undefined) =>
  a != null && b != null && moneyToFen(a, 'yuan') === moneyToFen(b, 'yuan');
function amountInQuote(quote: string, expected: string): boolean {
  const text = quote
    .normalize('NFKC')
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/g, '[日期]');
  const tokens = [
    ...text.matchAll(/([+−－-]?\d[\d,，]*(?:\.\d+)?)\s*(千元|万元|亿元|元)/g),
    ...text.matchAll(/(?:人民币|CNY|RMB|￥|¥)\s*([+−－-]?\d[\d,，]*(?:\.\d+)?)/g),
  ];
  return tokens.some((match) => {
    try {
      const raw = match[1]!.replace(/[,，]/g, '').replace(/[−－]/g, '-');
      if (
        raw.startsWith('-') ||
        /(?:负|-|−|－)\s*(?:人民币|CNY|RMB|￥|¥)?\s*$/.test(
          text.slice(Math.max(0, match.index! - 12), match.index)
        ) ||
        text.slice(Math.max(0, match.index! - 1), match.index) === '('
      )
        return false;
      return (
        moneyToFen(
          raw.replace(/^\+/, ''),
          match[2] === '万元' ? 'wan' : match[2] === '亿元' ? 'yi' : 'yuan'
        ) *
          (match[2] === '千元' ? 1000n : 1n) ===
        moneyToFen(expected, 'yuan')
      );
    } catch {
      return false;
    }
  });
}
function dateInQuote(quote: string, value: string): boolean {
  const [year, month, day] = value.split('-');
  return (
    quote.includes(value) ||
    normalizedText(quote).includes(`${year}年${Number(month)}月${Number(day)}日`)
  );
}
export interface DecisionContext {
  tasks: AnalysisTask[];
  materials: Material[];
  knownConflicts?: DecisionKnownConflict[];
}
function binding(record: DecisionEvidence, materials: Material[]): DecisionDependency['binding'] {
  if (!record.materialId) return 'user-transcribed';
  const material = materials.find((item) => item.id === record.materialId);
  if (!material) return 'not-located';
  const texts = record.observationId
    ? material.observations
        .filter(
          (row) =>
            row.id === record.observationId && (record.page == null || row.page === record.page)
        )
        .flatMap((row) => [
          row.quote,
          ...(row.components || [])
            .filter((part) => record.page == null || part.page === record.page)
            .map((part) => part.quote),
        ])
    : [
        ...material.excerpts
          .filter((part) => record.page == null || part.page === record.page)
          .map((part) => part.text),
        ...material.observations
          .filter((row) => record.page == null || row.page === record.page)
          .map((row) => row.quote),
      ];
  return texts.some((value) => normalizedText(value).includes(normalizedText(record.quote)))
    ? 'source-located'
    : 'not-located';
}
function fieldsMatch(record: DecisionEvidence, baselineDate?: string | null): boolean {
  const value = record.values;
  if (value.amount != null && !amountInQuote(record.quote, value.amount)) return false;
  if (value.day != null) {
    const relative = new RegExp(
      `(?:D\\s*${value.day}\\b|第\\s*${value.day}\\s*(?:日|天))`,
      'i'
    ).test(record.quote);
    let absolute = false;
    if (baselineDate) {
      const due = new Date(`${baselineDate}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + value.day);
      absolute = dateInQuote(record.quote, due.toISOString().slice(0, 10));
    }
    if (!(absolute || (relative && (!baselineDate || record.asOf === baselineDate)))) return false;
  }
  if (
    ['paid', 'delivered', 'refunded'].includes(record.slot) &&
    /承诺|预计|计划|拟|将(?:退款|付款|支付|交付)|尚未|未到账|待退款|待支付|未支付|待交付|未交付|\b(?:promis(?:e|ed)|pending|expected|will|intend(?:s|ed|ing)?|planned|proposed)\b|not\s+yet|not\s+(?:received|paid|delivered)/i.test(
      record.quote
    )
  )
    return false;
  if (value.entity && !normalizedText(record.quote).includes(normalizedText(value.entity)))
    return false;
  if (value.terms && !normalizedText(record.quote).includes(normalizedText(value.terms)))
    return false;
  if (
    [
      'paid',
      'delivered',
      'refunded',
      'opening-cash',
      'cash-flow',
      'collections',
      'inventory',
    ].includes(record.slot) &&
    (!record.asOf || !dateInQuote(record.quote, record.asOf))
  )
    return false;
  return normalizedText(record.quote).includes(normalizedText(record.entity));
}
function quoteDirection(quote: string): 'in' | 'out' | null {
  const incoming = /收款|回款|流入|\b(?:receipt|receipts|inflow|collection|collections)\b/i.test(
    quote
  );
  const outgoing =
    /付款|支付|流出|\b(?:payment|payments|outflow|disbursement|disbursements)\b/i.test(quote);
  return incoming === outgoing ? null : incoming ? 'in' : 'out';
}
export function correctEvidenceScope(
  record: DecisionEvidence,
  scope: { entity: string; asOf: string | null },
  materials: Material[]
): DecisionEvidence {
  const parsed = z.object({ entity: text, asOf: date.nullable() }).strict().safeParse(scope);
  if (!parsed.success) throw new ApiFault(400, 'INVALID_EVIDENCE_SCOPE', '主体及适用日期无效');
  const corrected = { ...structuredClone(record), ...parsed.data };
  if (
    record.kind !== 'source-record' ||
    binding(record, materials) !== 'source-located' ||
    !fieldsMatch(corrected) ||
    (corrected.asOf !== null && !dateInQuote(corrected.quote, corrected.asOf))
  )
    throw new ApiFault(
      400,
      'EVIDENCE_SCOPE_NOT_LOCATED',
      '新主体或日期未在原绑定的保存文本中定位；原文和金额未修改'
    );
  if (
    normalizeEntity(record.entity) === normalizeEntity(corrected.entity) &&
    record.asOf === corrected.asOf
  )
    throw new ApiFault(400, 'EVIDENCE_SCOPE_UNCHANGED', '适用范围没有变化');
  return corrected;
}
function issueUnresolved(issue: DecisionKnownConflict, revision: number): boolean {
  const events = (issue.resolutionEvents || []).filter((event) => event.revision <= revision);
  if (events.length) return events.at(-1)!.state === 'reopened';
  return issue.resolvedRevision === undefined || issue.resolvedRevision > revision;
}
export function decisionConflictsAtRevision(
  issues: DecisionKnownConflict[],
  revision: number
): DecisionKnownConflict[] {
  return structuredClone(issues.filter((issue) => issue.introducedRevision <= revision)).map(
    (issue) => {
      if (issue.resolutionEvents) {
        issue.resolutionEvents = issue.resolutionEvents.filter(
          (event) => event.revision <= revision
        );
        const last = issue.resolutionEvents.at(-1);
        if (last?.state === 'scope-corrected') {
          issue.resolvedRevision = last.revision;
          issue.resolutionReason = last.reason;
        } else {
          delete issue.resolvedRevision;
          delete issue.resolutionReason;
        }
      } else if (issue.resolvedRevision !== undefined && issue.resolvedRevision > revision) {
        delete issue.resolvedRevision;
        delete issue.resolutionReason;
      }
      return issue;
    }
  );
}
export function resolveCorrectedScopeIssues(
  issues: DecisionKnownConflict[],
  version: DecisionVersion,
  evidenceId: string,
  reason: string,
  materials: Material[]
): DecisionKnownConflict[] {
  const next = structuredClone(issues);
  for (const issue of next) {
    if (
      issue.evidenceIds.length < 2 ||
      !issue.evidenceIds.includes(evidenceId) ||
      !issueUnresolved(issue, version.revision)
    )
      continue;
    const records = issue.evidenceIds.map((id) =>
      version.evidence.find((record) => record.id === id)
    );
    if (
      records.some(
        (record) =>
          !record || binding(record, materials) !== 'source-located' || !fieldsMatch(record)
      )
    )
      continue;
    const groups = new Map<string, Set<string>>();
    for (const record of records as DecisionEvidence[]) {
      const key = `${normalizeEntity(record.entity)}|${record.asOf || ''}`;
      const values = groups.get(key) || new Set<string>();
      values.add(
        JSON.stringify({
          ...record.values,
          amount:
            record.values.amount == null
              ? null
              : fenToYuan(moneyToFen(record.values.amount, 'yuan')),
        })
      );
      groups.set(key, values);
    }
    if ([...groups.values()].some((values) => values.size > 1)) continue;
    issue.resolvedRevision = version.revision;
    issue.resolutionReason = `适用范围更正后不再同组；未认证真伪或争议事实。${reason}`;
    (issue.resolutionEvents ||= []).push({
      revision: version.revision,
      state: 'scope-corrected',
      reason: issue.resolutionReason,
    });
  }
  return next;
}
interface SlotResult {
  status: DecisionGate['status'];
  records: DecisionEvidence[];
  dependencies: DecisionDependency[];
  amount: string | null;
  day: number | null;
}
export function evaluateDecision(
  version: DecisionVersion,
  context: DecisionContext
): DecisionEvaluation {
  const input = version.input;
  const knownConflicts = decisionConflictsAtRevision(
    context.knownConflicts || [],
    version.revision
  );
  const gates: DecisionGate[] = [];
  const recordDependency = (
    record: DecisionEvidence,
    state: DecisionDependency['state']
  ): DecisionDependency => ({
    kind: 'evidence',
    id: record.id,
    label: record.sourceLabel,
    state,
    relation: 'supports',
    binding: binding(record, context.materials),
    ...(record.materialId ? { materialId: record.materialId } : {}),
    ...(record.page !== undefined ? { page: record.page } : {}),
    ...(record.observationId ? { observationId: record.observationId } : {}),
  });
  const resolve = (
    slot: DecisionEvidenceSlot,
    expectedEntity: string,
    asOf: string | null,
    expectedAmount?: string | null,
    flowId?: string,
    role?: 'contract' | 'payee' | 'refund',
    direction?: 'in' | 'out'
  ): SlotResult => {
    const distinguishing = slot === 'collections' || slot === 'inventory';
    const exactScope = distinguishing || (slot === 'terms' && input.purpose === 'handover');
    const entries = version.evidence.filter(
      (record) =>
        record.slot === slot &&
        (flowId === undefined || record.flowId === flowId) &&
        (role === undefined || (record.values.role || 'contract') === role)
    );
    const eligible = entries.filter(
      (record) =>
        record.state === 'active' &&
        record.kind !== 'assumption' &&
        normalizeEntity(record.entity) === normalizeEntity(expectedEntity) &&
        (!exactScope ||
          ((!record.values.entity ||
            normalizeEntity(record.values.entity) === normalizeEntity(expectedEntity)) &&
            !!asOf &&
            record.asOf === asOf)) &&
        (!asOf ||
          (!!record.asOf && (slot === 'opening-cash' ? record.asOf === asOf : record.asOf <= asOf)))
    );
    const latestDate = eligible
      .map((record) => record.asOf || '')
      .sort()
      .at(-1);
    const current = eligible.filter((record) => (record.asOf || '') === latestDate);
    const comparable = current.filter(
      (record) =>
        fieldsMatch(record, asOf) &&
        (!exactScope || (!!record.asOf && dateInQuote(record.quote, record.asOf))) &&
        (!direction || quoteDirection(record.quote) === direction)
    );
    const sourceRecords = comparable.filter(
      (record) =>
        record.kind === 'source-record' && binding(record, context.materials) === 'source-located'
    );
    const signatures = sourceRecords.map((record) =>
      JSON.stringify({
        amount:
          record.values.amount == null ? null : fenToYuan(moneyToFen(record.values.amount, 'yuan')),
        day: record.values.day ?? null,
        entity: record.values.entity ? normalizeEntity(record.values.entity) : null,
        terms: record.values.terms || null,
      })
    );
    const sourceConflict = new Set(signatures).size > 1;
    const inputConflict = comparable.some(
      (record) =>
        expectedAmount != null &&
        record.values.amount != null &&
        !sameMoney(expectedAmount, record.values.amount)
    );
    if (sourceConflict) {
      const id = `${slot}|${normalizeEntity(expectedEntity)}|${flowId || ''}|${role || ''}|${latestDate || ''}`;
      const previous = knownConflicts.find((issue) => issue.id === id);
      if (previous && !issueUnresolved(previous, version.revision)) {
        (previous.resolutionEvents ||= []).push({
          revision: version.revision,
          state: 'reopened',
          reason: '当前输入版本再次包含同主体、同日期的冲突记录；范围更正不适用于本版本。',
        });
        delete previous.resolvedRevision;
        delete previous.resolutionReason;
      }
      if (!previous)
        knownConflicts.push({
          id,
          slot,
          entity: expectedEntity,
          ...(flowId ? { flowId } : {}),
          ...(role ? { role } : {}),
          evidenceIds: sourceRecords.map((record) => record.id),
          message:
            '同一对象的提供字段或原文记录不一致，需补充纠正及对账依据；撤回记录不消除已知冲突。',
          introducedRevision: version.revision,
          asOf: latestDate || null,
        });
    }
    const issueDate = exactScope ? (asOf ?? undefined) : latestDate;
    const unresolved = knownConflicts.some(
      (issue) =>
        issue.slot === slot &&
        normalizeEntity(issue.entity) === normalizeEntity(expectedEntity) &&
        issue.flowId === flowId &&
        issue.role === role &&
        issueUnresolved(issue, version.revision) &&
        (issueDate === undefined || issue.asOf === undefined || (issue.asOf || '') === issueDate)
    );
    const matched = comparable.filter(
      (record) =>
        record.kind === 'source-record' && binding(record, context.materials) === 'source-located'
    );
    const requiredPresent = (record: DecisionEvidence) =>
      slot === 'identity'
        ? !!record.values.entity &&
          normalizeEntity(record.values.entity) === normalizeEntity(expectedEntity)
        : slot === 'terms'
          ? !!record.values.terms
          : ['collections', 'inventory'].includes(slot)
            ? true
            : record.values.amount != null && (slot !== 'cash-flow' || record.values.day != null);
    const adopted = matched.filter(requiredPresent);
    const status: DecisionGate['status'] =
      unresolved || inputConflict
        ? 'conflict'
        : adopted.length
          ? 'matched'
          : entries.length && entries.every((record) => record.state === 'withdrawn')
            ? 'withdrawn'
            : entries.some(
                  (record) =>
                    record.state === 'active' &&
                    (normalizeEntity(record.entity) !== normalizeEntity(expectedEntity) ||
                      ((slot === 'identity' || exactScope) &&
                        !!record.values.entity &&
                        normalizeEntity(record.values.entity) !==
                          normalizeEntity(expectedEntity)) ||
                      (exactScope && !!asOf && record.asOf !== asOf))
                )
              ? 'out-of-scope'
              : 'unknown';
    const dependencies = entries.map((record) =>
      recordDependency(
        record,
        record.state === 'withdrawn'
          ? 'withdrawn'
          : unresolved || inputConflict
            ? 'conflict'
            : adopted.includes(record)
              ? 'matched'
              : record.kind === 'assumption'
                ? 'assumption'
                : normalizeEntity(record.entity) !== normalizeEntity(expectedEntity) ||
                    (exactScope &&
                      ((!!asOf && record.asOf !== asOf) ||
                        (!!record.values.entity &&
                          normalizeEntity(record.values.entity) !==
                            normalizeEntity(expectedEntity))))
                  ? 'out-of-scope'
                  : 'missing'
      )
    );
    if (!entries.length)
      dependencies.push({
        kind: 'input',
        id: `${slot}:${flowId || role || ''}`,
        path: slot,
        label: '尚未提供对应记录',
        state: 'missing',
      });
    for (const issue of knownConflicts.filter(
      (issue) =>
        issue.slot === slot &&
        issue.entity === expectedEntity &&
        issue.flowId === flowId &&
        issue.role === role &&
        issueUnresolved(issue, version.revision) &&
        (issueDate === undefined || issue.asOf === undefined || (issue.asOf || '') === issueDate)
    ))
      for (const id of issue.evidenceIds)
        if (!dependencies.some((dependency) => dependency.id === id))
          dependencies.push({
            kind: 'evidence',
            id,
            label: '历史版本中的未解释冲突记录',
            state: 'conflict',
          });
    return {
      status,
      records: adopted,
      dependencies,
      amount: status === 'matched' ? (adopted[0]?.values.amount ?? null) : null,
      day: status === 'matched' ? (adopted[0]?.values.day ?? null) : null,
    };
  };
  const addGate = (id: string, label: string, result: SlotResult, slots: DecisionEvidenceSlot[]) =>
    gates.push({
      id,
      label,
      status: result.status,
      summary:
        result.status === 'matched'
          ? '字段已在所绑定的保存文本中定位；仅说明记录匹配，未鉴真或认证履行。'
          : result.status === 'conflict'
            ? '存在未解释的记录冲突；撤回或恢复旧版本不能视为已解决。'
            : '未形成同主体、适用日期及匹配原文的记录依据；用户转录、对方陈述和假设不当作已核验原件。',
      dependencies: result.dependencies,
      neededSlots: slots,
    });
  const historical = context.tasks.find((task) => task.id === input.reportTaskId);
  const financialDependencies: DecisionDependency[] = historical?.report
    ? historical.report.snapshot.flatMap((material) =>
        material.observations
          .filter(
            (row) =>
              row.year === historical.year &&
              row.period === 'annual' &&
              row.scope === 'consolidated' &&
              row.currency === 'CNY' &&
              !historical.excludedMetrics.includes(row.key) &&
              historical.report!.checks.some(
                (check) => check.id === `${row.year}-${row.key}` && check.status === 'pass'
              )
          )
          .map((row) => ({
            kind: 'financial' as const,
            id: `${material.id}:${row.id}`,
            taskId: historical.id,
            materialId: material.id,
            observationId: row.id,
            page: row.page,
            metric: row.key,
            label: `${row.year} ${row.key}`,
            state: 'matched' as const,
            relation: 'motivates' as const,
          }))
      )
    : [];
  const historySameEntity =
    !!historical &&
    normalizeEntity(historical.company) === normalizeEntity(input.transactionEntity);
  gates.push({
    id: 'historical-scope',
    label: '历史财报主体与适用范围',
    status: !historical?.report ? 'unknown' : historySameEntity ? 'matched' : 'out-of-scope',
    summary: historySameEntity
      ? '仅连接该主体的历史年度事实，不证明当前可用余额、个人交款安全或履约。'
      : '集团或其他主体的年报只作历史背景，不能证明本次交易主体的资金能力。',
    dependencies: financialDependencies.length
      ? financialDependencies
      : [
          {
            kind: 'input',
            id: 'reportTaskId',
            path: 'reportTaskId',
            label: '未取得可采用历史任务',
            state: 'missing',
          },
        ],
    neededSlots: [],
  });
  let external: DecisionEvaluation['external'] = null;
  let cash: DecisionEvaluation['cash'] = null;
  let recordedCash: DecisionEvaluation['recordedCash'] = null;
  if (input.purpose === 'external' && input.external) {
    const payment = input.external;
    for (const [role, entity] of [
      ['contract', input.transactionEntity],
      ['payee', payment.payeeEntity],
      ['refund', payment.refundEntity],
    ] as const) {
      const result = resolve('identity', entity || '', null, undefined, undefined, role);
      if (!entity) result.status = 'unknown';
      else if (
        role !== 'contract' &&
        normalizeEntity(entity) !== normalizeEntity(input.transactionEntity)
      )
        result.status = 'out-of-scope';
      addGate(
        `identity-${role}`,
        `${{ contract: '签约', payee: '收款', refund: '退款责任' }[role]}主体`,
        result,
        ['identity']
      );
    }
    addGate(
      'terms',
      '付款、交付与退款条款',
      resolve('terms', input.transactionEntity, payment.asOf),
      ['terms']
    );
    const paid = resolve('paid', input.transactionEntity, payment.asOf, payment.alreadyPaid);
    const delivered = resolve(
      'delivered',
      input.transactionEntity,
      payment.asOf,
      payment.deliveredAmount
    );
    const refunded = resolve(
      'refunded',
      input.transactionEntity,
      payment.asOf,
      payment.actualRefund
    );
    addGate('paid', '已付记录', paid, ['paid']);
    addGate('delivered', '实际交付对应金额', delivered, ['delivered']);
    addGate('refunded', '实际退款记录', refunded, ['refunded']);
    if (
      payment.alreadyPaid != null &&
      payment.actualRefund != null &&
      moneyToFen(payment.actualRefund, 'yuan') > moneyToFen(payment.alreadyPaid, 'yuan')
    ) {
      const issue: DecisionKnownConflict = {
        id: `refund-exceeds-paid|${normalizeEntity(input.transactionEntity)}`,
        slot: 'refunded',
        entity: input.transactionEntity,
        evidenceIds: refunded.dependencies
          .filter((dep) => dep.kind === 'evidence')
          .map((dep) => dep.id),
        message: '实际退款大于已付金额，需核查记录范围；未用max(0)抹掉矛盾。',
        introducedRevision: version.revision,
      };
      if (
        paid.amount !== null &&
        refunded.amount !== null &&
        !knownConflicts.some((current) => current.id === issue.id)
      )
        knownConflicts.push(issue);
      refunded.status = 'conflict';
      refunded.amount = null;
      gates.find((gate) => gate.id === 'refunded')!.status = 'conflict';
      gates.find((gate) => gate.id === 'refunded')!.summary = issue.message;
    }
    const assumptionsInvalid =
      (payment.alreadyPaid != null &&
        payment.actualRefund != null &&
        moneyToFen(payment.actualRefund, 'yuan') > moneyToFen(payment.alreadyPaid, 'yuan')) ||
      (payment.totalAmount != null &&
        [payment.alreadyPaid, payment.deliveredAmount].some(
          (value) =>
            value != null && moneyToFen(value, 'yuan') > moneyToFen(payment.totalAmount!, 'yuan')
        ));
    if (assumptionsInvalid)
      gates.push({
        id: 'payment-range',
        label: '交易金额范围一致性',
        status: 'conflict',
        summary:
          '已付、交付或退款金额与交易总额/发生范围矛盾，暂停方案暴露；未用max(0)掩盖范围错误。',
        dependencies: [
          {
            kind: 'input',
            id: 'external.totalAmount',
            path: 'external.totalAmount',
            label: '交易范围与总额',
            state: 'conflict',
          },
        ],
        neededSlots: ['terms', 'paid', 'delivered', 'refunded'],
      });
    external = {
      assumptionScenarios: scenarios(payment, assumptionsInvalid),
      recordScenarios: scenarios(
        {
          ...payment,
          alreadyPaid: paid.amount,
          deliveredAmount: delivered.amount,
          actualRefund: refunded.amount,
        },
        assumptionsInvalid
      ),
    };
    gates.push({
      id: 'exposure-condition',
      label: '自设未交付暴露上限',
      status:
        payment.exposureLimit === null ||
        external.recordScenarios.some((scenario) => scenario.status === 'unknown')
          ? 'unknown'
          : external.recordScenarios[0]!.withinLimit === false
            ? 'condition-unmet'
            : 'matched',
      summary:
        '只核对人工记录和自设上限；拟付方案满足算术条件也不是支付批准。承诺退款不抵减实际暴露。',
      dependencies: [
        ...paid.dependencies,
        ...delivered.dependencies,
        ...refunded.dependencies,
        {
          kind: 'input',
          id: 'external.exposureLimit',
          path: 'external.exposureLimit',
          label: '用户自设暴露上限',
          state: payment.exposureLimit === null ? 'missing' : 'assumption',
        },
        {
          kind: 'input',
          id: 'external.proposedAmount',
          path: 'external.proposedAmount',
          label: '本次拟付金额',
          state: payment.proposedAmount === null ? 'missing' : 'assumption',
        },
      ],
      neededSlots: (
        [
          ['paid', paid],
          ['delivered', delivered],
          ['refunded', refunded],
        ] as const
      )
        .filter(([, result]) => result.status !== 'matched')
        .map(([slot]) => slot),
    });
  } else if (input.purpose === 'handover' && input.datedCash) {
    const plan = input.datedCash;
    cash = compareDatedCash(plan);
    const opening = resolve('opening-cash', input.transactionEntity, plan.asOf, plan.openingCash);
    addGate('opening-cash', '起点可用余额记录', opening, ['opening-cash']);
    const proofPlan = structuredClone(plan);
    proofPlan.openingCash = opening.amount;
    for (const flow of proofPlan.flows) {
      const result = resolve(
        'cash-flow',
        input.transactionEntity,
        plan.asOf,
        flow.amount,
        flow.id,
        undefined,
        flow.direction
      );
      if (result.day !== null && result.day !== flow.day) result.status = 'conflict';
      addGate(`flow-${flow.id}`, `${flow.label}的金额与日期记录`, result, ['cash-flow']);
      flow.amount = result.status === 'matched' ? result.amount : null;
      flow.day = result.status === 'matched' ? result.day : null;
    }
    recordedCash = compareDatedCash(proofPlan);
    const result = recordedCash.primary;
    gates.push({
      id: 'cash-floor',
      label: '新增付款后的自设现金底线',
      status:
        result.status === 'unknown'
          ? 'unknown'
          : result.firstShortfallDay !== null ||
              (result.conservativeMinimumBalance &&
                moneyToFen(result.conservativeMinimumBalance, 'yuan') <
                  moneyToFen(plan.cashFloor, 'yuan'))
            ? 'condition-unmet'
            : 'matched',
      summary:
        '依据分支仍是有记录字段的情景，不认证未来现金。相同日先后未知时先付款保守边界单列；延期方案假设采购可延期且其他现金流不受影响。',
      dependencies: [
        ...opening.dependencies,
        ...gates.filter((gate) => gate.id.startsWith('flow-')).flatMap((gate) => gate.dependencies),
        {
          kind: 'input',
          id: 'datedCash.proposedDay',
          path: 'datedCash.proposedDay',
          label: '拟付款日期',
          state: 'assumption',
        },
      ],
      neededSlots: ['opening-cash', 'cash-flow'],
    });
    const alternativeTerms = resolve('terms', input.transactionEntity, plan.asOf);
    gates.push({
      id: 'alternative-terms',
      label: '延期方案的可行条件',
      status: alternativeTerms.status === 'matched' ? 'unknown' : alternativeTerms.status,
      summary:
        alternativeTerms.status === 'matched'
          ? '已有延期条款字段在同主体、同日期的保存文本中定位，仍需核对延期同意及交付、回款影响；不认证同意或履行。'
          : alternativeTerms.status === 'conflict'
            ? '延期条款的同范围提供字段存在未解冲突，需核对已有来源及纠正依据；延期现金方案仍是独立假设。'
            : alternativeTerms.status === 'withdrawn'
              ? '延期条款记录已撤回，需重新提供可核对材料；延期现金方案仍是独立假设。'
              : alternativeTerms.status === 'out-of-scope'
                ? '延期条款主体或适用日期不符，需提供本次范围材料；延期现金方案仍是独立假设。'
                : '改付款日假设供应商同意延期，交付及相关回款均不受影响；需提供可核对条款，不能推荐延期。',
      dependencies: [
        ...alternativeTerms.dependencies,
        {
          kind: 'input',
          id: 'datedCash.alternativeDay',
          path: 'datedCash.alternativeDay',
          label: '对照日期是假设',
          state: 'assumption',
        },
      ],
      neededSlots: ['terms'],
    });
  }
  const explanations: DecisionEvaluation['explanations'] = (
    ['collections', 'inventory'] as const
  ).map((id) => {
    const metric: MetricKey =
      id === 'collections' ? 'receivablesAdjustment' : 'inventoryAdjustment';
    const dependencies = financialDependencies.filter((dep) => dep.metric === metric);
    const value = historical?.report?.metrics.find((row) => row.key === metric)?.value;
    const open =
      historySameEntity &&
      !!historical?.report?.bridge &&
      value != null &&
      moneyToFen(value, 'yuan') < 0n &&
      dependencies.length > 0;
    const asOf =
      input.purpose === 'handover' ? input.datedCash?.asOf || null : input.external?.asOf || null;
    const entries = version.evidence.filter((record) => record.slot === id);
    const review = resolve(id, input.transactionEntity, asOf);
    const activeSources = entries.filter(
      (record) => record.state === 'active' && record.kind === 'source-record'
    );
    const reviewStatus: NonNullable<
      DecisionEvaluation['explanations'][number]['evidenceReview']
    >['status'] =
      review.status === 'conflict'
        ? 'conflict'
        : review.status === 'matched'
          ? 'ready'
          : review.status === 'withdrawn'
            ? 'withdrawn'
            : review.status === 'out-of-scope'
              ? 'out-of-scope'
              : !entries.length || !asOf
                ? 'missing'
                : activeSources.length
                  ? 'unlocated'
                  : 'context-only';
    const reviewSummary = {
      missing: '尚无同主体、同适用日期的区分材料依据。',
      withdrawn: '区分材料已撤回，相关材料核对暂停；历史财务信号和独立现金假设分别保留。',
      'out-of-scope': '区分材料主体或适用日期不符，不能用于本次解释核对。',
      conflict: '区分材料的同范围提供字段存在未解冲突；撤回反证不能视为已解决。',
      unlocated: '区分材料尚未在绑定的保存文本中定位适用字段；用户转录不当作原件记录依据。',
      'context-only': '对方陈述或假设仅作核查线索，不当作区分解释的原件记录依据。',
      ready: '区分材料字段已在保存文本中定位，可供核对两种解释；未鉴真，也未证实任何经营原因。',
    }[reviewStatus];
    const needed =
      id === 'collections' ? '账龄、票据结算和期后回款记录' : '订单覆盖、库龄和期后出库记录';
    const scope = `${input.transactionEntity}截至${asOf || '待补适用日期'}`;
    const nextEvidence =
      reviewStatus === 'ready'
        ? `核对已有${needed}，区分两种可能解释；逐项确认${scope}的记录范围、完整性与内容，不自动裁定经营原因。`
        : reviewStatus === 'conflict'
          ? `核对${scope}的区分材料冲突及纠正依据；保留所有来源，不以撤回反证代替解释。`
          : reviewStatus === 'out-of-scope'
            ? `补充${scope}的${needed}，或提供适用范围更正依据；其他主体或日期的材料不替代。`
            : `提供${scope}的${needed}及对应原文；${reviewStatus === 'withdrawn' ? '已撤回材料需重新提交核对，' : ''}用于区分两种可能解释。`;
    return {
      id,
      state: open ? 'open' : 'withheld',
      alternatives:
        id === 'collections'
          ? ['业务扩张或结算结构变化', '回款困难或收款延期']
          : ['扩张备货与订单增长', '去化困难或库存积压'],
      dependencies: [...dependencies, ...review.dependencies],
      nextEvidence: open
        ? nextEvidence
        : '历史财务依据未形成可用信号，暂不归因；区分材料状态单列，不据此填补当前现金。',
      evidenceReview: {
        status: reviewStatus,
        asOf,
        summary: reviewSummary,
        dependencies: review.dependencies,
      },
    };
  });
  const historicalGate = gates.find((gate) => gate.id === 'historical-scope');
  if (historicalGate) {
    gates.splice(gates.indexOf(historicalGate), 1);
    gates.push(historicalGate);
  }
  const nextActions = gates
    .filter((gate) => gate.status !== 'matched' && gate.id !== 'historical-scope')
    .map((gate) => ({
      id: `request-${gate.id}`,
      title:
        gate.status === 'conflict'
          ? `核对${gate.label}的冲突`
          : gate.id === 'alternative-terms' &&
              gate.dependencies.some((dep) => dep.kind === 'evidence' && dep.state === 'matched')
            ? '核对已有延期条款及影响'
            : gate.id === 'exposure-condition' &&
                gate.dependencies.some(
                  (dep) => dep.path === 'external.exposureLimit' && dep.state === 'missing'
                )
              ? '填写用户自设暴露上限'
              : `补充${gate.label}`,
      reason: gate.summary,
      requestedEvidence: requestFor(gate),
      gateIds: [gate.id],
      dependencies: gate.dependencies,
    }));
  for (const explanation of explanations.filter((item) => item.state === 'open'))
    nextActions.push({
      id: `request-${explanation.id}`,
      title: `${explanation.evidenceReview?.status === 'ready' ? '核对已有材料区分' : explanation.evidenceReview?.status === 'conflict' ? '核对材料冲突后区分' : '补充材料区分'}${explanation.id === 'collections' ? '应收' : '存货'}的两种解释`,
      reason: `${explanation.evidenceReview?.summary || ''}同一财务信号仅促使核查，不裁定经营原因。`,
      requestedEvidence: explanation.nextEvidence,
      gateIds: [],
      dependencies: explanation.dependencies,
    });
  if (input.datedCash) {
    for (const flow of input.datedCash.flows
      .filter((flow) => flow.direction === 'in')
      .slice(0, 3)) {
      for (const explanation of explanations.filter((item) => item.state === 'open')) {
        const flowGate = gates.find((gate) => gate.id === `flow-${flow.id}`);
        nextActions.push({
          id: `investigate-${explanation.id}-${flow.id}`,
          title: `核查${flow.label}的回款依据`,
          reason: `${explanation.id === 'collections' ? '历史应收' : '历史存货'}负向现金调整仅促使调查，不能支持当前流入金额或裁定原因。`,
          requestedEvidence: `请提供${input.transactionEntity}截至${input.datedCash.asOf}，事件${flow.id}（${flow.label}），${flow.day === null ? '日期待补' : `D${flow.day}`}、${flow.amount === null ? '金额待补' : `${flow.amount}元`}的收款对象、合同/订单、约定结算日期及期后实际回款记录；核对延期或去化对该笔流入的影响。`,
          gateIds: flowGate ? [flowGate.id] : [],
          dependencies: [
            ...explanation.dependencies.map((dependency) => ({
              ...dependency,
              relation:
                dependency.kind === 'financial' ? ('motivates' as const) : dependency.relation,
            })),
            ...(flowGate?.dependencies || []),
            {
              kind: 'input',
              id: flow.id,
              path: `datedCash.flows.${flow.id}`,
              label: '用户录入的当前流入情景',
              state: 'assumption',
              relation: 'supports',
            },
          ],
        });
      }
    }
  }
  return {
    evaluatedAt: new Date().toISOString(),
    knownConflicts,
    gates,
    nextActions,
    external,
    cash,
    recordedCash,
    explanations,
    limitations: [
      '决定、证据转录与现金计划仅保存在当前账号，不发送外部模型。',
      '来源定位及字段匹配不是资料鉴真，也不认证经济真实性或未来履行。',
      '没有绑定保存文本的用户转录仅支持独立假设分支，不进入有记录字段分支。',
      '历史年度财报不证明今日现金、交款安全、公司评级或支付批准。',
      '旧输入版本按当前规则重算；恢复创建新版本并保留当前已知未解释冲突。',
    ],
  };
}
function scenarios(input: ExternalPaymentInput, invalid: boolean): ExternalPaymentScenario[] {
  return (['A', 'B'] as const).map((id) => {
    const proposal = id === 'A' ? input.proposedAmount : input.alternativeAmount;
    const missingFields = (
      ['totalAmount', 'alreadyPaid', 'deliveredAmount', 'actualRefund'] as const
    )
      .filter((key) => input[key] === null)
      .map(String);
    if (proposal === null) missingFields.push(id === 'A' ? 'proposedAmount' : 'alternativeAmount');
    if (invalid) missingFields.push('inconsistent-transaction-range');
    if (
      input.totalAmount !== null &&
      input.alreadyPaid !== null &&
      proposal !== null &&
      moneyToFen(input.alreadyPaid, 'yuan') + moneyToFen(proposal, 'yuan') >
        moneyToFen(input.totalAmount, 'yuan')
    )
      missingFields.push('payment-exceeds-total');
    const value = missingFields.length
      ? null
      : moneyToFen(input.alreadyPaid!, 'yuan') +
        moneyToFen(proposal!, 'yuan') -
        moneyToFen(input.deliveredAmount!, 'yuan') -
        moneyToFen(input.actualRefund!, 'yuan');
    const exposure = value === null ? null : fenToYuan(value < 0n ? 0n : value);
    return {
      id,
      proposedAmount: proposal,
      exposure,
      withinLimit:
        exposure === null || input.exposureLimit === null
          ? null
          : moneyToFen(exposure, 'yuan') <= moneyToFen(input.exposureLimit!, 'yuan'),
      status: exposure === null ? 'unknown' : 'known',
      missingFields,
    };
  });
}
function requestFor(gate: DecisionGate): string {
  if (gate.id.startsWith('identity'))
    return '签约、收款和退款责任主体的原件；如主体不同，提供授权书、合同付款指引及责任说明。';
  if (
    gate.id === 'alternative-terms' &&
    gate.dependencies.some((dep) => dep.kind === 'evidence' && dep.state === 'matched')
  )
    return '核对已有延期条款中的供应商同意、适用付款日期及对交付和回款的影响；文本定位不认证同意，不能据此批准付款。';
  if (gate.id === 'terms' || gate.id === 'alternative-terms')
    return '明确付款、交付、退款责任及延期同意的书面条款，核对延期对交付和回款的影响。';
  if (gate.id === 'opening-cash')
    return '与起点日期一致的银行账户对账、受限资金和可用余额记录；不能以年报金额代替。';
  if (gate.id.startsWith('flow-') || gate.id === 'cash-floor')
    return '该事件的金额、日期、主体及必要支出/收款计划原文；缺依据不删除事件或填零。';
  if (gate.id === 'exposure-condition') {
    const missingInputs = gate.dependencies.filter(
      (dep) => dep.kind === 'input' && dep.state === 'missing'
    );
    const requests: string[] = [];
    if (missingInputs.some((dep) => dep.path === 'external.exposureLimit'))
      requests.push('填写你自行设定的未交付暴露上限；本产品不推荐上限，也不自动补零');
    if (missingInputs.some((dep) => dep.path === 'external.proposedAmount'))
      requests.push('填写本次拟付金额');
    if (gate.neededSlots.length)
      requests.push(
        `提供截至所选日期的${gate.neededSlots.map((slot) => ({ paid: '实际付款', delivered: '交付对应金额', refunded: '实际退款' })[slot as 'paid' | 'delivered' | 'refunded']).join('、')}凭据；承诺不替代发生记录`
      );
    return requests.length
      ? requests.join('；') + '。'
      : '核对已有发生记录、本次拟付金额与用户自设上限；算术条件不代表付款批准。';
  }
  if (['paid', 'delivered', 'refunded'].includes(gate.id))
    return '截至所选日期的实际付款、交付对应金额和实际退款凭据；承诺退款不替代发生记录。';
  return '同交易主体的资料及明确适用范围；集团历史报表仅作背景，不能代替当前交易证据。';
}
