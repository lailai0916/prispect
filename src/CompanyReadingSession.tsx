import { useLayoutEffect, useRef } from 'react';
import type { CompanyResearchRun } from '../shared/contracts';
import { resolveCompanyFocus, type CompanySection } from '../shared/company-workspace';
import { useApp } from './context';
import {
  companyReadingAnchors,
  companyReadingDefaultOpen,
  companyReadingDisclosures,
  companyReadingMemory,
  companyReadingScope,
  companyReadingScrollTarget,
  type CompanyReadingPosition,
} from './company-reading-memory';

/** Restore only the same account, record and acquired snapshot's document reading position. */
export function CompanyReadingSession({
  owner,
  run,
  section,
  focus,
}: {
  owner: string;
  run: CompanyResearchRun;
  section: CompanySection;
  focus?: string | null;
}) {
  const { historyNavigation } = useApp();
  const scope = companyReadingScope(owner, run);
  const previousSnapshot = useRef<string | null>(null);
  useLayoutEffect(() => {
    const changedSnapshot =
      previousSnapshot.current !== null && previousSnapshot.current !== scope.snapshot;
    previousSnapshot.current = scope.snapshot;
    companyReadingMemory.enter(scope);
    // Original review has asynchronous, editable content rather than stable report sections.
    if (section === 'evidence') return;
    const root = document.querySelector<HTMLElement>('.company-workspace');
    if (!root) return;
    const explicitTarget = Boolean(
      focus || location.hash || new URLSearchParams(location.search).has('focus')
    );
    const saved = explicitTarget ? null : companyReadingMemory.read(scope, section);
    let ready = false;
    let frame = 0;
    let last: CompanyReadingPosition | null = null;
    const elements = () =>
      companyReadingAnchors[section]
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement =>
          Boolean(element && root.contains(element) && element.getClientRects().length)
        );
    const capture = () => {
      if (!ready) return;
      const scrollY = Math.max(0, window.scrollY);
      const headerHeight =
        document.querySelector('header.site-header, .research-header')?.getBoundingClientRect()
          .height || 56;
      const indexHeight =
        Number.parseFloat(
          getComputedStyle(root).getPropertyValue('--company-reading-index-height')
        ) || 0;
      const anchor = elements()
        .filter((element) => element.getBoundingClientRect().top <= headerHeight + indexHeight + 16)
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
      last = {
        scrollY,
        anchor: anchor?.id || null,
        offset: anchor ? scrollY - (anchor.getBoundingClientRect().top + window.scrollY) : 0,
        openDetails: companyReadingDisclosures[section].filter((id) => {
          const detail = document.getElementById(id);
          return detail instanceof HTMLDetailsElement && root.contains(detail) && detail.open;
        }),
      };
      companyReadingMemory.save(scope, section, last);
    };
    const stopRestoring = () => {
      if (ready) return;
      cancelAnimationFrame(frame);
      ready = true;
      capture();
    };
    if (changedSnapshot) {
      // Reset only our reading disclosures, preserving a requested target and its ancestors.
      const requestedId = resolveCompanyFocus(section, focus) || location.hash.slice(1);
      const requested = requestedId ? document.getElementById(requestedId) : null;
      for (const id of companyReadingDisclosures[section]) {
        const detail = document.getElementById(id);
        if (detail instanceof HTMLDetailsElement && root.contains(detail))
          detail.open =
            companyReadingDefaultOpen[section].includes(id) ||
            Boolean(requested && detail.contains(requested));
      }
    }
    // App resets the newly committed destination to the top in its layout effect.
    // Two frames allow this and the restored disclosures to finish before measuring anchors.
    frame = requestAnimationFrame(() => {
      if (saved) {
        for (const id of companyReadingDisclosures[section]) {
          const detail = document.getElementById(id);
          if (detail instanceof HTMLDetailsElement && root.contains(detail))
            detail.open = saved.openDetails.includes(id);
        }
      }
      frame = requestAnimationFrame(() => {
        if (!explicitTarget && !historyNavigation) {
          const anchor = saved?.anchor ? document.getElementById(saved.anchor) : null;
          const anchorTop =
            anchor && root.contains(anchor) && anchor.getClientRects().length
              ? anchor.getBoundingClientRect().top + window.scrollY
              : null;
          window.scrollTo({
            top: saved
              ? companyReadingScrollTarget(
                  saved,
                  anchorTop,
                  document.documentElement.scrollHeight - window.innerHeight
                )
              : 0,
            left: 0,
            behavior: 'instant',
          });
        }
        ready = true;
        capture();
      });
    });
    window.addEventListener('scroll', capture, { passive: true });
    window.addEventListener('wheel', stopRestoring, { passive: true });
    window.addEventListener('touchstart', stopRestoring, { passive: true });
    window.addEventListener('keydown', stopRestoring);
    window.addEventListener('hashchange', stopRestoring);
    // Capture before React navigation replaces the outgoing DOM and App scrolls to zero.
    document.addEventListener('click', capture, true);
    root.addEventListener('toggle', capture, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', capture);
      window.removeEventListener('wheel', stopRestoring);
      window.removeEventListener('touchstart', stopRestoring);
      window.removeEventListener('keydown', stopRestoring);
      window.removeEventListener('hashchange', stopRestoring);
      document.removeEventListener('click', capture, true);
      root.removeEventListener('toggle', capture, true);
      // Never read the incoming page's DOM or persist after a scope/account invalidation.
      if (last) companyReadingMemory.save(scope, section, last);
    };
  }, [owner, run.id, scope.snapshot, section, focus, historyNavigation]);
  return null;
}
