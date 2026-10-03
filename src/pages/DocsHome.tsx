import { useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Copyright,
  FileCheck2,
  Info,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { DocumentLayout } from '../DocumentLayout';
import { documentationTitle, documentNavigation } from '../content/document-navigation';
import { useApp } from '../context';

const icons = [Info, BookOpen, FileCheck2, ShieldCheck, Scale, Copyright];
let articleModule: Promise<unknown> | undefined;
function prepareArticles() {
  articleModule ||= import('./Documentation').catch(() => {
    articleModule = undefined;
  });
}

export function DocsHome() {
  const { t } = useApp();
  useEffect(() => {
    document.title = `${t(...documentationTitle)} · ${t('析光', 'Prispect')}`;
  }, [t]);
  return (
    <DocumentLayout path="/docs" headings={[]}>
      <header className="document-heading">
        <nav className="document-breadcrumb" aria-label={t('当前位置', 'Breadcrumb')}>
          <a href="/">{t('析光', 'Prispect')}</a>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page">{t(documentationTitle[0], documentationTitle[1])}</span>
        </nav>
        <h1>{t(documentationTitle[0], documentationTitle[1])}</h1>
      </header>
      <div className="document-home-grid">
        {documentNavigation.map((item, index) => {
          const Icon = icons[index]!;
          return (
            <a
              className="document-home-card"
              href={item.path}
              key={item.path}
              onPointerEnter={prepareArticles}
              onFocus={prepareArticles}
            >
              <div className="document-home-card-heading">
                <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                <h2>{t(item.label[0], item.label[1])}</h2>
                <ArrowRight size={15} aria-hidden="true" />
              </div>
              <p>{t(item.description[0], item.description[1])}</p>
            </a>
          );
        })}
      </div>
    </DocumentLayout>
  );
}
