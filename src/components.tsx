import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LoaderCircle,
  X,
} from 'lucide-react';
import type { AnalysisTask, EvidenceRef, Report } from '../shared/contracts';
import { api } from './api';
import { metricName, money, yuan } from './format';

import { useApp } from './context';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <path d="M16 6H6v10M28 6h10v10M6 28v10h10M38 28v10H28" />
        <path d="M13 23h6l5-9v16l6-7" />
      </svg>
      <span className="brand-name">
        照见<span>CashLens</span>
      </span>
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FolderOpen size={28} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
export function TaskTag({ status }: { status: AnalysisTask['status'] }) {
  const { t } = useApp();
  const label = {
    queued: t('等待处理', 'Queued'),
    running: t('核查中', 'Processing'),
    completed: t('已完成', 'Completed'),
    failed: t('处理失败', 'Failed'),
  };
  return (
    <Tag
      tone={
        status === 'completed'
          ? 'green'
          : status === 'failed'
            ? 'red'
            : status === 'running'
              ? 'amber'
              : 'neutral'
      }
    >
      {status === 'running' && <LoaderCircle size={12} className="spinner" />}
      {label[status]}
    </Tag>
  );
}
export function VerdictTag({ verdict }: { verdict: Report['verdict'] }) {
  const { t } = useApp();
  const labels = {
    attention: t('需要进一步核查', 'Follow-up needed'),
    supported: t('当前材料支持', 'Supported by current evidence'),
    insufficient: t('材料不足', 'Insufficient evidence'),
    conflict: t('口径存在冲突', 'Scope conflict'),
  };
  return (
    <Tag tone={verdict === 'supported' ? 'green' : verdict === 'conflict' ? 'red' : 'amber'}>
      {labels[verdict]}
    </Tag>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
        tabIndex={-1}
      >
        <div className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('关闭对话框', 'Close dialog')}
          >
            <X size={21} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
export function useDialogFocus(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]'
          ) || []
        ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || (document.activeElement === ref.current && !first))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [ref]);
}

export function EvidenceDrawer({
  refs,
  report,
  onClose,
}: {
  refs: EvidenceRef[];
  report?: Report;
  onClose: () => void;
}) {
  const { t, locale, workspace } = useApp();
  const drawerRef = useRef<HTMLDivElement>(null);
  useDialogFocus(drawerRef, onClose);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const materials = report?.snapshot || workspace?.materials || [];
  const uniqueRefs = refs.filter(
    (ref, index) =>
      refs.findIndex(
        (item) =>
          item.materialId === ref.materialId && item.page === ref.page && item.quote === ref.quote
      ) === index
  );
  const sources = Array.from(
    new Set(
      uniqueRefs
        .map((ref) => materials.find((material) => material.id === ref.materialId)?.rawSourceId)
        .filter(Boolean)
    )
  ) as string[];
  useEffect(() => {
    let canceled = false;
    Promise.all(
      sources.map(async (id) => {
        const response = await fetch(`/api/sources/${id}/pdf`, { method: 'HEAD' });
        return [id, response.ok] as const;
      })
    )
      .then((values) => {
        if (!canceled) setAvailability(Object.fromEntries(values));
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [sources.join('|')]);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        ref={drawerRef}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            <div className="eyebrow">THE ORIGINAL EVIDENCE</div>
            <h2 id="evidence-title">
              {t('把数值，放回原文。', 'Put the number back in context.')}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('关闭证据抽屉', 'Close evidence drawer')}
          >
            <X size={22} />
          </button>
        </div>
        <div className="drawer-scroll">
          {!uniqueRefs.length ? (
            <EmptyState
              title={t('当前判断没有可用原文引用', 'No source citation for this check')}
              text={t(
                '它可能是材料缺失检查或方法规则。不能把规则当成公司事实。',
                'This may be a missing-evidence check or a method rule. A rule is not a company fact.'
              )}
            />
          ) : (
            uniqueRefs.map((ref, index) => {
              const material = materials.find((item) => item.id === ref.materialId);
              const observations =
                material?.observations.filter(
                  (obs) =>
                    obs.page === ref.page &&
                    (obs.quote === ref.quote || ref.quote.includes(obs.quote))
                ) || [];
              return (
                <article className="evidence-entry" key={`${ref.materialId}-${index}`}>
                  <div className="evidence-entry-head">
                    <span className="evidence-number">E{String(index + 1).padStart(2, '0')}</span>
                    <Tag>
                      {ref.page
                        ? `PDF ${t('第', 'p.')} ${ref.page} ${t('页', '')}`
                        : t('页码未提供', 'Page not supplied')}
                    </Tag>
                  </div>
                  <h3>{material?.title || ref.materialId}</h3>
                  <div className="evidence-meta">
                    <span>{material?.company}</span>
                    <span>{material?.documentDate}</span>
                  </div>
                  <blockquote>
                    {ref.quote ||
                      t(
                        '此引用没有短摘录，请核对原始材料。',
                        'No excerpt was supplied. Check the original material.'
                      )}
                  </blockquote>
                  {locale === 'en' && (
                    <p className="original-language">
                      {t(
                        '',
                        'Original source language: Chinese. Quotes are retained verbatim, not rewritten as model evidence.'
                      )}
                    </p>
                  )}
                  {observations.length > 0 && (
                    <div className="evidence-observations">
                      {observations.map((obs) => (
                        <div key={obs.id}>
                          <strong>{metricName(obs.key, locale)}</strong>
                          <span className="mono">
                            {money(yuan(obs.value, obs.unit), locale, false)} {obs.currency}
                          </span>
                          <span>
                            {obs.year} ·{' '}
                            {obs.scope === 'consolidated'
                              ? t('合并', 'Consolidated')
                              : obs.scope === 'parent'
                                ? t('母公司', 'Parent')
                                : t('范围待确认', 'Unconfirmed scope')}{' '}
                            ·{' '}
                            {obs.period === 'annual'
                              ? t('全年', 'Annual')
                              : obs.period || t('期间待确认', 'Unconfirmed period')}
                          </span>
                          {obs.components?.length && (
                            <details>
                              <summary>
                                {t('查看全部原始分组行', 'View original component rows')}
                                <ChevronDown size={13} />
                              </summary>
                              {obs.components.map((component, i) => (
                                <p className="component-row" key={i}>
                                  <span>{component.label}</span>
                                  <span className="mono">
                                    {money(yuan(component.value, obs.unit), locale, false)} CNY
                                  </span>
                                  <small>PDF {component.page}</small>
                                </p>
                              ))}
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="evidence-links">
                    {material?.uploadId && (
                      <a
                        className="button button-primary"
                        href={`/api/materials/${material.id}/file${material.filename.toLowerCase().endsWith('.pdf') ? `#page=${ref.page || 1}` : ''}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} />
                        {t('打开原始上传文件', 'Open original uploaded file')}
                        <ArrowUpRight size={15} />
                      </a>
                    )}
                    {material?.rawSourceId && availability[material.rawSourceId] === true ? (
                      <a
                        className="button button-primary"
                        href={`/api/sources/${material.rawSourceId}/pdf#page=${ref.page || 1}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={16} />
                        {t('打开本机原件并定位', 'Open local PDF at page')}
                        <ArrowUpRight size={15} />
                      </a>
                    ) : material?.rawSourceId &&
                      availability[material.rawSourceId] === undefined ? (
                      <span className="field-note">
                        {t('正在检查本机原件…', 'Checking local PDF…')}
                      </span>
                    ) : !material?.uploadId ? (
                      <p className="pdf-unavailable">
                        <CircleAlert size={15} />
                        {t(
                          '本机原件未下载或此导入无可用 PDF。请核对公开原件或原始上传文件。',
                          'No local PDF is available for this evidence. Check the public source or the original uploaded file.'
                        )}
                      </p>
                    ) : null}
                    {(ref.sourceUrl || material?.sourceUrl) && (
                      <a
                        className="button button-secondary"
                        href={ref.sourceUrl || material?.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={16} />
                        {t('公开原件', 'Public source')}
                      </a>
                    )}
                  </div>
                  {material && (
                    <div className="evidence-provenance">
                      <span>{t('来源身份 / 文件哈希', 'Source identity / file hash')}</span>
                      <code>{material.sha256}</code>
                      <p>
                        {material.filename} ·{' '}
                        {t(
                          '材料观测一致不代表原件认证。',
                          'Consistent observations do not authenticate the document.'
                        )}
                      </p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
