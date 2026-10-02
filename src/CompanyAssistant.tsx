import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, BookOpen, LoaderCircle, MessageCircle, RefreshCw, X } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import type { CompanyRecordSummary, CompanyQuestionAnswer } from '../shared/company-workspace';
import { companyPath } from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { CompanyAssistantContext } from './company-assistant-context';
import { CompanyQuestionsView } from './CompanyQuestionsView';
import { COMPANY_RECORDS_EVENT } from './CompanySidebar';
import './home.css';
import './company-assistant.css';

export function CompanyAssistant({ route }: { route: string }) {
  const { user, t, locale, navigate } = useApp();
  const { company, publish } = useContext(CompanyAssistantContext);
  const query = new URLSearchParams(route.split('?')[1]);
  const routeRun = route.split('?')[0] === '/company' ? query.get('run') : null;
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<CompanyRecordSummary[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [selected, setSelected] = useState(routeRun || company?.run.id || '');
  const [loadedRun, setLoadedRun] = useState<CompanyResearchRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [basis, setBasis] = useState<CompanyReadingBasis>('parent');
  const [mode, setMode] = useState<'company' | 'help'>(routeRun || company ? 'company' : 'help');
  const [helpQuestion, setHelpQuestion] = useState('');
  const [helpAnswers, setHelpAnswers] = useState<{ question: string; text: string }[]>([]);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const helpScrolling = useRef<HTMLDivElement>(null);
  const current =
    routeRun &&
    company &&
    company.owner === user?.id &&
    company.run.id === selected &&
    selected === routeRun
      ? company
      : null;
  const run = current?.run || (loadedRun?.id === selected ? loadedRun : null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!routeRun) return;
    setSelected(routeRun);
    setMode('company');
  }, [routeRun]);
  useEffect(() => {
    if (routeRun && query.get('section') === 'qa') {
      setOpen(true);
      navigate(companyPath(routeRun), { replace: true });
    }
  }, [route, navigate]);
  useEffect(() => {
    if (!selected && company && company.owner === user?.id) setSelected(company.run.id);
  }, [company?.run.id, user?.id]);
  useEffect(() => {
    if (current) setBasis(current.basis);
  }, [current?.basis, selected]);
  useEffect(() => {
    if (open && mode === 'help' && helpScrolling.current)
      helpScrolling.current.scrollTop = helpScrolling.current.scrollHeight;
  }, [open, mode, helpAnswers.length]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const input = panel.current?.querySelector<HTMLTextAreaElement>(
        '.company-assistant-content:not([hidden]) textarea'
      );
      if (input) input.focus();
      else panel.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, mode, run?.id, Boolean(run?.context)]);
  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController();
    let generation = 0;
    const load = async () => {
      const currentGeneration = ++generation;
      try {
        const next = await api<CompanyRecordSummary[]>('/company-records', {
          signal: controller.signal,
        });
        if (controller.signal.aborted || currentGeneration !== generation) return;
        const sorted = next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setRecords(sorted);
        setRecordsLoaded(true);
        setRecordsError('');
        setSelected((previous) =>
          sorted.some((record) => record.id === previous) || previous === routeRun
            ? previous
            : sorted[0]?.id || ''
        );
      } catch (cause) {
        if (!controller.signal.aborted && currentGeneration === generation)
          setRecordsError(requestErrorText(cause, locale));
      }
    };
    void load();
    const update = () => void load();
    window.addEventListener(COMPANY_RECORDS_EVENT, update);
    return () => {
      controller.abort();
      window.removeEventListener(COMPANY_RECORDS_EVENT, update);
    };
  }, [open, user?.id, locale, retry, routeRun]);
  useEffect(() => {
    if (!open || !user || !selected || current) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setLoadError('');
    const load = async () => {
      try {
        const next = await api<CompanyResearchRun>(
          `/company-runs/${encodeURIComponent(selected)}`,
          {
            signal: controller.signal,
          }
        );
        if (controller.signal.aborted) return;
        setLoadedRun(next);
        if (
          next.status === 'queued' ||
          next.status === 'running' ||
          next.contextStatus === 'loading'
        )
          timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError(requestErrorText(cause, locale));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, user?.id, selected, locale, retry, Boolean(current)]);

  const onAnswer = (answer: CompanyQuestionAnswer) => {
    if (!run || !user) return;
    const next = { ...run, questions: [...(run.questions || []), answer].slice(-50) };
    setLoadedRun(next);
    if (current) publish({ ...current, run: next });
    window.dispatchEvent(new CustomEvent('prispect:company-run-updated', { detail: run.id }));
  };
  const help = (value: string) => {
    const question = value.trim();
    if (!question) return;
    const text = /查询|搜索|开始|search|start|query/i.test(question)
      ? t(
          '登录后点击“新建查询”，输入公司名称或证券代码，选择候选企业。概览会先显示，年报原件在后台继续核查。',
          'Sign in, open New query, and enter a company name or security code. Select a matching entity; context appears while originals are checked in the background.'
        )
      : /来源|数据|出处|缺失|source|data|missing/i.test(question)
        ? t(
            '在企业页打开“来源比对”或数字旁的“字段与来源”，查看报告期、原始金额和来源。未取得的数据保持未知；网页数据不会自动成为已确认的原件证据。',
            'Open Source comparison or Fields and sources to inspect report periods, source amounts and links. Missing data stays unknown; web data is not automatically adopted as original evidence.'
          )
        : /材料|导入|付款|交接|工具|import|material|payment|handover|tool/i.test(question)
          ? t(
              '侧边栏“核查工具”中保留财报工作台、材料中心、付款与交接、核查比较。材料可以先预览，确认后再保存和核查。',
              'Review tools contains the financial workbench, Materials, Payments and handovers, and Compare reviews. Preview evidence before confirming and saving it.'
            )
          : /问答|企业|公司|口径|规则|模型|company|question|model|profit|rules/i.test(question)
            ? t(
                '选择上方“企业问答”和已载入企业，即可继续原有问答。默认使用规则，回答和引用保存在该企业记录中；使用大模型解释需要主动勾选。',
                'Choose Company questions and a loaded company above. Rules are the default; answers and citations stay with that company record. Model explanations require explicit opt-in.'
              )
            : t(
                '我可以介绍公司查询、数据来源、核查工具和企业问答的使用方法。具体企业财务问题，请切换“企业问答”并选择已载入企业；更多说明见使用文档。',
                'I can explain company search, sources, review tools and company questions. For financial questions, choose Company questions and a loaded company. See the documentation for more help.'
              );
    setHelpAnswers((previous) => [...previous, { question, text }].slice(-20));
    setHelpQuestion('');
  };
  const submitHelp = (event: FormEvent) => {
    event.preventDefault();
    help(helpQuestion);
  };
  const choices = records.filter(
    (record, index) =>
      record.id === routeRun ||
      records.findIndex(
        (item) =>
          item.input.securityCode === record.input.securityCode &&
          item.input.orgId === record.input.orgId &&
          item.name === record.name
      ) === index
  );
  const selectedChoice = choices.find((record) => record.id === selected);
  const name =
    run?.informationGap?.name ||
    run?.identity?.shortName ||
    run?.context?.companyName ||
    selectedChoice?.name ||
    '';
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
            <MessageCircle size={18} />
            <div>
              <h2 id={`${panelId}-title`}>{t('析光助手', 'Prispect assistant')}</h2>
              <p>{t('使用帮助与企业资料', 'Product help and company evidence')}</p>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label={t('收起助手', 'Close assistant')}
            onClick={close}
          >
            <X size={17} />
          </button>
        </header>
        <div
          className="company-assistant-context-controls"
          role="group"
          aria-label={t('助手功能', 'Assistant mode')}
        >
          <button
            type="button"
            className="text-link"
            aria-pressed={mode === 'company'}
            onClick={() => setMode('company')}
          >
            {t('企业问答', 'Company questions')}
          </button>
          <button
            type="button"
            className="text-link"
            aria-pressed={mode === 'help'}
            onClick={() => setMode('help')}
          >
            {t('使用帮助', 'Product help')}
          </button>
        </div>
        <div className="company-assistant-content" hidden={mode !== 'company'}>
          {user ? (
            <>
              <div className="company-assistant-company-picker">
                <label htmlFor={`${panelId}-company`}>{t('企业', 'Company')}</label>
                <select
                  id={`${panelId}-company`}
                  value={selected}
                  disabled={!choices.length}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setLoadError('');
                    setBasis('parent');
                  }}
                >
                  {!choices.length && (
                    <option value={selected}>
                      {name || t('请选择已载入企业', 'Select a loaded company')}
                    </option>
                  )}
                  {selected &&
                    !choices.some((record) => record.id === selected) &&
                    choices.length > 0 && <option value={selected}>{name || selected}</option>}
                  {choices.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name} · {record.input.year}
                    </option>
                  ))}
                </select>
              </div>
              {run?.context && (
                <div className="company-assistant-context-controls">
                  <label htmlFor={`${panelId}-basis`}>{t('利润口径', 'Profit basis')}</label>
                  <select
                    id={`${panelId}-basis`}
                    value={basis}
                    onChange={(event) => {
                      const next = event.target.value as CompanyReadingBasis;
                      setBasis(next);
                      current?.changeBasis(next);
                    }}
                  >
                    <option value="parent">{t('归母净利润', 'Attributable profit')}</option>
                    <option value="consolidated">{t('合并净利润', 'Consolidated profit')}</option>
                  </select>
                </div>
              )}
              {(recordsError || loadError) && (
                <p className="context-data-note" role="alert">
                  {recordsError || loadError}
                  <button className="text-link" onClick={() => setRetry((value) => value + 1)}>
                    <RefreshCw size={12} />
                    {t('重试', 'Retry')}
                  </button>
                </p>
              )}
              {run?.context ? (
                <CompanyQuestionsView
                  key={run.id}
                  compact
                  run={run}
                  basis={basis}
                  onAnswer={onAnswer}
                />
              ) : (
                <div className="company-assistant-empty">
                  {(loading || (!recordsLoaded && !recordsError)) && (
                    <LoaderCircle size={17} className="spinner" />
                  )}
                  <p>
                    {selected
                      ? t(
                          '企业公开资料尚未取得。可先查看原件核查，资料就绪后再提问。',
                          'Public company context is not ready. Inspect original verification, then ask when context is available.'
                        )
                      : t(
                          '先查询一家企业，或切换“使用帮助”了解如何操作。',
                          'Search for a company first, or open Product help to learn how.'
                        )}
                  </p>
                  <a href={selected ? companyPath(selected) : '/query'}>
                    {t('打开公司查询', 'Open company query')}
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="company-assistant-empty">
              <p>
                {t(
                  '登录后，可以查询企业并继续已保存的问答。使用帮助无需登录。',
                  'Sign in to query companies and continue saved answers. Product help is available without signing in.'
                )}
              </p>
              <a href="/login">{t('登录', 'Sign in')}</a>
              <button className="text-link" onClick={() => setMode('help')}>
                {t('查看使用帮助', 'Open product help')}
              </button>
            </div>
          )}
        </div>
        <div
          className="company-assistant-content context-questions-compact"
          hidden={mode !== 'help'}
        >
          <div className="context-question-scroll" ref={helpScrolling} aria-live="polite">
            <p className="context-data-note">
              {t(
                '你好，我可以帮你了解析光的使用方法。',
                'Hello. I can help you find your way around Prispect.'
              )}
            </p>
            <div className="context-question-suggestions">
              {[
                t('如何开始查询？', 'How do I start a query?'),
                t('在哪里核对来源？', 'Where can I check sources?'),
                t('核查工具在哪里？', 'Where are the review tools?'),
              ].map((question) => (
                <button type="button" key={question} onClick={() => help(question)}>
                  {question}
                </button>
              ))}
            </div>
            <div className="context-question-history">
              {helpAnswers.map((answer, index) => (
                <article key={index}>
                  <h3>{answer.question}</h3>
                  <p className="context-answer-text">{answer.text}</p>
                </article>
              ))}
            </div>
            <a className="text-link" href="/docs">
              <BookOpen size={13} />
              {t('查看使用文档', 'Open documentation')}
            </a>
          </div>
          <div className="context-question-footer">
            <form className="start-input context-question-composer" onSubmit={submitHelp}>
              <label className="sr-only" htmlFor={`${panelId}-help`}>
                {t('使用问题', 'Product question')}
              </label>
              <textarea
                id={`${panelId}-help`}
                value={helpQuestion}
                rows={2}
                maxLength={500}
                placeholder={t('有什么可以帮你？', 'How can I help?')}
                onChange={(event) => setHelpQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="start-input-toolbar">
                <small>{t('本地使用帮助', 'Local product help')}</small>
                <button
                  type="submit"
                  className="start-submit"
                  disabled={!helpQuestion.trim()}
                  aria-label={t('发送使用问题', 'Send product question')}
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <button
        type="button"
        ref={trigger}
        className="company-assistant-trigger"
        aria-label={
          open
            ? t('收起析光助手', 'Close Prispect assistant')
            : t('打开析光助手', 'Open Prispect assistant')
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <X size={22} /> : <MessageCircle size={23} />}
      </button>
    </>
  );
}
