import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Download, FileSearch } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { AssessmentJudgment } from '../shared/company-assessment';
import {
  deriveResearchPlan,
  researchGoalTemplates,
  researchPlanText,
  researchQuestionLabels,
} from '../shared/research-plan';
import { CompanyAssessmentEvidence } from './CompanyAssessment';
import { useApp } from './context';
import { date } from './format';
import './research-plan.css';

/** Choosing a template fills the current goal; it never starts retrieval or analysis. */
export function ResearchGoalTemplates({
  onSelect,
  disabled = false,
}: {
  onSelect: (goal: string) => void;
  disabled?: boolean;
}) {
  const { t } = useApp();
  return (
    <div className="research-goal-templates">
      <div role="group" aria-label={t('选择研究关注', 'Choose a research focus')}>
        {researchGoalTemplates.map((template) => (
          <button
            type="button"
            className="research-goal-template"
            key={template.id}
            disabled={disabled}
            title={t(template.goal[0], template.goal[1])}
            onClick={() => onSelect(t(template.goal[0], template.goal[1]))}
          >
            {t(template.label[0], template.label[1])}
          </button>
        ))}
      </div>
      <p>
        {t(
          '选择后填入研究目标，可继续编辑后再开始。',
          'Choose a focus to fill the goal, then edit it before starting.'
        )}
      </p>
    </div>
  );
}

export function ResearchPlan({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const plan = deriveResearchPlan(run);
  const text = researchPlanText(plan, locale === 'en' ? 'en' : 'zh');
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [selected, setSelected] = useState<AssessmentJudgment | null>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const activeKey = useRef(run.id + '\n' + text);
  activeKey.current = run.id + '\n' + text;
  useEffect(() => {
    setCopyState('idle');
    setSelected(null);
  }, [run.id, text]);
  const copy = async () => {
    const copiedText = text;
    const copiedKey = run.id + '\n' + copiedText;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(copiedText);
      if (activeKey.current === copiedKey) setCopyState('copied');
    } catch {
      if (activeKey.current !== copiedKey) return;
      setCopyState('failed');
      requestAnimationFrame(() => {
        if (activeKey.current !== copiedKey) return;
        fallback.current?.focus();
        fallback.current?.select();
      });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `prispect-review-framework-${run.input.securityCode.replace(/[^a-zA-Z0-9-]/g, '')}-${run.input.year}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const count = (value: number | null) =>
    value === null ? t('未记录', 'Unrecorded') : String(value);
  return (
    <details className="research-plan" id="company-research-framework">
      <summary>
        <FileSearch size={14} aria-hidden="true" />
        <span>{t(...plan.title)}</span>
        <span className="research-plan-summary-note">
          {t('问题、依据与待补资料', 'Questions, sources and gaps')}
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </summary>
      <div className="research-plan-body">
        <p className="research-plan-intro">{t(...plan.explanation)}</p>
        <dl className="research-plan-identity">
          <div>
            <dt>{t('研究主体', 'Selected entity')}</dt>
            <dd>
              {plan.issuer} · {plan.securityCode}
            </dd>
          </div>
          <div>
            <dt>{t('研究目标', 'Research goal')}</dt>
            <dd>{t(...plan.goal)}</dd>
          </div>
          <div>
            <dt>{t('资料范围', 'Evidence scope')}</dt>
            <dd>
              {plan.scope.map((item) => (
                <p key={item[1]}>{t(...item)}</p>
              ))}
            </dd>
          </div>
          <div>
            <dt>{t('来源快照', 'Source snapshot')}</dt>
            <dd>
              {plan.sourceSnapshot ? date(plan.sourceSnapshot, locale) : t('未记录', 'Unrecorded')}
            </dd>
          </div>
        </dl>
        {plan.notes.length > 0 && (
          <div className="research-plan-notes">
            {plan.notes.map((note) => (
              <p key={note[1]}>{t(...note)}</p>
            ))}
          </div>
        )}
        <section aria-labelledby="research-plan-questions-heading">
          <h3 id="research-plan-questions-heading">{t('逐项核查', 'Review questions')}</h3>
          <ol className="research-plan-questions">
            {plan.questions.map((item) => (
              <li key={item.id}>
                <div>
                  <h4>{t(...item.question)}</h4>
                  <span className={'research-plan-state research-plan-state-' + item.state}>
                    {t(...researchQuestionLabels[item.state])}
                  </span>
                </div>
                <p>{t(...item.detail)}</p>
                <p className="research-plan-next">
                  <span>{t('所需依据：', 'Evidence needed: ')}</span>
                  {t(...item.nextEvidence)}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="research-plan-sources-heading">
          <h3 id="research-plan-sources-heading">
            {t('本快照的来源覆盖', 'Source coverage in this snapshot')}
          </h3>
          <div className="research-plan-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('资料', 'Evidence')}</th>
                  <th scope="col">{t('保存条目', 'Saved items')}</th>
                  <th scope="col">{t('已读节选', 'Retrieved excerpts')}</th>
                  <th scope="col">{t('使用边界', 'Use limits')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.sources.map((source) => (
                  <tr key={source.id}>
                    <th scope="row">{t(...source.label)}</th>
                    <td>{count(source.catalog)}</td>
                    <td>
                      {source.id === 'financials'
                        ? t('网页字段', 'Web fields')
                        : count(source.read)}
                    </td>
                    <td>{t(...source.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="research-plan-source-note">
            {t('来源尝试记录', 'Source attempt records')} {count(plan.sourceAttempts)} ·{' '}
            {t('读取失败', 'Retrieval failed')} {count(plan.sourceFailures)}.{' '}
            {t(
              '条目数不是独立证据链数量，也不是确信概率。',
              'Item counts are neither independent evidence-chain counts nor confidence probabilities.'
            )}
          </p>
        </section>
        <section aria-labelledby="research-plan-completion-heading">
          <h3 id="research-plan-completion-heading">
            {t('形成有依据判断的条件', 'Requirements for a supported judgment')}
          </h3>
          <ul>
            {plan.completionRequirements.map((item) => (
              <li key={item[1]}>{t(...item)}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="research-plan-materials-heading">
          <h3 id="research-plan-materials-heading">
            {t('需要直接核对的区分材料', 'Direct evidence to verify')}
          </h3>
          <p className="research-plan-source-note">
            {t(
              '以下列出核查所需材料，不代表本公开研究已经取得；使用时仍需核对主体、期间和范围。',
              'These materials are needed for review; this public research does not establish that they have been obtained. Check the entity, period and scope before use.'
            )}
          </p>
          <ul>
            {plan.distinguishingEvidence.map((item) => (
              <li key={item[1]}>{t(...item)}</li>
            ))}
          </ul>
        </section>
        {plan.changeConditions.length > 0 && (
          <section aria-labelledby="research-plan-change-heading">
            <h3 id="research-plan-change-heading">
              {t('报告中的改判条件', 'Change conditions in the report')}
            </h3>
            <p className="research-plan-source-note">
              {t('依据快照：', 'Evidence snapshot: ')}
              {plan.conditionSnapshot
                ? date(plan.conditionSnapshot, locale)
                : t('未记录', 'Unrecorded')}
            </p>
            <ul className="research-plan-conditions">
              {plan.changeConditions.map((condition, index) => (
                <li key={index}>
                  <p>{condition.judgment.text[locale === 'en' ? 'en' : 'zh']}</p>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setSelected(condition.judgment)}
                  >
                    <FileSearch size={12} aria-hidden="true" />
                    {t('查看依据', 'Inspect basis')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="research-plan-actions">
          <button
            className="text-link"
            type="button"
            onClick={() => void copy()}
            disabled={copyState === 'copying'}
          >
            {copyState === 'copied' ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
            {copyState === 'copying'
              ? t('复制中', 'Copying')
              : copyState === 'copied'
                ? t('已复制框架', 'Framework copied')
                : t('复制核查框架', 'Copy review framework')}
          </button>
          <button className="text-link" type="button" onClick={download}>
            <Download size={13} aria-hidden="true" />
            {t('下载核查框架', 'Download review framework')}
          </button>
          <span role="status" aria-live="polite">
            {copyState === 'failed'
              ? t(
                  '未能自动复制，可选取下方文本复制。',
                  'Automatic copy failed. Select the text below to copy it.'
                )
              : copyState === 'copied'
                ? t(
                    '已复制当前记录的核查框架。',
                    'The review framework for this record has been copied.'
                  )
                : ''}
          </span>
        </div>
        {copyState === 'failed' && (
          <textarea
            className="research-plan-copy-fallback"
            readOnly
            value={text}
            ref={fallback}
            aria-label={t('核查框架文本', 'Review framework text')}
          />
        )}
      </div>
      {selected && run.assessment && plan.changeConditions.length > 0 && (
        <CompanyAssessmentEvidence
          assessment={run.assessment}
          title={t('改判条件依据', 'Basis for the change condition')}
          judgment={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </details>
  );
}
