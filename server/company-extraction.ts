import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPdfIsolated } from './pdf-parser.js';
import { officialPdfTextCache } from './official-pdf-cache.js';
import type {
  CompanyAnnouncement,
  CompanyCandidatePreview,
  CompanyIdentity,
  Check,
  Material,
  MetricKey,
  MoneyUnit,
  Observation,
} from '../shared/contracts.js';
import { analyze } from './engine.js';
import { ApiFault, fenToYuan, moneyToFen, validateMaterial } from './validation.js';
import { shanghaiDate } from './company-sources.js';

export interface CompanyPdfPage {
  page: number;
  text: string;
  tables?: string[][][];
}
export interface CompanyPdfText {
  pages: CompanyPdfPage[];
  total: number;
  sha256: string;
}
export async function readCompanyPdf(
  buffer: Buffer,
  signal?: AbortSignal,
  options: { sourceUrl?: string } = {}
): Promise<CompanyPdfText> {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new ApiFault(400, 'COMPANY_INVALID_PDF', '原件没有PDF标记');
  try {
    if (options.sourceUrl)
      return await officialPdfTextCache.read(buffer, options.sourceUrl, signal);
    const text = await readPdfIsolated(buffer, signal, 'official');
    return {
      pages: text.pages,
      total: text.total,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  } catch (error) {
    if (error instanceof ApiFault) {
      const codes: Record<string, string> = {
        PDF_PARSE_CANCELLED: 'COMPANY_CANCELLED',
        PDF_PARSE_TIMEOUT: 'COMPANY_PDF_TIMEOUT',
        PDF_PAGE_LIMIT: 'COMPANY_PAGE_LIMIT',
        PDF_TEXT_LIMIT: 'COMPANY_TEXT_LIMIT',
        PDF_NO_TEXT: 'COMPANY_NO_TEXT',
        PDF_PARSE_BUSY: 'COMPANY_PDF_BUSY',
      };
      throw new ApiFault(error.status, codes[error.code] || 'COMPANY_PDF_PARSE', error.message);
    }
    throw new ApiFault(422, 'COMPANY_PDF_PARSE', 'PDF文本读取未完成，未生成替代金额');
  }
}

const amounts = /\(?\s*[−－-]?\d[\d,]*(?:\.\d+)?\s*\)?/g;
const compact = (text: string) => text.replace(/\s/g, '').replace(/[−－]/g, '-');
const cashHeader =
  /^(?:[一二三四五六七八九十\d、.．]*合并财务报表(?:主要)?(?:项目附注|项目注释|附注)(?:[（(]续[）)]|[-—]续)?|(?:[（(][\da-zA-Z]+[）)]|\d+[、.．])?现金流量表(?:项目附注|项目注释|补充资料)(?:[（(]续[）)]|[-—]续)?)$/;
function numeric(raw: string): string {
  raw = raw.replace(/[,\s]/g, '').replace(/[−－]/g, '-');
  return raw.startsWith('(') ? `-${raw.slice(1, -1)}` : raw;
}
function metricFor(label: string): MetricKey | null {
  if (
    /^(?:[一二三四五六七八九十]+[、.．])?净利润(?:[（(]|$)/.test(label) &&
    !/归属|少数/.test(label)
  )
    return 'netProfit';
  if (/^经营活动产生的现金流量净额/.test(label)) return 'operatingCashFlow';
  if (/^存货的[（(]?(?:减少|增加)/.test(label)) return 'inventoryAdjustment';
  if (/^经营性应收项目的[（(]?(?:减少|增加)/.test(label)) return 'receivablesAdjustment';
  if (/^经营性应付项目的[（(]?(?:增加|减少)/.test(label)) return 'payablesAdjustment';
  return null;
}
function findUnit(text: string): 'yuan' | 'qian' | 'wan' | 'yi' | null {
  const matches = [
    ...text.matchAll(/(?:金额)?单位(?:[：:]|为)\s*(?:人民币)?\s*(千元|万元|亿元|元)/g),
  ];
  const unit = matches.at(-1)?.[1];
  return unit
    ? ({ 元: 'yuan', 千元: 'qian', 万元: 'wan', 亿元: 'yi' } as const)[
        unit as '元' | '千元' | '万元' | '亿元'
      ]
    : null;
}
function sourceCurrency(text: string): string {
  if (/币种[：:]?\s*美元|单位[：:]\s*美元/.test(text)) return 'USD';
  return /人民币|RMB/.test(text) ? 'CNY' : 'XXX';
}
function tableColumns(text: string, year: number): boolean | null {
  const lines = text.split('\n').map(compact);
  for (let index = lines.length - 1; index >= 0; index--) {
    let line = lines[index]!;
    if (
      /^20\d{2}(?:年度|年)?$/.test(line) &&
      index > 0 &&
      /^20\d{2}(?:年度|年)?$/.test(lines[index - 1]!)
    )
      line = lines[index - 1]! + line;
    if (/^(?:项目(?:附注|行次)?|附注|行次|补充资料)?(?:20\d{2}(?:年度|年)?){2}$/.test(line)) {
      const years = [...line.matchAll(/20\d{2}/g)].map((match) => Number(match[0]));
      return years[0] === year && years[1] === year - 1;
    }
    if (
      /^(?:项目|附注|行次|补充资料)?(?:本期(?:金额|发生额)|本年(?:金额|发生额))(?:上期(?:金额|发生额)|上年(?:金额|发生额))$/.test(
        line
      )
    )
      return true;
  }
  return null;
}
function matchesCoverYear(pages: CompanyPdfPage[], year: number): boolean {
  return pages
    .filter((page) => page.page <= 5)
    .some((page) => {
      const lines = page.text.split('\n').map(compact);
      return (
        new RegExp(`${year}(?:年)?年度报告`).test(lines.join('')) ||
        lines.some(
          (line, index) =>
            line === '年度报告' &&
            [lines[index - 1], lines[index + 1]].some(
              (value) => value === `${year}` || value === `${year}年`
            )
        )
      );
    });
}
function supplementHeader(text: string): string {
  const lines = text.split('\n').slice(-10);
  let unitIndex = -1;
  for (let index = 0; index < lines.length; index++)
    if (findUnit(lines[index]!) !== null) unitIndex = index;
  if (unitIndex < 0) return '';
  if (
    !lines.slice(Math.max(0, unitIndex - 4), unitIndex).some((line) => {
      const value = compact(line);
      return (
        cashHeader.test(value) ||
        /^(?:20\d{2}年度)?财务报表附注(?:[（(]续[）)]|[-—]续)?$/.test(value)
      );
    })
  )
    return '';
  const trailing = lines.slice(unitIndex + 1).map(compact);
  if (
    trailing.some(
      (line) =>
        !cashHeader.test(line) &&
        !/^(?:项目|附注|行次|补充资料|本期金额|上期金额|本年金额|上年金额|本期发生额|上期发生额|本年发生额|上年发生额|20\d{2}(?:年度|年)?|\d+)*$/.test(
          line
        )
    )
  )
    return '';
  return lines.slice(unitIndex).join('\n');
}

export function candidateCompanyName(pages: CompanyPdfPage[]): string | null {
  const matches = pages.slice(0, 4).flatMap((page) =>
    page.text.split('\n').flatMap((line) => {
      const value = compact(line).match(
        /^[\u3400-\u9fffA-Za-z0-9（）()·&]{2,100}(?:股份有限公司|有限责任公司|有限公司)/
      )?.[0];
      return value ? [value] : [];
    })
  );
  return [...new Set(matches)][0] || null;
}

/** Issuer codes come only from same-page basic-information labels or explicitly aligned A-share rows. */
export function issuerCodeEvidence(
  pages: CompanyPdfPage[],
  exchange: CompanyIdentity['exchange']
): { code: string; page: number; quote: string }[] {
  if (exchange === 'us') return [];
  const evidence: { code: string; page: number; quote: string }[] = [];
  const exchangeNames: Partial<Record<CompanyIdentity['exchange'], readonly string[]>> = {
    sse: ['上海证券交易所', '上交所'],
    szse: ['深圳证券交易所', '深交所'],
    bse: ['北京证券交易所', '北交所'],
  };
  const marketNames = exchangeNames[exchange] || [];
  const exchangeLabel = marketNames[0] || '';
  const cells = (line: string) =>
    line.includes('\t')
      ? line.split(/\t+/).map(compact)
      : line
          .trim()
          .split(/\s{2,}/)
          .map(compact);
  for (const page of pages.slice(0, 15)) {
    if (!Number.isInteger(page.page) || page.page < 1 || page.page > 15) continue;
    const lines = page.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const line = compact(lines[index]!);
      for (const match of line.matchAll(
        /(?:股票|证券)(?:代码|代号)[：:]?(?:A股)?[：:]?(\d{6})(?!\d)/g
      )) {
        const before = line.slice(0, match.index);
        const after = line.slice(match.index! + match[0].length);
        if (
          /(?:^|[;；：:])[（(]?[HB]股[）)]?$/.test(before) ||
          /^(?:[（(][HB]股[）)]|[HB]股)/.test(after)
        )
          continue;
        evidence.push({ code: match[1]!, page: page.page, quote: lines[index]! });
      }
      if (page.page <= 5 && /年度报告/.test(compact(page.text)) && /公司简称[：:]/.test(line)) {
        const code = line.match(/公司代码[：:](\d{6})(?!\d)/)?.[1];
        if (code) evidence.push({ code, page: page.page, quote: lines[index]! });
      }
      const header = cells(lines[index]!);
      if (
        header[0] === '股票种类' &&
        header.length >= 2 &&
        header.length <= 4 &&
        exchangeLabel &&
        lines
          .slice(Math.max(0, index - 30), index)
          .some((value) => /^(?:公司)?股票(?:简况)?$/.test(compact(value)))
      ) {
        const rows = lines.slice(index, index + 4).map(cells);
        if (
          rows.length === 4 &&
          rows.every(
            (row, offset) =>
              row.length === header.length &&
              row[0] === ['股票种类', '股票上市交易所', '股票简称', '股票代码'][offset]
          )
        ) {
          for (let column = 1; column < header.length; column++) {
            if (
              rows[0]![column] === 'A股' &&
              marketNames.includes(rows[1]![column]!) &&
              /^\d{6}$/.test(rows[3]![column]!)
            )
              evidence.push({
                code: rows[3]![column]!,
                page: page.page,
                quote: lines.slice(index, index + 4).join('\n'),
              });
          }
        }
      }
      const labels = new Set([
        '股票种类',
        '股票上市交易所',
        '股票简称',
        '股票代码',
        '变更前股票简称',
      ]);
      if (
        !exchangeLabel ||
        header.length < 4 ||
        header.length > 5 ||
        new Set(header).size !== header.length ||
        header.some((label) => !labels.has(label))
      )
        continue;
      const type = header.indexOf('股票种类'),
        market = header.indexOf('股票上市交易所'),
        code = header.indexOf('股票代码');
      if (type < 0 || market < 0 || code < 0 || !header.includes('股票简称')) continue;
      if (
        !lines
          .slice(Math.max(0, index - 3), index)
          .some((value) =>
            /^(?:[一二三四五六七八九十\d]+[、.．])?(?:公司)?股票简况$/.test(compact(value))
          )
      )
        continue;
      // Never join pages, infer missing cells, or scan unrelated later rows for a matching number.
      for (let rowIndex = index + 1; rowIndex < Math.min(lines.length, index + 5); rowIndex++) {
        const row = cells(lines[rowIndex]!);
        const trailingBlank =
          header.at(-1) === '变更前股票简称' && row.length === header.length - 1;
        if (row.length !== header.length && !trailingBlank) break;
        if (row[type] !== 'A股' || row[market] !== exchangeLabel || !/^\d{6}$/.test(row[code]!))
          continue;
        evidence.push({
          code: row[code]!,
          page: page.page,
          quote: `${lines[index]}\n${lines[rowIndex]}`,
        });
      }
    }
  }
  return evidence;
}

/** Only explicit table boundaries, column headers and source units produce candidates. */
export function extractFinancialCandidates(
  identity: CompanyIdentity,
  announcement: CompanyAnnouncement,
  pdf: CompanyPdfText,
  year: number,
  selectedPages?: number[],
  strategy?: 'supplement' | 'statements'
): CompanyCandidatePreview {
  const warnings = [
    '自动提取是候选预览；来源可追溯不等于业务真实性已认证，采用前须核对主体、期间、单位与合并口径。',
  ];
  const company = candidateCompanyName(pdf.pages) || identity.companyName || identity.shortName;
  const coverYear = matchesCoverYear(pdf.pages, year) && announcement.reportYear === year;
  if (!coverYear) warnings.push('官方标题与原件封面年度尚未同时确认，未采用表格金额。');
  const issuerPages = pdf.pages.slice(0, 15);
  const issuerEvidence = issuerCodeEvidence(issuerPages, identity.exchange);
  const issuerCodes = issuerEvidence.map((item) => item.code);
  const issuerMatches = issuerCodes.includes(identity.securityCode);
  if (!issuerMatches)
    warnings.push(
      '官方代码与原件基本信息中的证券代码尚未同时匹配，未采用金额；不能凭相似名称换主体。'
    );
  const reportCurrency =
    /(?:人民币(?:元|千元|万元)|(?:记账本位币|编报货币)[\s\S]{0,40}人民币|以人民币为记账本位币)/.test(
      pdf.pages.map((page) => page.text).join('\n')
    )
      ? 'CNY'
      : 'XXX';
  const declarations = pdf.pages.flatMap((page) =>
    page.text.split('\n').flatMap((line) => {
      const match = compact(line).match(
        /本财务报表[^。]{0,80}人民币[^。]{0,80}除[^。]{0,30}特别(?:说明|注明)[^。]{0,30}均以人民币(千元|万元|亿元|元)为单位/
      );
      return match
        ? [
            {
              page: page.page,
              quote: line,
              unit: ({ 元: 'yuan', 千元: 'qian', 万元: 'wan', 亿元: 'yi' } as const)[
                match[1] as '元' | '千元' | '万元' | '亿元'
              ],
            },
          ]
        : [];
    })
  );
  const declaredUnit =
    new Set(declarations.map((item) => item.unit)).size === 1 ? declarations[0] : undefined;
  const observations: Observation[] = [];
  const excerpts: Material['excerpts'] = [];
  const used = new Set<string>();
  const allowed = selectedPages ? new Set(selectedPages) : null;
  let scope: Observation['scope'] = 'unknown';
  let recent = '';
  let table: {
    kind: 'profit' | 'cash' | 'supplement';
    scope: Observation['scope'];
    unit: ReturnType<typeof findUnit>;
    currency: string;
    columns: boolean;
    header: string;
    rows: { label: string; values: (string | null)[]; page: number; quote: string }[];
    label: string;
    closed: boolean;
    incomplete: boolean;
  } | null = null;
  const add = (
    row: { label: string; values: (string | null)[]; page: number; quote: string },
    key: MetricKey,
    column: number,
    unit: NonNullable<ReturnType<typeof findUnit>>,
    currency: string,
    statementScope: Observation['scope']
  ) => {
    if (allowed && !allowed.has(row.page)) return;
    if (row.values[column] === null) return;
    const raw = row.values[column];
    if (raw === undefined) return;
    let value = raw,
      normalizedUnit: MoneyUnit = unit === 'qian' ? 'yuan' : unit;
    try {
      if (unit === 'qian') value = fenToYuan(moneyToFen(raw, 'yuan') * 1000n);
      else moneyToFen(raw, normalizedUnit);
    } catch {
      warnings.push(`第${row.page}页金额精度或格式无法确认，未采用该行。`);
      return;
    }
    const idKey = `${key}|${year - column}|${statementScope}|${value}|${normalizedUnit}`;
    if (used.has(idKey)) return;
    used.add(idKey);
    observations.push({
      id: `cninfo-${identity.securityCode}-${announcement.id}-${key}-${year - column}-${observations.length}`,
      key,
      year: year - column,
      period: 'annual',
      value,
      unit: normalizedUnit,
      currency,
      scope: statementScope,
      page: row.page,
      quote: `${row.quote.slice(0, 1050)}；第${column + 1}列${year - column}年度；原表单位${{ yuan: '元', qian: '千元', wan: '万元', yi: '亿元' }[unit]}${unit === 'qian' ? '，按千元×1000转换为元' : ''}`,
      kind: 'reported',
    });
  };
  const finish = () => {
    if (!table) return;
    const current = table;
    table = null;
    if (
      (strategy === 'supplement' && current.kind !== 'supplement') ||
      (strategy === 'statements' && current.kind === 'supplement')
    )
      return;
    if (!coverYear || !issuerMatches || !current.columns || !current.unit) return;
    const total = current.rows.find((row) => metricFor(row.label) === 'operatingCashFlow');
    for (const row of current.rows) {
      const key = metricFor(row.label);
      if (!key) continue;
      if (
        (current.kind === 'profit' && key !== 'netProfit') ||
        (current.kind === 'cash' && key !== 'operatingCashFlow')
      )
        continue;
      for (let column = 0; column < 2; column++)
        add(row, key, column, current.unit, current.currency, current.scope);
    }
    if (
      current.kind !== 'supplement' ||
      !current.closed ||
      !total ||
      current.scope !== 'consolidated' ||
      current.currency !== 'CNY'
    )
      return;
    const other = current.rows.filter((row) => !metricFor(row.label));
    if (current.incomplete || !other.length || other.some((row) => row.values.length !== 2)) {
      warnings.push('其余调整行不完整，没有以现金桥残差代替原始分组。');
      return;
    }
    for (let column = 0; column < 2; column++) {
      if (other.some((row) => row.values[column] === null)) {
        warnings.push(
          `${year - column}年其余调整行含空白单元格，未当作零或用现金桥残差补数；另一年度的已披露金额单独保留。`
        );
        continue;
      }
      const components = other.map((row) => ({
        label: row.label.slice(0, 200),
        value: fenToYuan(
          moneyToFen(row.values[column]!, current.unit === 'qian' ? 'yuan' : current.unit!) *
            (current.unit === 'qian' ? 1000n : 1n)
        ),
        page: row.page,
        quote: `${row.quote.slice(0, 1000)}；原表单位${current.unit === 'qian' ? '千元' : current.unit}`,
      }));
      if (allowed && components.some((row) => !allowed.has(row.page!))) continue;
      const value = fenToYuan(
        components.reduce((sum, row) => sum + moneyToFen(row.value, 'yuan'), 0n)
      );
      const idKey = `otherAdjustments|${year - column}|consolidated|${value}|yuan`;
      if (used.has(idKey)) continue;
      used.add(idKey);
      observations.push({
        id: `cninfo-${identity.securityCode}-${announcement.id}-other-${year - column}`,
        key: 'otherAdjustments',
        year: year - column,
        period: 'annual',
        value,
        unit: 'yuan',
        currency: 'CNY',
        scope: 'consolidated',
        page: components[0]!.page,
        quote: '原表中除存货、经营性应收及经营性应付以外的已提取调整行逐项求和；不是现金桥残差。',
        kind: 'derived',
        components,
      });
    }
  };
  for (const page of pdf.pages) {
    const lines = page.text.split('\n');
    const pageUnit = lines
      .slice(0, 6)
      .some((line) => /^财务报表附注(?:[（(]续[）)]|[-—]续)?$/.test(compact(line)))
      ? lines
          .slice(0, 6)
          .map(
            (line) => compact(line).match(new RegExp(`^${year}年度人民币(千元|万元|亿元|元)$`))?.[1]
          )
          .filter(Boolean)
          .map(
            (unit) =>
              (({ 元: 'yuan', 千元: 'qian', 万元: 'wan', 亿元: 'yi' }) as const)[
                unit as '元' | '千元' | '万元' | '亿元'
              ]
          )[0] || null
      : null;
    for (const [lineIndex, line] of lines.entries()) {
      const text = compact(line);
      if (
        /(?:20\d{2})(?:年)?年度报告/.test(text) ||
        ((lineIndex < 5 || lineIndex >= lines.length - 3) &&
          /^(?:\d+(?:\/\d+)?|[-—]\d+[-—])$/.test(text))
      )
        continue;
      const previous = recent;
      recent = `${recent}\n${line}`.slice(-3500);
      if (
        /^(?:[一二三四五六七八九十\d、.．]*)?(?:(?:母公司|公司)(?:财务报表|资产负债表|利润表|现金流量表))/.test(
          text
        )
      ) {
        if (
          table?.kind === 'supplement' &&
          scope === 'parent' &&
          /(?:[（(]续[）)]|[-—]续)$/.test(text)
        )
          continue;
        finish();
        scope = 'parent';
      }
      if (
        /^(?:[一二三四五六七八九十\d、.．]*)?(?:合并(?:财务报表|资产负债表|利润表|现金流量表))/.test(
          text
        )
      ) {
        if (
          table?.kind === 'supplement' &&
          scope === 'consolidated' &&
          /(?:[（(]续[）)]|[-—]续)$/.test(text)
        )
          continue;
        finish();
        scope = 'consolidated';
      }
      const kind = /将净利润调节为经营活动(?:的)?现金流量/.test(text)
        ? 'supplement'
        : /^(?:[一二三四五六七八九十\d、.．]*)?合并利润表/.test(text)
          ? 'profit'
          : /^(?:[一二三四五六七八九十\d、.．]*)?合并现金流量表/.test(text)
            ? 'cash'
            : null;
      if (kind) {
        finish();
        const context = kind === 'supplement' ? supplementHeader(previous) : '';
        table = {
          kind,
          scope,
          unit:
            findUnit(context) ||
            (kind === 'supplement' ? pageUnit || declaredUnit?.unit || null : null),
          currency: sourceCurrency(context) === 'XXX' ? reportCurrency : sourceCurrency(context),
          columns: tableColumns(context, year) === true,
          header: context,
          rows: [],
          label: '',
          closed: false,
          incomplete: false,
        };
        if (excerpts.length < 30)
          excerpts.push({
            page: page.page,
            text: `${context.slice(-900)}\n${page.text.slice(0, 2000)}`.slice(0, 4000),
          });
        if (
          kind === 'supplement' &&
          !findUnit(context) &&
          declaredUnit &&
          !pageUnit &&
          !excerpts.some((item) => item.page === declaredUnit.page)
        )
          excerpts.push({ page: declaredUnit.page, text: declaredUnit.quote });
        continue;
      }
      if (!table) continue;
      if (
        text === compact(company) ||
        text === `${year}年度财务报表附注` ||
        text === `${year}年度财务报表附注(续)` ||
        text === `${year}年度财务报表附注（续）` ||
        cashHeader.test(text)
      )
        continue;
      const newUnit = findUnit(line);
      if (newUnit) {
        if (table.rows.length && table.unit && newUnit !== table.unit) {
          warnings.push('本表金额行后出现不同单位，暂停该表；未把新单位套到先前金额。');
          table.incomplete = true;
          table.unit = null;
          finish();
          continue;
        }
        table.unit = newUnit;
        if (sourceCurrency(line) !== 'XXX') table.currency = sourceCurrency(line);
        if (!/\d/.test(line)) continue;
      }
      table.header = `${table.header}\n${line}`.slice(-500);
      const columns = tableColumns(table.header, year);
      if (columns !== null) {
        table.columns = columns;
        if (!columns && !warnings.some((warning) => warning.includes('列顺序')))
          warnings.push(
            '本表显式年度列顺序与当前/上年不一致，暂停该表金额提取；未借用封面或其他表的年度。'
          );
      }
      if (!table.columns) continue;
      if (tableColumns(line, year) !== null || /^20\d{2}(?:年度|年)?$/.test(text)) continue;
      if (/^2[.．、]/.test(text) && table.kind === 'supplement') {
        finish();
        continue;
      }
      if (
        !text ||
        /^--|^\d+$|年度报告|^项目|^单位|^本期|^上期|^本年|^上年|^[（(]经重述[）)]$/.test(text)
      )
        continue;
      let values: (string | null)[] = [...line.matchAll(amounts)].map((match) => numeric(match[0]));
      const label = compact(line.replace(amounts, ''));
      const cellRow = (page.tables || [])
        .flat()
        .find((row) => compact(row[0]!) === `${table!.label}${label}`);
      if (!values.length) {
        if (cellRow && cellRow.slice(1).every((cell) => !cell.trim())) {
          table.label = '';
          continue;
        }
        table.label = `${table.label}${label}`.slice(0, 600);
        continue;
      }
      if (values.length === 1 && cellRow) {
        const aligned = cellRow.slice(1).map((cell) => {
          if (!cell.trim()) return null;
          const matches = [...cell.matchAll(amounts)];
          return matches.length === 1 && !cell.replace(amounts, '').trim()
            ? numeric(matches[0]![0])
            : undefined;
        });
        if (
          !aligned.includes(undefined) &&
          aligned.filter((value) => value !== null).length === 1 &&
          aligned.includes(values[0])
        )
          values = aligned as (string | null)[];
      }
      if (values.length !== 2) {
        table.incomplete = true;
        table.label = '';
        continue;
      }
      const row = {
        label: `${table.label}${label}`,
        values,
        page: page.page,
        quote: `${table.label ? `${table.label}\n` : ''}${line.trim()}`,
      };
      table.label = '';
      if (table.kind !== 'supplement' && !metricFor(row.label)) continue;
      table.rows.push(row);
      if (metricFor(row.label) === 'operatingCashFlow' && table.kind === 'supplement') {
        table.closed = true;
        finish();
        continue;
      }
      if (table.rows.length > 100) {
        warnings.push('表格行数超过预算，停止本表分组提取。');
        finish();
      }
    }
  }
  finish();
  if (!observations.length)
    warnings.push(
      '未找到同时确认年度、列顺序、单位与表格边界的金额；请补充合并财务表或手工核对字段。'
    );
  if (observations.some((row) => row.scope === 'unknown' || row.currency === 'XXX'))
    warnings.push('部分观测的合并范围或币种待确认；规则不会把未知当作已核实。');
  const filtered = observations.filter((row) => row.scope !== 'parent');
  if (filtered.length !== observations.length)
    warnings.push('母公司独立表已识别并排除，不与合并表混用。');
  const material = validateMaterial({
    company,
    shortName: identity.shortName,
    title: announcement.title,
    filename: `${identity.securityCode}-${year}-${announcement.id}.pdf`,
    origin: 'public-report',
    documentDate: shanghaiDate(announcement.publishedAt),
    sourceUrl: announcement.sourceUrl,
    sha256: pdf.sha256,
    observations: filtered.slice(0, 100),
    notes: warnings,
    excerpts,
  });
  const report = analyze({ title: '公开财报候选核验', company, year, materialIds: ['candidate'] }, [
    { ...material, id: 'candidate', createdAt: new Date().toISOString() },
  ]);
  report.checks.push({
    id: 'source-issuer-code',
    label: '披露主体代码核对',
    status: issuerMatches ? 'pass' : 'fail',
    message: issuerMatches
      ? '官方公告主体代码与原件基本信息一致；不证明合同相对方相同。'
      : '原件基本信息未匹配所选主体代码；金额未采用。',
    sourceRefs: issuerEvidence
      .filter((item) => item.code === identity.securityCode)
      .slice(0, 2)
      .map((item) => ({
        materialId: 'candidate',
        page: item.page,
        quote: item.quote,
        sourceUrl: announcement.sourceUrl,
      })),
  });
  appendSourceRowChecks(material, year, report.checks);
  return {
    material,
    reviewRequired: true,
    warnings,
    tablePages: [
      ...new Set(filtered.map((row) => row.page).filter((page): page is number => page !== null)),
    ].sort((a, b) => a - b),
    checks: report.checks,
  };
}

function appendSourceRowChecks(
  material: Omit<Material, 'id' | 'createdAt'>,
  year: number,
  checks: Check[]
): void {
  for (const period of [year, year - 1]) {
    const keys: MetricKey[] = [
      'netProfit',
      'inventoryAdjustment',
      'receivablesAdjustment',
      'payablesAdjustment',
      'otherAdjustments',
      'operatingCashFlow',
    ];
    const rows = keys.map((key) =>
      material.observations.filter(
        (row) =>
          row.key === key &&
          row.year === period &&
          row.scope === 'consolidated' &&
          row.currency === 'CNY'
      )
    );
    if (
      rows.some(
        (values) =>
          !values.length ||
          new Set(values.map((row) => moneyToFen(row.value, row.unit).toString())).size !== 1
      )
    )
      continue;
    const selected = rows.map((values) => values[0]!);
    const difference =
      selected.slice(0, 5).reduce((sum, row) => sum + moneyToFen(row.value, row.unit), 0n) -
      moneyToFen(selected[5]!.value, selected[5]!.unit);
    const thousand = selected.some((row) => row.quote.includes('原表单位千元'));
    checks.push({
      id: `source-row-reconciliation-${period}`,
      label: '原始财务行逐项加总',
      status: difference === 0n ? 'pass' : 'fail',
      message:
        difference === 0n
          ? `${period}年度原始行求和与披露经营现金净额精确一致。`
          : `${period}年度原始行求和与披露经营现金净额相差${fenToYuan(difference < 0n ? -difference : difference)}元（${difference < 0n ? -difference : difference}分）。${thousand ? '原表以千元列示，差异可能与列示精度有关，但原因未经核查。' : ''}保留原始金额，不以残差更改字段。`,
      sourceRefs: selected.map((row) => ({
        materialId: 'candidate',
        page: row.page,
        quote: row.quote,
        sourceUrl: material.sourceUrl,
      })),
    });
  }
}

export async function verifiedFixturePreview(
  root: string,
  identity: CompanyIdentity,
  announcement: CompanyAnnouncement,
  pdf: CompanyPdfText,
  year: number
): Promise<CompanyCandidatePreview | null> {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'data/source-manifest.json'), 'utf8')
  ) as {
    sources: { id: string; securityCode: string; sha256: string; url: string; pdfPages: number }[];
  };
  const match = manifest.sources.find(
    (source) =>
      ['songyuan-2025', 'hikvision-2025'].includes(source.id) &&
      source.securityCode === identity.securityCode &&
      source.sha256 === pdf.sha256 &&
      source.url === announcement.sourceUrl &&
      source.pdfPages === pdf.total &&
      year === 2025 &&
      announcement.reportYear === 2025
  );
  if (!match) return null;
  const fixture = validateMaterial(
    JSON.parse(await readFile(path.join(root, 'data/cases', `${match.id}.json`), 'utf8'))
  );
  const material = validateMaterial({
    ...fixture,
    filename: `${identity.securityCode}-${year}-${announcement.id}.pdf`,
    title: announcement.title,
    documentDate: shanghaiDate(announcement.publishedAt),
    rawSourceId: undefined,
    managementExplanation: undefined,
    notes: [
      '本次实际下载原件的SHA-256、URL及页数与逐页审查的公开样本完全匹配；重用已核对的金额与原始分组行。',
      '样本原件核对不等于企业经营或承诺安全，采用仍需确认。',
    ],
  });
  const report = analyze(
    { title: '公开原件候选核验', company: material.company, year, materialIds: ['candidate'] },
    [{ ...material, id: 'candidate', createdAt: new Date().toISOString() }]
  );
  appendSourceRowChecks(material, year, report.checks);
  return {
    material,
    reviewRequired: true,
    warnings: [...material.notes],
    tablePages: [
      ...new Set(
        material.observations.map((row) => row.page).filter((page): page is number => page !== null)
      ),
    ].sort((a, b) => a - b),
    checks: report.checks,
  };
}
