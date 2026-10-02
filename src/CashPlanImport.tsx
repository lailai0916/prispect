import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileText, FileUp, LoaderCircle } from 'lucide-react';
import type { DatedCashInput } from '../shared/decision-contracts';
import {
  CASH_PLAN_CSV_TEMPLATE,
  CASH_PLAN_IMPORT_MAX_BYTES,
  CashPlanImportError,
  parseCashPlanImport,
  type CashPlanImportPreview,
} from '../shared/cash-plan-import';
import { Dialog } from './components';
import { useApp } from './context';
import { useFileDrop, validateFileSelection, type FileSelectionError } from './useFileDrop';
import './cash-plan-import.css';
import './styles/cash-plan-upload.css';

const extensions = ['csv', 'json'];

export function CashPlanImport({
  current,
  onChange,
}: {
  current: DatedCashInput | null;
  onChange: (input: DatedCashInput) => void;
}) {
  const { t } = useApp();
  const id = useId();
  const [open, setOpen] = useState(false),
    [source, setSource] = useState(''),
    [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [filename, setFilename] = useState(''),
    [asOf, setAsOf] = useState(''),
    [floor, setFloor] = useState('');
  const [preview, setPreview] = useState<CashPlanImportPreview | null>(null),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false),
    [readFailed, setReadFailed] = useState(false),
    [previewStale, setPreviewStale] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const generation = useRef(0);
  const readingLock = useRef(false);
  const isOpen = useRef(false);
  const defaults = useRef({ asOf, floor });
  const latest = useRef({ current, t });
  latest.current = { current, t };
  useEffect(
    () => () => {
      isOpen.current = false;
      generation.current += 1;
      readingLock.current = false;
    },
    []
  );
  const clearPreview = () => {
    setPreview(null);
    setError('');
  };
  const close = () => {
    isOpen.current = false;
    generation.current += 1;
    readingLock.current = false;
    setReading(false);
    setOpen(false);
  };
  const parseSource = (text: string, fileFormat: 'csv' | 'json') => {
    clearPreview();
    setPreviewStale(false);
    const { t, current } = latest.current;
    try {
      setPreview(
        parseCashPlanImport(text, fileFormat, {
          asOf: defaults.current.asOf,
          cashFloor: defaults.current.floor,
          proposedAmount: current?.proposedAmount ?? null,
          proposedDay: current?.proposedDay ?? null,
          alternativeDay: current?.alternativeDay ?? null,
        })
      );
    } catch (failure) {
      const messages: Record<string, string> = {
        'too-large': t('文件超过1MB。', 'The file exceeds 1MB.'),
        'empty-file': t('文件为空。', 'The file is empty.'),
        'invalid-json': t('JSON格式无效。', 'Invalid JSON format.'),
        'unknown-field': t(
          'JSON含不支持的字段或事件格式。',
          'The JSON contains unsupported fields or events.'
        ),
        'invalid-csv': t('CSV行或引号格式不完整。', 'CSV rows or quoting are incomplete.'),
        'unknown-header': t(
          'CSV列名不在支持范围，请使用空白格式。',
          'Unsupported CSV headers. Use the blank format.'
        ),
        'duplicate-header': t(
          'CSV列名重复或同义列冲突。',
          'CSV headers are duplicated or ambiguous.'
        ),
        'metadata-conflict': t(
          '重复的起点日期、起点金额或计划条件不一致。',
          'Repeated dates, opening balances or conditions conflict.'
        ),
        'invalid-date': t(
          '需要明确且有效的YYYY-MM-DD日期。',
          'An explicit valid YYYY-MM-DD date is required.'
        ),
        'invalid-day': t(
          '事件必须在起点后D1至D90；未知请留空。',
          'Events must be D1 through D90; leave unknown dates blank.'
        ),
        'date-day-conflict': t('同一事件的日期与day不一致。', 'The event date and day disagree.'),
        'invalid-money': t(
          '金额必须为非负人民币元文本，最多20位整数和2位小数。',
          'Amounts must be nonnegative CNY text with at most 20 integer digits and 2 decimals.'
        ),
        'invalid-currency': t(
          '只支持人民币元CNY，不接受万元或其他币种。',
          'Only CNY yuan is supported; other currencies or units are rejected.'
        ),
        'missing-floor': t(
          '请明确自设现金底线；0也需要明确填写。',
          'Specify your cash floor; enter 0 explicitly if intended.'
        ),
        'duplicate-id': t('事件编号重复。', 'Event IDs are duplicated.'),
        'too-many-flows': t('最多导入100个事件。', 'Import at most 100 events.'),
        'invalid-direction': t(
          '每个事件必须明确in/收款或out/付款。',
          'Each event must specify in/receipt or out/payment.'
        ),
        'invalid-text': t(
          '名称或编号无效，最多200字符。',
          'Labels or IDs are invalid; use at most 200 characters.'
        ),
        'invalid-flexibility': t(
          '可调整性只接受fixed或proposed。',
          'Flexibility must be fixed or proposed.'
        ),
      };
      if (failure instanceof CashPlanImportError)
        setError(
          `${messages[failure.code] || t('无法解析此计划。', 'This plan could not be parsed.')}${failure.row ? t(` 第${failure.row}行。`, ` Row ${failure.row}.`) : ''}`
        );
      else setError(t('无法读取计划，请检查文件。', 'Cannot read this plan. Check the file.'));
    }
  };
  const selectionError = (code: FileSelectionError) => {
    if (readingLock.current || !isOpen.current) return;
    clearPreview();
    setPreviewStale(false);
    const messages: Record<FileSelectionError, string> = {
      multiple: t('一次选择一个计划文件。', 'Choose one plan file at a time.'),
      type: t('仅支持CSV或JSON文件，请重新选择。', 'Choose a CSV or JSON file.'),
      size: t('文件超过1MB，请选择较小的文件。', 'The file exceeds 1MB. Choose a smaller file.'),
      empty: t(
        '文件为空，请选择含计划内容的文件。',
        'The file is empty. Choose a file with a plan.'
      ),
      directory: t(
        '不能导入文件夹，请选择一个文件。',
        'Folders cannot be imported. Choose a file.'
      ),
    };
    setError(`${messages[code]} ${t('未替换当前计划。', 'The current plan was not replaced.')}`);
  };
  const readPlanFile = async (file: File) => {
    if (readingLock.current || !isOpen.current) return;
    readingLock.current = true;
    const revision = ++generation.current;
    selectedFile.current = file;
    clearPreview();
    setSource('');
    setFilename(file.name);
    setReadFailed(false);
    setPreviewStale(false);
    setReading(true);
    try {
      const text = await file.text();
      if (!isOpen.current || generation.current !== revision) return;
      const fileFormat = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      setSource(text);
      setFormat(fileFormat);
      parseSource(text, fileFormat);
    } catch {
      if (!isOpen.current || generation.current !== revision) return;
      setReadFailed(true);
      setError(
        latest.current.t(
          '文件读取失败，请重试或重新选择。',
          'Reading failed. Retry or choose another file.'
        )
      );
    } finally {
      if (generation.current === revision) {
        readingLock.current = false;
        setReading(false);
      }
    }
  };
  const { isDragging, dropProps } = useFileDrop({
    disabled: reading || !open,
    extensions,
    maxBytes: CASH_PLAN_IMPORT_MAX_BYTES,
    onFile: (file) => void readPlanFile(file),
    onError: selectionError,
  });
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + CASH_PLAN_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cash-plan-blank.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          generation.current += 1;
          isOpen.current = true;
          readingLock.current = false;
          selectedFile.current = null;
          setReading(false);
          setReadFailed(false);
          setPreviewStale(false);
          setOpen(true);
          setSource('');
          setFilename('');
          const next = { asOf: current?.asOf || '', floor: current?.cashFloor || '' };
          defaults.current = next;
          setAsOf(next.asOf);
          setFloor(next.floor);
          clearPreview();
        }}
      >
        <FileUp size={15} />
        {t('导入现金计划', 'Import cash plan')}
      </button>
      {open && (
        <Dialog
          title={t('导入私人现金计划', 'Import a private cash plan')}
          onClose={close}
          wide
          className="cash-import-dialog"
        >
          <p>
            {t(
              'CSV或JSON，最多1MB、100个事件。只在此浏览器解析，不发送模型。采用后作为计划条件，仍需保存当前事项。',
              'CSV or JSON, up to 1MB and 100 events. Parsed in this browser without sending to a model. Adoption changes plan conditions; save the case separately.'
            )}
          </p>
          <div className="cash-import-actions">
            <button type="button" className="button button-secondary" onClick={download}>
              <Download size={15} />
              {t('下载空白CSV', 'Download blank CSV')}
            </button>
          </div>
          <div
            {...dropProps}
            className="cash-plan-upload"
            data-dragging={isDragging}
            data-reading={reading}
            data-error={!!error && !source}
            aria-busy={reading}
          >
            <input
              ref={fileInput}
              id={id}
              className="cash-plan-upload-input"
              type="file"
              tabIndex={-1}
              aria-label={t('选择CSV或JSON计划文件', 'Choose a CSV or JSON plan file')}
              accept=".csv,.json,text/csv,application/json"
              disabled={reading}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                if (!files.length) return;
                const result = validateFileSelection(files, {
                  extensions,
                  maxBytes: CASH_PLAN_IMPORT_MAX_BYTES,
                });
                if (typeof result === 'string') selectionError(result);
                else void readPlanFile(result);
              }}
            />
            <button
              type="button"
              className="cash-plan-upload-target"
              disabled={reading}
              aria-controls={id}
              aria-describedby={`${id}-upload-help`}
              onClick={() => fileInput.current?.click()}
            >
              {reading ? (
                <LoaderCircle size={22} className="spinner" aria-hidden="true" />
              ) : filename ? (
                <FileText size={22} aria-hidden="true" />
              ) : (
                <FileUp size={22} aria-hidden="true" />
              )}
              <strong>
                {reading
                  ? t('正在读取文件…', 'Reading the file…')
                  : isDragging
                    ? t('松开以导入计划', 'Drop to import the plan')
                    : filename
                      ? t('选择另一个文件', 'Choose another file')
                      : t('拖入计划文件，或选择文件', 'Drop a plan file or choose a file')}
              </strong>
              <span id={`${id}-upload-help`}>
                {t('CSV / JSON · 单文件 · 最多1MB', 'CSV / JSON · One file · Up to 1MB')}
              </span>
            </button>
            {filename && <p className="cash-plan-upload-filename">{filename}</p>}
            <p className="cash-plan-upload-status" role="status" aria-live="polite">
              {reading
                ? t('文件仅在此浏览器读取。', 'The file is read only in this browser.')
                : preview
                  ? t('预览已生成，核对后再采用。', 'Preview ready. Review it before adopting.')
                  : previewStale
                    ? t(
                        '日期或底线已更改，请重新预览。',
                        'The date or floor changed. Preview again.'
                      )
                    : t(
                        '读取后自动预览，不会自动采用。',
                        'Reading creates a preview, never automatic adoption.'
                      )}
            </p>
          </div>
          <div className="cash-import-grid cash-plan-upload-defaults">
            <label className="form-field">
              <span>{t('起点日期（文件未提供时）', 'As-of date (if absent in file)')}</span>
              <input
                type="date"
                value={asOf}
                onChange={(event) => {
                  setAsOf(event.target.value);
                  defaults.current.asOf = event.target.value;
                  clearPreview();
                  setPreviewStale(!!source);
                }}
              />
            </label>
            <label className="form-field">
              <span>
                {t(
                  '自设现金底线（文件未提供时，人民币元）',
                  'Your cash floor (if absent in file, CNY)'
                )}
              </span>
              <input
                inputMode="decimal"
                value={floor}
                onChange={(event) => {
                  setFloor(event.target.value);
                  defaults.current.floor = event.target.value;
                  clearPreview();
                  setPreviewStale(!!source);
                }}
              />
            </label>
          </div>
          <p className="muted">
            {t(
              'CSV列：名称、收付方向、金额（元）、day或日期；起点日期、起点现金、自设底线可在文件内提供。收付方向使用in/out或收款/付款。金额未知留空；不接受科学记数、负数或含糊单位。',
              'CSV columns: label, direction, amount, day or date; asOf, openingCash and cashFloor may be supplied in the file. Use in/out or 收款/付款. Leave unknown amounts blank. Scientific notation, negatives and ambiguous units are rejected.'
            )}
          </p>
          <details>
            <summary>{t('JSON字段格式', 'JSON field format')}</summary>
            <p className="muted">
              asOf, openingCash, cashFloor, proposedAmount, proposedDay, alternativeDay, flows:
              [&#123;id, label, direction, day, amount, flexibility&#125;].{' '}
              {t(
                '金额使用字符串或null；day为1–90整数或null。',
                'Amounts use strings or null; days are integers 1–90 or null.'
              )}
            </p>
          </details>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="cash-import-actions">
            {readFailed && (
              <button
                type="button"
                className="button button-secondary"
                disabled={reading}
                onClick={() => {
                  if (selectedFile.current) void readPlanFile(selectedFile.current);
                }}
              >
                {t('重试读取', 'Retry reading')}
              </button>
            )}
            {source && !preview && (
              <button
                type="button"
                className="button button-secondary"
                disabled={reading || !source}
                onClick={() => parseSource(source, format)}
              >
                {t('重新预览', 'Preview again')}
              </button>
            )}
          </div>
          {preview && (
            <section aria-label={t('计划候选预览', 'Plan candidate preview')}>
              <p>
                <strong>
                  {t(
                    `${preview.rowCount}个事件`,
                    `${preview.rowCount} ${preview.rowCount === 1 ? 'event' : 'events'}`
                  )}
                </strong>{' '}
                · {preview.input.asOf} · {t('起点现金', 'Opening cash')}:{' '}
                {preview.input.openingCash ?? t('未知', 'Unknown')} · {t('自设底线', 'Your floor')}:{' '}
                {preview.input.cashFloor} CNY
              </p>
              <p className="muted">
                {t(
                  '将替换当前计划事件；本次拟付与对照日期按下列条件保留或由文件明确修改。',
                  'This replaces the current events. The proposal and comparison dates are retained or explicitly changed by the file as shown below.'
                )}
              </p>
              <p>
                {t('本次拟付', 'Proposed payment')}:{' '}
                {preview.input.proposedAmount ?? t('未知', 'Unknown')} CNY /{' '}
                {preview.input.proposedDay === null ? '?' : `D${preview.input.proposedDay}`} ·{' '}
                {t('对照付款日', 'Alternative day')}:{' '}
                {preview.input.alternativeDay === null ? '?' : `D${preview.input.alternativeDay}`}
              </p>
              {!!preview.warnings.length && (
                <p className="warning-box">
                  {t(
                    '有未知起点、事件金额或日期时，对应计算保持未知；缺项不会填0。',
                    'Unknown opening cash, event amounts or dates keep the calculation unknown. Missing values are never filled with zero.'
                  )}
                </p>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('名称', 'Label')}</th>
                      <th>{t('方向', 'Direction')}</th>
                      <th>{t('日期', 'Day')}</th>
                      <th>{t('人民币元', 'CNY')}</th>
                      <th>{t('性质', 'Condition')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.input.flows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.label}</td>
                        <td>
                          {item.direction === 'in' ? t('收款', 'Receipt') : t('付款', 'Payment')}
                        </td>
                        <td>{item.day === null ? t('未知', 'Unknown') : `D${item.day}`}</td>
                        <td>{item.amount ?? t('未知', 'Unknown')}</td>
                        <td>
                          {item.flexibility === 'fixed'
                            ? t('固定条件', 'Fixed condition')
                            : t('拟定条件', 'Proposed condition')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                {t(
                  '计划文件不是资金记录。此操作不创建来源证据、不认证真伪；年报数值不会补入起点现金。',
                  'A plan file is not a cash record. This creates no source evidence or authenticity claim; annual-report values never fill opening cash.'
                )}
              </p>
              <div className="cash-import-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    if (!isOpen.current || readingLock.current) return;
                    onChange(structuredClone(preview.input));
                    close();
                  }}
                >
                  {t('使用这些计划条件', 'Use these plan conditions')}
                </button>
              </div>
            </section>
          )}
        </Dialog>
      )}
    </>
  );
}
