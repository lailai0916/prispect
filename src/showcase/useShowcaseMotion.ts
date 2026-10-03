import type { RefObject } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Short workspace feedback only: no scroll hijacking, staged progress or numeric animation. */
export function useShowcaseMotion(
  root: RefObject<HTMLDivElement | null>,
  locale: string,
  mode = 'search'
) {
  useGSAP(
    () => {
      const container = root.current;
      if (!container) return;
      const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
      let priorReducedMotion = motionPreference.matches;
      let motionScroll: { x: number; y: number; href: string } | null = null;
      const mediaEvents = gsap as typeof gsap & {
        addEventListener(event: 'matchMediaInit' | 'matchMedia', callback: () => void): void;
        removeEventListener(event: 'matchMediaInit' | 'matchMedia', callback: () => void): void;
      };
      const recordMotionScroll = () => {
        const reduced = motionPreference.matches;
        if (reduced === priorReducedMotion) return;
        priorReducedMotion = reduced;
        motionScroll = container.isConnected
          ? { x: scrollX, y: scrollY, href: location.href }
          : null;
      };
      const restoreMotionScroll = () => {
        const position = motionScroll;
        motionScroll = null;
        if (!position || !container.isConnected || position.href !== location.href) return;
        window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
      };
      mediaEvents.addEventListener('matchMediaInit', recordMotionScroll);
      mediaEvents.addEventListener('matchMedia', restoreMotionScroll);
      const media = gsap.matchMedia();
      media.add(
        {
          motion: '(prefers-reduced-motion: no-preference)',
          pointer: '(hover: hover) and (pointer: fine)',
        },
        (context) => {
          if (!context.conditions?.motion) return;
          const all = (selector: string) =>
            Array.from(container.querySelectorAll<HTMLElement>(selector));
          const enter = gsap.timeline({ defaults: { ease: 'power3.out' } });
          if (mode === 'search') {
            enter.from(all('.lite-search-eyebrow'), { opacity: 0, y: 8, duration: 0.45 });
            enter.from(
              all('.lite-search-letter'),
              {
                opacity: 0,
                y: 14,
                duration: 0.55,
                stagger: locale === 'en' ? 0.009 : 0.022,
                clearProps: 'opacity,transform',
              },
              0.07
            );
            enter.from(all('.lite-search-description'), { opacity: 0, y: 10, duration: 0.5 }, 0.25);
            enter.from(
              all('.lite-search-modes, .showcase-search'),
              { opacity: 0, y: 12, duration: 0.55, stagger: 0.08, clearProps: 'opacity,transform' },
              0.32
            );
          } else {
            enter.from(all('.lite-search-detail-heading'), {
              opacity: 0,
              y: 12,
              duration: 0.5,
              clearProps: 'opacity,transform',
            });
            enter.from(
              all('[data-lite-card]'),
              { opacity: 0, y: 16, duration: 0.5, stagger: 0.08, clearProps: 'opacity,transform' },
              0.08
            );
          }
          const visibility = () => {
            if (document.hidden) enter.pause();
            else enter.resume();
          };
          document.addEventListener('visibilitychange', visibility);
          visibility();
          const cards = context.conditions.pointer ? all('[data-lite-card]') : [];
          const handlers = cards.map((card) => {
            const tiltX = gsap.quickTo(card, 'rotationX', { duration: 0.35, ease: 'power2.out' });
            const tiltY = gsap.quickTo(card, 'rotationY', { duration: 0.35, ease: 'power2.out' });
            const move = (event: PointerEvent) => {
              if (document.hidden || card.contains(document.activeElement)) return;
              const bounds = card.getBoundingClientRect();
              const x = (event.clientX - bounds.left) / bounds.width;
              const y = (event.clientY - bounds.top) / bounds.height;
              card.style.setProperty('--lite-shine-x', `${x * 100}%`);
              card.style.setProperty('--lite-shine-y', `${y * 100}%`);
              tiltX((0.5 - y) * 2);
              tiltY((x - 0.5) * 2);
            };
            const leave = () => {
              tiltX(0);
              tiltY(0);
            };
            card.addEventListener('pointermove', move, { passive: true });
            card.addEventListener('pointerleave', leave);
            card.addEventListener('focusin', leave);
            return () => {
              card.removeEventListener('pointermove', move);
              card.removeEventListener('pointerleave', leave);
              card.removeEventListener('focusin', leave);
              tiltX.tween.kill();
              tiltY.tween.kill();
              card.style.removeProperty('--lite-shine-x');
              card.style.removeProperty('--lite-shine-y');
            };
          });
          return () => {
            document.removeEventListener('visibilitychange', visibility);
            handlers.forEach((dispose) => dispose());
          };
        }
      );
      return () => {
        motionScroll = null;
        mediaEvents.removeEventListener('matchMediaInit', recordMotionScroll);
        mediaEvents.removeEventListener('matchMedia', restoreMotionScroll);
        media.revert();
      };
    },
    { scope: root, dependencies: [locale, mode], revertOnUpdate: true }
  );
}
