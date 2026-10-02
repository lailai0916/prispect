import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApp } from './context';
import { ROUTE_CHANGE_EVENT } from './routing';
import './styles/documentation.css';

export type DocumentRoute = '/about' | '/docs' | '/method' | '/privacy' | '/terms' | '/copyright';

const documentNavigation = [
  { path: '/about', label: ['产品介绍', 'Product overview'] },
  { path: '/docs', label: ['使用文档', 'User guide'] },
  { path: '/method', label: ['方法', 'Method'] },
  { path: '/privacy', label: ['隐私政策', 'Privacy policy'] },
  { path: '/terms', label: ['用户协议', 'Terms of service'] },
  { path: '/copyright', label: ['版权声明', 'Copyright'] },
] as const;

export interface DocumentHeading {
  id: string;
  section: string;
  label: string;
}

export function DocumentLayout({
  path,
  headings,
  section,
  children,
}: {
  path: DocumentRoute;
  headings: DocumentHeading[];
  section?: string | null;
  children: ReactNode;
}) {
  const { t } = useApp();
  const [activeId, setActiveId] = useState(headings[0]?.id);
  const article = useRef<HTMLElement>(null);
  const mobileDocuments = useRef<HTMLDetailsElement>(null);
  const mobileContents = useRef<HTMLDetailsElement>(null);
  // Only IDs and query keys affect navigation; translation changes don't reset reading position.
  const targets = JSON.stringify(headings.map(({ id, section: key }) => ({ id, key })));

  useEffect(() => {
    const expandedForPrint = new Set<HTMLDetailsElement>();
    const preparePrint = () => {
      article.current
        ?.querySelectorAll<HTMLDetailsElement>('details:not([open])')
        .forEach((item) => {
          expandedForPrint.add(item);
          item.open = true;
        });
    };
    const restoreDetails = () => {
      for (const item of expandedForPrint) item.open = false;
      expandedForPrint.clear();
    };
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', restoreDetails);
    return () => {
      window.removeEventListener('beforeprint', preparePrint);
      window.removeEventListener('afterprint', restoreDetails);
      restoreDetails();
    };
  }, []);

  useEffect(() => {
    const entries: { id: string; key: string }[] = JSON.parse(targets);
    let frame = 0;
    const showSection = () => {
      if (location.pathname !== path) return;
      cancelAnimationFrame(frame);
      if (mobileDocuments.current) mobileDocuments.current.open = false;
      if (mobileContents.current) mobileContents.current.open = false;
      const hash = location.hash;
      const key = new URLSearchParams(location.search).get('section');
      const id =
        hash && !hash.startsWith('#/')
          ? entries.find((entry) => `#${entry.id}` === hash)?.id
          : entries.find((entry) => entry.key === key)?.id;
      if (!id) return;
      const target = document.getElementById(id);
      if (id === 'method-privacy') {
        const details = target?.querySelector('details');
        if (details) details.open = true;
      }
      // Wait for collapsed menus and browser history scroll restoration before aligning the section.
      frame = requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    };
    showSection();
    window.addEventListener('popstate', showSection);
    window.addEventListener('hashchange', showSection);
    window.addEventListener(ROUTE_CHANGE_EVENT, showSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('popstate', showSection);
      window.removeEventListener('hashchange', showSection);
      window.removeEventListener(ROUTE_CHANGE_EVENT, showSection);
    };
  }, [path, section, targets]);

  useEffect(() => {
    const entries: { id: string }[] = JSON.parse(targets);
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 60;
      const sections = entries
        .map(({ id }) => document.getElementById(id))
        .filter((element): element is HTMLElement => Boolean(element));
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const current = atBottom
        ? sections.at(-1)
        : [...sections]
            .reverse()
            .find((element) => element.getBoundingClientRect().top <= header + 48);
      setActiveId((current || sections[0])?.id);
    };
    const queueUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
    };
  }, [path, targets]);

  const articleLinks = (start: number, end: number) =>
    documentNavigation.slice(start, end).map((item) => (
      <a key={item.path} href={item.path} aria-current={path === item.path ? 'page' : undefined}>
        {t(item.label[0], item.label[1])}
      </a>
    ));

  const documents = (
    <nav className="document-navigation" aria-label={t('文档导航', 'Documents')}>
      {articleLinks(0, 3)}
      <span className="document-navigation-label">{t('条款与政策', 'Policies')}</span>
      {articleLinks(3, 6)}
    </nav>
  );
  const contents = (
    <nav className="document-contents" aria-label={t('本页目录', 'On this page')}>
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`${path}?section=${encodeURIComponent(heading.section)}`}
          aria-current={activeId === heading.id ? 'location' : undefined}
        >
          {heading.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="document-layout">
      <aside className="document-sidebar">
        <p className="document-navigation-title">{t('文档', 'Docs')}</p>
        {documents}
      </aside>
      <div className="document-reading-column">
        <div className="document-mobile-navigation">
          <details ref={mobileDocuments} className="document-mobile-documents">
            <summary>
              {t('浏览文档', 'Browse documents')}
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            {documents}
          </details>
          <details ref={mobileContents} className="document-mobile-contents">
            <summary>
              {t('本页目录', 'On this page')}
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            {contents}
          </details>
        </div>
        <article ref={article} className="document-page">
          {children}
        </article>
      </div>
      <aside className="document-outline">
        <p className="document-navigation-title">{t('本页目录', 'On this page')}</p>
        {contents}
      </aside>
    </div>
  );
}
