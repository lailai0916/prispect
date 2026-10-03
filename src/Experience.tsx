import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Search, X } from 'lucide-react';
import { useApp } from './context';

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
      <span className="page-loading-label">
        <LoaderCircle size={14} className="spinner" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

export function RecordListLoading({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`record-list-loading${compact ? ' record-list-loading-compact' : ''}`}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {[0, 1, 2].map((key) => (
          <div className="record-loading-row" key={key}>
            {!compact && <span className="skeleton record-loading-icon" />}
            <div className="record-loading-copy">
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OriginalReviewLoading({ label }: { label: string }) {
  return (
    <div className="original-review-loading" role="status" aria-busy="true">
      <div aria-hidden="true">
        <div className="original-loading-heading">
          <div>
            <span className="skeleton skeleton-heading" />
            <span className="skeleton skeleton-subheading" />
          </div>
          <span className="skeleton original-loading-state" />
        </div>
        <div className="original-loading-evidence">
          <span className="skeleton skeleton-heading" />
          <span className="skeleton skeleton-subheading" />
          {[0, 1, 2].map((key) => (
            <div className="skeleton-row" key={key}>
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      </div>
      <span className="page-loading-label">
        <LoaderCircle size={14} className="spinner" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

export function ToastNotice({
  notice,
  onDismiss,
  onRetry,
  retrying,
}: {
  notice: { text: string; error?: boolean };
  onDismiss: () => void;
  onRetry?: () => void;
  retrying?: boolean;
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
      <span className="toast-message" tabIndex={0}>
        {notice.text}
      </span>
      {onRetry && (
        <button className="text-link" disabled={retrying} onClick={onRetry}>
          {retrying ? t('正在读取…', 'Loading…') : t('重新读取', 'Reload')}
        </button>
      )}
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

/** A short opacity transition never moves content or changes fixed-overlay positioning. */
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
      // The cinematic timeline owns its entrance; keep generic route effects off
      // its root so opacity and fixed-stage positioning have one owner.
      if (
        !preference.matches &&
        child &&
        !child.classList.contains('page-loading') &&
        !child.classList.contains('cinematic-home') &&
        !child.classList.contains('showcase-home')
      ) {
        animation = child.animate([{ opacity: 0.85 }, { opacity: 1 }], {
          duration: 120,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
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
