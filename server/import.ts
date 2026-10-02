import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readPdfIsolated } from './pdf-parser.js';
import type { Material, MetricKey, Observation, UploadPreview } from '../shared/contracts.js';
import { ApiFault, fenToYuan, moneyToFen, validateMaterial } from './validation.js';
export interface UploadMeta {
  company?: string;
  shortName?: string;
  documentDate?: string;
}
function filenameOnly(filename: string) {
  return path.basename(filename.replace(/\\/g, '/')).slice(0, 240) || 'upload';
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new ApiFault(400, 'INVALID_CSV', 'CSV 引号未闭合');
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
function fromCsv(text: string, filename: string, hash: string, meta: UploadMeta): UploadPreview {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const header = rows.shift()?.map((cell) => cell.trim()) || [];
  const required = ['company', 'year', 'key', 'value', 'unit', 'currency', 'scope'];
  if (required.some((key) => !header.includes(key)))
    throw new ApiFault(400, 'INVALID_CSV', `CSV 缺少必需列：${required.join(', ')}`);
  const records = rows.map((row) =>
    Object.fromEntries(header.map((column, index) => [column, (row[index] || '').trim()]))
  );
  if (!records.length) throw new ApiFault(400, 'EMPTY_CSV', 'CSV 没有数据行');
  if (new Set(records.map((record) => record.company)).size > 1)
    throw new ApiFault(400, 'MIXED_SUBJECT', '单份导入材料不能含多个主体；请分别导入后核查');
  const first = records[0]!;
  const material = validateMaterial({
    company: meta.company || first.company,
    shortName: meta.shortName || first.shortName || first.company,
    title: filename,
    filename,
    origin: 'user-upload',
    documentDate: meta.documentDate || first.documentDate || new Date().toISOString().slice(0, 10),
    ...(first.sourceUrl ? { sourceUrl: first.sourceUrl } : {}),
    sha256: hash,
    observations: records.map((record) => ({
      id: randomUUID(),
      key: record.key,
      year: Number(record.year),
      value: record.value,
      unit: record.unit,
      currency: record.currency,
      scope: record.scope,
      period: record.period || 'unknown',
      page: record.page ? Number(record.page) : null,
      quote: record.quote || '用户提供的结构化金额；尚未独立核验来源。',
      kind: 'reported',
    })),
    notes: ['导入的结构化输入须由提供者核对原始来源。'],
    excerpts: [],
  });
  return {
    material,
    warnings: [
      'CSV 不承载其余分组原始行，若要完整现金桥，请使用含 components 的 JSON。',
      ...(!first.documentDate && !meta.documentDate
        ? ['未提供披露日期，暂用导入日期；保存前请核对。']
        : []),
    ],
  };
}
const amountPattern = /\(?-?\d[\d,]*\.\d{2}\)?/g;
function keyFor(label: string): MetricKey | null {
  if (/^净利润/.test(label)) return 'netProfit';
  if (/经营活动产生的现金流量净额/.test(label)) return 'operatingCashFlow';
  if (/存货的减少/.test(label)) return 'inventoryAdjustment';
  if (/经营性应收项目的减少/.test(label)) return 'receivablesAdjustment';
  if (/经营性应付项目的增加/.test(label)) return 'payablesAdjustment';
  return null;
}
async function fromPdf(
  buffer: Buffer,
  filename: string,
  hash: string,
  meta: UploadMeta,
  signal?: AbortSignal
): Promise<UploadPreview> {
  if (buffer.subarray(0, 5).toString() !== '%PDF-')
    throw new ApiFault(400, 'INVALID_PDF', '文件没有 PDF 格式标记');
  try {
    const result = await readPdfIsolated(buffer, signal);
    const extracted = {
      text: result.text,
      pages: result.pages.map((page) => ({ num: page.page, text: page.text })),
    };
    if (extracted.text.trim().length < 40)
      throw new ApiFault(
        400,
        'PDF_NO_TEXT',
        '未取得可用文本；扫描件目前不支持 OCR，请导入 JSON/CSV'
      );
    const yearMatches = [...extracted.text.matchAll(/(20\d{2})\s*年(?:度)?(?:\s*年度)?报告/g)].map(
      (match) => Number(match[1])
    );
    const year = yearMatches[0];
    const company =
      meta.company ||
      extracted.pages[0]?.text.match(/([^\n]{2,80}股份有限公司)/)?.[1]?.replace(/\s+/g, '') ||
      '';
    if (!company)
      throw new ApiFault(400, 'PDF_SUBJECT_REQUIRED', '无法确认公司主体，请在上传时提供 company');
    let prior = '';
    const observations: Observation[] = [],
      warnings: string[] = [];
    const excerpts: Material['excerpts'] = [];
    let table: {
      scope: Observation['scope'];
      unit: Observation['unit'] | null;
      year: number;
      rows: { label: string; values: string[]; page: number }[];
      label: string;
      active: boolean;
    } | null = null;
    const finish = () => {
      if (!table || !table.rows.length || !table.unit) {
        table = null;
        return;
      }
      const t = table;
      for (let column = 0; column < 2; column++) {
        const currentYear = t.year - column;
        const other: NonNullable<Observation['components']> = [];
        for (const row of t.rows) {
          const value = row.values[column];
          if (!value) continue;
          const key = keyFor(row.label);
          if (key)
            observations.push({
              id: randomUUID(),
              key,
              year: currentYear,
              value,
              unit: t.unit!,
              currency: 'CNY',
              scope: t.scope,
              period: 'annual',
              page: row.page,
              quote: `${row.label}；${currentYear}年：${value} ${t.unit}`,
              kind: 'reported',
            });
          else
            other.push({
              label: row.label.slice(0, 200),
              value,
              page: row.page,
              quote: `${row.label}；${currentYear}年：${value} ${t.unit}`,
            });
        }
        if (other.length)
          observations.push({
            id: randomUUID(),
            key: 'otherAdjustments',
            year: currentYear,
            value: fenToYuan(
              other.reduce((sum, component) => sum + moneyToFen(component.value, t.unit!), 0n)
            ),
            unit: 'yuan',
            currency: 'CNY',
            scope: t.scope,
            period: 'annual',
            page: other[0]!.page,
            quote: '其余已提取调整行的分组求和；保存前请核对完整表格。',
            kind: 'derived',
            components: other.map((component) => ({
              ...component,
              value: fenToYuan(moneyToFen(component.value, t.unit!)),
            })),
          });
      }
      table = null;
    };
    for (const page of extracted.pages) {
      const section = `${prior}\n${page.text}`;
      for (const line of page.text.split('\n')) {
        const compact = line.replace(/\s/g, '');
        if (/将净利润调节为经营活动(?:的)?现金流量/.test(compact)) {
          finish();
          const beforeTable = section.slice(0, section.indexOf(line));
          const consolidated = beforeTable.lastIndexOf('合并财务报表项目注释');
          const parent = Math.max(
            beforeTable.lastIndexOf('母公司财务报表'),
            beforeTable.lastIndexOf('母公司财务报表主要项目注释')
          );
          const scope =
            consolidated >= 0 && consolidated > parent
              ? 'consolidated'
              : parent >= 0
                ? 'parent'
                : 'unknown';
          const context = page.text.slice(0, page.text.indexOf(line));
          const unit = /单位[：:]\s*(?:人民币)?万元/.test(context)
            ? 'wan'
            : /单位[：:]\s*(?:人民币)?亿元/.test(context)
              ? 'yi'
              : /单位[：:]\s*(?:人民币)?元/.test(context)
                ? 'yuan'
                : null;
          const columnsConfirmed =
            /(?:本期金额|本年发生额|本年金额)[\s\S]{0,30}(?:上期金额|上年发生额|上年金额)/.test(
              context
            );
          if (!year || !columnsConfirmed) {
            warnings.push(`第 ${page.num} 页无法确定年度与两列顺序，未采用该表数值。`);
            table = null;
            continue;
          }
          table = { scope, unit, year, rows: [], label: '', active: true };
          if (!unit) warnings.push(`第 ${page.num} 页未确认单位，未采用该表数值。`);
          if (scope === 'unknown') warnings.push(`第 ${page.num} 页合并范围未确认，需人工核对。`);
          if (scope === 'parent')
            warnings.push(`第 ${page.num} 页为母公司表，保留观测用于冲突核查，不用于合并计算。`);
          if (excerpts.length < 100) excerpts.push({ page: page.num, text: context.slice(-300) });
          continue;
        }
        if (!table?.active) continue;
        if (/^2[.．、]/.test(compact)) {
          finish();
          continue;
        }
        if (/年度报告|^--\s*\d+\s*of|^\d+$/.test(line.trim()) || !line.trim()) continue;
        const amounts = [...line.matchAll(amountPattern)].map((match) => {
          const raw = match[0].replace(/,/g, '');
          return raw.startsWith('(') ? `-${raw.slice(1, -1)}` : raw;
        });
        const label = line.replace(amountPattern, '').replace(/\s/g, '');
        table.label += label;
        if (amounts.length) {
          if (amounts.length > 2) {
            warnings.push(`第 ${page.num} 页一行出现超过两列金额，未采用。`);
            table.label = '';
            continue;
          }
          table.rows.push({
            label: table.label || '未识别调整项',
            values: amounts,
            page: page.num,
          });
          if (keyFor(table.label) === 'operatingCashFlow') finish();
          else table.label = '';
        }
      }
      prior += '\n' + page.text;
    }
    finish();
    if (!observations.length)
      warnings.push('未找到可确认的两年现金流补充表，当前仅提取文本；请手工补入结构化观测。');
    warnings.unshift(
      'PDF 自动提取仅为预览；请逐项核对表头、列顺序、金额与范围后保存。扫描件不支持。'
    );
    return {
      material: validateMaterial({
        company,
        shortName: meta.shortName || company,
        title: filename,
        filename,
        origin: 'user-upload',
        documentDate: meta.documentDate || new Date().toISOString().slice(0, 10),
        sha256: hash,
        observations,
        notes: warnings,
        excerpts,
      }),
      warnings,
    };
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault(
      400,
      'PDF_PARSE_FAILED',
      'PDF 提取失败或文件不可读，请使用文本 PDF 或 JSON/CSV'
    );
  }
}
export async function previewUpload(
  buffer: Buffer,
  originalName: string,
  meta: UploadMeta = {},
  signal?: AbortSignal
): Promise<UploadPreview> {
  const filename = filenameOnly(originalName),
    extension = path.extname(filename).toLowerCase();
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (extension === '.pdf') return fromPdf(buffer, filename, hash, meta, signal);
  if (!['.json', '.csv'].includes(extension))
    throw new ApiFault(415, 'UNSUPPORTED_FILE', '仅支持 JSON、CSV 与文本型 PDF');
  const text = buffer.toString('utf8');
  if (text.includes('\0')) throw new ApiFault(400, 'INVALID_TEXT', '结构化文件必须是 UTF-8 文本');
  if (extension === '.csv') return fromCsv(text, filename, hash, meta);
  try {
    const input = JSON.parse(text) as Record<string, unknown>;
    const material = validateMaterial({
      ...input,
      ...(meta.company ? { company: meta.company } : {}),
      ...(meta.shortName ? { shortName: meta.shortName } : {}),
      ...(meta.documentDate ? { documentDate: meta.documentDate } : {}),
      filename,
      origin: 'user-upload',
      sha256: hash,
      rawSourceId: undefined,
    });
    return { material, warnings: ['JSON 已通过格式校验；原始来源及数字真实性需由提供者核对。'] };
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault(400, 'INVALID_JSON', 'JSON 文件格式无效');
  }
}
