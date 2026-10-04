import { aboutDocument } from '../src/content/about.js';
import { copyrightDocument } from '../src/content/copyright.js';
import { guideDocument } from '../src/content/guide.js';
import { privacyDocument } from '../src/content/privacy.js';
import { termsDocument } from '../src/content/terms.js';
import { documentMetadata, type DocumentPath } from '../src/content/document-navigation.js';
import type { BilingualText, DocumentSection, ProductDocument } from '../src/content/document.js';

export interface ProductKnowledgeRecord {
  id: string;
  title: string;
  text: string;
  url: string;
}

export type KnowledgeLocale = 'zh' | 'en';

export interface ProductKnowledgeSearchOptions {
  /** General document answers retain the existing introductory fallback by default. */
  fallback?: boolean;
  /** Keep complete sections and return no more than the six-section answer budget. */
  limit?: number;
}
type IndexedRecord = {
  record: ProductKnowledgeRecord;
  titleTerms: Set<string>;
  bodyTerms: Set<string>;
};

const documents: readonly { path: DocumentPath; document: ProductDocument }[] = [
  { path: '/docs/about', document: aboutDocument },
  { path: '/docs/guide', document: guideDocument },
  { path: '/docs/privacy', document: privacyDocument },
  { path: '/docs/terms', document: termsDocument },
  { path: '/docs/copyright', document: copyrightDocument },
];

const englishStopWords = new Set(
  'a an and are as at be by can could did do does for from had have how i in is it me my of on or our please that the their there these they this to us was we were what when where which who why will with would you your'.split(
    ' '
  )
);
const chineseStopWords = new Set([
  '什么',
  '如何',
  '可以',
  '是否',
  '哪个',
  '怎么',
  '这个',
  '你们',
  '我的',
  '我们',
  '请问',
  '一下',
]);

function localized(value: BilingualText, locale: KnowledgeLocale): string {
  return value[locale === 'en' ? 1 : 0];
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** Chinese overlapping terms work without a dictionary; English uses word boundaries. */
function terms(value: string): Set<string> {
  const result = new Set<string>();
  for (const run of normalized(value).match(/[\p{Script=Han}]+|[\p{Script=Latin}\p{N}]+/gu) || []) {
    if (/^\p{Script=Han}+$/u.test(run)) {
      const characters = Array.from(run);
      if (characters.length === 1) result.add(run);
      for (let index = 0; index < characters.length - 1; index++) {
        const term = characters.slice(index, index + 2).join('');
        if (!chineseStopWords.has(term)) result.add(term);
      }
    } else if (!englishStopWords.has(run)) {
      result.add(run);
      // Retain the original word and a small shared stem for train/training, delete/deleted, etc.
      if (/^[a-z]{5,}$/.test(run)) {
        const stem = run.replace(/(?:ing|ed|s)$/, '');
        if (stem.length >= 3 && stem !== run) result.add(stem);
      }
    }
  }
  return result;
}

function sectionText(section: DocumentSection, locale: KnowledgeLocale): string[] {
  const content = [
    ...(section.paragraphs || []).map((paragraph) => localized(paragraph, locale)),
    ...(section.bullets || []).map((bullet) => `- ${localized(bullet, locale)}`),
  ];
  if (section.table) {
    content.push(section.table.columns.map((column) => localized(column, locale)).join(' | '));
    content.push(
      ...section.table.rows.map((row) => row.map((cell) => localized(cell, locale)).join(' | '))
    );
  }
  content.push(
    ...(section.links || []).map((link) => `${localized(link.label, locale)}: ${link.href}`)
  );
  return content;
}

function versionText(
  document: Pick<ProductDocument, 'version' | 'updatedAt'>,
  locale: KnowledgeLocale
) {
  return locale === 'en'
    ? `Version: ${document.version} · Updated: ${document.updatedAt}`
    : `版本：${document.version} · 更新日期：${document.updatedAt}`;
}

/** The source documents own every policy statement; this projection never rewrites them. */
function buildRecords(locale: KnowledgeLocale): ProductKnowledgeRecord[] {
  const records = documents.flatMap(({ path, document }) =>
    document.sections.map((section) => {
      const title = `${localized(document.title, locale)} · ${localized(section.title, locale)}`;
      return {
        id: `${path.slice('/docs/'.length)}:${section.id}`,
        title,
        text: [title, versionText(document, locale), ...sectionText(section, locale)].join('\n\n'),
        url: `${path}#${section.id}`,
      };
    })
  );
  // Methodology is a React page: only its canonical navigation summary is indexed here.
  const methodology = documentMetadata['/docs/methodology'];
  records.push({
    id: 'methodology',
    title: localized(methodology.title, locale),
    text: [
      localized(methodology.title, locale),
      versionText(methodology, locale),
      localized(methodology.description, locale),
    ].join('\n\n'),
    url: '/docs/methodology',
  });
  return records;
}

function buildIndex(locale: KnowledgeLocale) {
  const records: IndexedRecord[] = buildRecords(locale).map((record) => ({
    record,
    titleTerms: terms(record.title),
    bodyTerms: terms(record.text),
  }));
  const frequency = new Map<string, number>();
  for (const { bodyTerms } of records)
    for (const term of bodyTerms) frequency.set(term, (frequency.get(term) || 0) + 1);
  return { records, frequency };
}

const indexes = { zh: buildIndex('zh'), en: buildIndex('en') };

/** Matching hints select actual chapters; they do not supply answer or policy text. */
function topicBoost(question: string, url: string): number {
  let score = 0;
  const productContext =
    /析光|prispect|网站|平台|产品|你们|服务|协议|\b(?:you|your|website|site|platform|product|service|terms)\b/u.test(
      question
    );
  if (
    productContext &&
    /(?:谁|哪个团队|哪家(?:公司|机构)).{0,12}(?:运营|负责)|(?:运营|负责).{0,12}(?:谁|哪个团队|哪家(?:公司|机构))|who.{0,25}(?:operat|runs?|responsible)|(?:operat|runs?|responsible).{0,25}who/u.test(
      question
    ) &&
    !/退款|签约|收款主体|refund|contracting|payee/u.test(question)
  ) {
    if (url === '/docs/about#product') score += 36;
    if (url === '/docs/privacy#scope') score += 24;
  }
  if (
    productContext &&
    /依法|法定|免除|免责|赔偿|法律|legal|lawful|statutory|liabil/u.test(question) &&
    url === '/docs/terms#responsibility'
  )
    score += 30;
  if (
    /你是(?:谁|什么)|你叫什么|(?:析光|prispect|这个网站|这是什么网站).{0,12}(?:是什么|介绍|做什么|用途)|who are you|what is (?:prispect|this (?:site|website|product))|about prispect/u.test(
      question
    ) &&
    url === '/docs/about#product'
  )
    score += 24;
  if (
    /训练|外发|对外|发给|传给|模型|tokenflux|\btrain(?:ing)?\b|external processing|(?:send|sent|sharing).{0,30}(?:ai|model)|(?:ai|model).{0,30}(?:send|sent|sharing)/u.test(
      question
    ) &&
    url === '/docs/privacy#ai'
  )
    score += 18;
  if (
    /保存多久|保存期限|保留|删除|清空|备份|24\s*小时|retention|retain|how long|delet|backup|clear.{0,20}workspace/u.test(
      question
    ) &&
    url === '/docs/privacy#retention'
  )
    score += 18;
  if (
    /注销|账号删除|删除账号|更正|data requests?|data rights|(?:close|delet\w*).{0,20}account/u.test(
      question
    ) &&
    url === '/docs/privacy#rights'
  )
    score += 18;
  if (/联系|负责人|邮箱|contact|e-?mail/u.test(question)) {
    const copyright = /版权|copyright/u.test(question);
    if (url === (copyright ? '/docs/copyright#copyright-requests' : '/docs/privacy#scope'))
      score += 18;
  }
  if (/核查方法|方法论|methodology/u.test(question) && url === '/docs/methodology') score += 18;
  if (
    /收集|采集|collec/u.test(question) &&
    /隐私|个人|数据|privacy|personal|data/u.test(question) &&
    url === '/docs/privacy#collection'
  )
    score += 18;
  if (
    /怎么用|如何使用|如何开始|使用指南|how.{0,20}(?:use|start)|getting started|user guide/u.test(
      question
    ) &&
    url === '/docs/guide#start'
  )
    score += 18;
  if (
    /上传|导入|upload|import/u.test(question) &&
    /如何|怎么|怎样|格式|文件|how|where|format|file/u.test(question) &&
    url === '/docs/guide#import'
  )
    score += 18;
  return score;
}

/** Detached public records are also available for coverage checks or local documentation help. */
export function getProductKnowledgeRecords(locale: KnowledgeLocale): ProductKnowledgeRecord[] {
  return indexes[locale].records.map(({ record }) => ({ ...record }));
}

export function searchProductKnowledge(
  question: string,
  locale: KnowledgeLocale,
  options: ProductKnowledgeSearchOptions = {}
): ProductKnowledgeRecord[] {
  const query = normalized(question.slice(0, 2000)).trim();
  const queryTerms = terms(query);
  const { records, frequency } = indexes[locale];
  const ranked = records
    .map(({ record, titleTerms, bodyTerms }, order) => {
      let score = topicBoost(query, record.url);
      for (const term of queryTerms) {
        const weight = Math.log(1 + records.length / (1 + (frequency.get(term) || 0)));
        if (titleTerms.has(term)) score += weight * 4;
        else if (bodyTerms.has(term)) score += weight;
      }
      return { record, order, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const limit = Number.isFinite(options.limit)
    ? Math.max(0, Math.min(6, Math.floor(options.limit!)))
    : 6;
  const matches = ranked.length
    ? ranked.map(({ record }) => record)
    : options.fallback === false
      ? []
      : records
          .filter(({ record }) => ['/docs/about#product', '/docs/guide#start'].includes(record.url))
          .map(({ record }) => record);
  // Preserve entire sections, especially privacy qualifications and table relationships.
  return matches.slice(0, limit).map((record) => ({ ...record }));
}
