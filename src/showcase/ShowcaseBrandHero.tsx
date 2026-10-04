import { useEffect, useRef } from 'react';
import { Logo } from '../components';

/** The existing brand mark, with decorative motion independent of company research. */
export function ShowcaseBrandHero() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hero = root.current;
    const home = hero?.closest<HTMLElement>('.showcase-hermes');
    if (!hero || !home) return;
    hero.dataset.brandMotion = 'static';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    let focused = home.querySelector('.showcase-search')?.contains(document.activeElement) || false;
    let disposed = false;
    const settleStroke = () => {
      hero.dataset.brandSettled = 'true';
    };
    const reconcile = () => {
      if (disposed) return;
      hero.dataset.brandFocus = focused ? 'true' : 'false';
      if (focused || reduced.matches) settleStroke();
      hero.dataset.brandMotion = reduced.matches
        ? 'static'
        : !document.hidden && inView && !focused
          ? 'active'
          : 'paused';
    };
    const focus = (event: FocusEvent) => {
      const target = event.type === 'focusin' ? event.target : event.relatedTarget;
      focused = target instanceof Element && Boolean(target.closest('.showcase-search'));
      reconcile();
    };
    const animationEnd = (event: AnimationEvent) => {
      if (
        event.animationName === 'lite-brand-stroke' &&
        event.target === hero.querySelector('.lite-brand-mark path:last-child')
      ) {
        settleStroke();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      reconcile();
    });
    observer.observe(hero);
    home.addEventListener('focusin', focus);
    home.addEventListener('focusout', focus);
    hero.addEventListener('animationend', animationEnd);
    document.addEventListener('visibilitychange', reconcile);
    reduced.addEventListener('change', reconcile);
    reconcile();
    return () => {
      disposed = true;
      observer.disconnect();
      home.removeEventListener('focusin', focus);
      home.removeEventListener('focusout', focus);
      hero.removeEventListener('animationend', animationEnd);
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
      hero.dataset.brandMotion = 'static';
    };
  }, []);

  return (
    <div
      ref={root}
      className="lite-search-introduction lite-search-description lite-brand-hero"
      data-brand-ready="true"
      data-brand-motion="static"
      data-brand-focus="false"
      data-brand-settled="false"
    >
      <div className="lite-brand-lockup">
        <div className="lite-brand-mark" data-lite-card aria-hidden="true">
          <Logo />
        </div>
        <h1
          id="showcase-title"
          className="lite-search-title lite-search-eyebrow lite-brand-wordmark"
          aria-label="析光 Prispect"
        >
          <span className="lite-brand-name" aria-hidden="true">
            {Array.from('析光').map((letter) => (
              <span className="lite-search-letter" key={letter}>
                {letter}
              </span>
            ))}
          </span>
          <span className="lite-brand-latin" aria-hidden="true">
            {Array.from('Prispect').map((letter, index) => (
              <span className="lite-search-letter" key={`${letter}-${index}`}>
                {letter}
              </span>
            ))}
          </span>
        </h1>
      </div>
    </div>
  );
}
