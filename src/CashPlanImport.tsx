import { useId, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
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
import './cash-plan-import.css';

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
    [reading, setReading] = useState(false);
  const clearPreview = () => {
    setPreview(null);
    setError('');
  };
  const parse = () => {
    clearPreview();
    try {
      setPreview(
        parseCashPlanImport(source, format, {
          asOf,
          cashFloor: floor,
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
          setOpen(true);
          setSource('');
          setFilename('');
          setAsOf(current?.asOf || '');
          setFloor(current?.cashFloor || '');
          clearPreview();
        }}
      >
        <FileUp size={15} />
        {t('导入现金计划', 'Import cash plan')}
      </button>
      {open && (
        <Dialog
          title={t('导入私人现金计划', 'Import a private cash plan')}
          onClose={() => setOpen(false)}
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
          <div className="cash-import-grid">
            <label htmlFor={id} className="form-field">
              <span>{t('选择CSV / JSON文件', 'Choose a CSV / JSON file')}</span>
              <input
                id={id}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                disabled={reading}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  clearPreview();
                  setSource('');
                  setFilename(file.name);
                  if (file.size > CASH_PLAN_IMPORT_MAX_BYTES) {
                    setError(t('文件超过1MB。', 'The file exceeds 1MB.'));
                    return;
                  }
                  const suffix = file.name.toLowerCase().split('.').pop();
                  if (suffix !== 'csv' && suffix !== 'json') {
                    setError(t('仅支持.csv或.json。', 'Only .csv and .json are supported.'));
                    return;
                  }
                  setReading(true);
                  try {
                    setSource(await file.text());
                    setFormat(suffix);
                  } catch {
                    setError(t('文件读取失败。', 'The file could not be read.'));
                  } finally {
                    setReading(false);
                  }
                }}
              />
            </label>
            <label className="form-field">
              <span>{t('起点日期（文件未提供时）', 'As-of date (if absent in file)')}</span>
              <input
                type="date"
                value={asOf}
                onChange={(event) => {
                  setAsOf(event.target.value);
                  clearPreview();
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
                  clearPreview();
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
            <button
              type="button"
              className="button button-secondary"
              disabled={reading || !source}
              onClick={parse}
            >
              {reading ? t('正在读取…', 'Reading…') : t('解析预览', 'Preview import')}
            </button>
            <span className="muted">{filename}</span>
          </div>
          {preview && (
            <section aria-label={t('计划候选预览', 'Plan candidate preview')}>
              <p>
                <strong>{t(`${preview.rowCount}个事件`, `${preview.rowCount} events`)}</strong> ·{' '}
                {preview.input.asOf} · {t('起点现金', 'Opening cash')}:{' '}
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
                    onChange(structuredClone(preview.input));
                    setOpen(false);
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
