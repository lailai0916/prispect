import { useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import './report-evidence-controls.css';

// These disclosures contain retained report content only. Keep acquisition, adoption,
// experiments and sibling workspace disclosures outside this explicit list.
const evidenceDisclosures = [
  'details.research-grade-limits',
  'details#company-research-process',
  'details#company-research-framework',
  '#company-source-trust > details.source-trust-detail',
  'details#company-review-requests',
].join(', ');

/** Changes local disclosure state within one report; never reads or adopts sources. */
export function ReportEvidenceControls({
  scopeId,
  scopeKey,
}: {
  scopeId: string;
  scopeKey: string;
}) {
  const { t } = useApp();
  const [counts, setCounts] = useState({ open: 0, total: 0 });
  const [scopeChanged, setScopeChanged] = useState(false);
  const previousScope = useRef<string | null>(null);
  const disclosures = () =>
    Array.from(
      document.getElementById(scopeId)?.querySelectorAll<HTMLDetailsElement>(evidenceDisclosures) ||
        []
    );

  useEffect(() => {
    const container = document.getElementById(scopeId);
    if (!container) return;
    const selected = () =>
      Array.from(container.querySelectorAll<HTMLDetailsElement>(evidenceDisclosures));
    const updateCounts = () => {
      const entries = selected();
      const next = { open: entries.filter((entry) => entry.open).length, total: entries.length };
      setCounts((current) =>
        current.open === next.open && current.total === next.total ? current : next
      );
    };
    // A new record, issuer, year or snapshot starts a fresh local review view.
    if (previousScope.current !== scopeKey) {
      setScopeChanged(previousScope.current !== null);
      selected().forEach((entry) => (entry.open = false));
      previousScope.current = scopeKey;
    }
    updateCounts();
    const observer = new MutationObserver(updateCounts);
    observer.observe(container, {
      attributes: true,
      attributeFilter: ['open'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [scopeId, scopeKey]);

  const setOpen = (open: boolean) => {
    disclosures().forEach((entry) => (entry.open = open));
    setScopeChanged(false);
  };

  return (
    <div className="report-evidence-controls">
      <div className="report-evidence-actions">
        <button
          type="button"
          className="button button-secondary"
          aria-controls={scopeId}
          disabled={counts.total === 0 || counts.open === counts.total}
          onClick={() => setOpen(true)}
        >
          {t('展开核验区', 'Expand review sections')}
        </button>
        <button
          type="button"
          className="button button-secondary"
          aria-controls={scopeId}
          disabled={counts.open === 0}
          onClick={() => setOpen(false)}
        >
          {t('收起核验区', 'Collapse review sections')}
        </button>
        <span className="report-evidence-count" role="status" aria-live="polite" aria-atomic="true">
          {t(
            `核验区 ${counts.open}/${counts.total} 已展开`,
            `${counts.open}/${counts.total} review sections expanded`
          )}
        </span>
      </div>
      <p className="report-evidence-note">
        {t(
          '仅展开本报告已保存的核验内容；打开来源入口不代表已读原文。',
          'Shows retained review content in this report. Opening a source entry does not mean its original has been read.'
        )}
        {scopeChanged && (
          <span role="status">
            {' '}
            {t(
              '核验范围已变化，展开状态已重置。',
              'Review scope changed; disclosure state was reset.'
            )}
          </span>
        )}
      </p>
    </div>
  );
}
