import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ArrowUp, Building2, Check, ChevronDown, HandCoins, Wallet, Sparkles } from 'lucide-react';
import { useApp } from './context';
import { interpretStart, type StartKind } from '../shared/start-intent';
import { clearComposerDraft, readComposerDraft, writeComposerDraft } from './start-draft';
import type { CompanyIdentity, CompanySearchResponse } from '../shared/contracts';
import { api, requestErrorText } from './api';
import './home.css';

type StartMode = StartKind | 'auto';

export function StartInput({
  compact = false,
  onCompanyChoice,
  companyOnly = false,
  toolbar,
  disabled = false,
  onInformationGap,
}: {
  compact?: boolean;
  onCompanyChoice?: (identity: CompanyIdentity, text: string) => void;
  companyOnly?: boolean;
  toolbar?: ReactNode;
  disabled?: boolean;
  onInformationGap?: (name: string) => void;
}) {
  const { t, navigate, user, locale } = useApp();
  const owner = user?.id || null;
  const [draft] = useState(() => readComposerDraft(owner));
  const [mode, setMode] = useState<StartMode>(companyOnly ? 'company' : draft?.mode || 'auto');
  const [text, setText] = useState(draft?.text || '');
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<CompanyIdentity[]>([]);
  const [finding, setFinding] = useState(false);
  const [searched, setSearched] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(-1);
  const composer = useRef<HTMLFormElement>(null);
  const selectionText = useRef('');
  const intent = interpretStart(text, mode);
  const safeQuery = companyOnly ? text.trim() || null : intent.companyQuery;
  const companyIntent = companyOnly || intent.kind === 'company';
  useEffect(() => {
    setCandidates([]);
    setSearched(false);
    setActiveCandidate(-1);
    if (
      !user ||
      !companyIntent ||
      !safeQuery ||
      safeQuery.length < (companyOnly ? 1 : 2) ||
      safeQuery.length > 80 ||
      selectionText.current === text
    ) {
      setFinding(false);
      return;
    }
    const controller = new AbortController();
    setFinding(true);
    const timer = setTimeout(() => {
      void api<CompanySearchResponse>(`/companies/search?q=${encodeURIComponent(safeQuery)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!controller.signal.aborted) {
            setCandidates(response.candidates);
            setSearched(true);
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(requestErrorText(cause, locale));
        })
        .finally(() => {
          if (!controller.signal.aborted) setFinding(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [safeQuery, companyIntent, companyOnly, user?.id, locale, text]);
  const chooseCompany = (identity: CompanyIdentity) => {
    selectionText.current = identity.shortName;
    setText(identity.shortName);
    setCompletionOpen(false);
    setActiveCandidate(-1);
    setError('');
    if (onCompanyChoice) {
      clearComposerDraft();
      onCompanyChoice(identity, text.trim());
    } else
      navigate(
        `/company?query=${encodeURIComponent(identity.shortName)}&code=${identity.securityCode}`
      );
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !composer.current?.contains(event.target))
        setCompletionOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => writeComposerDraft({ owner, text, mode }), [owner, text, mode]);
  const choices = [
    { id: 'auto' as const, label: t('自动识别', 'Automatic'), Icon: Sparkles },
    { id: 'company' as const, label: t('公司查询', 'Company research'), Icon: Building2 },
    { id: 'external' as const, label: t('核对预付款', 'Review a prepayment'), Icon: HandCoins },
    { id: 'handover' as const, label: t('接手公司', 'Company handover'), Icon: Wallet },
  ];
  const selected = choices.find((item) => item.id === mode)!;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    const intent = interpretStart(value, mode);
    if (intent.kind === 'company') {
      if (companyOnly && value.length > 80) {
        setError(t('公司名称或证券代码最多 80 个字符。', 'Use at most 80 characters.'));
        return;
      }
      if (onCompanyChoice && (!searched || finding)) {
        setCompletionOpen(true);
        return;
      }
      if (onCompanyChoice && searched && !candidates.length) {
        onInformationGap?.(value);
        return;
      }
      if (onCompanyChoice && candidates.length === 1) {
        chooseCompany(candidates[0]!);
        return;
      }
      if (onCompanyChoice && candidates.length > 1) {
        setCompletionOpen(true);
        setActiveCandidate(0);
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
      <label className="sr-only" htmlFor="start-query">
        {mode === 'auto'
          ? t('公司或要核查的事情', 'Company or matter to review')
          : mode === 'company'
            ? t('公司名称或证券代码', 'Company name or security code')
            : mode === 'handover'
              ? t('接手核查', 'Company handover review')
              : t('付款事项', 'Payment matter')}
      </label>
      <textarea
        id="start-query"
        rows={2}
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
        aria-describedby={error ? 'start-error' : undefined}
        aria-invalid={Boolean(error)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={completionOpen && (finding || searched)}
        aria-controls="company-completion-list"
        aria-activedescendant={
          completionOpen && activeCandidate >= 0
            ? `company-completion-${activeCandidate}`
            : undefined
        }
        onFocus={() => setCompletionOpen(true)}
        onChange={(event) => {
          selectionText.current = '';
          setText(event.target.value);
          setError('');
          setCompletionOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            setCompletionOpen(false);
            return;
          }
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && candidates.length) {
            event.preventDefault();
            setCompletionOpen(true);
            setActiveCandidate(
              (value) =>
                (value + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) %
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
            {t('公司查询', 'Company research')}
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
          aria-label={t('开始核查', 'Start review')}
          disabled={disabled || !text.trim()}
        >
          <ArrowUp size={19} />
        </button>
      </div>
      {completionOpen && (finding || searched) && (
        <div
          id="company-completion-list"
          className="company-completions"
          role="listbox"
          aria-label={t('匹配企业', 'Matching companies')}
        >
          {finding && (
            <p className="company-completions-state">
              {t('正在检索公司…', 'Searching companies…')}
            </p>
          )}
          {!finding &&
            candidates.map((identity, index) => (
              <button
                id={`company-completion-${index}`}
                key={`${identity.orgId}:${identity.securityCode}`}
                type="button"
                role="option"
                aria-selected={activeCandidate === index}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => chooseCompany(identity)}
              >
                <Building2 size={15} />
                <span>{identity.shortName}</span>
                <small>{identity.securityCode}</small>
              </button>
            ))}
          {!finding && !candidates.length && (
            <p className="company-completions-state">
              {t(
                '未匹配到支持的上市主体。未匹配不代表没有风险。',
                'No supported listed entity matched. No match does not mean no risk.'
              )}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id="start-error" className="start-input-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
