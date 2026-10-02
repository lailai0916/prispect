import { Select } from '../Select';
import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  History,
  LoaderCircle,
  ListChecks,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  AddDecisionEvidenceInput,
  DecisionDetail,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionEvidenceSlot,
  DecisionGate,
  DecisionInput,
  DecisionSummary,
  DatedCashInput,
  ExternalPaymentInput,
} from '../../shared/decision-contracts';
import type { DatedCashComparison, DatedCashResult } from '../../shared/decision-cash';
import type { ReviewPurpose } from '../../shared/contracts';
import { interpretStart } from '../../shared/start-intent';
import { api, post, requestErrorText } from '../api';
import { useApp, type Translate } from '../context';
import { ActionMenu, Dialog, EmptyState, PageHeading, Tag } from '../components';
import { date, money, metricName } from '../format';
import { decisionText } from '../decisionTranslations';
import { translateRule } from '../ruleTranslations';
import { CashPlanImport } from '../CashPlanImport';
import { ExportPreview, exportFilename } from '../ExportPreview';
import '../decision.css';

const EvidenceRecordContext = createContext<(id: string) => void>(() => {});

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const blankExternal = (): ExternalPaymentInput => ({
  asOf: today(),
  totalAmount: null,
  alreadyPaid: null,
  deliveredAmount: null,
  actualRefund: null,
  proposedAmount: null,
  alternativeAmount: null,
  exposureLimit: null,
  payeeEntity: null,
  refundEntity: null,
});
const blankCash = (): DatedCashInput => ({
  asOf: today(),
  openingCash: null,
  cashFloor: '0.00',
  proposedAmount: null,
  proposedDay: null,
  alternativeDay: null,
  flows: [],
});
const blankInput = (purpose: ReviewPurpose, taskId: string | null = null): DecisionInput => ({
  title: '',
  purpose,
  transactionEntity: '',
  reportTaskId: taskId,
  promise: '',
  external: purpose === 'external' ? blankExternal() : null,
  datedCash: purpose === 'handover' ? blankCash() : null,
});
const slotNames: Record<DecisionEvidenceSlot, [string, string]> = {
  identity: ['合同、收款与退款主体', 'Contract, payee and refund entities'],
  terms: ['付款、交付与退款条件', 'Payment, delivery and refund terms'],
  paid: ['已付款记录', 'Payment already made'],
  delivered: ['已交付记录', 'Delivered value'],
  refunded: ['实际退款记录', 'Actual refund'],
  'opening-cash': ['当前可用现金', 'Current available cash'],
  'cash-flow': ['收付款事件', 'Cash event'],
  collections: ['回款解释材料', 'Collection evidence'],
  inventory: ['存货解释材料', 'Inventory evidence'],
};
const evidenceName = (slot: DecisionEvidenceSlot, t: Translate) => t(...slotNames[slot]);
const explanationEvidenceState = (
  state: NonNullable<
    DecisionDetail['evaluation']['explanations'][number]['evidenceReview']
  >['status'],
  t: Translate
) =>
  ({
    missing: t('尚缺材料', 'Material missing'),
    withdrawn: t('材料已撤回', 'Material withdrawn'),
    'out-of-scope': t('主体或日期不符', 'Entity or date differs'),
    conflict: t('材料存在冲突', 'Evidence conflict'),
    unlocated: t('字段尚未定位', 'Fields not located'),
    'context-only': t('仅有陈述或假设', 'Statements or assumptions only'),
    ready: t('材料可供核对', 'Material available for review'),
  })[state];
const gateState = (state: DecisionGate['status'], t: Translate) =>
  ({
    matched: t('字段匹配', 'Fields match'),
    unknown: t('待补材料', 'Evidence needed'),
    conflict: t('记录冲突', 'Conflicting records'),
    'out-of-scope': t('范围不符', 'Out of scope'),
    withdrawn: t('依据已撤回', 'Evidence withdrawn'),
    'condition-unmet': t('条件未满足', 'Condition unmet'),
  })[state];
const kindName = (kind: DecisionEvidence['kind'], t: Translate, bound = false) =>
  kind === 'source-record'
    ? bound
      ? t('已关联材料记录', 'Record linked to material')
      : t('用户转录记录', 'User-transcribed record')
    : kind === 'counterparty-statement'
      ? t('对方陈述', 'Counterparty statement')
      : t('情景假设', 'Assumption');
const revisionName = (reason: string, t: Translate) =>
  ({
    created: t('创建', 'Created'),
    edited: t('修改输入', 'Inputs edited'),
    'evidence-added': t('加入材料', 'Evidence added'),
    'evidence-withdrawn': t('撤回材料', 'Evidence withdrawn'),
    'evidence-restored': t('恢复材料', 'Evidence restored'),
    'scope-corrected': t('更正适用范围', 'Scope corrected'),
    'restored-version': t('恢复历史版本并重算', 'Historical version restored and recalculated'),
  })[reason] || reason;

export function Decisions({ query }: { query: URLSearchParams }) {
  const { t, locale, user, workspace, navigate, execute, busy, confirm, showEvidence } = useApp();
  const id = query.get('id');
  const requestedRevision = query.get('revision');
  const isNew = query.has('new');
  const purpose: ReviewPurpose = query.get('new') === 'handover' ? 'handover' : 'external';
  const [list, setList] = useState<DecisionSummary[]>([]);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [input, setInput] = useState<DecisionInput>(() => {
    const linkedTask = workspace?.tasks.find((task) => task.id === query.get('task'));
    const value = blankInput(purpose, linkedTask?.id || null);
    value.transactionEntity = linkedTask?.company || '';
    if (isNew && query.get('start') === '1') {
      try {
        const draft: unknown = JSON.parse(sessionStorage.getItem('cashlens.start-draft') || 'null');
        if (
          draft &&
          typeof draft === 'object' &&
          'kind' in draft &&
          'text' in draft &&
          draft.kind === purpose &&
          typeof draft.text === 'string'
        ) {
          value.promise = draft.text;
          const intent = interpretStart(draft.text, purpose);
          value.transactionEntity = intent.companyQuery || value.transactionEntity;
          if (value.external) value.external.proposedAmount = intent.proposedAmount;
          if (value.datedCash) value.datedCash.proposedAmount = intent.proposedAmount;
        }
      } catch {
        /* A missing or invalid local draft leaves the form empty. */
      }
    }
    return value;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [editing, setEditing] = useState(isNew);
  const [focusInput, setFocusInput] = useState<string | null>(null);
  useEffect(() => {
    if (!editing || !focusInput) return;
    const field = document.getElementById(focusInput);
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    setFocusInput(null);
  }, [editing, focusInput]);
  const [evidenceSlot, setEvidenceSlot] = useState<DecisionEvidenceSlot | null>(null);
  const [scopeEvidence, setScopeEvidence] = useState<DecisionEvidence | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<{
    ownerId: string;
    detail: DecisionDetail;
  } | null>(null);
  useEffect(() => setExportSnapshot(null), [id, requestedRevision, user?.id]);
  const [section, setSection] = useState<
    'overview' | 'scenarios' | 'conditions' | 'evidence' | 'history'
  >('overview');
  const [viewedEvidenceId, setViewedEvidenceId] = useState<string | null>(null);
  const viewedEvidence = detail?.version.evidence.find((item) => item.id === viewedEvidenceId);
  useEffect(() => {
    if (isNew && query.get('start') === '1') sessionStorage.removeItem('cashlens.start-draft');
  }, []);
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const readOnly = Boolean(detail && detail.version.revision !== detail.decision.currentRevision);
  useEffect(() => {
    const controller = new AbortController();
    if (id) {
      setLoading(true);
      void api<DecisionDetail>(
        `/decisions/${id}${requestedRevision ? `?revision=${encodeURIComponent(requestedRevision)}` : ''}`,
        { signal: controller.signal }
      )
        .then((next) => {
          setDetail(next);
          setInput(next.version.input);
          setError('');
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(requestErrorText(cause, locale));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    } else if (!isNew)
      void api<DecisionSummary[]>('/decisions', { signal: controller.signal })
        .then(setList)
        .catch((cause) => {
          if (!controller.signal.aborted) setError(requestErrorText(cause, locale));
        });
    return () => controller.abort();
  }, [id, requestedRevision, reload]);
  const setPurpose = (next: ReviewPurpose) =>
    setInput((prev) => ({
      ...prev,
      purpose: next,
      external: prev.external || (next === 'external' ? blankExternal() : null),
      datedCash: prev.datedCash || (next === 'handover' ? blankCash() : null),
    }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = {
      ...input,
      title:
        input.title.trim() ||
        `${input.transactionEntity.trim()} · ${input.purpose === 'external' ? t('预付款', 'Prepayment') : t('接手核查', 'Handover review')}`.slice(
          0,
          200
        ),
      transactionEntity: input.transactionEntity.trim(),
      external: input.purpose === 'external' ? input.external : null,
      datedCash: input.purpose === 'handover' ? input.datedCash : null,
    };
    const result = await execute(
      () =>
        id && detail
          ? api<DecisionDetail>(`/decisions/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                baseRevision: detail.decision.currentRevision,
                input: normalized,
              }),
            })
          : post<DecisionDetail>('/decisions', normalized),
      t('事项已保存', 'Review saved')
    );
    if (result) {
      setDetail(result);
      setInput(result.version.input);
      setEditing(false);
      navigate(`/decisions?id=${result.decision.id}`);
    }
  };
  const updateEvidence = async (evidence: DecisionEvidence) => {
    if (!detail) return;
    const result = await execute(
      () =>
        api<DecisionDetail>(`/decisions/${detail.decision.id}/evidence/${evidence.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            baseRevision: detail.decision.currentRevision,
            state: evidence.state === 'active' ? 'withdrawn' : 'active',
          }),
        }),
      t('证据变化已保存并重算', 'Evidence change saved and recalculated')
    );
    if (result) {
      setDetail(result);
      setInput(result.version.input);
    }
  };
  const addEvidence = async (evidence: DecisionEvidenceInput) => {
    if (!detail) return;
    const result = await execute(
      () =>
        post<DecisionDetail>(`/decisions/${detail.decision.id}/evidence`, {
          baseRevision: detail.decision.currentRevision,
          evidence,
        } satisfies AddDecisionEvidenceInput),
      t('材料已记录并重新核对', 'Evidence recorded and rechecked')
    );
    if (result) {
      setDetail(result);
      setEvidenceSlot(null);
    }
  };
  const restore = () =>
    detail &&
    confirm({
      title: t('恢复这个版本并重新核算？', 'Restore this version and recalculate?'),
      text: t(
        '将以该版本输入与材料创建新版本。测算日期、付款时点和来源是否仍适用，需要重新复核。',
        'A new version will use these inputs and evidence. Recheck whether the calculation date, payment timing and sources still apply.'
      ),
      action: async () => {
        const result = await execute(
          () =>
            post<DecisionDetail>(`/decisions/${detail.decision.id}/restore`, {
              baseRevision: detail.decision.currentRevision,
              revision: detail.version.revision,
            }),
          t('已创建恢复版本，请复核日期', 'Restored version created; review the date')
        );
        if (result) navigate(`/decisions?id=${result.decision.id}`);
      },
    });
  const correctScope = async (entity: string, asOf: string | null, reason: string) => {
    if (!detail || !scopeEvidence) return;
    const result = await execute(
      () =>
        post<DecisionDetail>(
          `/decisions/${detail.decision.id}/evidence/${scopeEvidence.id}/scope`,
          {
            baseRevision: detail.decision.currentRevision,
            entity,
            asOf,
            reason,
          }
        ),
      t('适用范围已更正并重算', 'Scope corrected and recalculated')
    );
    if (result) {
      setDetail(result);
      setInput(result.version.input);
      setScopeEvidence(null);
    }
  };
  const exportDetail = () => {
    if (!detail || loading || !user) return;
    setExportSnapshot({ ownerId: user.id, detail: structuredClone(detail) });
  };
  const blocking = detail?.evaluation.gates.find(
    (gate) => gate.status !== 'matched' && gate.id !== 'historical-scope'
  );
  const nextAction = detail?.evaluation.nextActions[0];
  const nextExistingRecord =
    nextAction &&
    ['request-alternative-terms', 'request-collections', 'request-inventory'].includes(
      nextAction.id
    )
      ? nextAction.dependencies.find(
          (dependency) =>
            dependency.kind === 'evidence' &&
            dependency.state === 'matched' &&
            dependency.binding === 'source-located' &&
            detail?.version.evidence.some(
              (record) => record.id === dependency.id && record.state === 'active'
            )
        )
      : undefined;
  const nextNeedsExposureLimit = Boolean(
    nextAction?.gateIds.includes('exposure-condition') &&
      detail?.version.input.external?.exposureLimit === null
  );
  const nextSlot =
    nextAction &&
    detail?.evaluation.gates.find((gate) => nextAction.gateIds.includes(gate.id))?.neededSlots[0];
  const translated = (text: string) => (locale === 'en' ? decisionText(text) : text);
  const relatedTask = workspace?.tasks.find(
    (task) => task.id === detail?.version.input.reportTaskId
  );
  const relatedReport = relatedTask?.report;
  const relatedFinding = relatedReport?.findings.find(
    (finding) =>
      finding.sourceRefs.length > 0 &&
      finding.questionIds.some((id) =>
        relatedReport.questions.some((question) => question.id === id)
      )
  );
  const relatedQuestion = relatedReport?.questions.find((question) =>
    relatedFinding?.questionIds.includes(question.id)
  );

  return (
    <div className="decisions-page">
      <PageHeading
        title={t('核查事项', 'Reviews')}
        description={t(
          '从财务发现出发，核对相关材料和当前安排。',
          'Follow financial findings into evidence and current arrangements.'
        )}
        action={
          !id && !isNew ? (
            <button
              className="button button-primary"
              onClick={() => navigate('/decisions?new=external')}
            >
              <Plus size={15} />
              {t('新建事项', 'New review')}
            </button>
          ) : id ? (
            <button className="text-link" onClick={() => navigate('/decisions')}>
              {t('全部事项', 'All reviews')}
            </button>
          ) : undefined
        }
      />
      {error && (
        <div className="inline-error">
          <span>{error}</span>
          <button className="text-link" onClick={() => setReload((n) => n + 1)}>
            {t('重新读取', 'Reload')}
          </button>
        </div>
      )}
      {loading && (
        <div className="loading-page">
          <LoaderCircle className="spinner" />
          {t('读取任务…', 'Loading task…')}
        </div>
      )}
      {!id && !isNew && (
        <>
          {list.length > 0 && (
            <div className="decision-entry-actions">
              <button
                className="button button-secondary"
                onClick={() => navigate('/decisions?new=external')}
              >
                {t('付款前核对', 'Before payment')}
                <ArrowRight size={15} />
              </button>
              <button
                className="button button-secondary"
                onClick={() => navigate('/decisions?new=handover')}
              >
                {t('接手核查', 'Company handover')}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="decision-list">
            {list.length
              ? list.map((item) => (
                  <div className="decision-list-row" key={item.id}>
                    <button onClick={() => navigate(`/decisions?id=${item.id}`)}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.transactionEntity} · {t('版本', 'Version')} {item.currentRevision} ·{' '}
                        {date(item.updatedAt, locale)}
                      </span>
                    </button>
                  </div>
                ))
              : !error &&
                !loading && (
                  <EmptyState
                    title={t('暂无核查事项', 'No reviews yet')}
                    icon={<ListChecks size={25} strokeWidth={1.4} />}
                    text={t(
                      '付款前核对签约、收款与履约约定；接手核查现有财务问题和收付款安排。',
                      'Check contract, payee and delivery terms before payment, or financial questions and cash arrangements before a handover.'
                    )}
                    action={
                      <div className="empty-state-actions">
                        <button
                          className="button button-primary"
                          onClick={() => navigate('/decisions?new=external')}
                        >
                          {t('付款前核对', 'Before payment')}
                          <ArrowRight size={15} />
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => navigate('/decisions?new=handover')}
                        >
                          {t('接手核查', 'Company handover')}
                        </button>
                      </div>
                    }
                  />
                )}
          </div>
        </>
      )}
      {(editing || isNew) && (
        <form className="decision-input-form" onSubmit={save}>
          <fieldset className="new-purpose">
            <legend>{t('事项类型', 'Review type')}</legend>
            <div className="purpose-options">
              {(['external', 'handover'] as const).map((value) => (
                <label
                  className={`purpose-option ${input.purpose === value ? 'selected' : ''}`}
                  key={value}
                >
                  <input
                    type="radio"
                    name="decision-purpose"
                    checked={input.purpose === value}
                    onChange={() => setPurpose(value)}
                  />
                  <strong>
                    {value === 'external'
                      ? t('付款前核对', 'Before payment')
                      : t('接手核查', 'Company handover')}
                  </strong>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="decision-form-grid">
            <label className="form-field">
              <span id="decision-company-label">
                {t('公司或商家名称', 'Company or merchant name')}
              </span>
              <input
                required
                aria-labelledby="decision-company-label"
                aria-describedby="decision-company-note"
                maxLength={200}
                value={input.transactionEntity}
                onChange={(e) => setInput({ ...input, transactionEntity: e.target.value })}
              />
              <small id="decision-company-note" className="field-note">
                {t(
                  '暂按你提供的名称保存；尚未确认合同责任主体。',
                  'Saved under the name you provide; the contract-responsible entity is not yet confirmed.'
                )}
              </small>
            </label>
            <MoneyField
              label={t('本次拟付款', 'Proposed payment')}
              value={
                input.purpose === 'external'
                  ? (input.external?.proposedAmount ?? null)
                  : (input.datedCash?.proposedAmount ?? null)
              }
              onChange={(value) =>
                setInput(
                  input.purpose === 'external'
                    ? {
                        ...input,
                        external: { ...(input.external || blankExternal()), proposedAmount: value },
                      }
                    : {
                        ...input,
                        datedCash: { ...(input.datedCash || blankCash()), proposedAmount: value },
                      }
                )
              }
            />
          </div>
          <label className="form-field">
            <span>
              {t(
                '任务说明或对方原话（可选）',
                'Your description or counterparty’s words (optional)'
              )}
            </span>
            <textarea
              maxLength={2000}
              rows={2}
              value={input.promise}
              onChange={(e) => setInput({ ...input, promise: e.target.value })}
            />
          </label>
          {input.purpose === 'handover' && (
            <div className="decision-cash-import">
              <CashPlanImport
                current={input.datedCash}
                onChange={(datedCash) => setInput((current) => ({ ...current, datedCash }))}
              />
              {!!input.datedCash?.flows.length && (
                <p className="field-note" role="status">
                  {t(
                    `${input.datedCash.flows.length} 项收付款计划 · 起点 ${input.datedCash.asOf} · 保存后核对`,
                    `${input.datedCash.flows.length} planned cash events · as of ${input.datedCash.asOf} · save to review`
                  )}
                </p>
              )}
            </div>
          )}
          <details className="decision-input-details" open={!isNew}>
            <summary>{t('补充计算条件', 'Add calculation conditions')}</summary>
            <p className="field-note">
              {t(
                '暂缺的付款、交付、退款与现金记录保留未知，保存不会填零。',
                'Missing payment, delivery, refund and cash records stay unknown. Saving does not fill them with zero.'
              )}
            </p>
            <label className="form-field">
              <span>{t('事项名称（可选）', 'Name (optional)')}</span>
              <input
                maxLength={200}
                value={input.title}
                onChange={(e) => setInput({ ...input, title: e.target.value })}
                placeholder={t('按公司和决定自动命名', 'Named from the company and decision')}
              />
            </label>
            <DecisionInputs input={input} onChange={setInput} />
            <details className="decision-financial-binding">
              <summary>
                {t('关联历史财务核查（可选）', 'Link a historical financial review (optional)')}
              </summary>
              <label className="form-field">
                <span>{t('选择本账号核查', 'Select your review')}</span>
                <Select
                  value={input.reportTaskId || ''}
                  onValueChange={(selectedValue) =>
                    setInput({ ...input, reportTaskId: selectedValue || null })
                  }
                >
                  <option value="">{t('不关联', 'No linked review')}</option>
                  {workspace?.tasks
                    .filter((task) => task.report)
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.company} · {task.year} · {task.title}
                      </option>
                    ))}
                </Select>
              </label>
              <p className="field-note">
                {t(
                  '集团年报不能代替子公司的合同责任或当前资金。',
                  'A group annual report does not establish a subsidiary’s contract responsibility or current funds.'
                )}
              </p>
            </details>
          </details>
          <div className="decision-form-actions">
            <button className="button button-primary" disabled={busy}>
              <Check size={15} />
              {id
                ? t('保存新版本并重算', 'Save new version and recalculate')
                : t('保存并核对', 'Save and review')}
            </button>
            {id && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setInput(detail!.version.input);
                  setEditing(false);
                }}
              >
                {t('取消修改', 'Cancel edits')}
              </button>
            )}
          </div>
          <p className="field-note">
            {t(
              '留空为未知，0须明确填写。任务说明和材料记录仅保存在本账号，不发送到外部模型。',
              'Blank means unknown; enter zero explicitly. Descriptions and evidence stay in your account and are not sent to an external model.'
            )}
          </p>
        </form>
      )}
      {detail && !editing && (
        <EvidenceRecordContext.Provider value={setViewedEvidenceId}>
          <div className="decision-detail-heading">
            <div>
              <h2>{detail.version.input.title}</h2>
              <p>
                {detail.version.input.transactionEntity} · {t('版本', 'Version')}{' '}
                {detail.version.revision} · {date(detail.version.createdAt, locale)}
              </p>
            </div>
            <ActionMenu
              label={t('事项操作', 'Review actions')}
              items={[
                {
                  label: t('预览并导出这个版本', 'Preview and export this version'),
                  icon: <Download size={15} />,
                  onSelect: exportDetail,
                  disabled: loading,
                },
                {
                  label: t('重新读取', 'Reload'),
                  onSelect: () => setReload((value) => value + 1),
                  disabled: loading,
                },
                ...(!readOnly
                  ? [{ label: t('修改输入', 'Edit inputs'), onSelect: () => setEditing(true) }]
                  : []),
              ]}
            />
          </div>
          <nav className="decision-local-nav" aria-label={t('事项内容', 'Review sections')}>
            {(
              [
                ['overview', t('下一步', 'Next step')],
                ['scenarios', t('方案比较', 'Compare options')],
                ['conditions', t('条件', 'Conditions')],
                ['evidence', t('材料', 'Evidence')],
                ['history', t('版本', 'Versions')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-current={section === value ? 'page' : undefined}
                aria-controls={`decision-panel-${value}`}
                onClick={() => setSection(value)}
              >
                {label}
                {value === 'evidence' && <span>{detail.version.evidence.length}</span>}
              </button>
            ))}
          </nav>
          {readOnly && (
            <p className="decision-history-notice">
              {t(
                '正在查看历史版本。修改前请返回当前版本，或恢复为一个新版本。',
                'You are viewing history. Return to the current version to edit, or restore this as a new version.'
              )}
              <button className="text-link" onClick={() => navigate(`/decisions?id=${id}`)}>
                {t('返回当前版本', 'Current version')}
              </button>
            </p>
          )}
          <div id="decision-panel-history" hidden={section !== 'history'}>
            <div className="decision-version-bar">
              <History size={15} />
              <label>
                {t('版本回放', 'Version replay')}
                <Select
                  value={detail.version.revision}
                  onValueChange={(selectedValue) =>
                    navigate(`/decisions?id=${id}&revision=${selectedValue}`)
                  }
                >
                  {detail.revisions.map((version) => (
                    <option key={version.revision} value={version.revision}>
                      V{version.revision} · {revisionName(version.reason, t)} ·{' '}
                      {date(version.createdAt, locale)}
                    </option>
                  ))}
                </Select>
              </label>
              {readOnly ? (
                <>
                  <Tag>{t('历史版本 · 只读', 'Historical version · read only')}</Tag>
                  <button className="text-link" onClick={restore}>
                    <RotateCcw size={14} />
                    {t('恢复并重新核算', 'Restore and recalculate')}
                  </button>
                  <button className="text-link" onClick={() => navigate(`/decisions?id=${id}`)}>
                    {t('返回当前版本', 'Current version')}
                  </button>
                </>
              ) : (
                <Tag>{t('当前版本', 'Current version')}</Tag>
              )}
            </div>
            <div className="decision-revision-list">
              {detail.revisions.map((version) => (
                <button
                  key={version.revision}
                  className={version.revision === detail.version.revision ? 'selected' : ''}
                  onClick={() => navigate(`/decisions?id=${id}&revision=${version.revision}`)}
                >
                  <strong>V{version.revision}</strong>
                  <span>{revisionName(version.reason, t)}</span>
                  <time>{date(version.createdAt, locale)}</time>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
          {detail.version.reason === 'restored-version' && (
            <p className="decision-restored-note">
              {t(
                '已按历史输入重新核算。请复核测算日期和付款时点，历史记录不代表今天的资金。',
                'Recalculated from historical inputs. Recheck dates and payment timing; historical records do not establish today’s funds.'
              )}
            </p>
          )}
          <div id="decision-panel-overview" hidden={section !== 'overview'}>
            {detail.version.input.promise && (
              <details className="decision-description">
                <summary>{t('任务说明 · 用户提供', 'Description · supplied by you')}</summary>
                <p>{detail.version.input.promise}</p>
              </details>
            )}
            {relatedReport && relatedTask && (
              <section className="decision-research-context">
                <div className="decision-research-heading">
                  <span className="field-note">
                    {t('关联财务研究 · 当前报告', 'Related research · current report')} ·{' '}
                    {relatedReport.company} · {relatedReport.year}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => navigate(`/tasks/${relatedTask.id}`)}
                  >
                    {t('查看报告', 'Open report')} <ArrowUpRight size={14} />
                  </button>
                </div>
                {relatedFinding ? (
                  <>
                    <h3>{t(relatedFinding.label, translateRule(relatedFinding.label))}</h3>
                    <p>
                      {t(relatedFinding.explanation, translateRule(relatedFinding.explanation))}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => showEvidence(relatedFinding.sourceRefs, relatedReport)}
                    >
                      <FileText size={14} /> {t('核对原文', 'Check source')}
                    </button>
                    {relatedQuestion && (
                      <div className="decision-research-question">
                        <span className="field-note">
                          {t('由此追问', 'Follow-up from this finding')}
                        </span>
                        <p>
                          {t(
                            relatedQuestion.requestedEvidence,
                            translateRule(relatedQuestion.requestedEvidence)
                          )}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p>{t(relatedReport.summary, translateRule(relatedReport.summary))}</p>
                )}
                {readOnly && (
                  <p className="field-note">
                    {t(
                      '关联任务当前报告独立于此历史输入版本。',
                      'The linked task’s current report is separate from this historical input version.'
                    )}
                  </p>
                )}
                <p className="field-note decision-research-scope">
                  {relatedReport.company.trim() !== detail.version.input.transactionEntity.trim()
                    ? t(
                        `研究主体为${relatedReport.company}，事项主体为${detail.version.input.transactionEntity}；两者尚未确认一致。`,
                        `The research concerns ${relatedReport.company}; this review concerns ${detail.version.input.transactionEntity}. They are not confirmed to be the same entity.`
                      )
                    : t(
                        '历史披露用于提出核查问题；当前现金、交易主体和条款需各自提供依据。',
                        'Historical disclosure informs follow-up questions. Current cash, transaction entities and terms need their own evidence.'
                      )}
                </p>
              </section>
            )}
            <section className="decision-next">
              <div>
                <span className="field-note">{t('当前阻断项', 'Current blocker')}</span>
                <h3>
                  {blocking
                    ? translated(blocking.label)
                    : t('已提供字段匹配记录', 'Provided fields have matching records')}
                </h3>
                <p>
                  {blocking
                    ? translated(blocking.summary)
                    : t(
                        '字段匹配不等于平台鉴真，也不是付款批准。',
                        'Field matching is not authentication or payment approval.'
                      )}
                </p>
              </div>
              {nextAction && (
                <div>
                  <span className="field-note">{t('下一步先做', 'Next action')}</span>
                  <h3>{translated(nextAction.title)}</h3>
                  <p>{translated(nextAction.requestedEvidence)}</p>
                  <button
                    className="text-link decision-copy-question"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${detail.version.input.transactionEntity}：${translated(nextAction.requestedEvidence)}`
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2200);
                      } catch (cause) {
                        setError(
                          t(
                            '未能复制，请选择上方询问文字复制。',
                            'Could not copy. Select the request text above and copy it.'
                          )
                        );
                      }
                    }}
                  >
                    {copied ? t('已复制', 'Copied') : t('复制询问', 'Copy request')}
                  </button>
                  {!readOnly && (
                    <button
                      className="button button-primary"
                      onClick={() => {
                        const gate = detail.evaluation.gates.find((g) =>
                          nextAction.gateIds.includes(g.id)
                        );
                        if (nextNeedsExposureLimit) {
                          setFocusInput('decision-exposure-limit');
                          setEditing(true);
                        } else if (nextExistingRecord) setViewedEvidenceId(nextExistingRecord.id);
                        else if (gate?.neededSlots[0]) setEvidenceSlot(gate.neededSlots[0]);
                        else if (nextAction.id === 'request-collections')
                          setEvidenceSlot('collections');
                        else if (nextAction.id === 'request-inventory')
                          setEvidenceSlot('inventory');
                        else setEditing(true);
                      }}
                    >
                      {nextNeedsExposureLimit
                        ? t('设置上限', 'Set your limit')
                        : nextExistingRecord
                          ? t('核对已有材料', 'Review provided material')
                          : nextSlot ||
                              ['request-collections', 'request-inventory'].includes(nextAction.id)
                            ? t('添加这项材料', 'Add this evidence')
                            : t('补充输入', 'Complete inputs')}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
            </section>
            {detail.evaluation.knownConflicts.some((issue) =>
              conflictOpen(issue, detail.version.revision)
            ) && (
              <section className="decision-known-conflicts">
                <h3>{t('仍未解释的冲突', 'Unresolved conflicts')}</h3>
                {detail.evaluation.knownConflicts
                  .filter((issue) => conflictOpen(issue, detail.version.revision))
                  .map((issue) => (
                    <div key={issue.id}>
                      <strong>
                        {evidenceName(issue.slot, t)} · {issue.entity}
                      </strong>
                      <span>
                        {t('首次记录于版本', 'First recorded in version')}{' '}
                        {issue.introducedRevision}
                      </span>
                      <p>{translated(issue.message)}</p>
                    </div>
                  ))}
              </section>
            )}
          </div>
          <div hidden={section !== 'history'}>
            {detail.evaluation.knownConflicts.some(
              (issue) => !conflictOpen(issue, detail.version.revision)
            ) && (
              <details className="decision-scope-history">
                <summary>{t('范围更正记录', 'Scope corrections')}</summary>
                {detail.evaluation.knownConflicts
                  .filter((issue) => !conflictOpen(issue, detail.version.revision))
                  .map((issue) => (
                    <div key={issue.id}>
                      <strong>
                        {evidenceName(issue.slot, t)} · {issue.entity}
                      </strong>
                      <p>{translated(issue.resolutionReason || '')}</p>
                      <span>
                        {t('更正记录版本', 'Correction version')} {issue.resolvedRevision}
                      </span>
                    </div>
                  ))}
              </details>
            )}
          </div>
          <div id="decision-panel-scenarios" hidden={section !== 'scenarios'}>
            <DecisionScenarios detail={detail} />
          </div>
          <div id="decision-panel-conditions" hidden={section !== 'conditions'}>
            <section className="decision-gates">
              <div className="report-section-title">
                <h3>{t('条件与依据', 'Conditions and dependencies')}</h3>
                <span className="field-note">
                  {t('局部结论随相关证据变化', 'Local results follow relevant evidence')}
                </span>
              </div>
              {detail.evaluation.gates.map((gate) => (
                <details key={gate.id} className={`decision-gate decision-gate-${gate.status}`}>
                  <summary>
                    <strong>{translated(gate.label)}</strong>
                    <Tag>{gateState(gate.status, t)}</Tag>
                    <ChevronDown size={14} />
                  </summary>
                  <p>{translated(gate.summary)}</p>
                  <Dependencies detail={detail} dependencies={gate.dependencies} />
                  {!readOnly &&
                    gate.neededSlots.map((slot) => (
                      <button
                        key={slot}
                        className="text-link"
                        onClick={() => setEvidenceSlot(slot)}
                      >
                        <Plus size={14} />
                        {evidenceName(slot, t)}
                      </button>
                    ))}
                </details>
              ))}
            </section>
            {detail.version.input.reportTaskId && detail.evaluation.explanations.length > 0 && (
              <section className="decision-explanations">
                <h3>{t('待区分的经营解释', 'Operating explanations to distinguish')}</h3>
                {detail.evaluation.explanations.map((item) => (
                  <div key={item.id} className="decision-explanation">
                    <h4>
                      {item.id === 'collections'
                        ? t('回款', 'Collections')
                        : t('存货', 'Inventory')}
                    </h4>
                    <div className="decision-explanation-status">
                      <span>{t('历史财务信号', 'Historical financial signal')}</span>
                      <Tag>
                        {item.state === 'withheld'
                          ? t('依据不足，暂不归因', 'Insufficient evidence; attribution withheld')
                          : t('可提示核查', 'Available for follow-up')}
                      </Tag>
                    </div>
                    {item.state === 'open' && (
                      <ol>
                        {item.alternatives.map((text, i) => (
                          <li key={i}>{translated(text)}</li>
                        ))}
                      </ol>
                    )}
                    <Dependencies
                      detail={detail}
                      dependencies={item.dependencies.filter(
                        (dependency) => dependency.kind === 'financial'
                      )}
                    />
                    {item.evidenceReview ? (
                      <div
                        className="decision-explanation-evidence"
                        data-state={item.evidenceReview.status}
                      >
                        <div className="decision-explanation-status">
                          <span>{t('区分材料', 'Distinguishing evidence')}</span>
                          <Tag>{explanationEvidenceState(item.evidenceReview.status, t)}</Tag>
                        </div>
                        <p className="field-note">
                          {detail.version.input.transactionEntity} ·{' '}
                          {item.evidenceReview.asOf ||
                            t('适用日期未提供', 'Applicable date missing')}
                        </p>
                        <p>{translated(item.evidenceReview.summary)}</p>
                        <Dependencies
                          detail={detail}
                          dependencies={item.evidenceReview.dependencies}
                        />
                      </div>
                    ) : (
                      <Dependencies
                        detail={detail}
                        dependencies={item.dependencies.filter(
                          (dependency) => dependency.kind !== 'financial'
                        )}
                      />
                    )}
                    <p className="decision-explanation-next">{translated(item.nextEvidence)}</p>
                    {detail.evaluation.nextActions.some((action) =>
                      action.id.startsWith(`investigate-${item.id}-`)
                    ) && (
                      <details className="decision-specific-requests">
                        <summary>
                          {t('这项信号与当前收款事件', 'This signal and current receipt events')}
                        </summary>
                        {detail.evaluation.nextActions
                          .filter((action) => action.id.startsWith(`investigate-${item.id}-`))
                          .map((action) => (
                            <div key={action.id}>
                              <h4>{translated(action.title)}</h4>
                              <p>{translated(action.reason)}</p>
                              <p>{translated(action.requestedEvidence)}</p>
                              <Dependencies detail={detail} dependencies={action.dependencies} />
                              <CopyRequest text={translated(action.requestedEvidence)} />
                            </div>
                          ))}
                      </details>
                    )}

                    {!readOnly && (
                      <button
                        className="text-link"
                        onClick={() => {
                          const record =
                            item.evidenceReview?.status === 'ready'
                              ? item.evidenceReview.dependencies.find(
                                  (dependency) =>
                                    dependency.kind === 'evidence' && dependency.state === 'matched'
                                )
                              : undefined;
                          if (record) setViewedEvidenceId(record.id);
                          else setEvidenceSlot(item.id);
                        }}
                      >
                        {item.evidenceReview?.status === 'ready'
                          ? t('核对已有材料', 'Review provided material')
                          : t('记录区分材料', 'Record distinguishing evidence')}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>
          <div id="decision-panel-evidence" hidden={section !== 'evidence'}>
            <section className="decision-evidence">
              <div className="report-section-title">
                <h3>{t('证据记录', 'Evidence records')}</h3>
                {!readOnly && (
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      setEvidenceSlot(input.purpose === 'external' ? 'identity' : 'opening-cash')
                    }
                  >
                    <Plus size={15} />
                    {t('记录材料', 'Record evidence')}
                  </button>
                )}
              </div>
              <p className="field-note">
                {t(
                  '来源记录、对方陈述与假设分别保留。撤回会创建新版本；无关财报事实保留。',
                  'Records, counterparty statements and assumptions remain distinct. Withdrawing creates a new version; unrelated financial facts remain.'
                )}
              </p>
              {detail.version.evidence.length ? (
                <div className="decision-evidence-list">
                  {detail.version.evidence.map((evidence) => (
                    <button
                      key={evidence.id}
                      className={`decision-evidence-card ${evidence.state}`}
                      aria-label={`${evidenceName(evidence.slot, t)} · ${evidence.entity} · ${evidence.state === 'active' ? t('当前采用', 'Active') : t('已撤回', 'Withdrawn')}`}
                      onClick={() => setViewedEvidenceId(evidence.id)}
                    >
                      <div>
                        <FileText size={17} />
                        <strong>{evidenceName(evidence.slot, t)}</strong>
                        <ArrowUpRight size={15} />
                      </div>
                      <span>
                        {evidence.entity} · {evidence.asOf || t('日期未提供', 'Date missing')}
                      </span>
                      <p>{evidence.quote}</p>
                      <footer>
                        <Tag>{kindName(evidence.kind, t, evidence.materialId != null)}</Tag>
                        {evidence.state === 'withdrawn' && <Tag>{t('已撤回', 'Withdrawn')}</Tag>}
                      </footer>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="decision-empty-evidence">
                  <FileText size={24} />
                  <h4>{t('尚未提供材料', 'No evidence yet')}</h4>
                  <p>
                    {t(
                      '输入金额只用于情景测算。添加记录后，核对适用主体、日期和原文。',
                      'Entered amounts are scenarios. Add records to check their entity, date and source text.'
                    )}
                  </p>
                </div>
              )}
            </section>
          </div>
          <div hidden={section !== 'overview'} className="decision-secondary-tools">
            <details className="decision-linked-tools">
              <summary>{t('财报与公司资料', 'Financial reviews and company documents')}</summary>
              {detail.version.input.reportTaskId ? (
                <a
                  className="button button-secondary"
                  href={`/tasks/${detail.version.input.reportTaskId}`}
                >
                  <FileText size={15} />
                  {t('打开关联财务核查', 'Open linked financial review')}
                </a>
              ) : (
                <p className="field-note">
                  {t(
                    '没有关联年报；这不会自动证明付款主体或当前现金。',
                    'No annual report linked. A report would not automatically establish transaction identity or current cash.'
                  )}
                </p>
              )}
              <button
                className="text-link"
                onClick={() => navigate(`/company?purpose=${detail.version.input.purpose}`)}
              >
                {t('查询公司公开资料', 'Look up company disclosures')}
                <ArrowUpRight size={14} />
              </button>
            </details>
            <details className="decision-boundaries">
              <summary>{t('计算范围与边界', 'Calculation scope and limits')}</summary>
              <ul>
                {detail.evaluation.limitations.map((text, i) => (
                  <li key={i}>{translated(text)}</li>
                ))}
              </ul>
              <p>
                {t(
                  '测算供你核对条件，不作公司安全评级，不批准或执行付款，也不代发请求。',
                  'Use these calculations to review conditions. They do not rate safety, approve payments, or send requests.'
                )}
              </p>
            </details>
          </div>
        </EvidenceRecordContext.Provider>
      )}
      {viewedEvidence && detail && (
        <Dialog
          title={evidenceName(viewedEvidence.slot, t)}
          variant="drawer"
          onClose={() => setViewedEvidenceId(null)}
        >
          <DecisionEvidenceRecord
            evidence={viewedEvidence}
            readOnly={readOnly}
            onToggle={updateEvidence}
            onCorrect={() => {
              setViewedEvidenceId(null);
              setScopeEvidence(viewedEvidence);
            }}
          />
        </Dialog>
      )}
      {evidenceSlot && detail && !readOnly && (
        <EvidenceDialog
          initialSlot={evidenceSlot}
          input={detail.version.input}
          onClose={() => setEvidenceSlot(null)}
          onSave={addEvidence}
        />
      )}
      {scopeEvidence && detail && !readOnly && (
        <ScopeDialog
          evidence={scopeEvidence}
          onClose={() => setScopeEvidence(null)}
          onSave={correctScope}
        />
      )}
      {exportSnapshot && exportSnapshot.ownerId === user?.id && (
        <ExportPreview
          title={t('导出事项版本', 'Export review version')}
          snapshotKey={`${exportSnapshot.detail.decision.id}:${exportSnapshot.detail.version.revision}`}
          sources={[
            {
              id: 'json',
              label: `JSON · ${t('版本', 'Version')} ${exportSnapshot.detail.version.revision}`,
              filename: exportFilename(
                `${exportSnapshot.detail.version.input.title}-v${exportSnapshot.detail.version.revision}`,
                'json'
              ),
              mimeType: 'application/json;charset=utf-8',
              preview: 'text',
              load: () => JSON.stringify(exportSnapshot.detail, null, 2),
            },
          ]}
          onClose={() => setExportSnapshot(null)}
        />
      )}
    </div>
  );
}

function DecisionEvidenceRecord({
  evidence,
  readOnly,
  onToggle,
  onCorrect,
}: {
  evidence: DecisionEvidence;
  readOnly: boolean;
  onToggle: (evidence: DecisionEvidence) => Promise<void>;
  onCorrect: () => void;
}) {
  const { t, busy } = useApp();
  return (
    <div
      className={`decision-evidence-record ${evidence.state === 'withdrawn' ? 'withdrawn' : ''}`}
    >
      <div className="decision-evidence-record-heading">
        <Tag>{kindName(evidence.kind, t, evidence.materialId != null)}</Tag>
        <Tag>
          {evidence.state === 'active' ? t('当前采用', 'Active') : t('已撤回', 'Withdrawn')}
        </Tag>
      </div>
      <p>
        {evidence.entity} · {evidence.asOf || t('日期未提供', 'Date missing')} ·{' '}
        {evidence.sourceLabel}
      </p>
      {evidence.kind === 'source-record' && (
        <p className="field-note">
          {evidence.materialId
            ? t(
                '字段仅与保存的材料文本核对；不认证材料。定位结果见“条件”。',
                'Fields are compared with saved text, without authentication. See Conditions for location results.'
              )
            : t(
                '用户转录，按所供输入测算；未进入已关联记录字段分支。',
                'User transcription, calculated from supplied inputs; excluded from the linked-records branch.'
              )}
        </p>
      )}
      <blockquote>{evidence.quote}</blockquote>
      <div className="decision-evidence-values">
        {Object.entries(evidence.values).map(([key, value]) => (
          <span key={key}>
            {fieldName(key, t)}:{' '}
            <strong>
              {value == null
                ? t('未知', 'Unknown')
                : key === 'role'
                  ? roleName(String(value), t)
                  : value}
            </strong>
          </span>
        ))}
      </div>
      {evidence.materialId && <SourceLink materialId={evidence.materialId} page={evidence.page} />}

      <div className="dialog-actions">
        {!readOnly && evidence.kind === 'source-record' && evidence.materialId && (
          <button className="button button-secondary" disabled={busy} onClick={onCorrect}>
            {t('更正范围', 'Correct scope')}
          </button>
        )}
        {!readOnly && (
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void onToggle(evidence)}
          >
            <RotateCcw size={14} />
            {evidence.state === 'active'
              ? t('撤回依据并重算', 'Withdraw and recalculate')
              : t('恢复依据并重算', 'Restore and recalculate')}
          </button>
        )}
      </div>
    </div>
  );
}

function ScopeDialog({
  evidence,
  onClose,
  onSave,
}: {
  evidence: DecisionEvidence;
  onClose: () => void;
  onSave: (entity: string, asOf: string | null, reason: string) => Promise<void>;
}) {
  const { t, busy } = useApp();
  const [entity, setEntity] = useState(evidence.entity);
  const [asOf, setAsOf] = useState(evidence.asOf);
  const [reason, setReason] = useState('');
  return (
    <Dialog title={t('更正适用范围', 'Correct evidence scope')} onClose={onClose}>
      <form
        className="decision-evidence-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(entity.trim(), asOf, reason.trim());
        }}
      >
        <p className="field-note">
          {t(
            '只更正这条记录的主体与日期，金额、摘录与来源保留。新范围须能在保存的材料文本中定位；更正不认证材料真实性。',
            'Only the entity and date change; amounts, excerpts and source remain. The corrected scope must be located in the saved material text. Correction does not authenticate the material.'
          )}
        </p>
        <label className="form-field">
          <span>{t('更正后的主体', 'Corrected entity')}</span>
          <input
            required
            maxLength={200}
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t('更正后的覆盖日期', 'Corrected covered date')}</span>
          <input type="date" value={asOf || ''} onChange={(e) => setAsOf(e.target.value || null)} />
        </label>
        <label className="form-field">
          <span>{t('更正原因', 'Correction reason')}</span>
          <textarea
            required
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <details className="decision-evidence-binding">
          <summary>{t('原记录（保持不变）', 'Original record (unchanged)')}</summary>
          <p>{evidence.sourceLabel}</p>
          <blockquote>{evidence.quote}</blockquote>
          <SourceLink materialId={evidence.materialId!} page={evidence.page} />
        </details>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            {t('取消', 'Cancel')}
          </button>
          <button className="button button-primary" disabled={busy}>
            {t('另存范围更正版本', 'Save scope-correction version')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function conflictOpen(
  issue: DecisionDetail['evaluation']['knownConflicts'][number],
  revision: number
) {
  const events = (issue.resolutionEvents || []).filter((event) => event.revision <= revision);
  if (events.length) return events[events.length - 1].state === 'reopened';
  return issue.resolvedRevision === undefined || issue.resolvedRevision > revision;
}
function MoneyField({
  label,
  value,
  onChange,
  required = false,
  id,
}: {
  id?: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
}) {
  const { t } = useApp();
  return (
    <label className="form-field">
      <span>
        {label}
        <small> CNY</small>
      </span>
      <input
        id={id}
        required={required}
        inputMode="decimal"
        pattern="[0-9]{1,20}([.][0-9]{1,2})?"
        placeholder={t('留空为未知', 'Blank = unknown')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </label>
  );
}
function DayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { t } = useApp();
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={90}
        step={1}
        placeholder={t('第1–90天', 'Day 1–90')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
}
function DecisionInputs({
  input,
  onChange,
}: {
  input: DecisionInput;
  onChange: (input: DecisionInput) => void;
}) {
  const { t } = useApp();
  const ext = input.external || blankExternal();
  const cash = input.datedCash || blankCash();
  const updateExternal = (patch: Partial<ExternalPaymentInput>) =>
    onChange({ ...input, external: { ...ext, ...patch } });
  const updateCash = (patch: Partial<DatedCashInput>) =>
    onChange({ ...input, datedCash: { ...cash, ...patch } });
  return input.purpose === 'external' ? (
    <section className="decision-input-section">
      <h3>{t('本次付款与未交付金额', 'This payment and undelivered value')}</h3>
      <p className="field-note">
        {t(
          '仅测算你这笔款项的暴露；不推测对方账本。退款承诺不抵实际退款。',
          'Measures exposure from your payment, not the counterparty’s books. A refund promise is not an actual refund.'
        )}
      </p>
      <div className="decision-form-grid">
        <label className="form-field">
          <span>{t('记录日期', 'Record date')}</span>
          <input
            type="date"
            required
            value={ext.asOf}
            onChange={(e) => updateExternal({ asOf: e.target.value })}
          />
        </label>
        <MoneyField
          label={t('交易总金额', 'Total transaction')}
          value={ext.totalAmount}
          onChange={(value) => updateExternal({ totalAmount: value })}
        />
        <label className="form-field">
          <span>{t('收款主体完整名称', 'Full receiving entity')}</span>
          <input
            maxLength={200}
            value={ext.payeeEntity ?? ''}
            onChange={(e) => updateExternal({ payeeEntity: e.target.value || null })}
          />
        </label>
        <label className="form-field">
          <span>{t('承担退款责任的主体', 'Entity responsible for refunds')}</span>
          <input
            maxLength={200}
            value={ext.refundEntity ?? ''}
            onChange={(e) => updateExternal({ refundEntity: e.target.value || null })}
          />
        </label>
        <MoneyField
          label={t('已付金额', 'Already paid')}
          value={ext.alreadyPaid}
          onChange={(value) => updateExternal({ alreadyPaid: value })}
        />
        <MoneyField
          label={t('已交付对应金额', 'Value already delivered')}
          value={ext.deliveredAmount}
          onChange={(value) => updateExternal({ deliveredAmount: value })}
        />
        <MoneyField
          label={t('实际已收到退款', 'Refund actually received')}
          value={ext.actualRefund}
          onChange={(value) => updateExternal({ actualRefund: value })}
        />
        <MoneyField
          id="decision-exposure-limit"
          label={t('自设未交付暴露上限', 'Your undelivered-exposure limit')}
          value={ext.exposureLimit}
          onChange={(value) => updateExternal({ exposureLimit: value })}
        />
        <MoneyField
          label={t('方案 B · 本次拟付', 'Option B · proposed payment')}
          value={ext.alternativeAmount}
          onChange={(value) => updateExternal({ alternativeAmount: value })}
        />
      </div>
    </section>
  ) : (
    <section className="decision-input-section">
      <h3>{t('付款日期与90天现金事件', 'Payment timing and 90-day cash events')}</h3>
      <p className="field-note">
        {t(
          '当前现金、预计收付与到期义务分开填写；年报不能自动填今天余额。',
          'Enter current cash, expected receipts and payment obligations separately. An annual report cannot fill today’s balance.'
        )}
      </p>
      <div className="decision-form-grid">
        <label className="form-field">
          <span>{t('测算起点日期', 'Calculation start date')}</span>
          <input
            type="date"
            required
            value={cash.asOf}
            onChange={(e) => updateCash({ asOf: e.target.value })}
          />
        </label>
        <MoneyField
          label={t('起点可用现金', 'Opening available cash')}
          value={cash.openingCash}
          onChange={(value) => updateCash({ openingCash: value })}
        />
        <MoneyField
          label={t('自设现金底线', 'Your cash floor')}
          value={cash.cashFloor}
          required
          onChange={(value) => updateCash({ cashFloor: value ?? '' })}
        />
        <DayField
          label={t('方案 A · 付款日', 'Option A · payment day')}
          value={cash.proposedDay}
          onChange={(value) => updateCash({ proposedDay: value })}
        />
        <DayField
          label={t('方案 B · 付款日', 'Option B · payment day')}
          value={cash.alternativeDay}
          onChange={(value) => updateCash({ alternativeDay: value })}
        />
      </div>
      <div className="report-section-title">
        <h4>{t('其他收付款事件', 'Other cash events')}</h4>
        <button
          type="button"
          className="button button-secondary"
          disabled={cash.flows.length >= 100}
          onClick={() =>
            updateCash({
              flows: [
                ...cash.flows,
                {
                  id: crypto.randomUUID(),
                  label: '',
                  direction: 'out',
                  day: null,
                  amount: null,
                  flexibility: 'fixed',
                },
              ],
            })
          }
        >
          <Plus size={14} />
          {t('新增事件', 'Add event')}
        </button>
      </div>
      {cash.flows.length ? (
        <div className="decision-flow-list">
          {cash.flows.map((flow, index) => (
            <div className="decision-flow-row" key={flow.id}>
              <label className="form-field">
                <span>{t('事件名称', 'Event name')}</span>
                <input
                  required
                  maxLength={200}
                  value={flow.label}
                  onChange={(e) =>
                    updateCash({
                      flows: cash.flows.map((v, i) =>
                        i === index ? { ...v, label: e.target.value } : v
                      ),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>{t('收付方向', 'Direction')}</span>
                <Select
                  value={flow.direction}
                  onValueChange={(selectedValue) =>
                    updateCash({
                      flows: cash.flows.map((v, i) =>
                        i === index ? { ...v, direction: selectedValue as 'in' | 'out' } : v
                      ),
                    })
                  }
                >
                  <option value="in">{t('收款', 'Receipt')}</option>
                  <option value="out">{t('付款', 'Payment')}</option>
                </Select>
              </label>
              <DayField
                label={t('事件日', 'Event day')}
                value={flow.day}
                onChange={(value) =>
                  updateCash({
                    flows: cash.flows.map((v, i) => (i === index ? { ...v, day: value } : v)),
                  })
                }
              />
              <MoneyField
                label={t('金额', 'Amount')}
                value={flow.amount}
                onChange={(value) =>
                  updateCash({
                    flows: cash.flows.map((v, i) => (i === index ? { ...v, amount: value } : v)),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`${t('移除事件', 'Remove event')} ${index + 1}`}
                onClick={() => updateCash({ flows: cash.flows.filter((_, i) => i !== index) })}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="field-note">
          {t(
            '尚未记录其他收付。未填写事件不表示没有义务，请对照到期计划。',
            'No other cash events entered. This does not establish the absence of obligations; review the due-date schedule.'
          )}
        </p>
      )}
    </section>
  );
}
function DecisionAmount({ value }: { value: string | null }) {
  const { t, locale } = useApp();
  return value === null ? (
    <span className="decision-amount-unknown">{t('尚未提供', 'Not provided')}</span>
  ) : (
    <>
      {money(value, locale, false)} <small>CNY</small>
    </>
  );
}
function DecisionScenarios({ detail }: { detail: DecisionDetail }) {
  const { t, locale } = useApp();
  const ext = detail.evaluation.external;
  return (
    <section className="decision-scenarios">
      <div className="report-section-title">
        <h3>{t('两个方案', 'Two options')}</h3>
        <Tag>{t('按输入测算', 'Calculated from inputs')}</Tag>
      </div>
      {ext ? (
        <>
          <p className="field-note">
            {t(
              '本次付款后暴露 = max(0, 已付 + 拟付 − 已交付对应金额 − 实际退款)。不表示整笔交易全程损失上限。',
              'Exposure after this payment = max(0, already paid + proposed payment − delivered value − actual refunds). This is not a lifetime loss limit for the transaction.'
            )}
          </p>
          <div className="decision-options">
            {ext.assumptionScenarios.map((option) => (
              <div key={option.id}>
                <span>
                  {t('方案', 'Option')} {option.id}
                </span>
                <dl>
                  <dt>{t('本次拟付', 'Proposed payment')}</dt>
                  <dd>
                    <DecisionAmount value={option.proposedAmount} />
                  </dd>
                  <dt>{t('本次付款后未交付暴露', 'Undelivered exposure after this payment')}</dt>
                  <dd>
                    <DecisionAmount value={option.exposure} />
                  </dd>
                </dl>
                <p>
                  {option.status === 'known' && option.withinLimit === null
                    ? t(
                        '自设上限尚未设置，不能核对上限条件。',
                        'Your limit is not set, so the limit condition remains unknown.'
                      )
                    : option.withinLimit === null
                      ? t(
                          '缺输入，尚无法与自设上限比较。',
                          'Missing input prevents comparison with your limit.'
                        )
                      : option.withinLimit
                        ? t(
                            '按输入计算，未超过自设上限；其他条件仍需核对。',
                            'The input-based amount is within your limit; other conditions still require review.'
                          )
                        : t(
                            '按输入计算，超过自设上限。',
                            'The input-based amount exceeds your limit.'
                          )}
                </p>
              </div>
            ))}
          </div>
          <details className="decision-record-calculation">
            <summary>
              {t('按提供记录字段核对的路径', 'Path using fields from provided records')}
            </summary>
            <p className="field-note">
              {t(
                '未关联保存材料文本的记录属于用户转录；字段匹配不代表资金或履约已被独立核实。',
                'Records not linked to saved material text are user transcriptions. Field matching does not independently verify funds or performance.'
              )}
            </p>
            <div className="decision-options">
              {ext.recordScenarios.map((option) => (
                <div key={option.id}>
                  <span>
                    {t('方案', 'Option')} {option.id}
                  </span>
                  <strong>
                    <DecisionAmount value={option.exposure} />
                  </strong>
                  <p>
                    {option.status === 'known'
                      ? t('所供字段可用于本次计算。', 'Provided fields support this calculation.')
                      : t(
                          '缺少匹配记录，保留未知。',
                          'Matching records are missing; the result stays unknown.'
                        )}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <>
          {detail.evaluation.cash && (
            <CashComparison
              value={detail.evaluation.cash}
              input={detail.version.input.datedCash!}
            />
          )}
          <details className="decision-record-calculation">
            <summary>
              {t('按提供记录字段核对的现金路径', 'Cash path using fields from provided records')}
            </summary>
            <p className="field-note">
              {t(
                '这是依据所供记录字段的测算，不是银行鉴真或资金可执行批准。',
                'A calculation based on supplied record fields, not bank authentication or payment approval.'
              )}
            </p>
            {detail.evaluation.recordedCash && (
              <CashComparison
                value={detail.evaluation.recordedCash}
                input={detail.version.input.datedCash!}
              />
            )}
          </details>
        </>
      )}
    </section>
  );
}
function CashComparison({ value, input }: { value: DatedCashComparison; input: DatedCashInput }) {
  const { t, locale } = useApp();
  const [selected, setSelected] = useState<'A' | 'B'>('A');
  const result = selected === 'A' ? value.primary : value.alternative;
  return (
    <div className="decision-cash-comparison">
      <p className="field-note">
        {t(
          '仅按已列事件测算，未列义务不等于零。只改变本次付款日，假设采购允许延期且其他收付金额、日期不变；需核对同意、供货及回款影响。',
          'Calculated only from listed events; unlisted obligations are not zero. Only this payment date changes, assuming consent to delay and unchanged other amounts and dates; review delivery and collection impacts.'
        )}
      </p>
      <div className="decision-options">
        {(
          [
            { id: 'A', result: value.primary, day: input.proposedDay },
            { id: 'B', result: value.alternative, day: input.alternativeDay },
          ] as const
        ).map((option) => (
          <div key={option.id}>
            <button
              className="decision-option-select"
              aria-pressed={selected === option.id}
              onClick={() => setSelected(option.id)}
            >
              {t('方案', 'Option')} {option.id} ·{' '}
              {option.day === null ? t('日期未知', 'Day unknown') : `D${option.day}`}
            </button>
            <dl>
              <dt>{t('最低事件日末余额', 'Lowest end-of-event-day balance')}</dt>
              <dd>
                <DecisionAmount value={option.result.minimumBalance} />
              </dd>
              <dt>{t('首次日末低于底线', 'First end-of-day shortfall')}</dt>
              <dd>
                {option.result.status === 'unknown'
                  ? t('未知', 'Unknown')
                  : option.result.firstShortfallDay === null
                    ? t('未出现', 'None')
                    : `D${option.result.firstShortfallDay} · ${money(option.result.firstShortfallGap, locale, false)} CNY`}
              </dd>
            </dl>
            {option.result.sameDayOrderSensitive && (
              <p>
                {t(
                  '日内先付仍可能缺口，查看保守次序。',
                  'Payments first may still create an intraday gap; review the conservative order.'
                )}
              </p>
            )}
            <div className="decision-period-ends">
              {option.result.periodEnds.map((period) => (
                <span key={period.day}>
                  D{period.day}
                  <strong>
                    {period.balance === null
                      ? t('尚未提供', 'Not provided')
                      : money(period.balance, locale, false)}
                  </strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="decision-cash-chart-scroll">
        {value.primary.status === 'known' && value.alternative.status === 'known' ? (
          <CashPlot
            comparison={value}
            opening={input.openingCash!}
            floor={input.cashFloor}
            selected={selected}
          />
        ) : (
          <p className="section-intro">
            {t(
              '缺少起点金额、事件金额或日期；不以0补齐现金路径。',
              'Opening cash, event amounts or dates are missing; the cash path is not filled with zeros.'
            )}
          </p>
        )}
      </div>
      {value.primary.status === 'known' && value.alternative.status === 'known' && (
        <p className="decision-chart-hint">
          {t('左右滑动查看完整现金路径。', 'Swipe to view the full cash path.')}
        </p>
      )}
      {value.primary.status === 'known' && (
        <div className="decision-cash-threshold">
          <p>
            {value.primary.thresholdStatus === 'baseline-below-floor'
              ? t(
                  '原计划已低于底线，无法据此得出可新增付款上限。',
                  'The baseline is already below the floor; it does not establish an additional-payment limit.'
                )
              : value.primary.thresholdStatus === 'known'
                ? `${t('方案A付款日，在当前计划与自设底线下的数学新增付款上限：', 'At option A’s payment date, the mathematical additional-payment ceiling under this plan and floor:')} ${money(value.primary.maximumAdditionalPayment, locale, false)} CNY`
                : t(
                    '新增付款数学限值仍未知。',
                    'The mathematical additional-payment ceiling remains unknown.'
                  )}
          </p>
          <p>
            {value.alternative.minimumCollectionStatus === 'known'
              ? `${t('方案B保持底线所需的最低整数回款比例（先付款保守条件）：', 'Minimum whole-percent collections needed for option B to maintain the floor, assuming payments occur first:')} ${value.alternative.minimumCollectionPercent}%`
              : value.alternative.minimumCollectionStatus === 'not-achievable'
                ? t(
                    '当前金额与时点下，仅调整回款比例仍不能保持底线。',
                    'Changing collections alone cannot maintain the floor under these amounts and dates.'
                  )
                : t('回款比例条件仍未知。', 'The collection condition remains unknown.')}
          </p>
        </div>
      )}
      {result.sameDayOrderSensitive && (
        <div className="decision-order-warning">
          <strong>{t('同日先后不明，次序敏感', 'Same-day order is unknown and sensitive')}</strong>
          <p>
            {t(
              '日末未出现缺口不代表日内保障；按先付款计算的最低余额：',
              'No end-of-day gap does not establish intraday coverage. Minimum balance if payments occur first:'
            )}{' '}
            {money(result.conservativeMinimumBalance, locale, false)} CNY
          </p>
        </div>
      )}
      <details className="decision-event-table">
        <summary>
          {t('逐日事件与精确金额', 'Event days and exact amounts')} · {selected}
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('日期', 'Date')}</th>
                <th>{t('收款', 'Receipts')}</th>
                <th>{t('付款', 'Payments')}</th>
                <th>{t('日末余额', 'End-of-day balance')}</th>
                <th>{t('先付款余额', 'Payments-first balance')}</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((event) => (
                <tr key={event.day}>
                  <th>
                    D{event.day} · {event.date}
                  </th>
                  <td>{money(event.inflow, locale, false)}</td>
                  <td>{money(event.outflow, locale, false)}</td>
                  <td>{money(event.balance, locale, false)}</td>
                  <td>{money(event.outflowFirstBalance, locale, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
function CopyRequest({ text }: { text: string }) {
  const { t } = useApp();
  const [state, setState] = useState('');
  return (
    <button
      className="text-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState(''), 2200);
      }}
    >
      {state === 'copied'
        ? t('已复制', 'Copied')
        : state === 'failed'
          ? t('复制失败，请选择文字复制', 'Copy failed; select the text')
          : t('复制询问', 'Copy request')}
    </button>
  );
}
function CashPlot({
  comparison,
  opening,
  floor,
  selected,
}: {
  comparison: DatedCashComparison;
  opening: string;
  floor: string;
  selected: 'A' | 'B';
}) {
  const { t, locale } = useApp();
  const cents = (value: string) => {
    const negative = value.startsWith('-');
    const [whole, frac = ''] = value.replace('-', '').split('.');
    return (BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'))) * (negative ? -1n : 1n);
  };
  const values = [
    0n,
    cents(opening),
    cents(floor),
    ...comparison.primary.events.map((e) => cents(e.balance)),
    ...comparison.alternative.events.map((e) => cents(e.balance)),
  ];
  const min = values.reduce((a, b) => (a < b ? a : b));
  const max = values.reduce((a, b) => (a > b ? a : b));
  const span = max - min || 100n;
  const y = (value: bigint) => 220 - Number(((value - min) * 1600000n) / span) / 10000;
  const points = (result: DatedCashResult) => [
    { day: 0, balance: opening },
    ...result.events,
    { day: 90, balance: result.periodEnds[2].balance! },
  ];
  const path = (result: DatedCashResult) =>
    points(result)
      .map((event, index) =>
        index
          ? `H ${54 + event.day * 6.7} V ${y(cents(event.balance))}`
          : `M ${54 + event.day * 6.7} ${y(cents(event.balance))}`
      )
      .join(' ');
  return (
    <svg
      className="decision-cash-plot"
      viewBox="0 0 720 270"
      role="img"
      aria-label={t(
        '两个方案的事件日末现金路径；精确金额见下方表。',
        'End-of-event-day cash paths for both options; exact amounts are in the table below.'
      )}
    >
      <line x1="54" x2="660" y1={y(0n)} y2={y(0n)} className="cash-zero-line" />
      <text x="12" y={y(0n) - 6}>
        0
      </text>
      {cents(floor) !== 0n && (
        <g>
          <line
            x1="54"
            x2="660"
            y1={y(cents(floor))}
            y2={y(cents(floor))}
            className="cash-floor-line"
          />
          <text x="660" y={y(cents(floor)) - 7} textAnchor="end">
            {t('底线', 'Floor')} · {money(floor, locale)} CNY
          </text>
        </g>
      )}

      {[0, 30, 60, 90].map((day) => (
        <g key={day}>
          <line
            x1={54 + day * 6.7}
            x2={54 + day * 6.7}
            y1="46"
            y2="226"
            className="cash-grid-line"
          />
          <text x={54 + day * 6.7} y="251" textAnchor="middle">
            D{day}
          </text>
        </g>
      ))}
      <path
        d={path(comparison.primary)}
        className={`cash-path cash-path-a ${selected === 'B' ? 'cash-path-muted' : ''}`}
      />
      <path
        d={path(comparison.alternative)}
        className={`cash-path cash-path-b ${selected === 'A' ? 'cash-path-muted' : ''}`}
      />
      {points(selected === 'A' ? comparison.primary : comparison.alternative).map((event, i) => (
        <circle
          key={i}
          cx={54 + event.day * 6.7}
          cy={y(cents(event.balance))}
          r="3"
          className={selected === 'A' ? 'cash-point-a' : 'cash-point-b'}
        >
          <title>
            D{event.day} · {money(event.balance, locale, false)} CNY
          </title>
        </circle>
      ))}
    </svg>
  );
}

function Dependencies({
  detail,
  dependencies,
}: {
  detail: DecisionDetail;
  dependencies: DecisionGate['dependencies'];
}) {
  const { t, locale } = useApp();
  const openRecord = useContext(EvidenceRecordContext);
  return (
    <ul className="decision-dependencies">
      {dependencies.map((dependency, index) => (
        <li key={`${dependency.kind}-${dependency.id}-${index}`}>
          <span>
            {dependency.kind === 'financial' && dependency.metric
              ? [dependency.label.match(/^(\d{4})\s/)?.[1], metricName(dependency.metric, locale)]
                  .filter(Boolean)
                  .join(' ')
              : locale === 'en' && dependency.kind !== 'evidence'
                ? decisionText(dependency.label)
                : dependency.label}
          </span>
          <Tag>
            {dependency.state === 'matched'
              ? t('字段匹配', 'Fields match')
              : dependency.state === 'missing'
                ? t('缺失', 'Missing')
                : dependency.state === 'withdrawn'
                  ? t('已撤回', 'Withdrawn')
                  : dependency.state === 'conflict'
                    ? t('冲突', 'Conflict')
                    : dependency.state === 'out-of-scope'
                      ? t('范围不符', 'Out of scope')
                      : t('假设', 'Assumption')}
          </Tag>
          {dependency.relation === 'motivates' && (
            <Tag>{t('仅提示核查', 'Motivates review only')}</Tag>
          )}
          {dependency.binding && (
            <Tag>
              {dependency.binding === 'source-located'
                ? t('已定位材料文本', 'Located in saved material text')
                : dependency.binding === 'user-transcribed'
                  ? t('用户转录 · 未绑定材料', 'User transcription · no linked material')
                  : t('关联原文未定位', 'Not located in linked text')}
            </Tag>
          )}
          {dependency.kind === 'financial' && dependency.taskId ? (
            <a className="text-link" href={`/tasks/${dependency.taskId}`}>
              {t('财务原文', 'Financial source')}
              <ArrowUpRight size={12} />
            </a>
          ) : dependency.kind === 'evidence' &&
            detail.version.evidence.some((item) => item.id === dependency.id) ? (
            <button className="text-link" onClick={() => openRecord(dependency.id)}>
              {t('查看记录', 'View record')}
            </button>
          ) : null}
          {dependency.kind !== 'financial' && dependency.materialId && (
            <SourceLink materialId={dependency.materialId} page={dependency.page} />
          )}
        </li>
      ))}
    </ul>
  );
}
function SourceLink({ materialId, page }: { materialId: string; page?: number | null }) {
  const { t, workspace } = useApp();
  const material = workspace?.materials.find((item) => item.id === materialId);
  if (!material)
    return (
      <span className="field-note">
        {t('关联材料当前不可用', 'Linked evidence is unavailable')}
      </span>
    );
  const file = material.uploadId
    ? `/api/materials/${material.id}/file${material.filename.toLowerCase().endsWith('.pdf') ? `#page=${page || 1}` : ''}`
    : material.sourceUrl && /^https?:\/\//.test(material.sourceUrl)
      ? `${material.sourceUrl}${page ? `#page=${page}` : ''}`
      : null;
  return file ? (
    <a className="text-link" href={file} target="_blank" rel="noopener noreferrer">
      {material.shortName}
      {page
        ? ` · ${material.filename.toLowerCase().endsWith('.pdf') ? 'PDF' : t('页', 'Page')} ${page}`
        : ''}
      <ArrowUpRight size={12} />
    </a>
  ) : (
    <span className="field-note">
      {t('结构化输入，未关联独立原件', 'Structured input without a separate original')}
    </span>
  );
}
function roleName(role: string, t: Translate) {
  return role === 'contract'
    ? t('合同责任主体', 'Contract-responsible entity')
    : role === 'payee'
      ? t('收款主体', 'Receiving entity')
      : role === 'refund'
        ? t('退款责任主体', 'Refund-responsible entity')
        : role;
}
function fieldName(key: string, t: Translate) {
  const names: Record<string, [string, string]> = {
    amount: ['金额', 'Amount'],
    day: ['事件日', 'Event day'],
    entity: ['主体', 'Entity'],
    terms: ['条款', 'Terms'],
    role: ['主体角色', 'Entity role'],
  };
  return names[key] ? t(...names[key]) : key;
}
function EvidenceDialog({
  initialSlot,
  input,
  onClose,
  onSave,
}: {
  initialSlot: DecisionEvidenceSlot;
  input: DecisionInput;
  onClose: () => void;
  onSave: (evidence: DecisionEvidenceInput) => Promise<void>;
}) {
  const { t, locale, workspace, busy } = useApp();
  const [evidence, setEvidence] = useState<DecisionEvidenceInput>({
    slot: initialSlot,
    kind: 'source-record',
    entity: '',
    asOf: null,
    values: {},
    quote: '',
    sourceLabel: '',
  });
  const material = workspace?.materials.find((item) => item.id === evidence.materialId);
  const monetary = ['paid', 'delivered', 'refunded', 'opening-cash', 'cash-flow'].includes(
    evidence.slot
  );
  const setValue = (patch: DecisionEvidenceInput['values']) =>
    setEvidence({ ...evidence, values: { ...evidence.values, ...patch } });
  return (
    <Dialog title={t('记录决定依据', 'Record decision evidence')} onClose={onClose}>
      <form
        className="decision-evidence-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(evidence);
        }}
      >
        <div className="decision-form-grid">
          <label className="form-field">
            <span>{t('材料用途', 'Evidence slot')}</span>
            <Select
              value={evidence.slot}
              onValueChange={(selectedValue) =>
                setEvidence({
                  ...evidence,
                  slot: selectedValue as DecisionEvidenceSlot,
                  values: {},
                  flowId: undefined,
                })
              }
            >
              {(Object.keys(slotNames) as DecisionEvidenceSlot[]).map((slot) => (
                <option key={slot} value={slot}>
                  {evidenceName(slot, t)}
                </option>
              ))}
            </Select>
          </label>
          <label className="form-field">
            <span>{t('记录性质', 'Record type')}</span>
            <Select
              value={evidence.kind}
              onValueChange={(selectedValue) =>
                setEvidence({ ...evidence, kind: selectedValue as DecisionEvidenceInput['kind'] })
              }
            >
              <option value="source-record">{t('原文记录', 'Source record')}</option>
              <option value="counterparty-statement">
                {t('对方陈述或承诺', 'Counterparty statement or promise')}
              </option>
              <option value="assumption">{t('情景假设', 'Scenario assumption')}</option>
            </Select>
          </label>
          <label className="form-field">
            <span>{t('记录所涉及主体', 'Entity covered by the record')}</span>
            <input
              required
              maxLength={200}
              value={evidence.entity}
              onChange={(e) => setEvidence({ ...evidence, entity: e.target.value })}
            />
          </label>
          <label className="form-field">
            <span>{t('记录覆盖日期', 'Date covered by the record')}</span>
            <input
              type="date"
              value={evidence.asOf || ''}
              onChange={(e) => setEvidence({ ...evidence, asOf: e.target.value || null })}
            />
          </label>
        </div>
        {evidence.slot === 'identity' && (
          <div className="decision-form-grid">
            <label className="form-field">
              <span>{t('主体角色', 'Entity role')}</span>
              <Select
                value={evidence.values.role || 'contract'}
                onValueChange={(selectedValue) =>
                  setValue({ role: selectedValue as 'contract' | 'payee' | 'refund' })
                }
              >
                <option value="contract">{t('合同责任主体', 'Contract-responsible entity')}</option>
                <option value="payee">{t('收款主体', 'Receiving entity')}</option>
                <option value="refund">{t('退款责任主体', 'Refund-responsible entity')}</option>
              </Select>
            </label>
            <label className="form-field">
              <span>{t('原文主体完整名称', 'Full entity name in the source')}</span>
              <input
                required
                maxLength={200}
                value={evidence.values.entity || ''}
                onChange={(e) =>
                  setValue({ entity: e.target.value, role: evidence.values.role || 'contract' })
                }
              />
            </label>
          </div>
        )}
        {evidence.slot === 'terms' && (
          <label className="form-field">
            <span>
              {t('原文付款、交付或退款条件', 'Payment, delivery or refund terms in the source')}
            </span>
            <textarea
              required
              rows={2}
              maxLength={2000}
              value={evidence.values.terms || ''}
              onChange={(e) => setValue({ terms: e.target.value })}
            />
          </label>
        )}
        {monetary && (
          <>
            <MoneyField
              label={t('记录中的金额', 'Amount in the record')}
              value={evidence.values.amount ?? null}
              onChange={(value) => setValue({ amount: value })}
            />
            <p className="field-note">
              {t(
                '金额和覆盖日期需由原文明示；0也要有记录。年报年度现金净额不是当前可用余额，退款承诺不是实际退款。',
                'The source must explicitly state the amount and covered date, including zero. Annual operating cash is not current available cash; a refund promise is not an actual refund.'
              )}
            </p>
          </>
        )}
        {evidence.slot === 'cash-flow' && (
          <div className="decision-form-grid">
            <label className="form-field">
              <span>{t('对应现金事件', 'Linked cash event')}</span>
              <Select
                required
                value={evidence.flowId || ''}
                onValueChange={(selectedValue) =>
                  setEvidence({ ...evidence, flowId: selectedValue || undefined })
                }
              >
                <option value="">{t('选择已录入事件', 'Select an entered event')}</option>
                {input.datedCash?.flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.label} · D{flow.day ?? '?'}
                  </option>
                ))}
              </Select>
            </label>
            <DayField
              label={t('原文对应事件日', 'Event day supported by the source')}
              value={evidence.values.day ?? null}
              onChange={(value) => setValue({ day: value })}
            />
          </div>
        )}
        <label className="form-field">
          <span>{t('来源名称', 'Source label')}</span>
          <input
            required
            maxLength={200}
            placeholder={t(
              '例如：银行对账单、合同条款、对方邮件',
              'Bank reconciliation, contract terms, counterparty email'
            )}
            value={evidence.sourceLabel}
            onChange={(e) => setEvidence({ ...evidence, sourceLabel: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>{t('原文摘录', 'Source excerpt')}</span>
          <textarea
            required
            rows={4}
            maxLength={4000}
            value={evidence.quote}
            onChange={(e) => setEvidence({ ...evidence, quote: e.target.value })}
          />
        </label>
        <details className="decision-evidence-binding">
          <summary>
            {t('关联保存的材料文本（可选）', 'Link saved material text (optional)')}
          </summary>
          <label className="form-field">
            <span>{t('材料', 'Material')}</span>
            <Select
              value={evidence.materialId || ''}
              onValueChange={(selectedValue) =>
                setEvidence({
                  ...evidence,
                  materialId: selectedValue || undefined,
                  observationId: undefined,
                  page: null,
                })
              }
            >
              <option value="">
                {t('不关联材料 · 用户转录', 'No material linked · user transcription')}
              </option>
              {workspace?.materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortName} · {item.title}
                </option>
              ))}
            </Select>
          </label>
          {material && (
            <>
              <label className="form-field">
                <span>{t('已有观测定位', 'Locate an existing observation')}</span>
                <Select
                  value={evidence.observationId || ''}
                  onValueChange={(selectedValue) => {
                    const obs = material.observations.find((item) => item.id === selectedValue);
                    setEvidence({
                      ...evidence,
                      observationId: obs?.id,
                      page: obs?.page ?? null,
                      quote: obs?.quote || evidence.quote,
                      sourceLabel: material.title,
                    });
                  }}
                >
                  <option value="">
                    {t('选择观测或自行指定页码', 'Choose observation or specify page')}
                  </option>
                  {material.observations.map((obs) => (
                    <option key={obs.id} value={obs.id}>
                      {metricName(obs.key, locale)} · {obs.year} · PDF {obs.page ?? '?'}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="form-field">
                <span>{t('材料页码', 'Material page')}</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={evidence.page ?? ''}
                  onChange={(e) =>
                    setEvidence({
                      ...evidence,
                      page: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <SourceLink materialId={material.id} page={evidence.page} />
            </>
          )}
        </details>
        <p className="field-note">
          {t(
            '提供字段与原文的匹配不等于银行鉴真或履约核实。未关联保存材料文本时，仅记录你转录的文本；对方陈述与假设不会当作实际退款或现金依据。',
            'Matching supplied fields to text does not authenticate banking records or performance. Without linked saved material text, this records your transcription. Counterparty statements and assumptions do not establish actual refunds or available cash.'
          )}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            {t('取消', 'Cancel')}
          </button>
          <button className="button button-primary" disabled={busy}>
            {t('保存并重新核对', 'Save and recheck')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
