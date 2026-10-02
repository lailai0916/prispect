import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyQuestionAnswer } from '../shared/company-workspace';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { date } from './format';

export function CompanyQuestionsView({
  run,
  basis,
  onAnswer,
  compact = false,
}: {
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  onAnswer: (answer: CompanyQuestionAnswer) => void;
  compact?: boolean;
}) {
  const { t, locale } = useApp(),
    [question, setQuestion] = useState(''),
    [sending, setSending] = useState(false),
    [pendingQuestion, setPendingQuestion] = useState(''),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null),
    active = useRef(true),
    draft = useRef(''),
    draftRevision = useRef(0),
    scrolling = useRef<HTMLDivElement | null>(null),
    inputId = useId();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (compact && scrolling.current) {
      scrolling.current.scrollTop = scrolling.current.scrollHeight;
    }
  }, [compact, run.questions?.length, sending]);
  const ask = async (value: string) => {
    if (controller.current || !value.trim()) return;
    const request = new AbortController();
    const submittedRevision = draftRevision.current;
    const submittedFromDraft = value === draft.current;
    controller.current = request;
    setSending(true);
    setPendingQuestion(value.trim());
    setError('');
    try {
      const answer = await api<CompanyQuestionAnswer>(`/company-runs/${run.id}/questions`, {
        method: 'POST',
        body: JSON.stringify({ question: value.trim(), basis, useModel: true }),
        signal: request.signal,
      });
      if (active.current && !request.signal.aborted) {
        onAnswer(answer);
        if (submittedFromDraft && draftRevision.current === submittedRevision) {
          draft.current = '';
          setQuestion('');
        }
      }
    } catch (cause) {
      if (active.current && !request.signal.aborted) setError(requestErrorText(cause, locale));
    } finally {
      if (controller.current === request) controller.current = null;
      if (active.current && !request.signal.aborted) {
        setSending(false);
        setPendingQuestion('');
      }
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };
  const suggested = [
    t('最新中报有哪些数据？', 'What does the latest interim snapshot show?'),
    t('利润与经营现金有什么差异？', 'How do profit and operating cash differ?'),
    t('有哪些需要核实的公告？', 'Which disclosures need verification?'),
    t('接手前需要哪些材料？', 'What evidence is needed before a handover?'),
  ];
  return (
    <section className={`context-questions${compact ? ' context-questions-compact' : ''}`}>
      <div className="context-question-scroll" ref={scrolling}>
        <p className="context-data-note">
          {t(
            '围绕当前企业已取得的公开材料提问，回答和来源按数据快照保存。',
            'Ask about retrieved public company evidence. Answers and sources are saved against their data snapshot.'
          )}
        </p>
        <div className="context-question-suggestions">
          {suggested.map((item) => (
            <button type="button" key={item} disabled={sending} onClick={() => void ask(item)}>
              {item}
            </button>
          ))}
        </div>
        <div
          className="context-question-history"
          role="log"
          aria-label={t('企业问答记录', 'Company question history')}
          aria-live="polite"
          aria-relevant="additions"
        >
          {(run.questions || []).map((answer, index) => (
            <article key={`${answer.createdAt}:${index}`}>
              <h3>{answer.question}</h3>
              <p className="context-answer-text">{answer.text}</p>
              {answer.warning && <p className="context-data-note">{answer.warning}</p>}
              <div className="context-answer-citations">
                {answer.citations.map((source, index) => (
                  <a
                    key={`${source.url}:${index}`}
                    href={`${source.url}${source.page ? `#page=${source.page}` : ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.label}
                    {source.page ? ` · ${t(`第 ${source.page} 页`, `page ${source.page}`)}` : ''}
                    <ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
              <small>
                {answer.mode === 'model'
                  ? t('模型解释与规则底稿', 'Model explanation and rules')
                  : answer.mode === 'rules-fallback'
                    ? t('回落规则回答', 'Rules fallback')
                    : t('规则回答', 'Rules answer')}{' '}
                · {t('数据获取于', 'Data retrieved at')} {date(answer.snapshotFetchedAt, locale)}
                {answer.snapshotFetchedAt !== run.context?.fetchedAt
                  ? ` · ${t('基于先前快照', 'based on a previous snapshot')}`
                  : ''}
              </small>
            </article>
          ))}
          {compact && sending && (
            <article className="context-question-pending">
              <h3>{pendingQuestion}</h3>
              <p role="status">
                <LoaderCircle size={14} className="spinner" />
                {t('正在整理回答…', 'Preparing an answer…')}
              </p>
            </article>
          )}
        </div>
      </div>
      <div className="context-question-footer">
        <form className="start-input context-question-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            {t('企业问题', 'Company question')}
          </label>
          <textarea
            id={inputId}
            value={question}
            maxLength={500}
            rows={2}
            placeholder={t(
              '针对这家公司的公开材料提问',
              'Ask about this company’s public evidence'
            )}
            onChange={(event) => {
              draft.current = event.target.value;
              draftRevision.current += 1;
              setQuestion(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="start-input-toolbar">
            <button
              type="submit"
              className="start-submit"
              disabled={sending || !question.trim()}
              aria-label={t('发送问题', 'Send question')}
            >
              {sending ? <LoaderCircle size={17} className="spinner" /> : <ArrowUp size={18} />}
            </button>
          </div>
        </form>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
