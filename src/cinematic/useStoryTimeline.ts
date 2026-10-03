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
      const stage = container?.querySelector<HTMLElement>('.landing-stage');
      if (!container || !stage) return;
      const match = gsap.matchMedia();
      match.add(
        {
          animated: '(prefers-reduced-motion: no-preference)',
          short: '(max-height: 560px), (max-width: 760px) and (max-height: 750px)',
        },
        (context) => {
          if (!context.conditions!.animated || context.conditions!.short) {
            container.dataset.motion = 'static';
            return () => {
              delete container.dataset.motion;
            };
          }
          container.dataset.motion = 'cinematic';
          const narrow = () => window.matchMedia('(max-width: 760px)').matches;
          const copies = Array.from(stage.querySelectorAll<HTMLElement>('.scene-copy'));
          const nav = Array.from(stage.querySelectorAll<HTMLButtonElement>('.story-nav button'));
          const panels = Array.from(stage.querySelectorAll<HTMLElement>('[data-story-panel]'));
          const clock = { progress: 0 };
          let active = -1;
          const synchronize = () => {
            stage.style.setProperty('--story-progress', clock.progress.toFixed(5));
            stage.dispatchEvent(
              new CustomEvent('storyframe', { detail: { progress: clock.progress } })
            );
            const index = chapterAt(clock.progress);
            if (index === active) return;
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
          gsap.set(copies, { autoAlpha: 0 });
          gsap.set(copies[0]!, { autoAlpha: 1 });
          gsap.set('.source-page, .bridge-structure', { autoAlpha: 0 });
          gsap.set('.bridge-structure', { xPercent: -50, yPercent: -50, y: 0 });
          gsap.set('.source-page-second', { y: 35 });
          gsap.set('.scene-inquiry .inquiry-branches article', { autoAlpha: 0, y: 24 });
          gsap.set('.scene-identity', { autoAlpha: 1 });
          const timeline = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            onUpdate: synchronize,
            scrollTrigger: {
              trigger: container,
              pin: stage,
              start: () =>
                `top top+=${parseFloat(getComputedStyle(container).getPropertyValue('--site-header-height')) || 52}`,
              end: () => `+=${stage.offsetHeight * (narrow() ? 7.8 : 8)}`,
              scrub: 0.3,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });
          trigger.current = timeline.scrollTrigger!;
          timeline.to(clock, { progress: 1, duration: 100, ease: 'none' }, 0);
          storyChapters.forEach((chapter) => timeline.addLabel(chapter.id, chapter.start * 100));
          timeline
            .to('.hero-heading', { y: -55, scale: 0.94, autoAlpha: 0, duration: 7 }, 10)
            .to(
              '.initial-amounts',
              {
                y: () => (narrow() ? 0 : -stage.offsetHeight * 0.1),
                autoAlpha: () => (narrow() ? 0 : 1),
                duration: 8,
              },
              12
            )
            .to('.initial-amounts', { autoAlpha: 0, duration: 4 }, 35)
            .to('.discovery-question', { autoAlpha: 0, duration: 4 }, 12)
            .to(copies[0]!, { autoAlpha: 0, duration: 2 }, 16)
            .to(
              stage,
              {
                '--scene-paper': '#0b0d13',
                '--scene-ink': '#eceef4',
                '--scene-muted': '#9a9faa',
                '--scene-line': 'rgba(197, 204, 221, 0.19)',
                duration: 8,
                ease: 'none',
              },
              12
            )
            .fromTo(copies[1]!, { y: 22 }, { autoAlpha: 1, y: 0, duration: 4 }, 18)
            .to('.source-page-first', { autoAlpha: 1, duration: 3 }, 22)
            .to('.source-page-first', { autoAlpha: 0, y: -35, duration: 3 }, 28)
            .to('.source-page-second', { autoAlpha: 1, y: 0, duration: 3 }, 30)
            .to('.source-page-second', { autoAlpha: 0, y: -25, scale: 0.96, duration: 4 }, 35)
            .to(copies[1]!, { autoAlpha: 0, y: -12, duration: 3 }, 37)
            .fromTo(copies[2]!, { y: 20 }, { autoAlpha: 1, y: 0, duration: 4 }, 40)
            .fromTo(
              '.bridge-structure',
              { y: 20, scale: 0.95 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 5 },
              48
            )
            .to('.bridge-structure', { autoAlpha: 0, scale: 0.94, y: -30, duration: 4 }, 61)
            .to(copies[2]!, { autoAlpha: 0, duration: 2 }, 63)
            .fromTo(copies[3]!, { y: 22 }, { autoAlpha: 1, y: 0, duration: 5 }, 65)
            .to(
              '.scene-inquiry .inquiry-branches article',
              { autoAlpha: 1, y: 0, duration: 5, stagger: 1.2 },
              68
            )
            .to(copies[3]!, { autoAlpha: 0, y: -22, duration: 4 }, 81)
            .to('.scene-identity', { autoAlpha: 0, duration: 4 }, 81)
            .to(
              stage,
              {
                '--scene-paper': '#f5f5f7',
                '--scene-ink': '#17191e',
                '--scene-muted': '#666a73',
                '--scene-line': 'rgba(30, 34, 43, 0.16)',
                duration: 8,
                ease: 'none',
              },
              82
            )
            .fromTo(copies[4]!, { y: 30 }, { autoAlpha: 1, y: 0, duration: 5 }, 88)
            .to('.sculpture-fallback', { autoAlpha: 0, duration: 7 }, 12);
          synchronize();
          return () => {
            if (trigger.current === timeline.scrollTrigger) trigger.current = null;
            if (container.dataset.motion === 'cinematic') delete container.dataset.motion;
            delete container.dataset.chapter;
            stage.style.removeProperty('--story-progress');
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
    const holds = [0, 0.245, 0.555, 0.755, 0.95];
    window.scrollTo({
      top: target.start + (target.end - target.start) * holds[index]!,
      behavior: 'smooth',
    });
  }, []);
  return { goToChapter };
}
