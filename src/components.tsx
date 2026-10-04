import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import {
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  FileSearch,
  LoaderCircle,
  MoreHorizontal,
  X,
} from 'lucide-react';
import type { AnalysisTask, EvidenceRef, Observation, Report } from '../shared/contracts';
import { api } from './api';
import { metricName, money, originalAmount } from './format';

import { useApp } from './context';
import { translateRule } from './ruleTranslations';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <path d="M16 6H6v10M28 6h10v10M6 28v10h10M38 28v10H28" />
        <path d="M13 23h6l5-9v16l6-7" />
      </svg>
      <span className="brand-name">
        析光<span>Prispect</span>
      </span>
    </span>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
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
  icon,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-art" aria-hidden="true">
        <span />
        <span />
        <div>{icon || <FileSearch size={25} strokeWidth={1.4} />}</div>
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
    attention: t('现金低于利润', 'Cash below profit'),
    supported: t('金额可核对', 'Amounts supported'),
    insufficient: t('缺少材料', 'Missing evidence'),
    conflict: t('输入冲突', 'Input conflict'),
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
  variant = 'dialog',
  className = '',
  closeDisabled = false,
  closeRequested = false,
  initialFocus,
  restoreFocus = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: 'dialog' | 'drawer';
  className?: string;
  closeDisabled?: boolean;
  closeRequested?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
}) {
  const { t } = useApp();
  const returnFocus = useReturnFocus(restoreFocus);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (closeRequested) setOpen(false);
  }, [closeRequested]);
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && closeDisabled) {
          details.cancel();
          return;
        }
        setOpen(nextOpen);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="dialog-backdrop" />
        <DialogPrimitive.Popup
          className={`dialog ${wide ? 'dialog-wide' : ''} ${variant === 'drawer' ? 'dialog-drawer' : ''} ${className}`}
          finalFocus={restoreFocus ? returnFocus : false}
          initialFocus={initialFocus}
        >
          <div className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <Hint label={t('关闭对话框', 'Close dialog')}>
              <DialogPrimitive.Close
                className="icon-button"
                disabled={closeDisabled}
                aria-label={t('关闭对话框', 'Close dialog')}
              >
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </Hint>
          </div>
          <div className="dialog-body">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionMenu({
  label,
  items,
  children,
  className = 'icon-button',
  align = 'end',
}: {
  label: string;
  items: ActionMenuItem[];
  children?: ReactNode;
  className?: string;
  align?: 'start' | 'end';
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger className={className} aria-label={label} ref={triggerRef}>
        {children || <MoreHorizontal size={18} />}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="menu-positioner"
        >
          <MenuPrimitive.Popup className="action-menu">
            {items.map((item) => (
              <MenuPrimitive.Item
                key={item.label}
                className={`action-menu-item ${item.danger ? 'menu-item-danger' : ''}`}
                render={<button type="button" />}
                nativeButton
                disabled={item.disabled}
                onClick={() => {
                  requestAnimationFrame(() => {
                    triggerRef.current?.focus();
                    item.onSelect();
                  });
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function Hint({ label, children }: { label: string; children: ReactElement }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const existingDescription = (children.props as { 'aria-describedby'?: string })[
    'aria-describedby'
  ];
  const description = [existingDescription, open ? id : undefined].filter(Boolean).join(' ');
  return (
    <TooltipPrimitive.Provider delay={500}>
      <TooltipPrimitive.Root
        onOpenChange={(next, details) => {
          // A transient hint must not consume Escape intended for its dialog or menu.
          if (details.reason === 'escape-key') details.allowPropagation();
          setOpen(next);
        }}
      >
        <TooltipPrimitive.Trigger render={children} aria-describedby={description || undefined} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            sideOffset={6}
            collisionPadding={8}
            className="tooltip-positioner"
          >
            <TooltipPrimitive.Popup id={id} role="tooltip" className="tooltip-popup">
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/** Icon actions share the same accessible name, focus behavior and visual hint. */
export function IconButton({
  label,
  className = '',
  children,
  type = 'button',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  label: string;
}) {
  return (
    <Hint label={label}>
      <button
        {...props}
        type={type}
        className={`icon-button ${className}`.trim()}
        aria-label={label}
      >
        {children}
      </button>
    </Hint>
  );
}

export function NavigationPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useApp();
  const returnFocus = useReturnFocus();
  const [open, setOpen] = useState(true);
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(nextOpen) => !nextOpen && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="dialog-backdrop" />
        <DialogPrimitive.Popup className="navigation-panel" finalFocus={returnFocus}>
          <div className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <Hint label={t('关闭导航', 'Close navigation')}>
              <DialogPrimitive.Close
                className="icon-button"
                aria-label={t('关闭导航', 'Close navigation')}
              >
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </Hint>
          </div>
          <div className="navigation-panel-body">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function useReturnFocus(restore = true) {
  const target = useRef(document.activeElement as HTMLElement | null);
  const enabled = useRef(restore);
  enabled.current = restore;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const previous = target.current;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (
          !mounted.current &&
          enabled.current &&
          previous?.isConnected &&
          !document.activeElement?.closest('[role="dialog"]')
        )
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return target;
}

export function EvidenceObservation({ observation: obs }: { observation: Observation }) {
  const { t, locale } = useApp();
  const currencyConflict = obs.unit === 'usd' && obs.currency !== 'USD';
  return (
    <div>
      <strong>{metricName(obs.key, locale)}</strong>
      <span className="mono">{originalAmount(obs.value, obs.unit, obs.currency, locale)}</span>
      <span>
        {obs.year} ·{' '}
        {obs.scope === 'consolidated'
          ? t('合并', 'Consolidated')
          : obs.scope === 'parent'
            ? t('母公司', 'Parent company')
            : t('范围待确认', 'Unconfirmed scope')}{' '}
        ·{' '}
        {obs.period === 'annual'
          ? t('全年', 'Annual')
          : obs.period || t('期间待确认', 'Unconfirmed period')}
      </span>
      {currencyConflict && (
        <p className="field-note">
          {t(
            '原始单位声明为美元，币种字段与之不一致；保留原值，不作为人民币金额采用。',
            'The original unit declares USD but the currency field differs. Original values are retained and are not adopted as CNY amounts.'
          )}
        </p>
      )}
      {obs.components?.length ? (
        <details>
          <summary>
            {t('查看全部原始分组行', 'View original component rows')}
            <ChevronDown size={13} />
          </summary>
          {obs.components.map((component, i) => (
            <p className="component-row" key={i}>
              <span>{component.label}</span>
              <span className="mono">
                {originalAmount(component.value, obs.unit, obs.currency, locale)}
              </span>
              <small>
                {component.page === null
                  ? t('页码未提供', 'Page not supplied')
                  : `PDF ${component.page}`}
              </small>
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
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
  const returnFocus = useReturnFocus();
  const [open, setOpen] = useState(true);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const materials = report?.snapshot || workspace?.materials || [];
  const uniqueRefs = refs.filter(
    (ref, index) =>
      refs.findIndex(
        (item) =>
          item.materialId === ref.materialId && item.page === ref.page && item.quote === ref.quote
      ) === index
  );
  const citedCalculations = (report?.metrics || []).filter(
    (metric) =>
      metric.unit === '%' &&
      metric.value !== null &&
      uniqueRefs.length > 0 &&
      uniqueRefs.every((ref) =>
        metric.sourceRefs.some(
          (entry) =>
            ref.materialId === entry.materialId &&
            ref.page === entry.page &&
            ref.quote === entry.quote
        )
      ) &&
      metric.sourceRefs.every((entry) =>
        uniqueRefs.some(
          (ref) =>
            ref.materialId === entry.materialId &&
            ref.page === entry.page &&
            ref.quote === entry.quote
        )
      )
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
    <DialogPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(nextOpen) => !nextOpen && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="drawer-backdrop" />
        <DialogPrimitive.Popup className="evidence-drawer" finalFocus={returnFocus}>
          <div className="drawer-header">
            <div>
              <DialogPrimitive.Title>{t('来源', 'Source')}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="icon-button"
              aria-label={t('关闭证据抽屉', 'Close evidence drawer')}
            >
              <X size={22} />
            </DialogPrimitive.Close>
          </div>
          <div className="drawer-scroll">
            {uniqueRefs.length > 0 && (
              <p className="source-reading-note">
                {t(
                  '以下显示已确认的输入与原文摘录，未认证原件真实性。',
                  'Confirmed inputs and source excerpts are shown below; original-document authenticity has not been verified.'
                )}
              </p>
            )}
            {citedCalculations.map((metric) => (
              <div className="source-calculation" key={metric.key}>
                <div>
                  <strong>{t(metric.label, metricName(metric.key, locale))}</strong>
                  <span className="mono">{metric.value}%</span>
                </div>
                <p>{t(metric.formula, translateRule(metric.formula))}</p>
                <small>
                  {t(
                    '以下来源分别支持公式中的输入。',
                    'The sources below support the inputs in this formula.'
                  )}
                </small>
              </div>
            ))}
            {!uniqueRefs.length ? (
              <EmptyState
                title={t('无原文引用', 'No source citation')}
                text={t(
                  '此项为口径检查或材料缺失提示。',
                  'This item is a scope check or missing-evidence notice.'
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
                          <EvidenceObservation key={obs.id} observation={obs} />
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
                          {t('打开 PDF 原件', 'Open original PDF')}
                          <ArrowUpRight size={15} />
                        </a>
                      ) : material?.rawSourceId &&
                        availability[material.rawSourceId] === undefined ? (
                        <span className="field-note">{t('检查文件…', 'Checking file…')}</span>
                      ) : !material?.uploadId ? (
                        <p className="pdf-unavailable">
                          <CircleAlert size={15} />
                          {t(
                            'PDF 原件不可用，请查看公开来源或上传文件。',
                            'PDF unavailable. Check the public source or uploaded file.'
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
                      <details className="evidence-provenance">
                        <summary>
                          {t('文件信息与核验范围', 'File information and verification scope')}
                        </summary>
                        <code>{material.sha256}</code>
                        <p>
                          {material.filename} ·{' '}
                          {t(
                            '材料观测一致不代表原件认证。',
                            'Consistent observations do not authenticate the document.'
                          )}
                        </p>
                      </details>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
