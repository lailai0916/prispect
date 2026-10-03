import { productTerms } from '../shared/product-terms';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Columns3,
  FileText,
  FolderOpen,
  ListChecks,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from './components';
import { useCompanyRecords } from './CompanyRecordsContext';
import { useApp } from './context';
import { documentationTitle } from './content/document-navigation';
import { companyPath } from '../shared/company-workspace';

type Destination = {
  id: string;
  label: string;
  detail?: string;
  path: string;
  icon: LucideIcon;
  group: string;
  keywords?: string;
};

export function CommandMenu({ onClose }: { onClose: () => void }) {
  const { t, workspace, user, navigate } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const { records, loading, error, reload } = useCompanyRecords();
  const [closing, setClosing] = useState(false);
  const destination = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const results = useMemo(() => {
    const group = t('页面', 'Pages');
    const researchGroup = t('研究', 'Research');
    const toolsGroup = t(...productTerms.reviewTools);
    const pages: Destination[] = user
      ? [
          {
            id: 'query',
            label: t(...productTerms.newResearch),
            path: '/query',
            icon: Plus,
            group: researchGroup,
            keywords: '公司 company lookup 查询',
          },
          {
            id: 'research',
            label: t(...productTerms.researchLibrary),
            path: '/research',
            icon: Building2,
            group: researchGroup,
            keywords: '研究 公司 查询 history records research',
          },
          {
            id: 'workspace',
            label: t(...productTerms.financialReviews),
            path: '/workspace',
            icon: FileText,
            group: toolsGroup,
          },
          {
            id: 'materials',
            label: t(...productTerms.materials),
            path: '/materials',
            icon: FolderOpen,
            group: toolsGroup,
          },
          {
            id: 'decisions',
            label: t(...productTerms.paymentsAndHandovers),
            path: '/decisions',
            icon: ListChecks,
            group: toolsGroup,
          },
          {
            id: 'compare',
            label: t(...productTerms.compareReviews),
            path: '/compare',
            icon: Columns3,
            group: toolsGroup,
          },
          {
            id: 'account',
            label: t(...productTerms.accountSettings),
            path: '/account',
            icon: UserRound,
            group,
          },
        ]
      : [
          { id: 'home', label: t('首页查询', 'Home search'), path: '/', icon: Search, group },
          { id: 'login', label: t('登录', 'Log in'), path: '/login', icon: UserRound, group },
        ];
    pages.push({
      id: 'docs',
      label: t(...documentationTitle),
      path: '/docs',
      icon: BookOpen,
      group,
    });
    const companies: Destination[] = [...records]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        id: `company-${record.id}`,
        label: record.name,
        detail: `${record.input.securityCode || ''} · ${record.input.year}`,
        path: companyPath(record.id),
        icon: Building2,
        group: t(...productTerms.researchRecords),
      }));
    const reports: Destination[] = [...(workspace?.tasks || [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((task) => ({
        id: `task-${task.id}`,
        label: task.title,
        detail: `${task.company} · ${task.year}`,
        path: `/tasks/${task.id}`,
        icon: FileText,
        group: t(...productTerms.reviewReports),
      }));
    const materials: Destination[] = (workspace?.materials || []).map((material) => ({
      id: `material-${material.id}`,
      label: material.title,
      detail: material.company,
      path: `/materials?material=${encodeURIComponent(material.id)}`,
      icon: FolderOpen,
      group: t(...productTerms.materials),
    }));
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return [pages, companies, reports, materials].flatMap((items, index) =>
      items
        .filter((item) =>
          terms.every((term) =>
            `${item.label} ${item.detail || ''} ${item.keywords || ''}`
              .toLocaleLowerCase()
              .includes(term)
          )
        )
        .slice(0, index === 0 ? items.length : 6)
    );
  }, [records, workspace, query, t, user]);
  const active = Math.min(selected, Math.max(0, results.length - 1));
  useEffect(() => {
    document.getElementById(`command-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);
  const choose = (item: Destination) => {
    destination.current = item.path;
    setClosing(true);
  };
  return (
    <Dialog
      title={t('搜索与跳转', 'Search and jump to')}
      className="command-dialog"
      closeRequested={closing}
      initialFocus={input}
      restoreFocus={!closing}
      onClose={() => {
        onClose();
        if (destination.current) {
          navigate(destination.current);
          requestAnimationFrame(() =>
            document.getElementById('main')?.focus({ preventScroll: true })
          );
        }
      }}
    >
      <div className="command-search">
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          value={query}
          autoComplete="off"
          placeholder={t(
            '搜索页面、公司、报告或材料…',
            'Search pages, companies, reports or materials…'
          )}
          aria-label={t('搜索工作区', 'Search workspace')}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `command-option-${active}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (['ArrowDown', 'ArrowUp'].includes(event.key) && results.length) {
              event.preventDefault();
              setSelected(
                (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
              );
            } else if (event.key === 'Enter' && results[active]) {
              event.preventDefault();
              choose(results[active]!);
            }
          }}
        />
        <kbd aria-hidden="true">esc</kbd>
      </div>
      <div
        className="command-results"
        id="command-results"
        role="listbox"
        aria-label={t('搜索结果', 'Search results')}
        aria-busy={loading}
      >
        {results.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {results[index - 1]?.group !== item.group && (
                <div className="command-group" aria-hidden="true">
                  {item.group}
                </div>
              )}
              <div
                id={`command-option-${index}`}
                role="option"
                aria-selected={active === index}
                className="command-option"
                onMouseMove={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="command-option-icon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="command-option-text">
                  <strong>{item.label}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
                <ArrowRight size={14} className="command-option-arrow" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>
      {!results.length && (
        <div className="command-empty" role="status">
          <Search size={24} />
          <p>{t('没有匹配的页面或记录', 'No matching pages or records')}</p>
          <span>
            {t('试试公司名、报告名称或证券代码。', 'Try a company, report title or security code.')}
          </span>
        </div>
      )}
      {error && (
        <p className="command-error" role="alert">
          {t('企业记录暂时无法读取。', 'Company records are unavailable.')}{' '}
          <button className="text-link" onClick={() => void reload()}>
            {t('重试', 'Retry')}
          </button>
          <span className="sr-only">{error}</span>
        </p>
      )}
      <div className="command-footer">
        <span>
          {loading ? (
            <>
              <LoaderCircle size={12} className="spinner" />
              {t('读取企业记录…', 'Loading companies…')}
            </>
          ) : (
            <>
              <Check size={12} />
              {user
                ? t('仅搜索当前工作区', 'Searches this workspace only')
                : t('页面快捷导航', 'Page navigation')}
            </>
          )}
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('选择', 'select')} <kbd>↵</kbd> {t('打开', 'open')}
        </span>
      </div>
    </Dialog>
  );
}
