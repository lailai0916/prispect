import { useRef, useState, type FormEvent } from 'react';
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
import { PageHeading, EmptyState, Tag, Dialog } from '../components';
import { purposeName } from '../ReviewContext';
import '../review-pages.css';

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
  const [importOpen, setImportOpen] = useState(false);
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
    <div className="financial-create-page">
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
            <button className="button button-secondary" onClick={() => setImportOpen(true)}>
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
                <a href="#/method?section=privacy">{t('数据使用', 'Data use')}</a>
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
      {importOpen && (
        <Dialog
          title={t('上传并确认材料', 'Upload and confirm evidence')}
          wide
          onClose={() => setImportOpen(false)}
        >
          <MaterialImporter
            onSaved={(material) => {
              setSelectedIds((previous) => [...previous, material.id]);
              setCompany(material.company);
              if (material.observations.length)
                setYear(Math.max(...material.observations.map((item) => item.year)));
              setImportOpen(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

export function MaterialsPage() {
  const { t, locale, workspace, execute, confirm, showEvidence } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const materials = workspace!.materials.filter(
    (material) =>
      (filter === 'all' || material.origin === filter) &&
      `${material.title} ${material.company}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <PageHeading
        title={t('材料', 'Evidence')}
        description={t(
          '查看来源、原文件与已确认的指标。',
          'Inspect sources, original files and confirmed metrics.'
        )}
        action={
          <button className="button button-primary" onClick={() => setImportOpen(true)}>
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
            <button className="button button-primary" onClick={() => setImportOpen(true)}>
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
      {importOpen && (
        <Dialog
          title={t('导入并确认材料', 'Import and confirm material')}
          wide
          onClose={() => setImportOpen(false)}
        >
          <MaterialImporter onSaved={() => setImportOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

export function MaterialImporter({ onSaved }: { onSaved: (material: Material) => void }) {
  const { t, locale, execute, busy } = useApp();
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCompany, setUploadCompany] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (uploadCompany) form.append('company', uploadCompany);
      if (uploadName) form.append('shortName', uploadName);
      if (uploadDate) form.append('documentDate', uploadDate);
      setPreview(await api<UploadPreview>('/materials/preview', { method: 'POST', body: form }));
    } catch (failure) {
      setError(requestErrorText(failure, locale));
    } finally {
      setUploading(false);
    }
  };
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
    if (!preview) return;
    const saved = await execute(
      () =>
        post<Material>('/materials', {
          ...preview.material,
          sourceUrl: preview.material.sourceUrl?.trim() || undefined,
          origin: 'user-upload',
        }),
      t('材料已保存', 'Material saved')
    );
    if (saved) onSaved(saved);
  };
  return (
    <div className="importer">
      {!preview ? (
        <>
          <input
            type="file"
            accept=".json,.csv,.pdf"
            ref={fileInput}
            className="sr-only"
            aria-label={t('选择材料文件', 'Choose a material file')}
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
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
                  onChange={(event) => setUploadCompany(event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('简称', 'Short name')}</span>
                <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
              </label>
              <label className="form-field field-wide">
                <span>{t('材料日期', 'Document date')}</span>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(event) => setUploadDate(event.target.value)}
                />
              </label>
            </div>
          </details>
          <button
            className="upload-zone"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) upload(file);
            }}
          >
            {uploading ? <LoaderCircle className="spinner" size={32} /> : <Upload size={32} />}
            <strong>
              {uploading
                ? t('正在读取文件…', 'Reading file…')
                : t('选择文件，或拖放到这里', 'Choose a file or drop it here')}
            </strong>
            <span>JSON / CSV / {t('文本型 PDF', 'text-based PDF')}</span>
          </button>
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
                      updateObservation(index, { unit: event.target.value as Observation['unit'] })
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
                    onChange={(event) => updateObservation(index, { currency: event.target.value })}
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
                      updateObservation(index, { kind: event.target.value as Observation['kind'] })
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
          <div className="import-bottom">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setPreview(null);
                setError('');
              }}
            >
              {t('重新选择文件', 'Choose another file')}
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={
                busy ||
                (!preview.material.observations.length &&
                  !preview.material.excerpts.some((excerpt) => excerpt.text.trim()))
              }
            >
              {busy ? <LoaderCircle className="spinner" size={17} /> : <Check size={17} />}{' '}
              {t('确认并保存材料', 'Confirm and save')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={17} />
          {error}
          <button
            className="text-link"
            onClick={() => {
              setError('');
              fileInput.current?.click();
            }}
          >
            {t('重新选择', 'Choose again')}
          </button>
        </div>
      )}
    </div>
  );
}
