import { useId, useState } from 'react';
import { ChevronDown, Copy, Plus, X } from 'lucide-react';
import type {
  DecisionClaimTarget,
  DecisionDependency,
  DecisionDetail,
  DecisionEvidenceSlot,
  DecisionEvidenceInput,
  DecisionInput,
} from '../shared/decision-contracts';
import {
  claimTargetAllowed,
  decisionClaimTargets,
  deriveDecisionClaims,
} from '../shared/decision-claims';
import { useApp, type Translate } from './context';
import { Tag } from './components';
import { Select } from './Select';
import { decisionText } from './decisionTranslations';
import './decision-claims.css';
import { decisionClaimQuestion, deriveDecisionFollowUpRecords } from '../shared/decision-followup';
import { date } from './format';

const dependencyState = (state: DecisionDependency['state'], t: Translate) =>
  ({
    matched: t('字段匹配', 'Fields match'),
    missing: t('尚缺依据', 'Evidence missing'),
    withdrawn: t('已撤回', 'Withdrawn'),
    conflict: t('记录冲突', 'Record conflict'),
    'out-of-scope': t('范围不符', 'Out of scope'),
    assumption: t('陈述或假设', 'Statement or assumption'),
  })[state];

export function DecisionClaimsEditor({
  input,
  onChange,
}: {
  input: DecisionInput;
  onChange: (input: DecisionInput) => void;
}) {
  const { t } = useApp();
  const baseId = useId();
  const claims = input.claims ?? [];
  // Keep indices stable while a selected unavailable target becomes an available one.
  const options = Object.keys(decisionClaimTargets) as DecisionClaimTarget[];
  const update = (
    id: string,
    values: Partial<{ text: string; target: DecisionClaimTarget; question: string }>
  ) =>
    onChange({
      ...input,
      claims: claims.map((claim) => (claim.id === id ? { ...claim, ...values } : claim)),
    });
  return (
    <section
      className="decision-input-section decision-claims-editor"
      aria-labelledby={`${baseId}-heading`}
    >
      <div className="report-section-title">
        <h3 id={`${baseId}-heading`}>
          {t('问询与对方说法', 'Questions and counterparty statements')}
        </h3>
        <span className="field-note">{claims.length}/12</span>
      </div>
      {claims.map((claim, index) => {
        const compatible = claimTargetAllowed(claim.target, input.purpose);
        const prefix = `${baseId}-${claim.id}`;
        return (
          <div className="decision-claim-edit" key={claim.id}>
            <div className="form-field">
              <label htmlFor={`${prefix}-text`}>
                {t(
                  `问询 ${index + 1} · 对方原话（可选）`,
                  `Question ${index + 1} · counterparty quotation (optional)`
                )}
              </label>
              <textarea
                id={`${prefix}-text`}
                maxLength={1000}
                required={!claim.question?.trim()}
                value={claim.text}
                placeholder={t(
                  '例如：提前退出可以退款（请保留实际原话）',
                  'For example: an early exit allows a refund (retain the actual wording)'
                )}
                onChange={(event) => update(claim.id, { text: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`${prefix}-question`}>
                {t('想向对方核对什么', 'Question for the counterparty')}
              </label>
              <textarea
                id={`${prefix}-question`}
                maxLength={2000}
                required={!claim.text.trim()}
                rows={2}
                value={claim.question || ''}
                placeholder={t(...decisionClaimTargets[claim.target].request)}
                onChange={(event) => update(claim.id, { question: event.target.value })}
              />
            </div>
            <div className="decision-claim-edit-controls">
              <div className="form-field">
                <label htmlFor={`${prefix}-target`}>{t('核对目标', 'Review field')}</label>
                <Select
                  id={`${prefix}-target`}
                  required
                  value={claim.target}
                  aria-invalid={!compatible}
                  aria-describedby={!compatible ? `${prefix}-scope` : undefined}
                  onValueChange={(target) => {
                    const nextTarget = target as DecisionClaimTarget;
                    update(claim.id, {
                      target: nextTarget,
                      ...(claim.question === t(...decisionClaimTargets[claim.target].request)
                        ? { question: t(...decisionClaimTargets[nextTarget].request) }
                        : {}),
                    });
                  }}
                >
                  {options.map((target) => {
                    const allowed = claimTargetAllowed(target, input.purpose);
                    return (
                      <option key={target} value={target} disabled={!allowed}>
                        {t(...decisionClaimTargets[target].label)}
                        {!allowed && ` · ${t('本类型不可用', 'Unavailable for this purpose')}`}
                      </option>
                    );
                  })}
                </Select>
              </div>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  onChange({ ...input, claims: claims.filter((item) => item.id !== claim.id) })
                }
                aria-label={t(`移除说法 ${index + 1}`, `Remove statement ${index + 1}`)}
              >
                <X size={14} />
                {t('移除', 'Remove')}
              </button>
            </div>
            {!compatible && (
              <p className="field-note form-error" id={`${prefix}-scope`} role="status">
                {t(
                  '已保留原话和原目标。本类型不能使用该目标；请主动选择适用目标或移除此条后再保存。',
                  'The quotation and original target are retained. This purpose cannot use that target; choose an applicable target or remove this statement before saving.'
                )}
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="text-link"
        disabled={claims.length >= 12}
        onClick={() =>
          onChange({
            ...input,
            claims: [
              ...claims,
              {
                id: crypto.randomUUID(),
                text: '',
                target: 'terms',
                question: t(...decisionClaimTargets.terms.request),
              },
            ],
          })
        }
      >
        <Plus size={14} />
        {t('提出一条核查问题', 'Add a review question')}
      </button>
    </section>
  );
}

export function DecisionClaims({
  detail,
  onEvidence,
  onAddEvidence,
}: {
  detail: DecisionDetail;
  onEvidence: (id: string) => void;
  onAddEvidence?: (
    slot: DecisionEvidenceSlot,
    role?: 'contract' | 'payee' | 'refund',
    claimId?: string,
    kind?: DecisionEvidenceInput['kind']
  ) => void;
}) {
  const { t, locale } = useApp();
  const [copyFeedback, setCopyFeedback] = useState<{ id: string; failed: boolean } | null>(null);
  const reviews = deriveDecisionClaims(detail.version, detail.evaluation);
  if (!reviews.length) return null;
  const translated = (text: string) => (locale === 'en' ? decisionText(text) : text);
  const statusName = (status: (typeof reviews)[number]['status']) =>
    ({
      matched: t('字段可核对', 'Fields available for review'),
      unknown: t('尚待核对', 'Review needed'),
      conflict: t('记录冲突', 'Record conflict'),
      'out-of-scope': t('范围不符', 'Out of scope'),
      withdrawn: t('依据已撤回', 'Evidence withdrawn'),
      'condition-unmet': t('条件未满足', 'Condition unmet'),
    })[status];
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback({ id, failed: false });
    } catch {
      setCopyFeedback({ id, failed: true });
    }
  };
  return (
    <section
      className="decision-claims decision-gates"
      aria-label={t('说法与依据对照', 'Statements and evidence')}
    >
      <div className="report-section-title">
        <h3>{t('说法与依据对照', 'Statements and evidence')}</h3>
        <span className="field-note">
          V{detail.version.revision} · {reviews.length} {t('条', 'statements')}
        </span>
      </div>
      {reviews.map((review) => {
        const statusLabel = statusName(review.status);
        const requests = review.requests.length
          ? review.requests.map(translated)
          : [t(...review.fallbackRequest)];
        const question = decisionClaimQuestion(review.claim);
        const requestText = `${detail.version.input.transactionEntity}：${question}`;
        const records = deriveDecisionFollowUpRecords(detail.version, review.claim);
        const change = detail.followUpChanges?.find((item) => item.claimId === review.claim.id);
        return (
          <details
            className={`decision-gate decision-claim decision-gate-${review.status}`}
            key={review.claim.id}
            open
          >
            <summary>
              <strong>{t(...review.targetLabel)}</strong>
              <Tag>{statusLabel}</Tag>
              <ChevronDown size={14} />
            </summary>
            {review.claim.text && (
              <blockquote className="decision-claim-quote">{review.claim.text}</blockquote>
            )}
            {change && (
              <div className="decision-followup-change" role="status">
                <span>
                  V{change.fromRevision} → V{change.toRevision}
                </span>
                <p>
                  {change.before === null
                    ? t('新增核查问题。', 'Review question added.')
                    : change.before !== change.after
                      ? t('对应字段的核对状态已改变。', 'The corresponding field review changed.')
                      : change.addedReplyIds.length
                        ? t(
                            '已补充对方回复，字段核对状态保持不变。',
                            'A reply was added; the field review remains unchanged.'
                          )
                        : change.questionChanged
                          ? t(
                              '问题已修改；此前回复保留原问题。',
                              'The question changed; earlier replies retain their original question.'
                            )
                          : t(
                              '关联材料已更新，字段核对状态保持不变。',
                              'Linked evidence changed; the field review remains unchanged.'
                            )}{' '}
                  {change.before && change.before !== change.after
                    ? `${statusName(change.before)} → `
                    : ''}
                  {statusLabel}
                </p>
              </div>
            )}
            {!review.scopeApplicable ? (
              <p>
                {t(
                  '这个目标不适用于本事项类型，不能用其他门槛推断。原话仍保留，编辑时请重新选择目标。',
                  'This target is unavailable for this purpose; other gates do not establish it. The quotation is retained. Choose another target when editing.'
                )}
              </p>
            ) : review.summaries.length ? (
              review.summaries.map((summary, index) => <p key={index}>{translated(summary)}</p>)
            ) : (
              <p>
                {t(
                  '尚未形成对应字段的记录依据；原话本身不是核验依据。',
                  'No record basis is available for this field. The quotation itself is not evidence of verification.'
                )}
              </p>
            )}
            {review.explanationOpen === false && (
              <p className="field-note">
                {t(
                  '历史财务信号不适用；本次材料单独核对。',
                  'Historical signal unavailable; review these records separately.'
                )}
              </p>
            )}
            {!!review.dependencies.length && (
              <ul className="decision-dependencies">
                {review.dependencies.map((dependency, index) => {
                  const evidence =
                    dependency.kind === 'evidence'
                      ? detail.version.evidence.find((item) => item.id === dependency.id)
                      : undefined;
                  const sourceLabel =
                    dependency.kind === 'evidence'
                      ? (evidence?.sourceLabel ?? translated(dependency.label))
                      : translated(dependency.label);
                  const relation =
                    dependency.relation === 'motivates' || dependency.kind === 'financial'
                      ? t('历史线索 · 仅促使核查', 'Historical lead · motivates review only')
                      : dependency.kind === 'input'
                        ? t('用户输入', 'User input')
                        : evidence?.kind === 'counterparty-statement'
                          ? t('对方陈述', 'Counterparty statement')
                          : evidence?.kind === 'assumption'
                            ? t('情景假设', 'Assumption')
                            : dependency.binding === 'source-located'
                              ? t('已定位保存文本', 'Located in saved text')
                              : dependency.binding === 'user-transcribed'
                                ? t('用户转录 · 未定位', 'Transcribed · not located')
                                : t('尚未定位材料', 'Material not located');
                  return (
                    <li key={`${dependency.kind}:${dependency.id}:${index}`}>
                      <span>
                        {sourceLabel}
                        <small>
                          {relation}
                          {evidence?.asOf ? ` · ${evidence.asOf}` : ''}
                          {dependency.page ? ` · ${t('页', 'p.')} ${dependency.page}` : ''}
                        </small>
                      </span>
                      <Tag>{dependencyState(dependency.state, t)}</Tag>
                      {dependency.kind === 'evidence' && evidence && (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => onEvidence(dependency.id)}
                        >
                          {t('查看材料', 'View material')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {review.scopeApplicable && (
              <div className="decision-claim-next">
                <strong>{t('向对方核对', 'Ask the counterparty')}</strong>
                <p>{question}</p>
                <div className="decision-entry-actions">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => void copy(review.claim.id, requestText)}
                  >
                    <Copy size={14} />
                    {t('复制核查请求', 'Copy review request')}
                  </button>
                  {onAddEvidence && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        onAddEvidence(
                          review.slot,
                          review.role,
                          review.claim.id,
                          'counterparty-statement'
                        )
                      }
                    >
                      <Plus size={14} />
                      {t('补充对方回复', 'Add counterparty reply')}
                    </button>
                  )}
                  {onAddEvidence && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        onAddEvidence(review.slot, review.role, review.claim.id, 'source-record')
                      }
                    >
                      <Plus size={14} />
                      {t('补录对应材料', 'Add corresponding evidence')}
                    </button>
                  )}
                </div>
                {copyFeedback?.id === review.claim.id && (
                  <p className="field-note" role="status">
                    {copyFeedback.failed
                      ? t(
                          '复制未完成，请选择上方请求文字复制。',
                          'Copy failed. Select and copy the request text above.'
                        )
                      : t('核查请求已复制。', 'Review request copied.')}
                  </p>
                )}
                {!!records.length && (
                  <div className="decision-followup-records">
                    {records.map(({ evidence, priorQuestion }) => (
                      <article className="decision-followup-record" key={evidence.id}>
                        <div className="decision-followup-record-heading">
                          <strong>
                            {evidence.kind === 'counterparty-statement'
                              ? t('对方回复', 'Counterparty reply')
                              : t('对应材料', 'Related evidence')}
                          </strong>
                          <Tag>
                            {evidence.state === 'withdrawn'
                              ? t('已撤回', 'Withdrawn')
                              : evidence.kind === 'counterparty-statement'
                                ? t('待核验陈述', 'Unverified statement')
                                : t('原文记录', 'Source record')}
                          </Tag>
                        </div>
                        <p>{evidence.quote}</p>
                        <span className="field-note">
                          {evidence.sourceLabel} · {date(evidence.createdAt, locale)}
                          {evidence.page ? ` · ${t('页', 'p.')} ${evidence.page}` : ''}
                        </span>
                        {priorQuestion && (
                          <details className="decision-prior-question">
                            <summary>
                              {t('对应此前问题', 'Responds to an earlier question')}
                            </summary>
                            <p>
                              {evidence.claimQuestion ||
                                t('问题快照未保存', 'Question snapshot unavailable')}
                            </p>
                            {evidence.claimTarget &&
                              evidence.claimTarget !== review.claim.target && (
                                <p className="field-note">
                                  {t('当时核对', 'Original target')} ·{' '}
                                  {t(...decisionClaimTargets[evidence.claimTarget].label)}
                                </p>
                              )}
                            {evidence.claimText !== review.claim.text && evidence.claimText && (
                              <blockquote>{evidence.claimText}</blockquote>
                            )}
                          </details>
                        )}
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => onEvidence(evidence.id)}
                        >
                          {t('查看记录', 'View record')}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                {review.status !== 'matched' && (
                  <details className="decision-followup-needed">
                    <summary>{t('仍需核对的依据', 'Evidence still to review')}</summary>
                    {requests.map((request, index) => (
                      <p key={index}>{request}</p>
                    ))}
                  </details>
                )}
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
