import { useEffect, useState, type FormEvent } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ArrowUp, Building2, Check, ChevronDown, HandCoins, Wallet, Sparkles } from 'lucide-react';
import { useApp } from './context';
import { interpretStart, type StartKind } from '../shared/start-intent';
import { clearComposerDraft, readComposerDraft, writeComposerDraft } from './start-draft';

type StartMode = StartKind | 'auto';

export function StartInput({ compact = false }: { compact?: boolean }) {
  const { t, navigate, user } = useApp();
  const owner = user?.id || null;
  const [draft] = useState(() => readComposerDraft(owner));
  const [mode, setMode] = useState<StartMode>(draft?.mode || 'auto');
  const [text, setText] = useState(draft?.text || '');
  const [error, setError] = useState('');
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
    <form className={`start-input ${compact ? 'start-input-compact' : ''}`} onSubmit={submit}>
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
        maxLength={1000}
        value={text}
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
        onChange={(event) => {
          setText(event.target.value);
          setError('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="start-input-toolbar">
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
        <button
          type="submit"
          className="start-submit"
          aria-label={t('开始核查', 'Start review')}
          disabled={!text.trim()}
        >
          <ArrowUp size={19} />
        </button>
      </div>
      {error && (
        <p id="start-error" className="start-input-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
