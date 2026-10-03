import { productTerms } from '../shared/product-terms';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  HandCoins,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { useApp } from './context';
import { interpretStart, type StartKind } from '../shared/start-intent';
import { clearComposerDraft, readComposerDraft, writeComposerDraft } from './start-draft';
import type { CompanyIdentity, CompanySearchResponse } from '../shared/contracts';
import { api, requestErrorText } from './api';
import type { CompanyDirectory } from '../shared/company-directory';
import {
  CompanySearchClient,
  companyMatchesQuery,
  normalizeCompanySearchQuery,
} from './company-search-client';
import './home.css';

type StartMode = StartKind | 'auto';

export function StartInput({
  compact = false,
  onCompanyChoice,
  companyOnly = false,
  toolbar,
  disabled = false,
  initialText,
  onInformationGap,
}: {
  compact?: boolean;
  onCompanyChoice?: (identity: CompanyIdentity, text: string) => void;
  companyOnly?: boolean;
  toolbar?: ReactNode;
  disabled?: boolean;
  initialText?: string;
  onInformationGap?: (name: string) => void;
}) {
  const { t, navigate, user, locale } = useApp();
  const composerId = useId();
  const inputId = `start-query-${composerId}`;
  const listId = `company-completion-list-${composerId}`;
  const errorId = `start-error-${composerId}`;
  const owner = user?.id || null;
  const [draft, setDraft] = useState(() => readComposerDraft(owner));
  const compatibleDraft =
    !companyOnly ||
    draft?.mode === 'company' ||
    (draft?.mode === 'auto' && interpretStart(draft.text).kind === 'company');
  const [mode, setMode] = useState<StartMode>(companyOnly ? 'company' : draft?.mode || 'auto');
  const [text, setText] = useState(
    initialText?.trim().slice(0, 80) || (compatibleDraft ? draft?.text : '') || ''
  );
  const [textOwner, setTextOwner] = useState(owner);
  const [formError, setError] = useState('');
  const [matches, setMatches] = useState<{
    query: string;
    candidates: CompanyIdentity[];
    phase: 'idle' | 'finding' | 'done' | 'failed';
    cause?: unknown;
    unlisted?: boolean;
  }>({ query: '', candidates: [], phase: 'idle' });
  const [completionOpen, setCompletionOpen] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(-1);
  const composer = useRef<HTMLFormElement>(null);
  const selectionText = useRef('');
  const selectedCompany = useRef<CompanyIdentity | null>(null);
  const intent = interpretStart(text, mode);
  const safeQuery = companyOnly ? text.trim() || null : intent.companyQuery;
  const companyIntent = companyOnly || intent.kind === 'company';
  const queryKey = normalizeCompanySearchQuery(safeQuery || '');
  const canSearch = Boolean(
    owner &&
      owner === textOwner &&
      companyIntent &&
      safeQuery &&
      safeQuery.length >= (companyOnly ? 1 : 2) &&
      safeQuery.length <= 80 &&
      !disabled
  );
  const candidates = !canSearch
    ? []
    : matches.query === queryKey
      ? matches.candidates
      : matches.candidates.filter((identity) => companyMatchesQuery(identity, queryKey));
  const finding = canSearch && matches.query === queryKey && matches.phase === 'finding';
  const searched = canSearch && matches.query === queryKey && matches.phase === 'done';
  const searchFailed = canSearch && matches.query === queryKey && matches.phase === 'failed';
  const error = formError || (searchFailed ? requestErrorText(matches.cause, locale) : '');
  const latest = useRef({
    owner,
    queryKey,
    text,
    disabled,
    canSearch,
    candidates,
    onCompanyChoice,
    onInformationGap,
    navigate,
  });
  latest.current = {
    owner,
    queryKey,
    text,
    disabled,
    canSearch,
    candidates,
    onCompanyChoice,
    onInformationGap,
    navigate,
  };
  const client = useMemo(
    () =>
      new CompanySearchClient(
        (signal) => api<CompanyDirectory>('/companies/directory', { signal }),
        (query, signal) =>
          api<CompanySearchResponse>(`/companies/search?q=${encodeURIComponent(query)}`, {
            signal,
          })
      ),
    [owner]
  );
  const attachedClient = useRef<CompanySearchClient | null>(null);
  const request = useRef<{
    owner: string | null;
    query: string;
    key: string;
    controller: AbortController;
    timer: ReturnType<typeof setTimeout> | null;
    started: boolean;
    submitted: string | null;
    start: () => void;
    useLocal: (response: CompanySearchResponse) => void;
  } | null>(null);
  const cancelSearch = useCallback(() => {
    if (request.current?.timer) clearTimeout(request.current.timer);
    request.current?.controller.abort();
    request.current = null;
  }, []);
  const chooseCompany = useCallback(
    (identity: CompanyIdentity, submittedText = latest.current.text.trim()) => {
      const current = latest.current;
      if (current.disabled || !current.canSearch) return;
      cancelSearch();
      selectionText.current = identity.shortName;
      selectedCompany.current = identity;
      setText(identity.shortName);
      setCompletionOpen(false);
      setActiveCandidate(-1);
      setError('');
      if (current.onCompanyChoice) current.onCompanyChoice(identity, submittedText);
      else
        current.navigate(
          `/company?query=${encodeURIComponent(identity.shortName)}&code=${identity.securityCode}${interpretStart(submittedText, 'company').year ? `&year=${interpretStart(submittedText, 'company').year}` : ''}`
        );
    },
    [cancelSearch]
  );
  const matchCompanies = useCallback(
    (query: string, immediate = false, submitted: string | null = null, refresh = false) => {
      const key = normalizeCompanySearchQuery(query);
      const current = latest.current;
      if (!current.canSearch || current.queryKey !== key) return;
      const existing = request.current;
      if (
        !refresh &&
        existing &&
        existing.owner === current.owner &&
        existing.key === key &&
        !existing.controller.signal.aborted
      ) {
        if (submitted !== null) existing.submitted = submitted;
        if (immediate) existing.start();
        return;
      }
      cancelSearch();
      const controller = new AbortController();
      const next = {
        owner: current.owner,
        query,
        key,
        controller,
        timer: null as ReturnType<typeof setTimeout> | null,
        started: false,
        submitted,
        start: () => {},
        useLocal: (_response: CompanySearchResponse) => {},
      };
      request.current = next;
      const isCurrent = () =>
        request.current === next &&
        !controller.signal.aborted &&
        latest.current.owner === next.owner &&
        latest.current.queryKey === key &&
        latest.current.canSearch;
      const complete = (response: CompanySearchResponse) => {
        if (!isCurrent()) return;
        request.current = null;
        setMatches({
          query: key,
          candidates: response.candidates,
          phase: 'done',
          unlisted: Boolean(response.unlisted),
        });
        setError('');
        if (next.submitted === null) return;
        const submittedText = next.submitted;
        next.submitted = null;
        if (
          normalizeCompanySearchQuery(latest.current.text) !==
          normalizeCompanySearchQuery(submittedText)
        )
          return;
        if (response.candidates.length === 1) {
          chooseCompany(response.candidates[0]!, submittedText);
        } else if (response.candidates.length > 1) {
          setCompletionOpen(true);
          setActiveCandidate(0);
        } else if (latest.current.onCompanyChoice) {
          latest.current.onInformationGap?.(submittedText);
        } else {
          clearComposerDraft();
          const submittedIntent = interpretStart(submittedText, 'company');
          latest.current.navigate(
            `/company?query=${encodeURIComponent(query)}${submittedIntent.year ? `&year=${submittedIntent.year}` : ''}`
          );
        }
      };
      next.useLocal = (response) => {
        complete(response);
        controller.abort();
      };
      const cached = !refresh ? client.peek(query) : null;
      if (cached) {
        next.started = true;
        complete(cached);
        return;
      }
      setMatches((previous) => ({
        query: key,
        candidates: previous.candidates.filter((identity) => companyMatchesQuery(identity, key)),
        phase: 'finding',
      }));
      setActiveCandidate(-1);
      next.start = () => {
        if (next.started || !isCurrent()) return;
        next.started = true;
        if (next.timer) clearTimeout(next.timer);
        next.timer = null;
        void client.search(query, controller.signal, refresh).then(complete, (cause: unknown) => {
          if (!isCurrent()) return;
          setMatches((previous) => ({ ...previous, query: key, phase: 'failed', cause }));
          next.submitted = null;
          request.current = null;
        });
      };
      if (immediate || /^\d{6}$/.test(key)) next.start();
      else next.timer = setTimeout(next.start, 180);
    },
    [cancelSearch, chooseCompany, client]
  );
  useEffect(() => {
    if (textOwner === owner) return;
    cancelSearch();
    selectionText.current = '';
    selectedCompany.current = null;
    const nextDraft = readComposerDraft(owner);
    const nextCompatible =
      !companyOnly ||
      nextDraft?.mode === 'company' ||
      (nextDraft?.mode === 'auto' && interpretStart(nextDraft.text).kind === 'company');
    setDraft(nextDraft);
    setText(initialText?.trim().slice(0, 80) || (nextCompatible ? nextDraft?.text : '') || '');
    setMode(companyOnly ? 'company' : nextDraft?.mode || 'auto');
    setTextOwner(owner);
    setError('');
    setMatches({ query: '', candidates: [], phase: 'idle' });
  }, [owner, textOwner, companyOnly, initialText, cancelSearch]);
  useEffect(() => {
    attachedClient.current = client;
    if (owner)
      void client.preload().then(
        () => {
          const pending = request.current;
          const local = pending?.owner === owner ? client.peek(pending.query) : null;
          if (local) pending?.useLocal(local);
        },
        () => undefined
      );
    return () => {
      cancelSearch();
      attachedClient.current = null;
      // Strict Mode immediately reconnects this instance; real detachments retire it.
      queueMicrotask(() => {
        if (attachedClient.current !== client) client.dispose();
      });
    };
  }, [client, owner, cancelSearch]);
  useEffect(() => {
    if (!canSearch || selectionText.current === latest.current.text) {
      cancelSearch();
      setMatches({ query: queryKey, candidates: [], phase: 'idle' });
      setActiveCandidate(-1);
      return;
    }
    matchCompanies(safeQuery!);
    return cancelSearch;
    // Matching uses the normalized public query; locale and whitespace do not start new requests.
  }, [queryKey, canSearch, client, matchCompanies, cancelSearch]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !composer.current?.contains(event.target))
        setCompletionOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    // Opening a company search must neither query nor erase an unrelated private draft.
    if (textOwner !== owner || (companyOnly && !compatibleDraft && !text)) return;
    writeComposerDraft({ owner, text, mode });
  }, [owner, textOwner, text, mode, companyOnly, compatibleDraft]);
  const choices = [
    { id: 'auto' as const, label: t('自动识别', 'Automatic'), Icon: Sparkles },
    { id: 'company' as const, label: t(...productTerms.companyResearch), Icon: Building2 },
    { id: 'external' as const, label: t(...productTerms.beforePayment), Icon: HandCoins },
    { id: 'handover' as const, label: t(...productTerms.handoverReview), Icon: Wallet },
  ];
  const selected = choices.find((item) => item.id === mode)!;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || textOwner !== owner) return;
    const value = text.trim();
    if (!value) return;
    const intent = interpretStart(value, mode);
    if (intent.kind === 'company') {
      if (companyOnly && value.length > 80) {
        setError(t('公司名称或证券代码最多 80 个字符。', 'Use at most 80 characters.'));
        return;
      }
      if (onCompanyChoice && selectedCompany.current && selectionText.current === text) {
        chooseCompany(selectedCompany.current);
        return;
      }
      if (canSearch) {
        setCompletionOpen(true);
        setError('');
        matchCompanies(safeQuery!, true, value, searchFailed);
        return;
      }
      if (!intent.companyQuery) {
        setError(
          t(
            '需要一个公司名称或证券代码才能开始检索。',
            'A company name or security code is needed to start research.'
          )
        );
        return;
      }
      clearComposerDraft();
      navigate(
        `/company?query=${encodeURIComponent(intent.companyQuery)}${intent.year ? `&year=${intent.year}` : ''}`
      );
    } else {
      try {
        sessionStorage.setItem(
          'cashlens.start-draft',
          JSON.stringify({ kind: intent.kind, text: value })
        );
      } catch {
        setError(
          t(
            '浏览器未能保存输入，请允许此网站使用本地存储。',
            'Allow storage for this site to retain your input.'
          )
        );
        return;
      }
      clearComposerDraft();
      navigate(`/decisions?new=${intent.kind}&start=1`);
    }
  };
  return (
    <form
      ref={composer}
      className={`start-input ${compact ? 'start-input-compact' : ''}`}
      onSubmit={submit}
    >
      <label className="sr-only" htmlFor={inputId}>
        {mode === 'auto'
          ? t('公司或要核查的事情', 'Company or matter to review')
          : mode === 'company'
            ? t('公司名称或证券代码', 'Company name or security code')
            : mode === 'handover'
              ? t(...productTerms.handoverReview)
              : t('付款事项', 'Payment matter')}
      </label>
      <textarea
        id={inputId}
        rows={compact ? 1 : 2}
        maxLength={companyOnly ? 80 : 1000}
        value={text}
        disabled={disabled}
        placeholder={
          mode === 'auto'
            ? t(
                '输入公司，或写下你要核查的事',
                'Enter a company or describe what you want to review'
              )
            : mode === 'company'
              ? t('公司名称或证券代码', 'Company name or security code')
              : mode === 'handover'
                ? t(
                    '写下公司或交接中需要核对的事，收付款安排可选',
                    'Describe the company or a handover question; payment arrangements are optional'
                  )
                : t(
                    '写下付款对象、金额或需要核对的约定',
                    'Describe the company, amount, or terms to review'
                  )
        }
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={completionOpen && (finding || searched || candidates.length > 0)}
        aria-controls={listId}
        aria-activedescendant={
          completionOpen && activeCandidate >= 0 ? `${listId}-${activeCandidate}` : undefined
        }
        onFocus={() => setCompletionOpen(true)}
        onChange={(event) => {
          selectionText.current = '';
          selectedCompany.current = null;
          setText(event.target.value);
          setError('');
          setActiveCandidate(-1);
          setCompletionOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape') {
            setCompletionOpen(false);
            return;
          }
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && candidates.length) {
            event.preventDefault();
            setCompletionOpen(true);
            setActiveCandidate((value) =>
              value < 0
                ? event.key === 'ArrowDown'
                  ? 0
                  : candidates.length - 1
                : (value + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) %
                  candidates.length
            );
            return;
          }
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            completionOpen &&
            activeCandidate >= 0 &&
            candidates[activeCandidate]
          ) {
            event.preventDefault();
            chooseCompany(candidates[activeCandidate]!);
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="start-input-toolbar">
        {!companyOnly && (
          <Menu.Root>
            <Menu.Trigger className="start-mode" type="button">
              <selected.Icon size={15} />
              <span>{selected.label}</span>
              <ChevronDown size={13} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} align="start">
                <Menu.Popup className="start-mode-popup">
                  {choices.map(({ id, label, Icon }) => (
                    <Menu.Item
                      className="start-mode-item"
                      key={id}
                      onClick={() => {
                        setMode(id);
                        setError('');
                      }}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                      {id === mode && <Check size={14} />}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
        {companyOnly && (
          <span className="start-mode">
            <Building2 size={15} />
            {t(...productTerms.companyResearch)}
          </span>
        )}
        {toolbar}
        <span className="start-key-hint" aria-hidden="true">
          <kbd>↵</kbd>
          {t('提交', 'submit')}
        </span>
        <button
          type="submit"
          className="start-submit"
          aria-label={companyOnly ? t('开始研究', 'Start research') : t('继续', 'Continue')}
          disabled={disabled || !text.trim()}
        >
          <span>{companyOnly ? t('开始研究', 'Start research') : t('继续', 'Continue')}</span>
          <ArrowRight size={16} />
        </button>
      </div>
      {completionOpen && (finding || searched || candidates.length > 0) && (
        <div
          id={listId}
          className="company-completions"
          role="listbox"
          aria-label={t('匹配企业', 'Matching companies')}
        >
          {finding && (
            <p className="company-completions-state" role="status">
              {t('正在匹配公司…', 'Matching companies…')}
            </p>
          )}
          {candidates.map((identity, index) => (
            <button
              id={`${listId}-${index}`}
              key={`${identity.orgId}:${identity.securityCode}`}
              type="button"
              role="option"
              aria-selected={activeCandidate === index}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                const visible = latest.current.candidates.some(
                  (candidate) =>
                    candidate.orgId === identity.orgId &&
                    candidate.securityCode === identity.securityCode
                );
                if (visible) chooseCompany(identity);
              }}
            >
              <Building2 size={15} />
              <span className="company-completion-identity">
                <strong>{identity.shortName}</strong>
                {identity.companyName && identity.companyName !== identity.shortName && (
                  <small>{identity.companyName}</small>
                )}
              </span>
              <small className="company-completion-code">{identity.securityCode}</small>
            </button>
          ))}
          {searched && !finding && !candidates.length && (
            <p className="company-completions-state">
              {matches.unlisted
                ? t(
                    '该主体可能未上市。未上市中国公司的核查接口已预留（接入工商/融资/舆情数据源后即可核查）。',
                    'This company may not be listed. The unlisted-company interface is reserved; it activates once a registry/funding/sentiment source is connected.'
                  )
                : t('未匹配到支持的上市主体', 'No supported listed entity matched.')}
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="start-input-error">
          <p id={errorId} role="alert">
            {error}
          </p>
          {searchFailed && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setCompletionOpen(true);
                if (safeQuery) matchCompanies(safeQuery, true, null, true);
              }}
            >
              {t('重试匹配', 'Retry matching')}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
