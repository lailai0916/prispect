import {
  OPEN_COMPANY_ASSISTANT_EVENT,
  type OpenCompanyAssistantDetail,
} from '../shared/company-navigation';
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  CornerDownLeft,
  LoaderCircle,
  Plus,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import type { AssistantAnswer, AssistantRequest } from '../shared/assistant';
import { companyPath } from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { CompanyAssistantContext } from './company-assistant-context';
import { appendCompanyAnswer } from './company-question-state';
import { useCompanyRecords } from './CompanyRecordsContext';
import { COMPANY_RECORDS_EVENT } from './company-record-events';
import { AssistantFish } from './AssistantFish';
import './company-assistant.css';

interface AssistantMessage {
  id: number;
  request: AssistantRequest;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  answer?: AssistantAnswer;
  cause?: unknown;
}

interface AssistantConversation {
  owner: string | null;
  draft: string;
  messages: AssistantMessage[];
}

function readableSource(url: string, page?: number) {
  try {
    const source = new URL(url, location.origin);
    if (!['http:', 'https:'].includes(source.protocol)) return null;
    if (page && !source.hash) source.hash = `page=${page}`;
    return { href: source.href, external: source.origin !== location.origin };
  } catch {
    return null;
  }
}

export function CompanyAssistant({ route }: { route: string }) {
  const { user, t, locale, navigate } = useApp();
  const { company, publish } = useContext(CompanyAssistantContext);
  const { records } = useCompanyRecords();
  const owner = user?.id || null;
  const query = new URLSearchParams(route.split('?')[1]);
  const [selectedCompany, setSelectedCompany] = useState<{ owner: string; runId: string } | null>(
    null
  );
  const requestedPageRun = route.split('?')[0] === '/company' ? query.get('run') : null;
  const pageRun =
    requestedPageRun &&
    (records.some((record) => record.id === requestedPageRun) ||
      (company?.owner === owner && company.run.id === requestedPageRun))
      ? requestedPageRun
      : null;
  const routeRun =
    pageRun ||
    (selectedCompany?.owner === owner &&
    records.some((record) => record.id === selectedCompany.runId)
      ? selectedCompany.runId
      : null);
  const current =
    routeRun && company?.owner === owner && company.run.id === routeRun ? company : null;
  const [open, setOpen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [conversation, setConversation] = useState<AssistantConversation>({
    owner,
    draft: '',
    messages: [],
  });
  const [queuedQuestion, setQueuedQuestion] = useState<OpenCompanyAssistantDetail | null>(null);
  const messages = conversation.owner === owner ? conversation.messages : [];
  const draft = conversation.owner === owner ? conversation.draft : '';
  const pending = messages.find((message) => message.status === 'pending');
  const previousCompany = [...messages].reverse().find((message) => message.answer?.company)
    ?.answer?.company;
  const recent = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const currentRecord = records.find((record) => record.id === routeRun);
  const backgroundCompany = current
    ? {
        name:
          current.run.identity?.shortName ||
          current.run.context?.companyName ||
          currentRecord?.name ||
          current.run.input.securityCode,
        year: current.run.input.year,
      }
    : currentRecord
      ? { name: currentRecord.name, year: currentRecord.input.year }
      : previousCompany || (recent ? { name: recent.name, year: recent.input.year } : null);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scrolling = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const request = useRef<{
    owner: string | null;
    id: number;
    controller: AbortController;
  } | null>(null);
  const reportView =
    query.get('report') === 'ai' && (!query.get('section') || query.get('section') === 'overview');
  const latest = useRef({ owner, current, routeRun, locale, publish, conversation, reportView });
  latest.current = { owner, current, routeRun, locale, publish, conversation, reportView };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.controller.abort();
      request.current = null;
    };
  }, []);
  useEffect(() => {
    if (conversation.owner === owner) return;
    request.current?.controller.abort();
    request.current = null;
    setConversation({ owner, draft: '', messages: [] });
    setQueuedQuestion(null);
    setOpen(false);
    following.current = true;
  }, [owner, conversation.owner]);
  useEffect(() => {
    setSelectedCompany(null);
  }, [route, owner]);
  useEffect(() => {
    const openCompanyAssistant = (event: Event) => {
      const detail = (event as CustomEvent<OpenCompanyAssistantDetail>).detail;
      if (
        !owner ||
        detail?.owner !== owner ||
        (!records.some((record) => record.id === detail.runId) &&
          !(current?.owner === owner && current.run.id === detail.runId))
      )
        return;
      setSelectedCompany({ owner, runId: detail.runId });
      setOpen(true);
      if (
        typeof detail.question === 'string' &&
        detail.question.trim() &&
        detail.question.trim().length <= 500
      )
        setQueuedQuestion({ ...detail, question: detail.question.trim() });
    };
    window.addEventListener(OPEN_COMPANY_ASSISTANT_EVENT, openCompanyAssistant);
    return () => window.removeEventListener(OPEN_COMPANY_ASSISTANT_EVENT, openCompanyAssistant);
  }, [owner, records, current]);
  useEffect(() => {
    if (routeRun && query.get('section') === 'qa') {
      setOpen(true);
      navigate(companyPath(routeRun), { replace: true });
    }
  }, [route, navigate]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    if (open && following.current && scrolling.current)
      scrolling.current.scrollTop = scrolling.current.scrollHeight;
  }, [open, messages]);

  const perform = async (message: AssistantMessage, clearDraft = false) => {
    const session = latest.current;
    if (
      request.current ||
      session.conversation.owner !== session.owner ||
      !message.request.question.trim()
    )
      return;
    const controller = new AbortController();
    const operation = { owner: session.owner, id: message.id, controller };
    request.current = operation;
    following.current = true;
    setConversation((previous) => {
      if (previous.owner !== operation.owner) return previous;
      const next = { ...message, status: 'pending' as const, answer: undefined, cause: undefined };
      return {
        ...previous,
        draft: clearDraft ? '' : previous.draft,
        messages: previous.messages.some((item) => item.id === message.id)
          ? previous.messages.map((item) => (item.id === message.id ? next : item))
          : [...previous.messages, next],
      };
    });
    const isCurrent = () =>
      mounted.current &&
      request.current === operation &&
      !controller.signal.aborted &&
      latest.current.owner === operation.owner;
    try {
      const answer = await api<AssistantAnswer>('/assistant/messages', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify(message.request),
      });
      if (!isCurrent()) return;
      setConversation((previous) => {
        if (previous.owner !== operation.owner) return previous;
        return {
          ...previous,
          messages: previous.messages.map((item) =>
            item.id === message.id
              ? { ...item, status: 'completed', answer, cause: undefined }
              : item
          ),
        };
      });
      if (answer.kind === 'company' && answer.company && operation.owner) {
        const context = latest.current.current;
        if (context?.owner === operation.owner && context.run.id === answer.company.runId) {
          latest.current.publish({
            ...context,
            run: appendCompanyAnswer(context.run, answer),
          });
          window.dispatchEvent(
            new CustomEvent('prispect:company-run-updated', { detail: answer.company.runId })
          );
        } else window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
      }
    } catch (cause) {
      if (!isCurrent()) return;
      setConversation((previous) =>
        previous.owner !== operation.owner
          ? previous
          : {
              ...previous,
              messages: previous.messages.map((item) =>
                item.id === message.id ? { ...item, status: 'failed', cause } : item
              ),
            }
      );
    } finally {
      if (request.current === operation) request.current = null;
    }
  };
  const ask = (value: string, clearDraft = false, source?: OpenCompanyAssistantDetail) => {
    const session = latest.current;
    const question = value.trim();
    if (!question || request.current || session.conversation.owner !== session.owner) return;
    const previous = [...session.conversation.messages]
      .reverse()
      .find((message) => message.answer?.company)?.answer?.company;
    const payload: AssistantRequest = {
      question,
      locale: session.locale === 'en' ? 'en' : 'zh',
      basis: source?.basis || session.current?.basis || 'consolidated',
      ...(source?.runId || session.routeRun
        ? { currentRunId: source?.runId || session.routeRun! }
        : {}),
      ...(source?.reportGeneratedAt ||
      (session.reportView && session.current?.run.assessment?.generatedAt)
        ? {
            reportGeneratedAt:
              source?.reportGeneratedAt || session.current!.run.assessment!.generatedAt,
          }
        : {}),
      ...(previous && (!source || previous.runId === source.runId)
        ? { previousRunId: previous.runId }
        : {}),
      previousQuestions: session.conversation.messages
        .filter((message) => !source || message.request.currentRunId === source.runId)
        .slice(-4)
        .map((message) => message.request.question),
    };
    void perform({ id: ++sequence.current, request: payload, status: 'pending' }, clearDraft);
  };
  useEffect(() => {
    if (!queuedQuestion) return;
    if (queuedQuestion.owner !== owner || conversation.owner !== owner) {
      setQueuedQuestion(null);
      return;
    }
    if (request.current || pending) return;
    setQueuedQuestion(null);
    ask(queuedQuestion.question!, false, queuedQuestion);
  }, [queuedQuestion, pending, owner, conversation.owner]);
  const cancel = () => {
    const operation = request.current;
    if (!operation || operation.owner !== latest.current.owner) return;
    operation.controller.abort();
    request.current = null;
    setConversation((previous) =>
      previous.owner !== operation.owner
        ? previous
        : {
            ...previous,
            messages: previous.messages.map((message) =>
              message.id === operation.id ? { ...message, status: 'cancelled' } : message
            ),
          }
    );
    input.current?.focus();
  };
  const newConversation = () => {
    const session = latest.current;
    const operation = request.current;
    request.current = null;
    operation?.controller.abort();
    const next: AssistantConversation = { owner: session.owner, draft: '', messages: [] };
    latest.current = {
      ...session,
      conversation: next,
      routeRun: pageRun,
      current: pageRun ? session.current : null,
    };
    setSelectedCompany(null);
    setQueuedQuestion(null);
    setConversation(next);
    following.current = true;
    if (scrolling.current) scrolling.current.scrollTop = 0;
    input.current?.focus();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft, true);
  };
  const fillSuggestion = (question: string) => {
    const sessionOwner = latest.current.owner;
    setConversation((previous) => {
      if (previous.owner !== sessionOwner) return previous;
      const nextDraft = previous.draft.trim()
        ? previous.draft.includes(question)
          ? previous.draft
          : `${previous.draft}\n\n${question}`
        : question;
      return nextDraft.length > 500 ? previous : { ...previous, draft: nextDraft };
    });
    input.current?.focus();
  };
  const suggestions = backgroundCompany
    ? [
        t(
          `${backgroundCompany.name}的利润与经营现金有什么差异？`,
          `How do ${backgroundCompany.name}'s profit and operating cash differ?`
        ),
        t(
          `${backgroundCompany.name}最近有哪些需要核实的公告？`,
          `Which recent disclosures from ${backgroundCompany.name} need verification?`
        ),
        t('如何核对数据来源？', 'How can I verify data sources?'),
      ]
    : [
        t('如何开始公司研究？', 'How do I start company research?'),
        t('财务评级如何计算？', 'How is the financial grade calculated?'),
        t('如何核对数据来源？', 'How can I verify data sources?'),
      ];
  return (
    <>
      <div
        id={panelId}
        ref={panel}
        className="company-assistant-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${panelId}-title`}
        hidden={!open}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <header className="company-assistant-header">
          <div>
            <AssistantFish happy={open} />
            <h2 id={`${panelId}-title`}>{t('析光助手', 'Prispect assistant')}</h2>
          </div>
          <div className="company-assistant-header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t('新建对话', 'New conversation')}
              title={t('新建对话', 'New conversation')}
              onClick={newConversation}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t('收起助手', 'Close assistant')}
              onClick={close}
            >
              <X size={17} />
            </button>
          </div>
        </header>
        <div
          className="company-assistant-history"
          ref={scrolling}
          role="log"
          aria-label={t('助手对话', 'Assistant conversation')}
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={() => {
            const element = scrolling.current;
            if (element)
              following.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          }}
        >
          {!messages.length && (
            <div className="company-assistant-empty">
              <div className="company-assistant-welcome">
                <AssistantFish happy />
                <p>{t('你好呀，想一起看看什么？', 'Hi! What shall we look into?')}</p>
              </div>
              <div className="company-assistant-suggestions">
                {suggestions.map((question) => (
                  <button type="button" key={question} onClick={() => fillSuggestion(question)}>
                    {question}
                    <CornerDownLeft size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => {
            const answer = message.answer;
            const sources = answer
              ? [...answer.citations, ...(answer.research?.sources || [])].filter(
                  (source, index, all) => all.findIndex((item) => item.url === source.url) === index
                )
              : [];
            return (
              <article className="company-assistant-message" key={message.id}>
                <h3 className="company-assistant-question">{message.request.question}</h3>
                {message.status === 'pending' ? (
                  <p className="company-assistant-pending" role="status">
                    <LoaderCircle size={13} className="spinner" aria-hidden="true" />
                    {t('正在查阅资料', 'Looking up sources')}
                  </p>
                ) : answer ? (
                  <div className="company-assistant-answer">
                    {answer.company && (
                      <a
                        className="company-assistant-answer-company"
                        href={companyPath(answer.company.runId)}
                      >
                        {answer.company.name} · {answer.company.year}
                        <ArrowUpRight size={11} aria-hidden="true" />
                      </a>
                    )}
                    <p className="company-assistant-answer-text">{answer.text}</p>
                    {answer.warning && (
                      <p className="company-assistant-warning">{answer.warning}</p>
                    )}
                    {sources.length > 0 && (
                      <div
                        className="company-assistant-sources"
                        aria-label={t('回答依据', 'Answer sources')}
                      >
                        {sources.map((source) => {
                          const page =
                            'page' in source && typeof source.page === 'number'
                              ? source.page
                              : undefined;
                          const link = readableSource(source.url, page);
                          return link ? (
                            <a
                              key={source.url}
                              href={link.href}
                              target={link.external ? '_blank' : undefined}
                              rel={link.external ? 'noopener noreferrer' : undefined}
                            >
                              {source.label}
                              {page ? ` · ${t('第', 'p. ')}${page}${t('页', '')}` : ''}
                              <ArrowUpRight size={11} aria-hidden="true" />
                            </a>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="company-assistant-message-error">
                    <p role={message.status === 'failed' ? 'alert' : 'status'}>
                      {message.status === 'cancelled'
                        ? t('已取消', 'Cancelled')
                        : requestErrorText(message.cause, locale)}
                    </p>
                    <button
                      type="button"
                      className="text-link"
                      disabled={Boolean(pending)}
                      onClick={() => void perform(message)}
                    >
                      <RefreshCw size={12} />
                      {t('重试', 'Retry')}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {queuedQuestion?.owner === owner && pending && (
            <p className="company-assistant-pending" role="status">
              {t('待回答：', 'Next question: ')}
              {queuedQuestion.question}
            </p>
          )}
        </div>
        <div className="company-assistant-footer">
          <form className="company-assistant-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor={`${panelId}-question`}>
              {t('向析光助手提问', 'Ask Prispect assistant')}
            </label>
            <textarea
              ref={input}
              id={`${panelId}-question`}
              value={draft}
              rows={2}
              maxLength={500}
              placeholder={t('输入问题', 'Ask a question')}
              onChange={(event) => {
                const value = event.target.value;
                setConversation((previous) =>
                  previous.owner === owner ? { ...previous, draft: value } : previous
                );
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
            <div className="company-assistant-composer-toolbar">
              {pending ? (
                <button
                  key="cancel"
                  type="button"
                  className="company-assistant-send"
                  onClick={(event) => {
                    event.preventDefault();
                    cancel();
                  }}
                  aria-label={t('取消本次查询', 'Cancel this request')}
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  key="send"
                  type="submit"
                  className="company-assistant-send"
                  disabled={!draft.trim() || conversation.owner !== owner}
                  aria-label={t('发送问题', 'Send question')}
                >
                  <ArrowUp size={17} />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      <button
        type="button"
        ref={trigger}
        className="company-assistant-trigger"
        data-idle={!open}
        data-page-visible={pageVisible}
        aria-label={
          open
            ? t('收起析光助手', 'Close Prispect assistant')
            : t('打开析光助手', 'Open Prispect assistant')
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <AssistantFish happy={open} />
        {open && (
          <span className="company-assistant-close-mark" aria-hidden="true">
            <X size={12} />
          </span>
        )}
        <span className="company-assistant-trigger-label" aria-hidden="true">
          {open ? t('收起对话', 'Close chat') : t('问问小鱼', 'Ask me')}
        </span>
      </button>
    </>
  );
}
