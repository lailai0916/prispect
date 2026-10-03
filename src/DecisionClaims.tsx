import { useId, useState } from 'react';
import { ChevronDown, Copy, Plus, X } from 'lucide-react';
import type {
  DecisionClaimTarget,
  DecisionDependency,
  DecisionDetail,
  DecisionEvidenceSlot,
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
  const update = (id: string, values: Partial<{ text: string; target: DecisionClaimTarget }>) =>
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
        <h3 id={`${baseId}-heading`}>{t('逐条核对对方说法', 'Review individual statements')}</h3>
        <span className="field-note">{claims.length}/12</span>
      </div>
      <p className="field-note">
        {t(
          '摘录你想核对的原话，并选择要核对的字段。这里只记录待核验说法，不自动判断真假；材料匹配也不认证承诺履行。',
          'Quote the statement you want to examine and choose its review field. These are statements to review, not automatic truth judgments; matching records does not verify performance.'
        )}
      </p>
      {claims.map((claim, index) => {
        const compatible = claimTargetAllowed(claim.target, input.purpose);
        const prefix = `${baseId}-${claim.id}`;
        return (
          <div className="decision-claim-edit" key={claim.id}>
            <div className="form-field">
              <label htmlFor={`${prefix}-text`}>
                {t(`说法 ${index + 1} · 原话`, `Statement ${index + 1} · quotation`)}
              </label>
              <textarea
                id={`${prefix}-text`}
                maxLength={1000}
                required
                value={claim.text}
                placeholder={t(
                  '例如：提前退出可以退款（请保留实际原话）',
                  'For example: an early exit allows a refund (retain the actual wording)'
                )}
                onChange={(event) => update(claim.id, { text: event.target.value })}
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
                  onValueChange={(target) =>
                    update(claim.id, { target: target as DecisionClaimTarget })
                  }
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
            claims: [...claims, { id: crypto.randomUUID(), text: '', target: 'terms' }],
          })
        }
      >
        <Plus size={14} />
        {t('加入一条待核验说法', 'Add a statement to review')}
      </button>
      {!claims.length && (
        <p className="field-note">
          {t(
            '可选。没有摘录说法时，现有材料核查与条件演算照常保留。',
            'Optional. Evidence review and condition calculations remain available without quoted statements.'
          )}
        </p>
      )}
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
  onAddEvidence?: (slot: DecisionEvidenceSlot, role?: 'contract' | 'payee' | 'refund') => void;
}) {
  const { t, locale } = useApp();
  const [copyFeedback, setCopyFeedback] = useState<{ id: string; failed: boolean } | null>(null);
  const reviews = deriveDecisionClaims(detail.version, detail.evaluation);
  if (!reviews.length) return null;
  const translated = (text: string) => (locale === 'en' ? decisionText(text) : text);
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
      <p className="field-note">
        {t(
          '原话由你摘录，目标由你选择。下面展示对应字段与已有依据的状态，未对原话作语义鉴定，也不认证真实性、同意或履行。',
          'You quoted these statements and selected their targets. The review below reports the corresponding fields and evidence; it does not semantically authenticate the quotation, consent or performance.'
        )}
      </p>
      {reviews.map((review) => {
        const statusLabel = {
          matched: t('字段可核对', 'Fields available for review'),
          unknown: t('尚待核对', 'Review needed'),
          conflict: t('记录冲突', 'Record conflict'),
          'out-of-scope': t('范围不符', 'Out of scope'),
          withdrawn: t('依据已撤回', 'Evidence withdrawn'),
          'condition-unmet': t('条件未满足', 'Condition unmet'),
        }[review.status];
        const requests = review.requests.length
          ? review.requests.map(translated)
          : [t(...review.fallbackRequest)];
        const requestText = requests.join('\n');
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
            <blockquote className="decision-claim-quote">{review.claim.text}</blockquote>
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
                  '历史财务依据未形成适用解释信号。材料状态单独展示，不据此裁定经营原因或填补当前现金。',
                  'Historical financial evidence does not provide an applicable explanatory signal. Material status is shown separately; it does not establish an operating cause or fill current cash.'
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
                <strong>{t('下一步核对', 'Next review step')}</strong>
                {requests.map((request, index) => (
                  <p key={index}>{request}</p>
                ))}
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
                      onClick={() => onAddEvidence(review.slot, review.role)}
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
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
