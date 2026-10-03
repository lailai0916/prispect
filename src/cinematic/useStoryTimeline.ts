import { useCallback, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { chapterAt, storyChapters } from './story';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function useStoryTimeline(root: RefObject<HTMLDivElement | null>) {
  const trigger = useRef<ScrollTrigger | null>(null);

  useGSAP(
    () => {
      const container = root.current;
      if (!container) return;
      const stage = container.querySelector<HTMLElement>('.landing-stage');
      if (!stage) return;
      const match = gsap.matchMedia();
      match.add(
        {
          animated: '(prefers-reduced-motion: no-preference)',
          short: '(max-height: 560px), (max-width: 760px) and (max-height: 750px)',
        },
        (context) => {
          const { animated, short } = context.conditions!;
          const narrow = () => window.matchMedia('(max-width: 760px)').matches;
          if (!animated || short) {
            container.dataset.motion = 'static';
            return () => {
              if (container.dataset.motion === 'static') delete container.dataset.motion;
            };
          }
          container.dataset.motion = 'cinematic';
          const copies = Array.from(container.querySelectorAll<HTMLElement>('.landing-copy'));
          const nav = Array.from(
            container.querySelectorAll<HTMLButtonElement>('.story-nav button')
          );
          const panels = Array.from(container.querySelectorAll<HTMLElement>('[data-story-panel]'));
          let active = -1;
          const clock = { progress: 0 };
          const synchronize = () => {
            const index = chapterAt(clock.progress);
            stage.style.setProperty('--story-progress', clock.progress.toFixed(5));
            stage.style.setProperty('--story-percent', `${clock.progress * 100}%`);
            if (active === index) return;
            active = index;
            container.dataset.chapter = storyChapters[index]!.id;
            copies.forEach((element, i) => {
              element.inert = i !== index;
              element.setAttribute('aria-hidden', String(i !== index));
            });
            nav.forEach((button, i) => {
              if (i === index) button.setAttribute('aria-current', 'step');
              else button.removeAttribute('aria-current');
            });
            panels.forEach((panel) => {
              const visible = panel.dataset.storyPanel!.split(' ').includes(String(index));
              panel.inert = !visible;
              panel.setAttribute('aria-hidden', String(!visible));
            });
          };
          gsap.set(copies, { autoAlpha: 0, y: 18 });
          gsap.set(copies[0]!, { autoAlpha: 1, y: 0 });
          gsap.set('.document-sheet', { autoAlpha: 0.24, x: -28, y: -30, z: -70 });
          gsap.set('.document-crop', { yPercent: 0 });
          gsap.set('.bridge-structure', { autoAlpha: 0, z: -20, y: 25, scale: 0.88 });
          gsap.set('.landing-stage .bridge-column', { scaleY: 0, transformOrigin: '50% 100%' });
          gsap.set('.explanation-layer', { autoAlpha: 0, y: 22, z: -40 });
          gsap.set('.report-sheet', { rotationY: -14, rotationX: 7, rotationZ: -3 });
          gsap.set('.source-connector', { scaleX: 0, transformOrigin: '0% 50%' });
          gsap.set('.final-paper', { autoAlpha: 0 });
          const timeline = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            onUpdate: synchronize,
            scrollTrigger: {
              trigger: container,
              pin: stage,
              start: () =>
                `top top+=${parseFloat(getComputedStyle(container).getPropertyValue('--site-header-height')) || 52}`,
              end: () => `+=${Math.max(stage.offsetHeight, 520) * (narrow() ? 6.4 : 7)}`,
              scrub: 0.22,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });
          trigger.current = timeline.scrollTrigger!;
          timeline.to(clock, { progress: 1, duration: 100, ease: 'none' }, 0);
          storyChapters.forEach((chapter, i) => {
            timeline.addLabel(chapter.id, chapter.start * 100);
            if (i > 0) {
              timeline.to(
                copies[i - 1]!,
                { autoAlpha: 0, y: -16, duration: 3 },
                chapter.start * 100 - 3
              );
              timeline.to(copies[i]!, { autoAlpha: 1, y: 0, duration: 3 }, chapter.start * 100);
            }
          });
          timeline
            .to('.report-sheet', { y: -90, z: 80, rotationX: -28, autoAlpha: 0, duration: 14 }, 12)
            .to('.document-sheet', { autoAlpha: 1, x: 0, y: 0, z: 0, duration: 14 }, 13)
            .to(
              '.evidence-model',
              { rotationY: () => (narrow() ? 0 : 3), rotationX: 0, duration: 15 },
              13
            )
            .to('.source-connector', { scaleX: 1, duration: 8 }, 15)
            .to('.source-aperture', { scale: 1, duration: 12 }, 16)
            .to('.document-crop', { yPercent: -49, duration: 6 }, 26)
            .to('.evidence-values', { y: () => (narrow() ? -136 : -200), duration: 12 }, 13)
            .to(
              '.amount-profit',
              {
                y: () => (narrow() ? -4 : -20),
                x: () => (narrow() ? -8 : -16),
                scale: 0.83,
                duration: 12,
              },
              16
            )
            .to(
              '.amount-cash',
              {
                y: () => (narrow() ? -4 : -20),
                x: () => (narrow() ? 8 : 16),
                scale: 0.83,
                duration: 12,
              },
              16
            )
            .to(
              '.document-sheet',
              { rotationX: 43, y: 122, z: -120, scale: 0.64, autoAlpha: 0.025, duration: 14 },
              36
            )
            .to('.source-aperture', { autoAlpha: 0, duration: 8 }, 36)
            .to('.bridge-structure', { autoAlpha: 1, z: 20, y: 0, scale: 1, duration: 14 }, 36)
            .to('.landing-stage .bridge-column', { scaleY: 1, stagger: 1.2, duration: 7 }, 40)
            .to('.amount-profit, .amount-cash', { autoAlpha: 0, duration: 8 }, 37)
            .to(
              '.amount-profit',
              {
                y: () => (narrow() ? -12 : -30),
                x: () => (narrow() ? -10 : -24),
                scale: 0.76,
                duration: 12,
              },
              37
            )
            .to(
              '.amount-cash',
              {
                y: () => (narrow() ? -12 : -30),
                x: () => (narrow() ? 10 : 24),
                scale: 0.76,
                duration: 12,
              },
              37
            )
            .to('.evidence-model', { rotationY: () => (narrow() ? 0 : -4), duration: 8 }, 40)
            .to('.evidence-model', { rotationY: 0, duration: 8 }, 52)
            .to(
              '.bridge-structure',
              {
                y: () => (narrow() ? -12 : -28),
                scale: 0.82,
                autoAlpha: 0.07,
                z: -50,
                duration: 12,
              },
              61
            )
            .to('.amount-profit, .amount-cash', { autoAlpha: 0, duration: 7 }, 62)
            .to('.explanation-layer', { autoAlpha: 1, y: 0, z: 40, duration: 10 }, 64)
            .to('.explanation-path', { scaleX: 1, stagger: 1.4, duration: 6 }, 67)
            .to('.explanation-layer', { autoAlpha: 0, y: -18, z: 0, duration: 9 }, 81)
            .to(
              '.bridge-structure, .document-sheet, .source-connector',
              { autoAlpha: 0, duration: 8 },
              82
            )
            .to('.final-paper', { autoAlpha: 1, duration: 5 }, 81)
            .to(
              '.report-sheet',
              {
                autoAlpha: 1,
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0,
                x: 0,
                y: 0,
                z: 0,
                duration: 12,
              },
              84
            )
            .to(
              '.amount-profit, .amount-cash',
              { autoAlpha: 1, y: 0, x: 0, scale: 1, duration: 12 },
              84
            )
            .to('.evidence-values', { y: 0, duration: 12 }, 84)
            .to('.evidence-model', { rotationY: 0, rotationX: 0, duration: 12 }, 84);
          synchronize();
          return () => {
            if (trigger.current === timeline.scrollTrigger) trigger.current = null;
            if (container.dataset.motion === 'cinematic') delete container.dataset.motion;
            delete container.dataset.chapter;
            stage.style.removeProperty('--story-progress');
            stage.style.removeProperty('--story-percent');
            copies.concat(panels).forEach((element) => {
              element.inert = false;
              element.removeAttribute('aria-hidden');
            });
            nav.forEach((button) => button.removeAttribute('aria-current'));
          };
        }
      );
      return () => match.revert();
    },
    { scope: root }
  );

  const goToChapter = useCallback((index: number) => {
    const target = trigger.current;
    const chapter = storyChapters[index];
    if (!target || !chapter) return;
    window.scrollTo({
      top: target.start + (target.end - target.start) * chapter.hold,
      behavior: 'smooth',
    });
  }, []);

  return { goToChapter };
}
