import { useEffect, useRef, useState } from 'react';
import { ArrowUp, CheckCircle2, CircleAlert, LoaderCircle, Search, X } from 'lucide-react';
import { useApp } from './context';
import { Hint } from './components';

export function ReadingTop({ route }: { route: string }) {
  const { t } = useApp();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 650);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [route]);
  if (!visible) return null;
  return (
    <Hint label={t('返回顶部', 'Back to top')}>
      <button
        className="reading-top icon-button"
        aria-label={t('返回顶部', 'Back to top')}
        onClick={() => {
          window.scrollTo({
            top: 0,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          });
          document.getElementById('main')?.focus({ preventScroll: true });
        }}
      >
        <ArrowUp size={16} />
      </button>
    </Hint>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  const { t } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange('');
    input.current?.focus();
  };
  return (
    <div className="search-field">
      <Search size={15} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            clear();
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={clear}
          aria-label={t('清除搜索', 'Clear search')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <div className="page-loading" role="status" aria-busy="true">
      <span className="page-loading-label">
        <LoaderCircle size={14} className="spinner" />
        {label}
      </span>
      <div className="page-skeleton" aria-hidden="true">
        <span className="skeleton skeleton-heading" />
        <span className="skeleton skeleton-subheading" />
        <div className="skeleton-metrics">
          {[0, 1, 2].map((key) => (
            <div key={key}>
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
        {[0, 1, 2].map((key) => (
          <div className="skeleton-row" key={key}>
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToastNotice({
  notice,
  onDismiss,
}: {
  notice: { text: string; error?: boolean };
  onDismiss: () => void;
}) {
  const { t } = useApp();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const remaining = useRef(7000);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const paused = hovered || focused || hidden;
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    remaining.current = 7000;
  }, [notice]);
  useEffect(() => {
    if (notice.error || paused) return;
    const started = performance.now();
    const timer = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [notice, paused]);
  return (
    <div
      role={notice.error ? 'alert' : 'status'}
      className={`toast ${notice.error ? 'toast-error' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {notice.error ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
      <span>{notice.text}</span>
      <button
        className="icon-button"
        onClick={onDismiss}
        aria-label={t('关闭提示', 'Dismiss message')}
      >
        <X size={16} />
      </button>
      {!notice.error && (
        <span
          key={notice.text}
          aria-hidden="true"
          className="toast-lifetime"
          style={{ animationPlayState: paused ? 'paused' : 'running' }}
        />
      )}
    </div>
  );
}

/** Animate the incoming page, never live financial values or the fixed-overlay container. */
export function usePageEntrance(route: string) {
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let current: Element | null = null;
    let animation: Animation | undefined;
    const enter = () => {
      const child = main.firstElementChild;
      if (child === current) return;
      current = child;
      animation?.cancel();
      if (!preference.matches && child && !child.classList.contains('page-loading')) {
        animation = child.animate(
          [
            { opacity: 0, translate: '0 5px' },
            { opacity: 1, translate: '0 0' },
          ],
          {
            duration: 220,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          }
        );
      }
    };
    const frame = requestAnimationFrame(enter);
    const observer = new MutationObserver(enter);
    observer.observe(main, { childList: true });
    const reduce = () => {
      if (preference.matches) animation?.cancel();
    };
    preference.addEventListener('change', reduce);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener('change', reduce);
      animation?.cancel();
    };
  }, [route]);
}
