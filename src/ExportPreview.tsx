import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import type { AnalysisTask } from '../shared/contracts';
import type { Locale } from './format';
import { RequestError, requestErrorText } from './api';
import { Dialog } from './components';
import { useApp } from './context';
import './export-preview.css';

export interface ExportSource {
  id: string;
  label: string;
  filename: string;
  mimeType: string;
  preview: 'text' | 'html';
  load: (signal: AbortSignal) => string | Promise<string>;
}

export function exportFilename(title: string, extension: string): string {
  const name = title
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .trim()
    .slice(0, 100);
  return `Prispect-${name || 'review'}.${extension}`;
}

/** Fetch once; the previewed string is also the downloaded file's content. */
export function taskExportSource(
  task: AnalysisTask,
  format: 'html' | 'json',
  locale: Locale
): ExportSource {
  return {
    id: format,
    label: format === 'html' ? (locale === 'en' ? 'Report · HTML' : '核查报告 · HTML') : 'JSON',
    filename: exportFilename(`${task.company}-${task.year}-${task.title}`, format),
    mimeType: format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8',
    preview: format === 'html' ? 'html' : 'text',
    load: async (signal) => {
      const response = await fetch(
        `/api/tasks/${task.id}/export?format=${format}&expectedUpdatedAt=${encodeURIComponent(task.updatedAt)}`,
        { signal, credentials: 'same-origin' }
      );
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        throw new RequestError(
          locale === 'en'
            ? 'The export could not be loaded.'
            : error.error || '暂时无法读取导出内容。',
          error.code || 'REQUEST_FAILED'
        );
      }
      return response.text();
    },
  };
}

type PreviewState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; body: string }
  | { key: string; status: 'error'; message: string; code?: string };

const TEXT_PREVIEW_LIMIT = 80_000;

export function ExportPreview({
  title,
  sources,
  snapshotKey,
  initialSourceId,
  onClose,
}: {
  title: string;
  sources: ExportSource[];
  snapshotKey: string;
  initialSourceId?: string;
  onClose: () => void;
}) {
  const { t, locale, user, refresh } = useApp();
  const [selectedId, setSelectedId] = useState(initialSourceId || sources[0]?.id || '');
  const [attempt, setAttempt] = useState(0);
  const [downloadedKey, setDownloadedKey] = useState('');
  const [state, setState] = useState<PreviewState | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState(
    () => document.documentElement.dataset.theme || 'light'
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setResolvedTheme(document.documentElement.dataset.theme || 'light')
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  const source = sources.find((item) => item.id === selectedId) || sources[0];
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const ownerRef = useRef(user?.id);
  ownerRef.current = user?.id;
  const key = `${user?.id || ''}:${snapshotKey}:${locale}:${source?.id || ''}:${attempt}`;
  useEffect(() => {
    const selected = sourceRef.current;
    const owner = ownerRef.current;
    if (!selected || !owner) return;
    const controller = new AbortController();
    let active = true;
    setState({ key, status: 'loading' });
    Promise.resolve()
      .then(() => selected.load(controller.signal))
      .then((body) => {
        if (active && !controller.signal.aborted && ownerRef.current === owner)
          setState({ key, status: 'ready', body });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted && ownerRef.current === owner)
          setState({
            key,
            status: 'error',
            message: requestErrorText(error, locale),
            ...(error instanceof RequestError ? { code: error.code } : {}),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, locale]);
  const current = state?.key === key ? state : null;
  const body = current?.status === 'ready' ? current.body : null;
  const download = () => {
    if (body === null || !source || !user || ownerRef.current !== user.id) return;
    const url = URL.createObjectURL(new Blob([body], { type: source.mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = source.filename;
    anchor.click();
    setDownloadedKey(key);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!user) return null;
  // The export contains user text. Isolate its HTML and block scripts, forms and external resources.
  const html =
    source?.preview === 'html' && body !== null
      ? body
          .replace(
            /<head>/i,
            `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`
          )
          .replace(
            /<\/head>/i,
            `<style>:root{color-scheme:${resolvedTheme};${resolvedTheme === 'dark' ? '--ink:#ececf0;--muted:#a0a4ae;--line:#34363d;--accent:#91a8ff;--canvas:#15161b;--paper:#1b1d23;--subtle:#24262e' : '--ink:#202124;--muted:#656970;--line:#e4e5e8;--accent:#3567db;--canvas:#f5f6f8;--paper:#fff;--subtle:#f8f9fa'}}</style></head>`
          )
      : null;
  return (
    <Dialog title={title} onClose={onClose} wide className="export-preview-dialog">
      <div className="export-preview-toolbar">
        <div className="export-preview-formats" aria-label={t('导出格式', 'Export format')}>
          {sources.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={source?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button button-primary"
          disabled={body === null}
          onClick={download}
        >
          {downloadedKey === key ? <Check size={15} /> : <Download size={15} />}
          {downloadedKey === key
            ? t('已开始下载 · 再次保存', 'Download started · save again')
            : t('保存文件', 'Save file')}
        </button>
      </div>
      <p className="field-note">
        {t(
          '先查看本次导出内容，再保存到你的设备。文件可能包含个人备注和原文摘录。',
          'Review this export before saving it to your device. The file may include personal notes and source excerpts.'
        )}
      </p>
      {source && (
        <div className="export-preview-file">
          <FileText size={14} aria-hidden="true" />
          <span>{source.filename}</span>
          {body !== null && (
            <span className="mono">
              {(new TextEncoder().encode(body).byteLength / 1024).toLocaleString(locale, {
                maximumFractionDigits: 1,
              })}{' '}
              KB
            </span>
          )}
        </div>
      )}
      {current?.status === 'error' ? (
        <div className="export-preview-state" role="alert">
          <p>{current.message}</p>
          {current.code === 'TASK_EXPORT_CHANGED' ? (
            <button
              className="button button-secondary"
              onClick={() => {
                onClose();
                void refresh();
              }}
            >
              <RefreshCw size={15} />
              {t('更新报告后再导出', 'Refresh the review before exporting')}
            </button>
          ) : (
            <button
              className="button button-secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw size={15} />
              {t('重新读取', 'Retry loading')}
            </button>
          )}
        </div>
      ) : !source ? (
        <div className="export-preview-state" role="status">
          {t('本次没有可导出的内容。', 'No export is available for this review.')}
        </div>
      ) : body === null ? (
        <div className="export-preview-state" role="status">
          <LoaderCircle size={20} className="spinner" aria-hidden="true" />
          <span>{t('正在准备预览…', 'Preparing preview…')}</span>
        </div>
      ) : html !== null ? (
        <iframe
          className="export-preview-html"
          title={t('核查报告文件预览', 'Report file preview')}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      ) : (
        <>
          <pre className="export-preview-text" tabIndex={0}>
            {body.slice(0, TEXT_PREVIEW_LIMIT)}
          </pre>
          {body.length > TEXT_PREVIEW_LIMIT && (
            <p className="field-note">
              {t(
                '预览显示前 80,000 个字符，保存文件包含全部内容。',
                'The preview shows the first 80,000 characters. The saved file contains the full content.'
              )}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
