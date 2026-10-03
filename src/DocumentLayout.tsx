import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApp } from './context';
import { ROUTE_CHANGE_EVENT } from './routing';
import {
  documentationTitle,
  documentNavigation,
  type DocumentRoute,
} from './content/document-navigation';
import './styles/documentation.css';

export type { DocumentRoute } from './content/document-navigation';

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
  const home = path === '/docs';
  const hasContents = headings.length > 0;
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

  const documents = (
    <nav className="document-navigation" aria-label={t('文档导航', 'Documents')}>
      <a className="document-navigation-home" href="/docs" aria-current={home ? 'page' : undefined}>
        {t(documentationTitle[0], documentationTitle[1])}
      </a>
      {documentNavigation.map((item) => (
        <a key={item.path} href={item.path} aria-current={path === item.path ? 'page' : undefined}>
          {t(item.label[0], item.label[1])}
        </a>
      ))}
    </nav>
  );
  const contents = (
    <nav className="document-contents" aria-label={t('目录', 'Contents')}>
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
    <div className={`document-layout${home ? ' document-layout-home' : ''}`}>
      {!home && <aside className="document-sidebar">{documents}</aside>}
      <div className="document-reading-column">
        {!home && (
          <div className="document-mobile-navigation">
            <details ref={mobileDocuments} className="document-mobile-documents">
              <summary>
                {t('浏览文档', 'Browse documents')}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              {documents}
            </details>
            {hasContents && (
              <details ref={mobileContents} className="document-mobile-contents">
                <summary>
                  {t('目录', 'Contents')}
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                {contents}
              </details>
            )}
          </div>
        )}
        <article ref={article} className="document-page">
          {children}
        </article>
      </div>
      {!home && hasContents && (
        <aside className="document-outline">
          <p className="document-navigation-title">{t('目录', 'Contents')}</p>
          {contents}
        </aside>
      )}
    </div>
  );
}
