import { useEffect, useRef } from 'react';

/** Local atmospheric geometry; the points do not represent company or source relationships. */
export function ShowcaseWorkspaceField() {
  const surface = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = surface.current;
    const home = canvas?.closest<HTMLElement>('.showcase-hermes');
    const context = canvas?.getContext('2d');
    if (!canvas || !home) return;
    home.dataset.ambientRendering = context ? 'canvas' : 'static';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let inView = false;
    let focused = false;
    let disposed = false;
    let lastPaint = 0;
    let phase = 0;
    let previousTime = 0;
    const aim = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    const particles = Array.from({ length: 26 }, (_, index) => ({
      x: (index * 0.61803398875 + 0.09) % 1,
      y: (index * 0.41421356237 + 0.12) % 1,
      drift: 0.4 + (index % 5) * 0.12,
    }));
    const active = () => !disposed && !document.hidden && !reduced.matches && inView && !focused;
    const draw = () => {
      if (!context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      const positions = particles.map((point, index) => ({
        x: point.x * width + Math.sin(phase * point.drift + index) * 12 + pointer.x * 12,
        y: point.y * height + Math.cos(phase * point.drift + index) * 14 + pointer.y * 9,
      }));
      context.lineWidth = 0.75;
      positions.forEach((point, index) => {
        // Keep the composer region quiet; foreground text remains on its own opaque surface.
        const central = point.x > width * 0.26 && point.x < width * 0.74;
        context.fillStyle = `rgba(244,222,188,${central ? 0.19 : 0.55})`;
        context.beginPath();
        context.arc(point.x, point.y, index % 4 ? 1.15 : 1.7, 0, Math.PI * 2);
        context.fill();
        for (let other = index + 1; other < positions.length; other++) {
          const next = positions[other];
          const distance = Math.hypot(point.x - next.x, point.y - next.y);
          if (distance > 132) continue;
          context.strokeStyle = `rgba(239,199,139,${(1 - distance / 132) * 0.16})`;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(next.x, next.y);
          context.stroke();
        }
      });
    };
    const tick = (now: number) => {
      frame = 0;
      if (!active()) return;
      if (previousTime) phase += Math.min((now - previousTime) / 1000, 0.06) * 0.18;
      previousTime = now;
      if (now - lastPaint >= 1000 / 24) {
        pointer.x += (aim.x - pointer.x) * 0.055;
        pointer.y += (aim.y - pointer.y) * 0.055;
        draw();
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const reconcile = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      home.dataset.ambientMotion = active() ? 'active' : 'paused';
      draw();
      if (active() && context) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (disposed) return;
      const bounds = home.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const density = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(height * density));
      context?.setTransform(density, 0, 0, density, 0, 0);
      home.dataset.ambientReady = 'true';
      reconcile();
    };
    const move = (event: PointerEvent) => {
      if (!fine.matches || reduced.matches) return;
      const bounds = home.getBoundingClientRect();
      aim.x = ((event.clientX - bounds.left) / Math.max(width, 1) - 0.5) * 2;
      aim.y = ((event.clientY - bounds.top) / Math.max(height, 1) - 0.5) * 2;
    };
    const leave = () => {
      aim.x = 0;
      aim.y = 0;
    };
    const focus = (event: FocusEvent) => {
      const next = event.type === 'focusin' ? event.target : event.relatedTarget;
      focused = next instanceof Element && next.matches('.showcase-search textarea');
      reconcile();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      reconcile();
    });
    const resizer = new ResizeObserver(resize);
    observer.observe(home);
    resizer.observe(home);
    home.addEventListener('pointermove', move, { passive: true });
    home.addEventListener('pointerleave', leave);
    home.addEventListener('focusin', focus);
    home.addEventListener('focusout', focus);
    document.addEventListener('visibilitychange', reconcile);
    reduced.addEventListener('change', reconcile);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizer.disconnect();
      home.removeEventListener('pointermove', move);
      home.removeEventListener('pointerleave', leave);
      home.removeEventListener('focusin', focus);
      home.removeEventListener('focusout', focus);
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
    };
  }, []);
  return <canvas ref={surface} className="lite-search-ambient" aria-hidden="true" />;
}
