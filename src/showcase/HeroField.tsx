import { useEffect, useRef } from 'react';
import './hero-field.css';

type OpticalPoint = {
  angle: number;
  radius: number;
  orbit: number;
  brightness: number;
  size: number;
};

const opticalColors = [
  [218, 255, 104],
  [125, 240, 246],
  [169, 138, 255],
] as const;
const tau = Math.PI * 2;

function opticalPoints(count: number): OpticalPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = ((index * 7919 + 104729) % 65521) / 65521;
    return {
      angle: index * 2.399963229728653,
      radius: 0.76 + (index % 3) * 0.15 + seed * 0.035,
      orbit: index % 3,
      brightness: 0.28 + seed * 0.72,
      size: seed > 0.9 ? 2 : 0.7 + seed * 0.75,
    };
  });
}

/** Local optical geometry; optional artwork, no account or financial data. */
export function HeroField({ artwork = true }: { artwork?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const scene = root.current;
    const surface = canvas.current;
    const prism = image.current;
    if (!scene || !surface || (artwork && !prism)) return;
    const hero = scene.closest<HTMLElement>('.showcase-hero') || scene;
    const context = surface.getContext('2d', { alpha: true });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousPaint = 0;
    let elapsed = 0;
    let previousTime = 0;
    let inView = true;
    let focused = false;
    let initialized = false;
    let disposed = false;
    let points: OpticalPoint[] = [];
    const aim = { x: 0, y: 0 };
    const position = { x: 0, y: 0 };

    const markReady = () => {
      if (!disposed && initialized && (!artwork || (prism?.complete && prism.naturalWidth > 0)))
        scene.dataset.heroReady = 'true';
    };
    const queryFocused = () =>
      Boolean(hero.querySelector('.showcase-search')?.contains(document.activeElement));
    const animate = () => !reduced.matches && !document.hidden && inView && !focused;

    const draw = (time: number) => {
      if (!context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      const centerX = width * 0.51 + position.x * width * 0.015;
      const centerY = height * 0.5 + position.y * height * 0.015;
      const scale = Math.min(width, height) * 0.4;
      const rotation = time * (pointer.matches ? 0.095 : 0.035);
      const yaw = -0.2 + position.x * 0.19;
      const pitch = -0.07 + position.y * 0.13;

      const project = (angle: number, radius: number, orbit: number) => {
        const tilt = [-1.07, 0.84, 1.37][orbit];
        const x = Math.cos(angle + rotation * (orbit === 1 ? -0.6 : 1)) * radius;
        const circleY = Math.sin(angle + rotation * (orbit === 1 ? -0.6 : 1)) * radius;
        const y = circleY * Math.cos(tilt);
        const z = circleY * Math.sin(tilt);
        const turnedX = x * Math.cos(yaw) + z * Math.sin(yaw);
        const turnedZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const turnedY = y * Math.cos(pitch) - turnedZ * Math.sin(pitch);
        const depth = y * Math.sin(pitch) + turnedZ * Math.cos(pitch);
        const perspective = 2.8 / (2.8 + depth);
        return {
          x: centerX + turnedX * scale * perspective,
          y: centerY + turnedY * scale * perspective,
          depth,
          perspective,
        };
      };

      context.globalCompositeOperation = 'lighter';
      for (let orbit = 0; orbit < 3; orbit++) {
        const [red, green, blue] = opticalColors[orbit];
        context.beginPath();
        for (let index = 0; index <= 80; index++) {
          const point = project((index / 80) * tau, 0.76 + orbit * 0.15, orbit);
          if (!index) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = `rgba(${red},${green},${blue},0.11)`;
        context.lineWidth = 0.65;
        context.stroke();
      }

      // A travelling highlight uses optical geometry only, never research progress.
      const scan = reduced.matches ? 0.6 : (time * 0.35) % tau;
      const beamStart = project(scan, 0.45, 1);
      const beamEnd = project(scan, 1.1, 1);
      const beam = context.createLinearGradient(beamStart.x, beamStart.y, beamEnd.x, beamEnd.y);
      beam.addColorStop(0, 'rgba(125,240,246,0)');
      beam.addColorStop(0.55, 'rgba(125,240,246,0.14)');
      beam.addColorStop(1, 'rgba(218,255,104,0)');
      context.strokeStyle = beam;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(beamStart.x, beamStart.y);
      context.lineTo(beamEnd.x, beamEnd.y);
      context.stroke();
      for (const point of points) {
        const projected = project(point.angle, point.radius, point.orbit);
        const sweep = Math.pow(Math.max(0, Math.cos(point.angle - scan)), 14);
        const opacity = Math.min(
          0.85,
          point.brightness * (0.18 + sweep * 0.6) * (projected.depth < 0 ? 1 : 0.55)
        );
        const [red, green, blue] = opticalColors[point.orbit];
        context.fillStyle = `rgba(${red},${green},${blue},${opacity})`;
        context.beginPath();
        context.arc(
          projected.x,
          projected.y,
          point.size * projected.perspective * (1 + sweep * 0.35),
          0,
          tau
        );
        context.fill();
        if (sweep > 0.8 && point.size > 1.6) {
          context.strokeStyle = `rgba(${red},${green},${blue},${opacity * 0.45})`;
          context.lineWidth = 0.5;
          context.beginPath();
          context.moveTo(projected.x - 4, projected.y);
          context.lineTo(projected.x + 4, projected.y);
          context.moveTo(projected.x, projected.y - 4);
          context.lineTo(projected.x, projected.y + 4);
          context.stroke();
        }
      }
      context.globalCompositeOperation = 'source-over';
    };

    const tick = (now: number) => {
      frame = 0;
      if (!animate()) return;
      if (!previousTime) previousTime = now;
      // Clamping excludes time spent in hidden tabs; cap painting at 30 fps.
      elapsed += Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      if (now - previousPaint >= 1000 / 30) {
        position.x += (aim.x - position.x) * 0.085;
        position.y += (aim.y - position.y) * 0.085;
        draw(elapsed);
        previousPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };

    const reconcile = () => {
      if (disposed || !context) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      if (animate() && width && height) frame = requestAnimationFrame(tick);
      else {
        position.x = position.y = aim.x = aim.y = 0;
        draw(reduced.matches ? 0 : elapsed);
      }
    };

    const resize = () => {
      if (disposed) return;
      // Layout dimensions stay stable while GSAP rotates or scales the outer scene.
      width = Math.max(1, scene.clientWidth);
      height = Math.max(1, scene.clientHeight);
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      surface.width = Math.ceil(width * dpr);
      surface.height = Math.ceil(height * dpr);
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = opticalPoints(pointer.matches && width > 650 ? 500 : 180);
      draw(reduced.matches ? 0 : elapsed);
      initialized = true;
      scene.dataset.heroRendering = context ? 'canvas' : 'static';
      markReady();
      reconcile();
    };

    const move = (event: PointerEvent) => {
      if (!pointer.matches || reduced.matches || !animate()) return;
      const bounds = hero.getBoundingClientRect();
      aim.x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      aim.y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    };
    const reset = () => {
      aim.x = aim.y = 0;
    };
    const focusIn = () => {
      focused = queryFocused();
      reconcile();
    };
    const focusOut = (event: FocusEvent) => {
      focused = Boolean(
        event.relatedTarget instanceof Node &&
          hero.querySelector('.showcase-search')?.contains(event.relatedTarget)
      );
      reconcile();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(scene);
    const intersection = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        reconcile();
      },
      { rootMargin: '80px' }
    );
    intersection.observe(scene);
    prism?.addEventListener('load', markReady);
    hero.addEventListener('pointermove', move, { passive: true });
    hero.addEventListener('pointerleave', reset, { passive: true });
    hero.addEventListener('focusin', focusIn);
    hero.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', reconcile);
    reduced.addEventListener('change', reconcile);
    pointer.addEventListener('change', resize);
    focused = queryFocused();
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      prism?.removeEventListener('load', markReady);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', reset);
      hero.removeEventListener('focusin', focusIn);
      hero.removeEventListener('focusout', focusOut);
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
      pointer.removeEventListener('change', resize);
    };
  }, [artwork]);

  return (
    <div ref={root} className="showcase-paper-scene hero-field" aria-hidden="true">
      <canvas ref={canvas} className="hero-field-canvas" />
      {artwork && (
        <div className="showcase-paper-follow hero-field-prism">
          <img
            ref={image}
            className="showcase-paper"
            src="/showcase/optical-prism.webp"
            width="1254"
            height="1254"
            alt=""
            fetchPriority="high"
            draggable="false"
          />
        </div>
      )}
    </div>
  );
}
