import { useEffect } from 'react';
import { ArrowUpRight, ChevronRight, Mail, Printer } from 'lucide-react';
import { useApp } from '../context';
import { DocumentLayout } from '../DocumentLayout';
import type { ProductDocument } from '../content/document';
import { aboutDocument } from '../content/about';
import { guideDocument } from '../content/guide';
import { privacyDocument } from '../content/privacy';
import { termsDocument } from '../content/terms';
import { copyrightDocument } from '../content/copyright';
import '../styles/documentation.css';

export type DocumentPath = '/about' | '/docs' | '/privacy' | '/terms' | '/copyright';
const documents: Record<DocumentPath, ProductDocument> = {
  '/about': aboutDocument,
  '/docs': guideDocument,
  '/privacy': privacyDocument,
  '/terms': termsDocument,
  '/copyright': copyrightDocument,
};

// Existing public contact of the operator; shared across policies and support information.
export const PRODUCT_CONTACT = 'lailai0x394@gmail.com';

export function DocumentationPage({
  path,
  section,
}: {
  path: DocumentPath;
  section?: string | null;
}) {
  const { t } = useApp();
  const documentContent = documents[path];
  useEffect(() => {
    document.title = `${t(...documentContent.title)} · ${t('析光', 'Prispect')}`;
  }, [documentContent, t]);
  return (
    <DocumentLayout
      path={path}
      section={section}
      headings={[
        ...documentContent.sections.map((item) => ({
          id: `document-${item.id}`,
          section: item.id,
          label: t(...item.title),
        })),
        { id: 'document-contact', section: 'contact', label: t('联系析光', 'Contact Prispect') },
      ]}
    >
      <header className="document-heading">
        <div className="document-breadcrumb">
          <a href="/">{t('析光', 'Prispect')}</a>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{t(...documentContent.title)}</span>
        </div>
        <h1>{t(...documentContent.title)}</h1>
        <p className="document-description">{t(...documentContent.description)}</p>
        <div className="document-meta">
          <span>
            {t('更新日期', 'Updated')}{' '}
            <time dateTime={documentContent.updatedAt}>{documentContent.updatedAt}</time>
          </span>
          {documentContent.version && (
            <span>
              {t('版本', 'Version')} {documentContent.version}
            </span>
          )}
          <button type="button" className="text-link" onClick={() => window.print()}>
            <Printer size={14} />
            {t('打印或保存', 'Print or save')}
          </button>
        </div>
      </header>
      <div className="document-body">
        {documentContent.sections.map((item) => (
          <section
            id={`document-${item.id}`}
            key={item.id}
            className={item.emphasis ? 'document-section document-important' : 'document-section'}
          >
            <h2>{t(...item.title)}</h2>
            {item.paragraphs?.map((paragraph, index) => (
              <p key={index}>{t(...paragraph)}</p>
            ))}
            {item.bullets && (
              <ul>
                {item.bullets.map((bullet, index) => (
                  <li key={index}>{t(...bullet)}</li>
                ))}
              </ul>
            )}
            {item.table && (
              <div
                className="document-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={t(...item.title)}
              >
                <table>
                  <thead>
                    <tr>
                      {item.table.columns.map((column, index) => (
                        <th scope="col" key={index}>
                          {t(...column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{t(...cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {item.links && (
              <div className="document-links">
                {item.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-link"
                    {...(link.href.startsWith('https://')
                      ? { target: '_blank', rel: 'noreferrer' }
                      : {})}
                  >
                    {t(...link.label)}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </section>
        ))}
        <section id="document-contact" className="document-section document-contact">
          <h2>{t('联系析光', 'Contact Prispect')}</h2>
          <p>
            {t(
              '本产品由析光团队运营。产品咨询、账号与个人信息请求、版权问题，请通过下列邮箱联系。',
              'Prispect is operated by the Prispect team. Contact us at the email below for product questions, account and personal-data requests, or copyright concerns.'
            )}
          </p>
          <a className="text-link" href={`mailto:${PRODUCT_CONTACT}`}>
            <Mail size={16} aria-hidden="true" />
            {PRODUCT_CONTACT}
          </a>
          <p className="document-contact-note">
            {t(
              '请说明请求类型和关联账号邮箱。首次联系无需发送密码、验证码、身份证件或财务原件。',
              'Describe your request and provide the associated account email. Do not include passwords, verification codes, identity documents, or original financial files in your first message.'
            )}
          </p>
        </section>
        <nav className="document-related" aria-label={t('相关文档', 'Related documents')}>
          {Object.entries(documents)
            .filter(([href]) => href !== path)
            .map(([href, content]) => (
              <a key={href} href={href}>
                {t(...content.title)}
                <ChevronRight size={14} aria-hidden="true" />
              </a>
            ))}
        </nav>
      </div>
    </DocumentLayout>
  );
}
