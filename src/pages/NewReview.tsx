import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
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
  DemoCase,
  Material,
  MetricKey,
  Observation,
  UploadPreview,
} from '../../shared/contracts';
import { api, post, requestErrorText } from '../api';
import { date, metricName, yuan } from '../format';
import { translateRule } from '../ruleTranslations';

import { useApp, adjustments, type Translate } from '../context';
import { PageHeading, EmptyState, Tag, Dialog } from '../components';

export function NewReview({ query }: { query: URLSearchParams }) {
  const { t, workspace, cases, navigate, execute, busy } = useApp();
  const initial =
    cases.find((item) => item.id === query.get('case')) ||
    cases.find((item) => item.kind === 'contrast');
  const [selectedCase, setSelectedCase] = useState(initial?.id || 'custom');
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.materialIds || []);
  const [title, setTitle] = useState(
    initial ? `${initial.shortName} · ${t('利润现金兑现核查', 'Profit-to-cash review')}` : ''
  );
  const [company, setCompany] = useState(initial?.company || '');
  const [year, setYear] = useState(initial?.year || 2025);
  const [importOpen, setImportOpen] = useState(false);
  const [useModel, setUseModel] = useState(false);
  const selectCase = (item: DemoCase) => {
    setSelectedCase(item.id);
    setSelectedIds(item.materialIds);
    setCompany(item.company);
    setYear(item.year);
    setTitle(`${item.shortName} · ${t('利润现金兑现核查', 'Profit-to-cash review')}`);
  };
  const selectCustom = () => {
    setSelectedCase('custom');
    setSelectedIds([]);
    setCompany('');
    setTitle('');
  };
  const toggleMaterial = (material: Material) => {
    setSelectedIds((previous) =>
      previous.includes(material.id)
        ? previous.filter((id) => id !== material.id)
        : [...previous, material.id]
    );
    if (!company) setCompany(material.company);
    if (!title)
      setTitle(`${material.shortName} · ${t('利润现金兑现核查', 'Profit-to-cash review')}`);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const task = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: title.trim(),
        company: company.trim(),
        year,
        materialIds: selectedIds,
        useModel,
      } satisfies CreateTaskInput)
    );
    if (task) navigate(`/tasks/${task.id}`);
  };
  return (
    <>
      <PageHeading
        eyebrow="START WITH ONE CLAIM"
        title={t('新建现金核查', 'Start a cash review')}
        description={t(
          '核查目标：利润是否兑现为经营现金？先确认你提供的材料，再开始计算。',
          'The claim to test: does profit translate into operating cash? Confirm your evidence before calculating.'
        )}
      />
      <div className="new-layout">
        <div className="new-main">
          <section className="form-section">
            <div className="form-section-heading">
              <span className="section-number">01</span>
              <h2>{t('选择核查起点', 'Choose your starting point')}</h2>
            </div>
            <div className="case-list">
              {cases.map((item) => (
                <button
                  key={item.id}
                  className={`case-option ${selectedCase === item.id ? 'selected' : ''}`}
                  onClick={() => selectCase(item)}
                >
                  <span className="radio-indicator">{selectedCase === item.id && <span />}</span>
                  <span className="case-option-text">
                    <strong>{caseTitle(item, t)}</strong>
                    <span>{caseDescription(item, t)}</span>
                  </span>
                  <span className="case-kind">
                    {item.year}
                    <ChevronRight size={16} />
                  </span>
                </button>
              ))}
              <button
                className={`case-option ${selectedCase === 'custom' ? 'selected' : ''}`}
                onClick={selectCustom}
              >
                <span className="radio-indicator">{selectedCase === 'custom' && <span />}</span>
                <span className="case-option-text">
                  <strong>{t('使用自己的材料', 'Use your own evidence')}</strong>
                  <span>
                    {t(
                      '导入 JSON / CSV / 文本型 PDF，逐项预览与确认。',
                      'Import JSON, CSV, or a text-based PDF. Preview and confirm every observation.'
                    )}
                  </span>
                </span>
                <Upload size={19} />
              </button>
            </div>
          </section>
          <section className="form-section">
            <div className="form-section-heading">
              <span className="section-number">02</span>
              <h2>{t('确认材料', 'Confirm the evidence')}</h2>
              <button className="text-link" onClick={() => setImportOpen(true)}>
                <Upload size={16} />
                {t('导入材料', 'Import material')}
              </button>
            </div>
            {selectedCase === 'custom' ? (
              <div className="material-picker">
                {workspace!.materials.map((material) => (
                  <label className="material-check" key={material.id}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(material.id)}
                      onChange={() => toggleMaterial(material)}
                    />
                    <FileText size={20} />
                    <span>
                      <strong>{material.title}</strong>
                      <small>
                        {material.company} · {material.documentDate} ·{' '}
                        {material.observations.length} {t('条观测', 'observations')}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="selected-materials">
                {workspace!.materials
                  .filter((material) => selectedIds.includes(material.id))
                  .map((material) => (
                    <div className="selected-material" key={material.id}>
                      <div className="file-symbol">
                        <FileText size={22} />
                      </div>
                      <div>
                        <strong>{material.title}</strong>
                        <p>
                          {material.documentDate} · {material.observations.length}{' '}
                          {t('条观测', 'observations')} ·{' '}
                          {material.origin === 'public-report'
                            ? t('公开披露', 'Public disclosure')
                            : t('用户导入', 'User import')}
                        </p>
                      </div>
                      <CheckCircle2 size={19} />
                    </div>
                  ))}
              </div>
            )}
            <p className="field-note">
              <ShieldCheck size={15} />
              {t(
                '任务保存输入快照；后续的压力测试不会修改原材料。',
                'Your review saves an input snapshot. Later stress tests do not alter the source material.'
              )}
            </p>
          </section>
          <form onSubmit={create} className="form-section">
            <div className="form-section-heading">
              <span className="section-number">03</span>
              <h2>{t('核查主体与期间', 'Company and reporting period')}</h2>
            </div>
            <div className="form-grid">
              <label className="form-field field-wide">
                <span>
                  {t(
                    '底稿名称（仅作为标签，核查目标固定）',
                    'Working-paper title (label only; fixed review objective)'
                  )}
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={180}
                  required
                  placeholder={t(
                    '例如：松原安全 · 采购合作前现金核查',
                    'Example: Songyuan · Pre-partnership cash review'
                  )}
                />
              </label>
              <label className="form-field">
                <span>{t('公司完整名称', 'Full company name')}</span>
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  maxLength={200}
                  required
                />
              </label>
              <label className="form-field">
                <span>{t('核查年度', 'Financial year')}</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  required
                />
              </label>
            </div>
            <label className="model-opt-in">
              <input
                type="checkbox"
                checked={useModel}
                disabled={!workspace!.provider.configured}
                onChange={(event) => setUseModel(event.target.checked)}
              />
              <span>
                <strong>{t('开启可选智能解释', 'Enable optional model explanation')}</strong>
                <small>
                  {workspace!.provider.configured
                    ? t(
                        '开启后，本次允许的财务观测与短摘录将发送至已配置的第三方模型服务。规则计算不依赖模型，模型含义仍需人工复核。',
                        'When enabled, permitted observations and short excerpts are sent to the configured third-party model service. Calculations do not depend on the model; meanings still need human review.'
                      )
                    : t(
                        '当前未配置模型接口，规则核查与导出仍可完整运行。',
                        'No model API configured. Rules-based review and export are fully available.'
                      )}
                </small>
              </span>
            </label>
            <div className="form-submit">
              <p>
                {t(
                  '先验证口径，再计算差额；材料不够时，结论会明确收缩。',
                  'Scope is verified before calculation. The conclusion narrows when evidence is missing.'
                )}
              </p>
              <button
                className="button button-primary button-large"
                type="submit"
                disabled={busy || selectedIds.length === 0}
              >
                {busy ? <LoaderCircle size={18} className="spinner" /> : <ArrowRight size={18} />}{' '}
                {t('开始核查', 'Run review')}
              </button>
            </div>
          </form>
        </div>
        <aside className="new-aside">
          <div className="eyebrow">REVIEW BOUNDARIES</div>
          <h3>
            {t('我们核查的，是材料能够支持的结论。', 'We review what the evidence can support.')}
          </h3>
          <div className="aside-rule">
            <CheckCircle2 size={18} />
            <span>
              {t(
                '同公司、同年度、同币种和合并范围',
                'Same company, year, currency, and consolidated scope'
              )}
            </span>
          </div>
          <div className="aside-rule">
            <CheckCircle2 size={18} />
            <span>
              {t('每个派生数值，可回溯到来源', 'Every derived number traces back to evidence')}
            </span>
          </div>
          <div className="aside-rule">
            <CircleAlert size={18} />
            <span>
              {t(
                '不推断违约概率，不输出信用总分',
                'No default probability or composite credit score'
              )}
            </span>
          </div>
          <div className="aside-rule">
            <CircleAlert size={18} />
            <span>
              {t(
                '现金调整不等同于坏账或滞销',
                'Cash adjustments do not prove bad debt or slow-moving stock'
              )}
            </span>
          </div>
          <a className="text-link" href="#/method">
            {t('查看完整方法与局限', 'Read the method and limitations')}
            <ArrowUpRight size={16} />
          </a>
        </aside>
      </div>
      {importOpen && (
        <Dialog
          title={t('导入并确认材料', 'Import and confirm evidence')}
          onClose={() => setImportOpen(false)}
          wide
        >
          <MaterialImporter
            onSaved={(material) => {
              setSelectedCase('custom');
              setSelectedIds((previous) => [...previous, material.id]);
              setCompany(material.company);
              if (!title)
                setTitle(
                  `${material.shortName} · ${t('利润现金兑现核查', 'Profit-to-cash review')}`
                );
              setImportOpen(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}

export function caseTitle(item: DemoCase, t: Translate): string {
  if (item.kind === 'contrast')
    return t(`${item.shortName} · 利润与现金的反差`, 'Songyuan · The profit–cash gap');
  if (item.kind === 'counterpoint')
    return t(`${item.shortName} · 另一种现金结构`, 'Hikvision · A different cash structure');
  if (item.kind === 'missing')
    return t('材料不足 · 结论应该停止在哪里', 'Missing evidence · Where conclusions must stop');
  return t('口径冲突 · 母公司与合并报表', 'Scope conflict · Parent and consolidated statements');
}
export function caseDescription(item: DemoCase, t: Translate): string {
  if (item.kind === 'contrast')
    return t(
      '利润增长与经营现金下降同时发生。打开完整现金桥，保留两种解释。',
      'Growing profit meets falling operating cash. Open the full cash bridge and preserve two explanations.'
    );
  if (item.kind === 'counterpoint')
    return t(
      '同样的方法、不同的现金结构。仅看历史证据，不做跨行业排名。',
      'The same method, a different historical cash structure. No cross-industry ranking.'
    );
  if (item.kind === 'missing')
    return t(
      '人为只提供选定材料；不能确认合并利润，系统停止比例解读。',
      'A deliberately restricted input. Consolidated profit cannot be verified, so ratio interpretation stops.'
    );
  return t(
    '人为混入不同范围的观测；展示冲突证据，拒绝静默计算。',
    'A deliberate mix of reporting scopes. Conflicting evidence is shown, not silently combined.'
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
        eyebrow="THE EVIDENCE LIBRARY"
        title={t('材料中心', 'Evidence library')}
        description={t(
          '原始材料、出处与确认后的观测值。每份材料，都应该知道从哪里来。',
          'Source materials, provenance, and confirmed observations. Know where every piece of evidence comes from.'
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
                        material.observations.slice(0, 6).map((obs) => ({
                          materialId: material.id,
                          page: obs.page,
                          quote: obs.quote,
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
            '文件哈希记录导入文件的来源身份；人工确认后的结构化观测与原始文件分别保留。扫描件与无法识别的表格不自动猜值。',
            'File hashes identify the imported source. Confirmed structured observations and source files remain distinct. Scanned or ambiguous tables are not silently guessed.'
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
                ? t('正在读取真实文件…', 'Reading your file…')
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
                {t('下载 JSON 样例', 'Download JSON example')}
                <Download size={14} />
              </a>
              <a className="text-link" href="/api/public/input-template?format=csv" download>
                {t('下载 CSV 样例', 'Download CSV example')}
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
          <h3 className="import-observation-title">
            {t('逐项确认结构化观测', 'Confirm each structured observation')}{' '}
            <Tag>{preview.material.observations.length}</Tag>
          </h3>
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
              disabled={busy || !preview.material.observations.length}
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
