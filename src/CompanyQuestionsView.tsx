import { useEffect, useRef, useState, type FormEvent } from 'react';
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
}: {
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  onAnswer: (answer: CompanyQuestionAnswer) => void;
}) {
  const { t, locale } = useApp(),
    [question, setQuestion] = useState(''),
    [sending, setSending] = useState(false),
    [error, setError] = useState(''),
    [useModel, setUseModel] = useState(false);
  const controller = useRef<AbortController | null>(null),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  const ask = async (value: string) => {
    if (sending || !value.trim()) return;
    const request = new AbortController();
    controller.current = request;
    setSending(true);
    setError('');
    try {
      const answer = await api<CompanyQuestionAnswer>(`/company-runs/${run.id}/questions`, {
        method: 'POST',
        body: JSON.stringify({ question: value.trim(), basis, useModel }),
        signal: request.signal,
      });
      if (active.current && !request.signal.aborted) {
        onAnswer(answer);
        setQuestion('');
      }
    } catch (cause) {
      if (active.current && !request.signal.aborted) setError(requestErrorText(cause, locale));
    } finally {
      if (active.current && !request.signal.aborted) setSending(false);
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
    <section className="context-questions">
      <p className="context-data-note">
        {t(
          '围绕当前企业已取得的公开材料提问。默认使用规则；回答和来源按数据快照保存。',
          'Ask about retrieved public company evidence. Rules are the default; answers and sources are saved against their data snapshot.'
        )}
      </p>
      <div className="context-question-suggestions">
        {suggested.map((item) => (
          <button type="button" key={item} disabled={sending} onClick={() => void ask(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="context-question-history" aria-live="polite">
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
      </div>
      <form className="start-input context-question-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="company-question-input">
          {t('企业问题', 'Company question')}
        </label>
        <textarea
          id="company-question-input"
          value={question}
          maxLength={500}
          rows={2}
          placeholder={t('针对这家公司的公开材料提问', 'Ask about this company’s public evidence')}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="start-input-toolbar">
          <label className="context-model-choice">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(event) => setUseModel(event.target.checked)}
            />
            {t('使用大模型解释', 'Use model explanation')}
          </label>
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
      {useModel && (
        <p className="context-data-note">
          {t(
            '问题与当前企业的公开资料将发送至服务端配置的模型服务；不包含私人核查材料、付款计划或账号资料。请勿在此输入私人信息。',
            'Your question and current public company context will be sent to the configured model provider. Private review materials, payment plans and account data are excluded. Do not enter private information here.'
          )}{' '}
          <a href="/privacy">{t('隐私说明', 'Privacy details')}</a>
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
