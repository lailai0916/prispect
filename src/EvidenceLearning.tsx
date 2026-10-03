import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import {
  createEvidenceLearningChallenge,
  evaluateEvidenceLearningPrediction,
  evidenceLearningFacts,
  evidenceLearningFingerprint,
  type EvidenceLearningResult,
} from '../shared/evidence-learning';
import type { EvidenceLabGraph, LabNode } from '../shared/evidence-lab';
import { evidenceDependencyPath } from '../shared/evidence-dependency-paths';
import type { AssessmentText } from '../shared/company-assessment';
import { useApp } from './context';
import { money } from './format';
import './evidence-learning.css';

export interface EvidenceLearningProps {
  graph: EvidenceLabGraph;
  /** Owning account, or anonymous scope. The session remounts before rendering another owner. */
  scopeKey: string;
}
type Attempt = { fact: AssessmentText; matches: boolean; missed: number; extra: number };

export function EvidenceLearning({ graph, scopeKey }: EvidenceLearningProps) {
  return (
    <LearningSession
      key={JSON.stringify([scopeKey, evidenceLearningFingerprint(graph)])}
      graph={graph}
    />
  );
}

function LearningSession({ graph }: { graph: EvidenceLabGraph }) {
  const { t, locale } = useApp();
  const facts = useMemo(() => evidenceLearningFacts(graph), [graph]);
  const [factId, setFactId] = useState(facts[0]?.id || '');
  const [predictedIds, setPredictedIds] = useState<string[]>([]);
  const [result, setResult] = useState<EvidenceLearningResult | null>(null);
  const [error, setError] = useState<AssessmentText | null>(null);
  const [restored, setRestored] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const submitted = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const selectId = useId();
  const headingId = useId();
  const availability = useMemo(
    () => createEvidenceLearningChallenge(graph, factId),
    [graph, factId]
  );
  const challenge = availability.status === 'ready' ? availability.challenge : null;
  useEffect(() => {
    if (result) feedbackRef.current?.focus();
    else if (restored) selectRef.current?.focus();
  }, [result, restored]);
  const displayValue = (node: LabNode) =>
    node.value === null
      ? '—'
      : node.unit === 'percent'
        ? `${node.value}%`
        : node.unit === 'CNY'
          ? `${money(node.value, locale, false)} ${t('元', 'CNY')}`
          : node.value;
  const reset = () => {
    submitted.current = false;
    setResult(null);
    setPredictedIds([]);
    setError(null);
    setRestored(true);
  };
  const verify = () => {
    if (submitted.current) return;
    const feedback = evaluateEvidenceLearningPrediction(graph, factId, predictedIds);
    if (feedback.status === 'unavailable') {
      setError(feedback.reason);
      return;
    }
    submitted.current = true;
    setResult(feedback.result);
    setError(null);
    setRestored(false);
    setAttempts((previous) => [
      ...previous.slice(-11),
      {
        fact: feedback.result.fact.label,
        matches: feedback.result.matches,
        missed: feedback.result.missedIds.length,
        extra: feedback.result.extraIds.length,
      },
    ]);
  };
  const resultById = useMemo(
    () => new Map(result?.trial.nodes.map((node) => [node.id, node]) || []),
    [result]
  );
  const comparisonNodes = useMemo(
    () =>
      result
        ? [...result.candidates].sort(
            (left, right) =>
              Number(
                result.pausedIds.includes(right.id) || result.predictedIds.includes(right.id)
              ) -
              Number(result.pausedIds.includes(left.id) || result.predictedIds.includes(left.id))
          )
        : [],
    [result]
  );

  return (
    <details className="evidence-learning" data-testid="evidence-learning">
      <summary>
        <span>
          {t(
            '试着判断：撤回一条事实，会影响哪些结果？',
            'Try predicting what a withdrawn fact affects'
          )}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="learning-body">
        <p className="learning-notice">
          {t(
            '在当前来源上练习计算依赖。演练结果单独展示，保存的资料与报告保留。',
            'Practice calculation dependencies with the current sources. Practice results appear here; saved sources and reports are retained.'
          )}
        </p>
        <p className="learning-scope">
          {graph.company} · {graph.year} · {t('合并口径', 'Consolidated')} ·{' '}
          {t('当前会话', 'This session')}
        </p>
        {!facts.length ? (
          <p className="learning-empty">
            {t(
              '没有可用于撤回练习的来源事实。先补齐或核对缺失、冲突的依据。',
              'No source facts are available for withdrawal practice. Obtain or reconcile missing or conflicting evidence first.'
            )}
          </p>
        ) : (
          <>
            <label className="learning-field" htmlFor={selectId}>
              {t('1. 选择一条可核对的来源事实', '1. Choose an inspectable source fact')}
              <select
                ref={selectRef}
                id={selectId}
                value={factId}
                disabled={result !== null}
                onChange={(event) => {
                  setFactId(event.target.value);
                  reset();
                  setRestored(false);
                }}
              >
                {facts.map((fact) => (
                  <option key={fact.id} value={fact.id}>
                    {t(...fact.label)} · {displayValue(fact)}
                  </option>
                ))}
              </select>
            </label>
            {challenge && !result && (
              <>
                <fieldset className="learning-prediction">
                  <legend>
                    {t(
                      '2. 预测哪些结果会暂停（可多选）',
                      '2. Predict which results will pause (select any)'
                    )}
                  </legend>
                  <p>
                    {t(
                      '先作选择，再运行本地试验；也可以不选，检验是否没有结果依赖它。',
                      'Choose before running the local trial. Leave all unchecked to test whether no result depends on it.'
                    )}
                  </p>
                  <div className="learning-options">
                    {challenge.candidates.map((node) => (
                      <label key={node.id}>
                        <input
                          type="checkbox"
                          checked={predictedIds.includes(node.id)}
                          onChange={(event) =>
                            setPredictedIds((previous) =>
                              event.target.checked
                                ? [...previous, node.id]
                                : previous.filter((id) => id !== node.id)
                            )
                          }
                        />
                        <span>
                          {t(...node.label)}
                          <small>
                            {node.kind === 'hypothesis'
                              ? t('待检验解释', 'Explanation to test')
                              : node.state === 'not-applicable'
                                ? t('当前不适用', 'Currently inapplicable')
                                : displayValue(node)}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="learning-actions">
                  <button type="button" className="learning-button" onClick={verify}>
                    {t('验证我的预测', 'Check my prediction')}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      reset();
                      setRestored(false);
                    }}
                  >
                    {t('清除选择', 'Clear selection')}
                  </button>
                </div>
              </>
            )}
            {availability.status === 'unavailable' && <p>{t(...availability.reason)}</p>}
          </>
        )}
        {error && <p role="alert">{t(...error)}</p>}
        {restored && (
          <p role="status">
            {t('演练已恢复，可以重新选择。', 'Practice restored. You can choose again.')}
          </p>
        )}
        {result && (
          <section className="learning-feedback" aria-labelledby={headingId}>
            <h3 ref={feedbackRef} tabIndex={-1} id={headingId} role="status">
              {result.matches
                ? t('预测与实际依赖一致', 'Your prediction matches the dependencies')
                : t(
                    '对照实际依赖，看看哪些需要重新判断',
                    'Compare the dependencies and reconsider your selections'
                  )}
            </h3>
            <p>
              {t(
                `撤回「${result.fact.label[0]}」：你预测 ${result.predictedIds.length} 项暂停，实际 ${result.pausedIds.length} 项。`,
                `Withdraw “${result.fact.label[1]}”: you predicted ${result.predictedIds.length} paused results; the trial pauses ${result.pausedIds.length}.`
              )}
            </p>
            <div className="learning-comparison">
              {comparisonNodes.map((before) => {
                const after = resultById.get(before.id)!;
                const paused = result.pausedIds.includes(before.id);
                const predicted = result.predictedIds.includes(before.id);
                const path = paused
                  ? evidenceDependencyPath(result.baseline.nodes, result.fact.id, before.id)
                  : null;
                const dependencies = before.dependsOn
                  .map((id) => result.baseline.nodes.find((node) => node.id === id))
                  .filter((node): node is LabNode => !!node);
                return (
                  <article
                    key={before.id}
                    data-learning-state={after.state}
                    data-learning-prediction={
                      result.missedIds.includes(before.id)
                        ? 'missed'
                        : result.extraIds.includes(before.id)
                          ? 'extra'
                          : 'matched'
                    }
                  >
                    <strong>{t(...before.label)}</strong>
                    {paused !== predicted && (
                      <span className="learning-selection-feedback">
                        {paused ? t('漏选', 'Missed') : t('多选', 'Extra selection')}
                      </span>
                    )}
                    <dl>
                      <div>
                        <dt>{t('你的预测', 'Your prediction')}</dt>
                        <dd>
                          {predicted ? t('会暂停', 'Will pause') : t('不受影响', 'Unaffected')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('本地试验', 'Local trial')}</dt>
                        <dd>
                          {paused
                            ? t('依赖暂停', 'Dependency paused')
                            : after.state === 'not-applicable'
                              ? t('仍不适用', 'Still inapplicable')
                              : after.kind === 'hypothesis'
                                ? t('仍待检验', 'Still untested')
                                : t('计算保留', 'Calculation retained')}
                        </dd>
                      </div>
                      {before.kind === 'calculation' && (
                        <div>
                          <dt>{t('演练数值', 'Practice value')}</dt>
                          <dd>
                            {displayValue(before)} → {displayValue(after)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {before.formula && <p className="learning-formula">{t(...before.formula)}</p>}
                    <p>
                      {paused && after.reason
                        ? t(...after.reason)
                        : dependencies.length
                          ? t(
                              `依赖${dependencies.map((node) => `「${node.label[0]}」`).join('、')}，这些依据在演练中仍可采用。`,
                              `Depends on ${dependencies.map((node) => `“${node.label[1]}”`).join(', ')}; these inputs remain usable in the practice.`
                            )
                          : t(
                              '没有连接到本次撤回的事实。',
                              'It does not depend on the fact withdrawn in this practice.'
                            )}
                    </p>
                    {path?.status === 'found' && (
                      <details className="learning-dependency">
                        <summary>{t('查看依赖路径', 'View dependency path')}</summary>
                        <p>
                          {path.nodeIds
                            .map((id) =>
                              t(...result.baseline.nodes.find((node) => node.id === id)!.label)
                            )
                            .join(' → ')}
                        </p>
                      </details>
                    )}
                    {before.kind === 'hypothesis' && <p>{t(...before.detail)}</p>}
                  </article>
                );
              })}
            </div>
            <h4>{t('仍可核对的其他来源字段', 'Other source fields still available')}</h4>
            {result.independentFacts.length ? (
              <ul className="learning-retained">
                {result.independentFacts.map((node) => (
                  <li key={node.id}>
                    {t(...node.label)} · {displayValue(node)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {t(
                  '当前演练没有其他可用来源字段。',
                  'No other source fields are available in this practice.'
                )}
              </p>
            )}
            <p className="learning-notice">
              {t(
                '暂停说明缺少计算依据，解释仍需材料检验。它不证明企业风险或任何经营原因。',
                'A pause means a calculation lacks its inputs. Explanations still need supporting materials; this establishes neither company risk nor a business cause.'
              )}
            </p>
            <div className="learning-actions">
              <button type="button" className="learning-button" onClick={reset}>
                <RotateCcw size={13} aria-hidden="true" />
                {t('恢复演练', 'Restore practice')}
              </button>
              <a href="/docs/methodology">{t('查看计算方法', 'Read the methodology')}</a>
            </div>
          </section>
        )}
        {attempts.length > 0 && (
          <details className="learning-recap">
            <summary>
              {t('当前会话复盘', 'Session recap')} · {attempts.length}
            </summary>
            <p>
              {t(
                `最近 ${attempts.length} 次依赖预测中，${attempts.filter((attempt) => attempt.matches).length} 次与实际关系一致。`,
                `Among the last ${attempts.length} dependency predictions, ${attempts.filter((attempt) => attempt.matches).length} matched the relationships.`
              )}
            </p>
            <ol>
              {attempts.map((attempt, index) => (
                <li key={index}>
                  {t(...attempt.fact)} ·{' '}
                  {attempt.matches
                    ? t('关系一致', 'Matched')
                    : t(
                        `漏选 ${attempt.missed} 项，多选 ${attempt.extra} 项`,
                        `Missed ${attempt.missed}; extra ${attempt.extra}`
                      )}
                </li>
              ))}
            </ol>
            <p className="learning-notice">
              {t(
                '只记录当前来源下的练习，最多保留最近 12 次。换主体、期间、来源或账号及刷新后清空。',
                'Only practice with these sources is recorded, up to the last 12 attempts. Changing entity, period, sources or account, or refreshing, clears it.'
              )}
            </p>
          </details>
        )}
      </div>
    </details>
  );
}
