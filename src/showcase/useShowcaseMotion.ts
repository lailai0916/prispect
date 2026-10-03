import type { RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Motion owns presentation only; native scrolling, exact amounts and research stay untouched. */
export function useShowcaseMotion(root: RefObject<HTMLDivElement | null>, locale: string) {
  useGSAP(
    () => {
      const container = root.current;
      if (!container) return;
      const media = gsap.matchMedia();
      media.add(
        {
          motion: '(prefers-reduced-motion: no-preference)',
          desktop: '(min-width: 900px)',
        },
        (context) => {
          if (!context.conditions?.motion) return;
          const desktop = context.conditions.desktop;
          const one = (selector: string) => container.querySelector<HTMLElement>(selector);
          const all = (selector: string) =>
            Array.from(container.querySelectorAll<HTMLElement>(selector));
          const hero = one('.showcase-hero');
          const scene = one('.showcase-paper-scene');
          const entrance = gsap.timeline({ defaults: { ease: 'power4.out' } });

          // Every letter settles at its native position before scroll choreography begins.
          entrance.from(all('[data-title-line="0"] .showcase-letter'), {
            yPercent: 145,
            rotationX: -80,
            transformOrigin: '50% 100%',
            duration: 1.12,
            stagger: { each: locale === 'en' ? 0.016 : 0.035, from: 'start' },
          });
          // The second line arrives laterally, alternating direction rather than repeating the hinge.
          entrance.from(
            all('[data-title-line="1"] .showcase-letter'),
            {
              x: (index) => (index % 2 ? 1 : -1) * 34,
              yPercent: (index) => (index % 2 ? -1 : 1) * 115,
              rotation: (index) => (index % 2 ? 1 : -1) * 9,
              opacity: 0,
              duration: 0.85,
              stagger: { each: locale === 'en' ? 0.012 : 0.045, from: 'center' },
            },
            0.2
          );
          if (scene) {
            entrance.from(
              scene,
              {
                xPercent: desktop ? 20 : 8,
                yPercent: 12,
                rotation: -24,
                scale: 0.58,
                opacity: 0,
                duration: 1.65,
                ease: 'expo.out',
              },
              0.08
            );
          }
          entrance.from(all('.showcase-description'), { y: 28, opacity: 0, duration: 0.75 }, 0.42);
          const orbitLabels = all('.showcase-orbit-labels > *');
          if (orbitLabels.length) {
            entrance.from(orbitLabels, { y: 24, opacity: 0, duration: 0.8, stagger: 0.12 }, 0.7);
          }

          if (hero) {
            if (scene) {
              gsap.to(scene, {
                yPercent: desktop ? 34 : 16,
                xPercent: desktop ? -17 : -5,
                rotation: desktop ? 21 : 9,
                scale: desktop ? 1.18 : 1.08,
                ease: 'none',
                scrollTrigger: {
                  trigger: hero,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: 0.9,
                },
              });
            }
            const copy = one('.showcase-hero-copy');
            if (copy) {
              gsap.to(copy, {
                y: desktop ? -76 : -24,
                ease: 'none',
                scrollTrigger: {
                  trigger: hero,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: 0.7,
                },
              });
            }
            all('.showcase-title-line').forEach((line, index) => {
              gsap.to(line, {
                xPercent: (index ? 1 : -1) * (desktop ? 11 : 3),
                ease: 'none',
                scrollTrigger: {
                  trigger: hero,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: 0.75,
                },
              });
            });
            orbitLabels.forEach((label, index) => {
              gsap.to(label, {
                y: (index % 2 ? -1 : 1) * (desktop ? 95 : 32),
                rotation: index % 2 ? 8 : -8,
                ease: 'none',
                scrollTrigger: {
                  trigger: hero,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: 1.15,
                },
              });
            });
          }

          all('.showcase-reveal').forEach((heading) => {
            gsap.from(heading, {
              y: desktop ? 90 : 42,
              rotation: desktop ? -3 : -1,
              opacity: 0,
              duration: 1.05,
              ease: 'power4.out',
              scrollTrigger: {
                trigger: heading,
                start: 'top 94%',
                toggleActions: 'play none none reverse',
              },
            });
          });

          // The document peels into view, then drifts past the exact figures beside it.
          const sourceSheet = one('.showcase-source-sheet');
          const evidenceStage = one('.showcase-evidence-stage');
          if (sourceSheet && evidenceStage) {
            gsap.fromTo(
              sourceSheet,
              {
                y: desktop ? 160 : 65,
                rotation: desktop ? 17 : 8,
                rotationY: desktop ? -28 : -10,
                scale: 0.82,
                opacity: 0,
                transformOrigin: '8% 80%',
              },
              {
                y: desktop ? -28 : 0,
                rotation: -3,
                rotationY: 0,
                scale: 1,
                opacity: 1,
                ease: 'power2.out',
                scrollTrigger: {
                  trigger: evidenceStage,
                  start: 'top 94%',
                  end: 'top 22%',
                  scrub: 0.8,
                },
              }
            );
          }
          const values = one('.showcase-evidence-values');
          if (values) {
            gsap.from(all('.showcase-evidence-values > *'), {
              y: 38,
              clipPath: 'inset(100% 0% 0% 0%)',
              opacity: 0,
              stagger: 0.14,
              duration: 0.95,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: values,
                start: 'top 92%',
                toggleActions: 'play none none reverse',
              },
            });
          }

          const chapters = one('.showcase-chapters');
          if (chapters) {
            gsap.from(all('.showcase-chapters > button'), {
              x: desktop ? -115 : -28,
              y: desktop ? 16 : 22,
              opacity: 0,
              stagger: 0.14,
              duration: 1.05,
              ease: 'power4.out',
              scrollTrigger: {
                trigger: chapters,
                start: 'top 92%',
                toggleActions: 'play none none reverse',
              },
            });
          }

          const driftingType = (
            selector: string,
            sectionSelector: string,
            desktopDistance: number,
            mobileDistance: number
          ) => {
            const word = one(selector);
            const section = one(sectionSelector);
            if (!word || !section) return;
            gsap.fromTo(
              word,
              { xPercent: desktop ? 5 : 2 },
              {
                xPercent: desktop ? desktopDistance : mobileDistance,
                ease: 'none',
                scrollTrigger: {
                  trigger: section,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: 0.65,
                },
              }
            );
          };
          driftingType('.showcase-process-word', '.showcase-process', -20, -8);
          driftingType('.showcase-ending-word', '.showcase-ending', -17, -7);
          all('.showcase-marquee').forEach((marquee) => {
            gsap.from(marquee, {
              y: 35,
              opacity: 0,
              duration: 0.8,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: marquee,
                start: 'top 96%',
                toggleActions: 'play none none reverse',
              },
            });
          });

          const visibility = () => {
            if (document.hidden) entrance.pause();
            else {
              entrance.resume();
              ScrollTrigger.refresh();
            }
          };
          if (document.hidden) entrance.pause();
          document.addEventListener('visibilitychange', visibility);
          return () => document.removeEventListener('visibilitychange', visibility);
        }
      );
      media.add(
        '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)',
        () => {
          const hero = container.querySelector<HTMLElement>('.showcase-hero');
          const paper = container.querySelector<HTMLElement>('.showcase-paper-follow');
          const paperMoves = paper
            ? {
                x: gsap.quickTo(paper, 'x', { duration: 0.8, ease: 'power3.out' }),
                y: gsap.quickTo(paper, 'y', { duration: 0.8, ease: 'power3.out' }),
                rotationY: gsap.quickTo(paper, 'rotationY', {
                  duration: 0.9,
                  ease: 'power3.out',
                }),
                rotationX: gsap.quickTo(paper, 'rotationX', {
                  duration: 0.9,
                  ease: 'power3.out',
                }),
              }
            : null;
          let pointerFrame = 0;
          const shine = (horizontal: number, vertical: number) => {
            hero?.style.setProperty('--showcase-pointer-x', `${horizontal * 100}%`);
            hero?.style.setProperty('--showcase-pointer-y', `${vertical * 100}%`);
          };
          const reset = () => {
            cancelAnimationFrame(pointerFrame);
            shine(0.5, 0.5);
            if (!paperMoves) return;
            paperMoves.x(0);
            paperMoves.y(0);
            paperMoves.rotationY(0);
            paperMoves.rotationX(0);
          };
          const follow = (event: PointerEvent) => {
            if (
              !hero ||
              document.hidden ||
              container.querySelector('.showcase-search')?.contains(document.activeElement)
            )
              return;
            const bounds = hero.getBoundingClientRect();
            const horizontal = gsap.utils.clamp(0, 1, (event.clientX - bounds.left) / bounds.width);
            const vertical = gsap.utils.clamp(0, 1, (event.clientY - bounds.top) / bounds.height);
            cancelAnimationFrame(pointerFrame);
            pointerFrame = requestAnimationFrame(() => shine(horizontal, vertical));
            paperMoves?.x((horizontal - 0.5) * 60);
            paperMoves?.y((vertical - 0.5) * 42);
            paperMoves?.rotationY((horizontal - 0.5) * 24);
            paperMoves?.rotationX((vertical - 0.5) * -18);
          };
          const onFocus = (event: FocusEvent) => {
            if (container.querySelector('.showcase-search')?.contains(event.target as Node))
              reset();
          };
          const onVisibility = () => {
            if (document.hidden) reset();
          };
          hero?.addEventListener('pointermove', follow);
          hero?.addEventListener('pointerleave', reset);
          hero?.addEventListener('focusin', onFocus);
          document.addEventListener('visibilitychange', onVisibility);

          const magneticSelector = '[data-magnetic], .showcase-search .start-submit';
          const magnetic = new Map<HTMLElement, { x: gsap.QuickToFunc; y: gsap.QuickToFunc }>();
          const magneticButton = (target: EventTarget | null) => {
            const button =
              target instanceof Element ? target.closest<HTMLElement>(magneticSelector) : null;
            return button && container.contains(button) ? button : null;
          };
          const magneticMove = (event: PointerEvent) => {
            if (document.hidden) return;
            const button = magneticButton(event.target);
            if (!button || button.matches(':disabled')) return;
            for (const [previous, moves] of magnetic) {
              if (previous.isConnected) continue;
              moves.x.tween.kill();
              moves.y.tween.kill();
              magnetic.delete(previous);
            }
            let moves = magnetic.get(button);
            if (!moves) {
              moves = {
                x: gsap.quickTo(button, 'x', { duration: 0.3, ease: 'power2.out' }),
                y: gsap.quickTo(button, 'y', { duration: 0.3, ease: 'power2.out' }),
              };
              magnetic.set(button, moves);
            }
            const bounds = button.getBoundingClientRect();
            moves.x((event.clientX - bounds.left - bounds.width / 2) * 0.12);
            moves.y((event.clientY - bounds.top - bounds.height / 2) * 0.12);
          };
          const magneticOut = (event: PointerEvent) => {
            const button = magneticButton(event.target);
            if (!button || magneticButton(event.relatedTarget) === button) return;
            magnetic.get(button)?.x(0);
            magnetic.get(button)?.y(0);
          };
          const magneticFocus = (event: FocusEvent) => {
            const button = magneticButton(event.target);
            if (!button) return;
            magnetic.get(button)?.x(0);
            magnetic.get(button)?.y(0);
          };
          // Delegation also covers the input's submit button after a sample fills a new draft.
          container.addEventListener('pointermove', magneticMove);
          container.addEventListener('pointerout', magneticOut);
          container.addEventListener('focusin', magneticFocus);
          return () => {
            cancelAnimationFrame(pointerFrame);
            hero?.removeEventListener('pointermove', follow);
            hero?.removeEventListener('pointerleave', reset);
            hero?.removeEventListener('focusin', onFocus);
            hero?.style.removeProperty('--showcase-pointer-x');
            hero?.style.removeProperty('--showcase-pointer-y');
            document.removeEventListener('visibilitychange', onVisibility);
            container.removeEventListener('pointermove', magneticMove);
            container.removeEventListener('pointerout', magneticOut);
            container.removeEventListener('focusin', magneticFocus);
            if (paperMoves) Object.values(paperMoves).forEach((move) => move.tween.kill());
            magnetic.forEach((moves, button) => {
              moves.x.tween.kill();
              moves.y.tween.kill();
              gsap.set(button, { clearProps: 'transform' });
            });
          };
        }
      );
      let frame = 0;
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!document.hidden) ScrollTrigger.refresh();
        });
      });
      resize.observe(container);
      return () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        media.revert();
      };
    },
    { scope: root, dependencies: [locale], revertOnUpdate: true }
  );
}
