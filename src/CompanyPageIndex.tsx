import { useEffect, useRef, useState } from 'react';
import { currentCompanyPageAnchor } from './company-page-index-state';
import { openCompanyReportSection } from './CompanyResearchReport';
import { useApp } from './context';
import './company-page-index.css';

type PageAnchor = readonly [target: string, zh: string, en: string];

function availablePageTarget(target: HTMLElement) {
  let ancestor: HTMLElement | null = target;
  while (ancestor) {
    const style = getComputedStyle(ancestor);
    if (
      ancestor.hidden ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false;
    ancestor = ancestor.parentElement;
  }
  // Closed details hide content without changing its computed display/visibility.
  // Such descendants remain reachable because navigation opens their disclosures.
  return true;
}

/** One local, reading-aware index; acquiring sources and changing reports stay elsewhere. */
export function CompanyPageIndex({ anchors }: { anchors: readonly PageAnchor[] }) {
  const { t } = useApp();
  const navigation = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{ present: string[]; current: string | null }>({
    present: [],
    current: null,
  });
  const anchorKey = anchors.map(([target]) => target).join('|');

  useEffect(() => {
    const root = navigation.current?.closest<HTMLElement>('.company-workspace');
    if (!root) return;
    const ids = anchorKey.split('|').filter(Boolean);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const targets = ids.flatMap((id) => {
        const target = document.getElementById(id);
        return target && root.contains(target) && availablePageTarget(target) ? [target] : [];
      });
      const positions = targets.map((target) => ({
        id: target.id,
        top: target.getBoundingClientRect().top,
        // A closed disclosure itself remains a reachable chapter. Only its hidden
        // descendants are excluded from the current reading position.
        visible: target.getClientRects().length > 0,
      }));
      const headerHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')
      );
      const headerBottom = Number.isFinite(headerHeight) ? headerHeight : 56;
      const indexBounds = navigation.current?.getBoundingClientRect();
      const indexHeight = navigation.current?.hidden ? 0 : indexBounds?.height || 0;
      const heightValue = `${indexHeight}px`;
      if (root.style.getPropertyValue('--company-reading-index-height') !== heightValue)
        root.style.setProperty('--company-reading-index-height', heightValue);
      const readingLine = Math.max(headerBottom + 24, (indexBounds?.bottom || 0) + 24);
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const present = targets.map((target) => target.id);
      const current = currentCompanyPageAnchor(positions, readingLine, atBottom);
      setState((previous) =>
        previous.current === current &&
        previous.present.length === present.length &&
        previous.present.every((id, index) => id === present[index])
          ? previous
          : { present, current }
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'open', 'hidden', 'class', 'style'],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    if (navigation.current) resize.observe(navigation.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    root.addEventListener('toggle', schedule, true);
    root.addEventListener('transitionend', schedule, true);
    schedule();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.removeEventListener('toggle', schedule, true);
      root.removeEventListener('transitionend', schedule, true);
      cancelAnimationFrame(frame);
      root.style.removeProperty('--company-reading-index-height');
    };
  }, [anchorKey]);

  return (
    <nav
      ref={navigation}
      className="company-page-index company-reading-index"
      aria-label={t('本页内容', 'On this page')}
      hidden={state.present.length === 0}
    >
      {anchors
        .filter(([target]) => state.present.includes(target))
        .map(([target, zh, en]) => (
          <button
            type="button"
            key={target}
            aria-controls={target}
            aria-current={state.current === target ? 'location' : undefined}
            onClick={() => openCompanyReportSection(target)}
          >
            {t(zh, en)}
          </button>
        ))}
    </nav>
  );
}
