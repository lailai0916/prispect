import type { RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Animation only owns presentation: it never starts research or interpolates amounts. */
export function useShowcaseMotion(root: RefObject<HTMLDivElement | null>, locale: string) {
  useGSAP(
    () => {
      const container = root.current;
      if (!container) return;
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const select = gsap.utils.selector(container);
        const entrance = gsap.timeline({ defaults: { ease: 'power4.out' } });
        entrance
          .from(select('.showcase-letter'), {
            yPercent: 120,
            rotationX: -65,
            transformOrigin: '50% 100%',
            duration: 0.95,
            stagger: 0.026,
          })
          .from(
            select('.showcase-paper-scene'),
            { xPercent: 18, rotation: 9, opacity: 0, duration: 1.2 },
            0.12
          )
          .from(select('.showcase-description'), { y: 16, opacity: 0, duration: 0.55 }, 0.45);
        gsap.to(select('.showcase-paper-scene'), {
          yPercent: 14,
          xPercent: -13,
          rotation: -12,
          ease: 'none',
          scrollTrigger: {
            trigger: select('.showcase-hero')[0],
            start: 'top top',
            end: 'bottom top',
            scrub: 0.8,
          },
        });
        select('.showcase-title-line').forEach((line: HTMLElement, index: number) =>
          gsap.to(line, {
            xPercent: index ? 5 : -7,
            ease: 'none',
            scrollTrigger: {
              trigger: select('.showcase-hero')[0],
              start: 'top top',
              end: 'bottom top',
              scrub: 0.7,
            },
          })
        );
        select('.showcase-reveal').forEach((heading: HTMLElement) =>
          gsap.from(heading, {
            y: 70,
            rotation: -2,
            opacity: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: heading,
              start: 'top 90%',
              toggleActions: 'play none none reverse',
            },
          })
        );
        gsap.from(select('.showcase-source-sheet'), {
          rotation: 12,
          y: 140,
          scale: 0.82,
          opacity: 0,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: select('.showcase-evidence-stage')[0],
            start: 'top 90%',
            end: 'top 38%',
            scrub: 0.65,
          },
        });
        gsap.from(select('.showcase-evidence-values > *'), {
          y: 34,
          opacity: 0,
          stagger: 0.12,
          duration: 0.65,
          scrollTrigger: {
            trigger: select('.showcase-evidence-values')[0],
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        });
        gsap.from(select('.showcase-chapters > button'), {
          x: -80,
          opacity: 0,
          stagger: 0.1,
          duration: 0.75,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: select('.showcase-chapters')[0],
            start: 'top 88%',
            toggleActions: 'play none none reverse',
          },
        });
        const visibility = () => {
          if (document.hidden) entrance.pause();
          else entrance.resume();
        };
        document.addEventListener('visibilitychange', visibility);
        return () => document.removeEventListener('visibilitychange', visibility);
      });
      media.add(
        '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)',
        () => {
          const hero = container.querySelector<HTMLElement>('.showcase-hero');
          const paper = container.querySelector<HTMLElement>('.showcase-paper-follow');
          if (!hero || !paper) return;
          const x = gsap.quickTo(paper, 'x', { duration: 0.7, ease: 'power3.out' });
          const y = gsap.quickTo(paper, 'y', { duration: 0.7, ease: 'power3.out' });
          const rotationY = gsap.quickTo(paper, 'rotationY', { duration: 0.8, ease: 'power3.out' });
          const rotationX = gsap.quickTo(paper, 'rotationX', { duration: 0.8, ease: 'power3.out' });
          const reset = () => {
            x(0);
            y(0);
            rotationY(0);
            rotationX(0);
          };
          const follow = (event: PointerEvent) => {
            if (
              document.hidden ||
              container.querySelector('.showcase-search')?.contains(document.activeElement)
            )
              return;
            const bounds = hero.getBoundingClientRect();
            const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
            const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
            x(horizontal * 38);
            y(vertical * 28);
            rotationY(horizontal * 18);
            rotationX(-vertical * 12);
          };
          const onFocus = (event: FocusEvent) => {
            if (container.querySelector('.showcase-search')?.contains(event.target as Node))
              reset();
          };
          hero.addEventListener('pointermove', follow);
          hero.addEventListener('pointerleave', reset);
          hero.addEventListener('focusin', onFocus);
          const magnetic = Array.from(
            container.querySelectorAll<HTMLElement>(
              '[data-magnetic], .showcase-search .start-submit'
            )
          );
          const handlers = magnetic.map((button) => {
            const moveX = gsap.quickTo(button, 'x', { duration: 0.3, ease: 'power2.out' });
            const moveY = gsap.quickTo(button, 'y', { duration: 0.3, ease: 'power2.out' });
            const move = (event: PointerEvent) => {
              if (document.hidden) return;
              const bounds = button.getBoundingClientRect();
              moveX((event.clientX - bounds.left - bounds.width / 2) * 0.12);
              moveY((event.clientY - bounds.top - bounds.height / 2) * 0.12);
            };
            const leave = () => {
              moveX(0);
              moveY(0);
            };
            button.addEventListener('pointermove', move);
            button.addEventListener('pointerleave', leave);
            button.addEventListener('focus', leave);
            return () => {
              button.removeEventListener('pointermove', move);
              button.removeEventListener('pointerleave', leave);
              button.removeEventListener('focus', leave);
            };
          });
          return () => {
            hero.removeEventListener('pointermove', follow);
            hero.removeEventListener('pointerleave', reset);
            hero.removeEventListener('focusin', onFocus);
            handlers.forEach((cleanup) => cleanup());
          };
        }
      );
      return () => media.revert();
    },
    { scope: root, dependencies: [locale], revertOnUpdate: true }
  );
}
