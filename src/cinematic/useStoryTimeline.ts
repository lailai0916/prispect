import { useCallback, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { chapterAt, sourcePageOpacity, storyChapters } from './story';

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
              if (container.dataset.motion === 'static') delete container.dataset.motion;
            };
          }
          container.dataset.motion = 'cinematic';
          const narrow = () => window.matchMedia('(max-width: 760px)').matches;
          const copies = Array.from(stage.querySelectorAll<HTMLElement>('.scene-copy'));
          const nav = Array.from(stage.querySelectorAll<HTMLButtonElement>('.story-nav button'));
          const panels = Array.from(stage.querySelectorAll<HTMLElement>('[data-story-panel]'));
          const sourcePages = Array.from(stage.querySelectorAll<HTMLElement>('.source-page'));
          const sourceAlphas = [-1, -1];
          const clock = { progress: 0 };
          let active = -1;
          const synchronize = () => {
            stage.style.setProperty('--story-progress', clock.progress.toFixed(5));
            sourcePages.forEach((page, index) => {
              const alpha = sourcePageOpacity(clock.progress, index);
              if (alpha === sourceAlphas[index]) return;
              sourceAlphas[index] = alpha;
              page.style.opacity = alpha.toFixed(4);
              page.style.visibility = alpha > 0 ? 'visible' : 'hidden';
            });
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
          gsap.set('.bridge-structure', {
            autoAlpha: 0,
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: 0,
          });
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
            .to('.hero-heading', { y: -28, scale: 0.985, autoAlpha: 0, duration: 4 }, 8.5)
            .to(
              '.initial-amounts',
              {
                y: () => (window.innerWidth <= 1000 ? 0 : -stage.offsetHeight * 0.1),
                autoAlpha: () => (window.innerWidth <= 1000 ? 0 : 1),
                duration: 8,
              },
              12
            )
            .to('.initial-amounts', { autoAlpha: 0, duration: 4 }, 35)
            .to('.discovery-question', { autoAlpha: 0, duration: 2.5 }, 8.5)
            .to(copies[0]!, { autoAlpha: 0, duration: 2 }, 13)
            .set(stage, { '--scene-ink': '#000000', '--scene-muted': '#000000' }, 12)
            .to('.scene-darkness', { opacity: 1, duration: 8, ease: 'none' }, 12)
            .set(
              stage,
              {
                '--scene-ink': '#ffffff',
                '--scene-muted': '#ffffff',
                '--scene-line': 'rgba(197, 204, 221, 0.19)',
              },
              16.4
            )
            .set(stage, { '--scene-ink': '#eceef4', '--scene-muted': '#9a9faa' }, 20)
            .fromTo(copies[1]!, { y: 22 }, { autoAlpha: 1, y: 0, duration: 4 }, 18)
            .to(copies[1]!, { autoAlpha: 0, y: -12, duration: 3 }, 37)
            .fromTo(copies[2]!, { y: 20 }, { autoAlpha: 1, y: 0, duration: 4 }, 40)
            .fromTo(
              '.bridge-structure',
              { y: 20, scale: 0.95 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 3.5 },
              49.5
            )
            .to('.bridge-structure', { autoAlpha: 0, scale: 0.94, y: -30, duration: 4 }, 61)
            .to(copies[2]!, { autoAlpha: 0, duration: 2 }, 63)
            .fromTo(copies[3]!, { y: 22 }, { autoAlpha: 1, y: 0, duration: 5 }, 65)
            .to(
              '.scene-inquiry .inquiry-branches article',
              { autoAlpha: 1, y: 0, duration: 4, stagger: 0.7 },
              71.8
            )
            .to(copies[3]!, { autoAlpha: 0, y: -22, duration: 4 }, 81)
            .to('.scene-identity', { autoAlpha: 0, duration: 2.5 }, 87.5)
            .set(stage, { '--scene-ink': '#ffffff', '--scene-muted': '#ffffff' }, 82)
            .to('.scene-darkness', { opacity: 0, duration: 8, ease: 'none' }, 82)
            .set(stage, { '--scene-ink': '#000000', '--scene-muted': '#000000' }, 85.6)
            .set(
              stage,
              {
                '--scene-ink': '#17191e',
                '--scene-muted': '#666a73',
                '--scene-line': 'rgba(30, 34, 43, 0.16)',
              },
              90
            )
            .fromTo(copies[4]!, { y: 20 }, { autoAlpha: 1, y: 0, duration: 4 }, 90)
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
            sourcePages.forEach((page) => {
              page.style.removeProperty('opacity');
              page.style.removeProperty('visibility');
            });
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
