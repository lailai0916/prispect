import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AnalysisTask,
  CreateTaskInput,
  Material,
  MetricKey,
  Observation,
  ReviewPurpose,
  UploadPreview,
} from '../../shared/contracts';
import { api, post, requestErrorText } from '../api';
import { date, metricName, yuan } from '../format';
import { translateRule } from '../ruleTranslations';

import { useApp, adjustments } from '../context';
import { PageHeading, EmptyState, Tag } from '../components';
import { purposeName } from '../ReviewContext';
import { useFileDrop, validateFileSelection, type FileSelectionError } from '../useFileDrop';
import type { Translate } from '../context';
import '../review-pages.css';
import '../styles/material-upload.css';

const materialFileOptions = { extensions: ['.json', '.csv', '.pdf'], maxBytes: 25 * 1024 * 1024 };

function fileSelectionMessage(code: FileSelectionError, t: Translate) {
  const messages = {
    multiple: [
      '一次选择一个文件，多个材料请分别导入。',
      'Choose one file at a time. Import separate materials individually.',
    ],
    type: ['请选择 JSON、CSV 或文本型 PDF 文件。', 'Choose a JSON, CSV or text-based PDF file.'],
    size: [
      '文件超过 25 MB，请缩小文件后重新选择。',
      'The file exceeds 25 MB. Reduce its size and choose it again.',
    ],
    empty: ['文件为空，请选择有内容的文件。', 'This file is empty. Choose a file with content.'],
    directory: ['不能导入文件夹，请选择一个文件。', 'Folders cannot be imported. Choose one file.'],
  } as const;
  const [zh, en] = messages[code];
  return t(zh, en);
}

function useMaterialImport() {
  const { t, busy } = useApp();
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [dropError, setDropError] = useState('');
  const drop = useFileDrop({
    ...materialFileOptions,
    disabled: open || busy,
    onFile: (file) => {
      if (hasDraft) {
        setDropError(
          t(
            '还有未保存的预览，已保留编辑稿。请先确认或放弃它，再换文件。',
            'An unsaved preview is retained. Confirm or discard it before replacing the file.'
          )
        );
        setOpen(true);
        return;
      }
      setDropError('');
      setInitialFile(file);
      setOpen(true);
    },
    onError: (code) => setDropError(fileSelectionMessage(code, t)),
  });
  return {
    open,
    setOpen,
    initialFile,
    setInitialFile,
    hasDraft,
    setHasDraft,
    dropError,
    setDropError,
    ...drop,
  };
}

export function ImportDialog({
  open,
  onClose,
  initialFile,
  onInitialFileConsumed,
  onDraftChange,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialFile: File | null;
  onInitialFileConsumed: () => void;
  onDraftChange: (hasDraft: boolean) => void;
  onSaved: (material: Material) => void;
}) {
  const { t } = useApp();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const updateSaving = useCallback((next: boolean) => {
    savingRef.current = next;
    setSaving(next);
  }, []);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    wasOpen.current = open;
  }, [open]);
  return (
    <DialogPrimitive.Root
      open={open}
      disablePointerDismissal={saving}
      onOpenChange={(next, details) => {
        if (!next && savingRef.current) {
          details.cancel();
          return;
        }
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal keepMounted>
        <DialogPrimitive.Backdrop className="dialog-backdrop material-import-backdrop" />
        <DialogPrimitive.Popup
          className="dialog dialog-wide material-import-dialog"
          finalFocus={returnFocus}
        >
          <div className="dialog-header">
            <DialogPrimitive.Title>
              {t('导入并确认材料', 'Import and confirm material')}
            </DialogPrimitive.Title>
            {saving && (
              <span className="field-note" role="status">
                {t('正在保存，请稍候…', 'Saving. Please wait…')}
              </span>
            )}
            <DialogPrimitive.Close
              className="icon-button"
              disabled={saving}
              aria-label={t('关闭对话框', 'Close dialog')}
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="dialog-body">
            <MaterialImporter
              active={open}
              initialFile={initialFile}
              onInitialFileConsumed={onInitialFileConsumed}
              onDraftChange={onDraftChange}
              onSavingChange={updateSaving}
              onSaved={onSaved}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function NewReview({ query }: { query: URLSearchParams }) {
  const { t, workspace, navigate, execute, busy } = useApp();
  const suppliedMaterial = workspace!.materials.find((item) => item.id === query.get('material'));
  const suppliedYear = Number(query.get('year'));
  const materialYear = suppliedMaterial?.observations.length
    ? Math.max(...suppliedMaterial.observations.map((item) => item.year))
    : null;
  const [selectedIds, setSelectedIds] = useState<string[]>(
    suppliedMaterial ? [suppliedMaterial.id] : []
  );
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState(suppliedMaterial?.company || '');
  const [year, setYear] = useState<number | null>(
    Number.isInteger(suppliedYear) && suppliedYear >= 2000 && suppliedYear <= 2100
      ? suppliedYear
      : materialYear
  );
  const materialImport = useMaterialImport();
  const [useModel, setUseModel] = useState(false);
  const [purpose, setPurpose] = useState<ReviewPurpose>(
    query.get('purpose') === 'handover' ? 'handover' : 'external'
  );
  const toggleMaterial = (material: Material) => {
    setSelectedIds((previous) =>
      previous.includes(material.id)
        ? previous.filter((id) => id !== material.id)
        : [...previous, material.id]
    );
    if (!company) setCompany(material.company);
    if (year == null && material.observations.length)
      setYear(Math.max(...material.observations.map((item) => item.year)));
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (year == null) return;
    const task = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: title.trim() || `${company.trim()} · ${year}`,
        company: company.trim(),
        year,
        materialIds: selectedIds,
        purpose,
        useModel,
      } satisfies CreateTaskInput)
    );
    if (task) navigate(`/tasks/${task.id}`);
  };
  return (
    <div
      className={`financial-create-page material-drop-page ${materialImport.isDragging ? 'is-file-dragging' : ''}`}
      {...materialImport.dropProps}
    >
      {materialImport.isDragging && (
        <div className="material-page-drop-feedback" role="status">
          <Upload size={24} />
          <strong>{t('松开以预览材料', 'Drop to preview the material')}</strong>
          <span>JSON / CSV / PDF · 25 MB</span>
        </div>
      )}
      {materialImport.dropError && (
        <p className="inline-error" role="alert">
          {materialImport.dropError}
        </p>
      )}
      <PageHeading
        title={t('新建财报核查', 'New financial review')}
        description={t(
          '先选材料，再确认主体与年度。',
          'Choose evidence, then confirm the company and financial year.'
        )}
      />
      <div className="financial-create-layout">
        <section className="financial-source-step">
          <div className="form-section-heading">
            <span className="section-number">1</span>
            <h2>{t('选择材料', 'Choose evidence')}</h2>
            <span className="field-note">
              {selectedIds.length} {t('份已选', 'selected')}
            </span>
          </div>
          <div className="financial-source-actions">
            <button
              className="button button-secondary"
              onClick={() => materialImport.setOpen(true)}
            >
              <Upload size={16} />
              {t('上传材料', 'Upload evidence')}
            </button>
            <button className="text-link" onClick={() => navigate(`/company?purpose=${purpose}`)}>
              {t('查找公开年报', 'Find public annual reports')}
              <ArrowUpRight size={14} />
            </button>
          </div>
          {workspace!.materials.length ? (
            <div className="material-picker">
              {workspace!.materials.map((material) => (
                <label
                  className={`material-check ${selectedIds.includes(material.id) ? 'selected' : ''}`}
                  key={material.id}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(material.id)}
                    onChange={() => toggleMaterial(material)}
                  />
                  <FileText size={18} />
                  <span>
                    <strong>{material.title}</strong>
                    <small>
                      {material.company} · {material.documentDate} · {material.observations.length}{' '}
                      {t('条指标', 'values')}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="financial-no-source">
              <FileText size={24} />
              <h3>{t('还没有材料', 'No evidence yet')}</h3>
              <p>
                {t(
                  '上传文本型 PDF、JSON 或 CSV，预览后确认金额与口径。',
                  'Upload a text PDF, JSON or CSV, then confirm values and statement scope.'
                )}
              </p>
            </div>
          )}
        </section>
        <form onSubmit={create} className="financial-create-form">
          <div className="form-section-heading">
            <span className="section-number">2</span>
            <h2>{t('确认核查范围', 'Confirm review scope')}</h2>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>{t('公司完整名称', 'Full company name')}</span>
              <input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                maxLength={200}
                required
                placeholder={t('与材料主体一致', 'Match the entity in the evidence')}
              />
            </label>
            <label className="form-field">
              <span>{t('财务年度', 'Financial year')}</span>
              <input
                type="number"
                min="2000"
                max="2100"
                value={year ?? ''}
                onChange={(event) =>
                  setYear(event.target.value ? Number(event.target.value) : null)
                }
                required
                placeholder={t('年报所属年度', 'Year covered by the report')}
              />
            </label>
          </div>
          <p className="field-note">
            {t(
              '使用同主体、同年度的合并净利润与经营现金净额。',
              'Use consolidated profit and operating cash flow for the same entity and year.'
            )}
          </p>
          <details className="financial-create-options">
            <summary>{t('名称与核查用途', 'Name and review purpose')}</summary>
            <label className="form-field">
              <span>{t('核查名称（可选）', 'Review name (optional)')}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                placeholder={t('按公司与年度命名', 'Named from the company and year')}
              />
            </label>
            <fieldset className="new-purpose">
              <legend>{t('核查用途', 'Review purpose')}</legend>
              <div className="purpose-options">
                {(['external', 'handover'] as const).map((value) => (
                  <label
                    key={value}
                    className={purpose === value ? 'purpose-option selected' : 'purpose-option'}
                  >
                    <input
                      type="radio"
                      name="purpose"
                      value={value}
                      checked={purpose === value}
                      onChange={() => setPurpose(value)}
                    />
                    <strong>{purposeName(value, t)}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          <label className="model-opt-in">
            <input
              type="checkbox"
              checked={useModel}
              disabled={!workspace!.provider.configured}
              onChange={(event) => setUseModel(event.target.checked)}
            />
            <span>
              <strong>{t('使用 AI 解读', 'Add AI interpretation')}</strong>
              <small>
                {workspace!.provider.configured
                  ? t(
                      '分析本次采用的财务数据与原文摘录。',
                      'Interpret the adopted financial data and source excerpts.'
                    )
                  : t(
                      'AI 解读暂不可用，仍可核对财务数据。',
                      'AI interpretation is unavailable. Financial checks remain available.'
                    )}{' '}
                <a
                  href="#/privacy?section=ai"
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('数据使用（在新标签页打开）', 'Data use (opens in a new tab)')}
                >
                  {t('数据使用', 'Data use')}
                </a>
              </small>
            </span>
          </label>
          <div className="form-submit">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || selectedIds.length === 0}
            >
              {busy ? <LoaderCircle size={16} className="spinner" /> : <ArrowRight size={16} />}
              {t('开始核查', 'Run review')}
            </button>
            {!selectedIds.length && (
              <span className="field-note">
                {t('先选择或上传材料', 'Choose or upload evidence first')}
              </span>
            )}
          </div>
        </form>
      </div>
      <ImportDialog
        open={materialImport.open}
        onClose={() => materialImport.setOpen(false)}
        initialFile={materialImport.initialFile}
        onInitialFileConsumed={() => materialImport.setInitialFile(null)}
        onDraftChange={materialImport.setHasDraft}
        onSaved={(material) => {
          setSelectedIds((previous) =>
            previous.includes(material.id) ? previous : [...previous, material.id]
          );
          setCompany(material.company);
          if (material.observations.length)
            setYear(Math.max(...material.observations.map((item) => item.year)));
          materialImport.setDropError('');
          materialImport.setOpen(false);
        }}
      />
    </div>
  );
}

export function MaterialsPage() {
  const { t, locale, workspace, execute, confirm, showEvidence } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const materialImport = useMaterialImport();
  const materials = workspace!.materials.filter(
    (material) =>
      (filter === 'all' || material.origin === filter) &&
      `${material.title} ${material.company}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div
      className={`material-drop-page ${materialImport.isDragging ? 'is-file-dragging' : ''}`}
      {...materialImport.dropProps}
    >
      {materialImport.isDragging && (
        <div className="material-page-drop-feedback" role="status">
          <Upload size={24} />
          <strong>{t('松开以预览材料', 'Drop to preview the material')}</strong>
          <span>JSON / CSV / PDF · 25 MB</span>
        </div>
      )}
      {materialImport.dropError && (
        <p className="inline-error" role="alert">
          {materialImport.dropError}
        </p>
      )}
      <PageHeading
        title={t('材料', 'Evidence')}
        description={t(
          '查看来源、原文件与已确认的指标。',
          'Inspect sources, original files and confirmed metrics.'
        )}
        action={
          <button className="button button-primary" onClick={() => materialImport.setOpen(true)}>
            <Upload size={17} />
            {t('导入材料', 'Import material')}
          </button>
        }
      />
      <div className="list-toolbar">
        <div className="segmented-control">
          {[
            ['all', t('全部材料', 'All')],
            ['public-report', t('公开年报', 'Public reports')],
            ['user-upload', t('用户导入', 'Imports')],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'selected' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label={t('搜索材料', 'Search materials')}
            value={search}
            placeholder={t('搜索材料或公司', 'Search material or company')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {!materials.length ? (
        <EmptyState
          title={t('没有找到材料', 'No materials found')}
          text={t('导入一份材料，或调整筛选条件。', 'Import a material or adjust your filter.')}
          action={
            <button className="button button-primary" onClick={() => materialImport.setOpen(true)}>
              {t('导入材料', 'Import material')}
            </button>
          }
        />
      ) : (
        <div className="materials-list">
          {materials.map((material) => {
            const used = workspace!.tasks.some((task) => task.materialIds.includes(material.id));
            return (
              <article className="material-row" key={material.id}>
                <div className="material-row-icon">
                  <FileText size={25} />
                  <span>{material.filename.split('.').at(-1)?.toUpperCase() || 'DATA'}</span>
                </div>
                <div className="material-row-content">
                  <div className="material-row-title">
                    <h2>{material.title}</h2>
                    <Tag tone={material.origin === 'public-report' ? 'green' : 'neutral'}>
                      {material.origin === 'public-report'
                        ? t('公开披露', 'Public disclosure')
                        : t('用户导入', 'User import')}
                    </Tag>
                    {!material.observations.length && <Tag>{t('文本材料', 'Text material')}</Tag>}
                  </div>
                  <p>
                    {material.company} · {t('披露/材料日期', 'Document date')}{' '}
                    {material.documentDate}
                  </p>
                  <div className="material-facts">
                    <span>
                      {material.observations.length} {t('条观测', 'observations')}
                    </span>
                    <span>
                      {Array.from(new Set(material.observations.map((obs) => obs.year))).join(
                        ' / '
                      )}
                    </span>
                    <span>
                      SHA256 <code title={material.sha256}>{material.sha256.slice(0, 12)}…</code>
                    </span>
                    <span>
                      {t('保存于', 'Saved')} {date(material.createdAt, locale)}
                    </span>
                  </div>
                  {material.notes.length > 0 && (
                    <p className="material-note">{material.notes[0]}</p>
                  )}
                </div>
                <div className="material-row-actions">
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      showEvidence(
                        material.observations.length
                          ? material.observations.slice(0, 6).map((obs) => ({
                              materialId: material.id,
                              page: obs.page,
                              quote: obs.quote,
                              sourceUrl: material.sourceUrl,
                            }))
                          : material.excerpts.slice(0, 6).map((excerpt) => ({
                              materialId: material.id,
                              page: excerpt.page,
                              quote: excerpt.text,
                              sourceUrl: material.sourceUrl,
                            }))
                      )
                    }
                  >
                    <Eye size={16} />
                    {t('查看原文', 'View evidence')}
                  </button>
                  {material.uploadId && (
                    <a
                      className="icon-button"
                      href={`/api/materials/${material.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      title={t('原始上传文件', 'Original uploaded file')}
                    >
                      <Download size={17} />
                    </a>
                  )}
                  {material.sourceUrl && (
                    <a
                      className="icon-button"
                      href={material.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={t('公开原件', 'Public source')}
                    >
                      <ExternalLink size={17} />
                    </a>
                  )}
                  <button
                    className="icon-button"
                    disabled={used}
                    title={
                      used
                        ? t(
                            '材料已被任务引用，请先删除相关任务',
                            'Used by a review; delete dependent reviews first'
                          )
                        : t('删除材料', 'Delete material')
                    }
                    onClick={() =>
                      confirm({
                        title: t('删除这份材料？', 'Delete this material?'),
                        text: t(
                          '此材料没有被任务引用，删除后将从工作区移除。原始公开文件不受影响。',
                          'This material is not used by any review. It will be removed from the workspace. Public source files are unaffected.'
                        ),
                        action: async () => {
                          await api(`/materials/${material.id}`, { method: 'DELETE' });
                        },
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="info-strip">
        <ShieldCheck size={18} />
        <p>
          {t(
            '哈希用于核对文件内容；原件与确认后的指标分别保留。扫描件或不明确的表格需人工核对。',
            'Hashes identify file content. Source files and confirmed values remain separate. Scans and unclear tables need manual review.'
          )}
        </p>
      </div>
      <ImportDialog
        open={materialImport.open}
        onClose={() => materialImport.setOpen(false)}
        initialFile={materialImport.initialFile}
        onInitialFileConsumed={() => materialImport.setInitialFile(null)}
        onDraftChange={materialImport.setHasDraft}
        onSaved={() => {
          materialImport.setDropError('');
          materialImport.setOpen(false);
        }}
      />
    </div>
  );
}

export function MaterialImporter({
  onSaved,
  active = true,
  initialFile = null,
  onInitialFileConsumed,
  onDraftChange,
  onSavingChange,
}: {
  onSaved: (material: Material) => void;
  active?: boolean;
  initialFile?: File | null;
  onInitialFileConsumed?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { t, locale, refresh, busy } = useApp();
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const activeRef = useRef(active);
  const previewRef = useRef(preview);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const lastFile = useRef<File | null>(null);
  const consumedFile = useRef<File | null>(null);
  const acceptedMaterial = useRef<Material | null>(null);
  activeRef.current = active;
  previewRef.current = preview;
  const [uploadCompany, setUploadCompany] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadDate, setUploadDate] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
      controller.current = null;
      operation.current = false;
    };
  }, []);
  useEffect(() => {
    onDraftChange?.(Boolean(preview));
  }, [preview, onDraftChange]);
  const cancelOperation = useCallback(() => {
    if (!operation.current) return;
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    operation.current = false;
    if (!mounted.current) return;
    setUploading(false);
    setSaving(false);
  }, []);
  useEffect(() => {
    if (!active) cancelOperation();
  }, [active, cancelOperation]);

  const upload = useCallback(
    async (file: File) => {
      if (!activeRef.current || operation.current || busy) return;
      if (previewRef.current) {
        setError(
          t(
            '当前预览尚未保存，已保留编辑稿。请先确认或放弃它，再换文件。',
            'Your unsaved preview is retained. Confirm or discard it before choosing another file.'
          )
        );
        return;
      }
      const valid = validateFileSelection([file], materialFileOptions);
      if (typeof valid === 'string') {
        setError(fileSelectionMessage(valid, t));
        return;
      }
      operation.current = true;
      const requestGeneration = ++generation.current;
      const requestController = new AbortController();
      controller.current = requestController;
      lastFile.current = file;
      setUploading(true);
      setError('');
      try {
        const form = new FormData();
        form.append('file', file);
        if (uploadCompany) form.append('company', uploadCompany);
        if (uploadName) form.append('shortName', uploadName);
        if (uploadDate) form.append('documentDate', uploadDate);
        const nextPreview = await api<UploadPreview>('/materials/preview', {
          method: 'POST',
          body: form,
          signal: requestController.signal,
        });
        if (
          !mounted.current ||
          !activeRef.current ||
          requestController.signal.aborted ||
          requestGeneration !== generation.current
        )
          return;
        previewRef.current = nextPreview;
        setPreview(nextPreview);
      } catch (failure) {
        if (
          mounted.current &&
          activeRef.current &&
          !requestController.signal.aborted &&
          requestGeneration === generation.current
        )
          setError(requestErrorText(failure, locale));
      } finally {
        if (requestGeneration === generation.current) {
          operation.current = false;
          controller.current = null;
          if (mounted.current && activeRef.current) setUploading(false);
        }
      }
    },
    [busy, locale, t, uploadCompany, uploadDate, uploadName]
  );
  useEffect(() => {
    if (!active || !initialFile || consumedFile.current === initialFile) return;
    consumedFile.current = initialFile;
    onInitialFileConsumed?.();
    void upload(initialFile);
  }, [active, initialFile, onInitialFileConsumed, upload]);
  const selectFiles = (files: FileList | File[]) => {
    if (!activeRef.current || operation.current || busy) return;
    const result = validateFileSelection(files, materialFileOptions);
    if (typeof result === 'string') setError(fileSelectionMessage(result, t));
    else void upload(result);
  };
  const drop = useFileDrop({
    ...materialFileOptions,
    disabled: !active || uploading || saving || busy,
    onFile: (file) => {
      void upload(file);
    },
    onError: (code) => setError(fileSelectionMessage(code, t)),
  });
  const setField = <K extends keyof UploadPreview['material']>(
    key: K,
    value: UploadPreview['material'][K]
  ) =>
    setPreview((previous) =>
      previous ? { ...previous, material: { ...previous.material, [key]: value } } : previous
    );
  const updateObservation = (index: number, update: Partial<Observation>) =>
    setPreview((previous) =>
      previous
        ? {
            ...previous,
            material: {
              ...previous.material,
              observations: previous.material.observations.map((obs, i) =>
                i === index ? { ...obs, ...update } : obs
              ),
            },
          }
        : previous
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview || !activeRef.current || operation.current || busy) return;
    operation.current = true;
    const requestGeneration = ++generation.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setSaving(true);
    onSavingChange?.(true);
    setError('');
    try {
      const saved =
        acceptedMaterial.current ||
        (await api<Material>('/materials', {
          method: 'POST',
          signal: requestController.signal,
          body: JSON.stringify({
            ...preview.material,
            sourceUrl: preview.material.sourceUrl?.trim() || undefined,
            origin: 'user-upload',
          }),
        }));
      if (
        !mounted.current ||
        !activeRef.current ||
        requestController.signal.aborted ||
        requestGeneration !== generation.current
      )
        return;
      acceptedMaterial.current = saved;
      await refresh();
      if (
        !mounted.current ||
        !activeRef.current ||
        requestController.signal.aborted ||
        requestGeneration !== generation.current
      )
        return;
      previewRef.current = null;
      setPreview(null);
      lastFile.current = null;
      acceptedMaterial.current = null;
      setDiscardPrompt(false);
      onSaved(saved);
    } catch (failure) {
      if (
        mounted.current &&
        activeRef.current &&
        !requestController.signal.aborted &&
        requestGeneration === generation.current
      )
        setError(
          acceptedMaterial.current
            ? t(
                '材料已保存，但列表未更新。请重试更新列表，无需重复保存。',
                'The material was saved, but the list did not refresh. Retry the refresh without saving again.'
              )
            : requestErrorText(failure, locale)
        );
    } finally {
      if (requestGeneration === generation.current) {
        controller.current = null;
        operation.current = false;
        if (mounted.current && activeRef.current) {
          setSaving(false);
          onSavingChange?.(false);
        }
      }
    }
  };
  return (
    <div
      className={`importer material-importer ${drop.isDragging ? 'is-file-dragging' : ''}`}
      {...drop.dropProps}
      aria-busy={uploading || saving}
    >
      {!preview ? (
        <>
          <input
            type="file"
            accept=".json,.csv,.pdf"
            ref={fileInput}
            className="sr-only"
            aria-label={t('选择材料文件', 'Choose a material file')}
            tabIndex={-1}
            disabled={uploading || saving || busy}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files || []);
              event.currentTarget.value = '';
              if (files.length) selectFiles(files);
            }}
          />
          <details className="upload-metadata">
            <summary>
              {t(
                '为 PDF 指定主体与日期（无法识别时需要）',
                'Specify PDF company and date (needed if unrecognized)'
              )}
            </summary>
            <div className="form-grid">
              <label className="form-field">
                <span>{t('公司完整名称', 'Full company name')}</span>
                <input
                  value={uploadCompany}
                  disabled={uploading}
                  onChange={(event) => setUploadCompany(event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('简称', 'Short name')}</span>
                <input
                  value={uploadName}
                  disabled={uploading}
                  onChange={(event) => setUploadName(event.target.value)}
                />
              </label>
              <label className="form-field field-wide">
                <span>{t('材料日期', 'Document date')}</span>
                <input
                  type="date"
                  value={uploadDate}
                  disabled={uploading}
                  onChange={(event) => setUploadDate(event.target.value)}
                />
              </label>
            </div>
          </details>
          <button
            type="button"
            className={`upload-zone ${drop.isDragging ? 'is-file-dragging' : ''}`}
            disabled={uploading || saving || busy}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <LoaderCircle className="spinner" size={32} /> : <Upload size={32} />}
            <strong>
              {uploading
                ? t('正在读取文件…', 'Reading file…')
                : drop.isDragging
                  ? t('松开以预览材料', 'Drop to preview the material')
                  : t('选择文件，或拖放到这里', 'Choose a file or drop it here')}
            </strong>
            <span>
              JSON / CSV / {t('文本型 PDF', 'text-based PDF')} · 25 MB · {t('单文件', 'One file')}
            </span>
          </button>
          {uploading && (
            <div className="material-upload-progress" role="status">
              <span>{lastFile.current?.name}</span>
              <button type="button" className="text-link" onClick={cancelOperation}>
                {t('取消读取', 'Cancel reading')}
              </button>
            </div>
          )}
          {!uploading && !error && lastFile.current && (
            <div className="material-upload-progress">
              <span>
                {t('读取已暂停，尚未生成预览。', 'Reading paused. No preview has been generated.')}
              </span>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  if (lastFile.current) void upload(lastFile.current);
                }}
              >
                {t('重试读取', 'Retry reading')}
              </button>
            </div>
          )}
          <p className="field-note">
            {t(
              '导入仅生成预览；点击「确认并保存」后才写入工作区。PDF 不确定的字段需手动确认，不支持扫描件 OCR。单文件最多 25MB，账号总上传额度 250MB；未确认的预览原件 24 小时后过期。',
              'Importing creates a preview only. Nothing is saved until you confirm. Ambiguous PDF fields need manual confirmation; scanned-PDF OCR is unsupported. Files are limited to 25 MB each and 250 MB per account. Unconfirmed preview uploads expire after 24 hours.'
            )}
          </p>
          <details className="input-format">
            <summary>{t('查看 JSON / CSV 输入规范', 'View JSON / CSV input format')}</summary>
            <div className="inline-actions">
              <a className="text-link" href="/api/public/input-template?format=json" download>
                {t('JSON 格式示例', 'JSON format example')}
                <Download size={14} />
              </a>
              <a className="text-link" href="/api/public/input-template?format=csv" download>
                {t('CSV 格式示例', 'CSV format example')}
                <Download size={14} />
              </a>
            </div>
            <p>{t('CSV 表头：', 'CSV columns:')}</p>
            <code>
              company,shortName,year,period,key,value,unit,currency,scope,page,quote,documentDate,sourceUrl
            </code>
            <p>
              {t(
                'key：netProfit / operatingCashFlow / inventoryAdjustment / receivablesAdjustment / payablesAdjustment / otherAdjustments。unit：yuan / wan / yi。scope：consolidated / parent / unknown。value 使用十进制字符串。JSON 使用同名字段及 observations 数组。',
                'key: netProfit / operatingCashFlow / inventoryAdjustment / receivablesAdjustment / payablesAdjustment / otherAdjustments. unit: yuan / wan / yi. scope: consolidated / parent / unknown. Values are decimal strings. JSON uses the same fields and an observations array.'
              )}
            </p>
          </details>
        </>
      ) : (
        <form onSubmit={save}>
          <div className="material-preview-status" role="status">
            <FileText size={16} />
            <span>{preview.material.filename}</span>
            <Tag>{t('预览 · 未保存', 'Preview · not saved')}</Tag>
            <span className="field-note">
              {t('关闭可稍后继续编辑', 'Close and resume editing later')}
            </span>
          </div>
          {drop.isDragging && (
            <p className="material-draft-drop-note" role="status">
              {t(
                '当前预览已保留。先确认或放弃它，再换文件。',
                'The current preview is retained. Confirm or discard it before replacing the file.'
              )}
            </p>
          )}
          <fieldset
            className="material-preview-fields"
            disabled={saving || busy || Boolean(acceptedMaterial.current)}
          >
            {preview.warnings.length > 0 && (
              <div className="warning-box">
                <CircleAlert size={19} />
                <div>
                  <strong>{t('确认以下导入提示', 'Review these import warnings')}</strong>
                  {preview.warnings.map((warning, i) => (
                    <p key={i}>{t(warning, translateRule(warning))}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="form-grid">
              <label className="form-field field-wide">
                <span>{t('材料标题', 'Material title')}</span>
                <input
                  required
                  value={preview.material.title}
                  onChange={(event) => setField('title', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('公司完整名称', 'Full company name')}</span>
                <input
                  required
                  value={preview.material.company}
                  onChange={(event) => setField('company', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('公司简称', 'Short company name')}</span>
                <input
                  required
                  value={preview.material.shortName}
                  onChange={(event) => setField('shortName', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('材料日期', 'Document date')}</span>
                <input
                  required
                  type="date"
                  value={preview.material.documentDate}
                  onChange={(event) => setField('documentDate', event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('公开来源 URL（可选）', 'Public source URL (optional)')}</span>
                <input
                  type="url"
                  value={preview.material.sourceUrl || ''}
                  onChange={(event) => setField('sourceUrl', event.target.value)}
                />
              </label>
            </div>
            {preview.material.observations.length > 0 && (
              <div className="import-filter-action">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    const retained = preview.material.observations.filter(
                      (obs) => obs.scope === 'consolidated' && obs.period === 'annual'
                    );
                    const removed = preview.material.observations.length - retained.length;
                    setPreview({
                      ...preview,
                      material: {
                        ...preview.material,
                        observations: retained,
                        notes: [
                          ...preview.material.notes,
                          t(
                            `用户主动仅保留合并年度观测，移除 ${removed} 条其他范围或期间观测。`,
                            `User explicitly retained consolidated annual observations and removed ${removed} other-scope/period observations.`
                          ),
                        ],
                      },
                      warnings: [
                        ...preview.warnings,
                        t(
                          `已显式过滤 ${removed} 条观测，保留 ${retained.length} 条合并年度观测。`,
                          `Explicitly removed ${removed} observations; kept ${retained.length} consolidated annual observations.`
                        ),
                      ],
                    });
                  }}
                >
                  <ShieldCheck size={16} />
                  {t(
                    '仅保留已确认合并年度观测',
                    'Keep only confirmed consolidated annual observations'
                  )}
                </button>
                <p>
                  {t(
                    '这会显式移除母公司、未知范围或非年度观测，不是后台自动选择。请先核对原文，再确认保留。',
                    'This explicitly removes parent, unconfirmed-scope, and non-annual observations. It is not a silent background selection. Verify the source before choosing.'
                  )}
                </p>
              </div>
            )}
            <h3 className="import-observation-title">
              {t('逐项确认结构化观测', 'Confirm each structured observation')}{' '}
              <Tag>{preview.material.observations.length}</Tag>
            </h3>
            {!preview.material.observations.length && (
              <p className="field-note">
                {t(
                  '文本材料：保存提供的原文，不生成财务观测。用于决定依据时仍需核对主体、日期和字段；财务核查缺少指标会停止计算。',
                  'Text material: saves supplied text without creating financial observations. Decision evidence still requires entity, date and field checks; financial calculations stop when metrics are missing.'
                )}
              </p>
            )}
            {preview.material.excerpts.length > 0 && (
              <details className="import-text-preview">
                <summary>
                  {t('查看保存的材料文本', 'Review material text to be saved')} ·{' '}
                  {preview.material.excerpts.length}
                </summary>
                {preview.material.excerpts.slice(0, 8).map((excerpt, index) => (
                  <div key={`${excerpt.page}-${index}`}>
                    <strong>
                      {t('页', 'Page')} {excerpt.page}
                    </strong>
                    <pre>{excerpt.text}</pre>
                  </div>
                ))}
                {preview.material.excerpts.length > 8 && (
                  <p className="field-note">
                    {t(
                      '此处显示前8段；其余文本与上传文件随材料保留。',
                      'The first eight excerpts are shown here. Remaining text and the upload are retained with the material.'
                    )}
                  </p>
                )}
              </details>
            )}
            {preview.material.observations.map((obs, index) => (
              <fieldset className="observation-editor" key={index}>
                <legend>
                  {index + 1}. {metricName(obs.key, locale)}
                </legend>
                <div className="observation-grid">
                  <label className="form-field">
                    <span>{t('指标', 'Metric')}</span>
                    <select
                      value={obs.key}
                      onChange={(event) =>
                        updateObservation(index, { key: event.target.value as MetricKey })
                      }
                    >
                      {(['netProfit', 'operatingCashFlow', ...adjustments] as MetricKey[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {metricName(key, locale)}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('年度', 'Year')}</span>
                    <input
                      required
                      type="number"
                      min="2000"
                      max="2100"
                      value={obs.year}
                      onChange={(event) =>
                        updateObservation(index, { year: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('金额（十进制）', 'Amount (decimal)')}</span>
                    <input
                      required
                      inputMode="decimal"
                      pattern="-?[0-9]+([.][0-9]{1,10})?"
                      value={obs.value}
                      onChange={(event) => updateObservation(index, { value: event.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('单位', 'Unit')}</span>
                    <select
                      value={obs.unit}
                      onChange={(event) =>
                        updateObservation(index, {
                          unit: event.target.value as Observation['unit'],
                        })
                      }
                    >
                      <option value="yuan">{t('元', 'Yuan')}</option>
                      <option value="wan">{t('万元', '10,000 yuan')}</option>
                      <option value="yi">{t('亿元', '100m yuan')}</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('会计期间', 'Reporting period')}</span>
                    <select
                      value={obs.period || 'unknown'}
                      onChange={(event) =>
                        updateObservation(index, {
                          period: event.target.value as Observation['period'],
                        })
                      }
                    >
                      <option value="annual">{t('完整年度', 'Full financial year')}</option>
                      <option value="interim">{t('半年度', 'Interim')}</option>
                      <option value="quarterly">{t('季度', 'Quarterly')}</option>
                      <option value="unknown">{t('待确认', 'Unconfirmed')}</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('币种', 'Currency')}</span>
                    <input
                      value={obs.currency}
                      required
                      maxLength={5}
                      onChange={(event) =>
                        updateObservation(index, { currency: event.target.value })
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('报表范围', 'Statement scope')}</span>
                    <select
                      value={obs.scope}
                      onChange={(event) =>
                        updateObservation(index, {
                          scope: event.target.value as Observation['scope'],
                        })
                      }
                    >
                      <option value="consolidated">{t('合并', 'Consolidated')}</option>
                      <option value="parent">{t('母公司', 'Parent company')}</option>
                      <option value="unknown">{t('未知，待确认', 'Unknown / unconfirmed')}</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('PDF 页码', 'PDF page')}</span>
                    <input
                      type="number"
                      min="1"
                      value={obs.page ?? ''}
                      onChange={(event) =>
                        updateObservation(index, {
                          page: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('观测性质', 'Observation type')}</span>
                    <select
                      value={obs.kind}
                      onChange={(event) =>
                        updateObservation(index, {
                          kind: event.target.value as Observation['kind'],
                        })
                      }
                    >
                      <option value="reported">{t('原文披露', 'Reported')}</option>
                      <option value="derived">{t('派生计算', 'Derived')}</option>
                    </select>
                  </label>
                  <label className="form-field field-wide">
                    <span>{t('原文短摘录', 'Short source excerpt')}</span>
                    <textarea
                      rows={2}
                      required
                      value={obs.quote}
                      onChange={(event) => updateObservation(index, { quote: event.target.value })}
                    />
                  </label>
                </div>
                <button
                  className="text-link text-danger"
                  type="button"
                  onClick={() =>
                    setField(
                      'observations',
                      preview.material.observations.filter((_, i) => i !== index)
                    )
                  }
                >
                  <Trash2 size={14} />
                  {t('移除此观测', 'Remove observation')}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setField('observations', [
                  ...preview.material.observations,
                  {
                    id: crypto.randomUUID(),
                    key: 'netProfit',
                    year: 2025,
                    period: 'unknown',
                    value: '',
                    unit: 'yuan',
                    currency: 'CNY',
                    scope: 'unknown',
                    page: null,
                    quote: '',
                    kind: 'reported',
                  },
                ])
              }
            >
              <Plus size={16} />
              {t(
                '手动补入一项观测（须核对原文）',
                'Add an observation manually (verify against source)'
              )}
            </button>
          </fieldset>
          {discardPrompt && (
            <div className="material-discard-confirm" role="alert">
              <p>
                {t(
                  '放弃当前预览？未保存的编辑将被移除。',
                  'Discard this preview? Unsaved edits will be removed.'
                )}
              </p>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDiscardPrompt(false)}
                >
                  {t('继续编辑', 'Keep editing')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    previewRef.current = null;
                    setPreview(null);
                    setError('');
                    setDiscardPrompt(false);
                    lastFile.current = null;
                    acceptedMaterial.current = null;
                  }}
                >
                  {t('放弃预览', 'Discard preview')}
                </button>
              </div>
            </div>
          )}
          <div className="import-bottom">
            <button
              type="button"
              className="button button-secondary"
              disabled={saving || busy || Boolean(acceptedMaterial.current)}
              onClick={() => setDiscardPrompt(true)}
            >
              {t('重新选择文件', 'Choose another file')}
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={
                busy ||
                saving ||
                (!preview.material.observations.length &&
                  !preview.material.excerpts.some((excerpt) => excerpt.text.trim()))
              }
            >
              {busy || saving ? (
                <LoaderCircle className="spinner" size={17} />
              ) : (
                <Check size={17} />
              )}{' '}
              {saving
                ? t('正在保存…', 'Saving…')
                : acceptedMaterial.current
                  ? t('更新材料列表', 'Refresh material list')
                  : t('确认并保存材料', 'Confirm and save')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          {!preview && lastFile.current && (
            <button
              type="button"
              disabled={uploading || saving || busy}
              className="text-link"
              onClick={() => {
                if (lastFile.current) void upload(lastFile.current);
              }}
            >
              {t('重试读取', 'Retry reading')}
            </button>
          )}
          {!preview && (
            <button
              type="button"
              className="text-link"
              disabled={uploading || saving || busy}
              onClick={() => {
                setError('');
                fileInput.current?.click();
              }}
            >
              {t('重新选择', 'Choose again')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
