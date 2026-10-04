import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProductKnowledgeRecords,
  searchProductKnowledge,
  type ProductKnowledgeRecord,
} from '../server/product-knowledge.js';
import { aboutDocument } from '../src/content/about.js';
import { copyrightDocument } from '../src/content/copyright.js';
import { guideDocument } from '../src/content/guide.js';
import { privacyDocument } from '../src/content/privacy.js';
import { termsDocument } from '../src/content/terms.js';
import { documentMetadata } from '../src/content/document-navigation.js';
import type { BilingualText, DocumentSection, ProductDocument } from '../src/content/document.js';
import { searchProductKnowledge as sharedSearchProductKnowledge } from '../shared/product-knowledge.js';

type Locale = 'zh' | 'en';
const locales: Locale[] = ['zh', 'en'];
const documents: { path: string; document: ProductDocument }[] = [
  { path: '/docs/about', document: aboutDocument },
  { path: '/docs/guide', document: guideDocument },
  { path: '/docs/privacy', document: privacyDocument },
  { path: '/docs/terms', document: termsDocument },
  { path: '/docs/copyright', document: copyrightDocument },
];
const languageIndex = (locale: Locale) => (locale === 'zh' ? 0 : 1);
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();

test('server and browser share the same source index while local retrieval can omit fallback', () => {
  assert.equal(searchProductKnowledge, sharedSearchProductKnowledge);
  for (const locale of locales) {
    for (const question of ['', '   ', 'zxqv7319 lunar-flamingo fixture', '万科']) {
      assert.deepEqual(searchProductKnowledge(question, locale, { fallback: false }), []);
      assert.ok(searchProductKnowledge(question, locale).length > 0);
    }
    const question = locale === 'zh' ? 'AI 训练 数据 隐私' : 'AI training data privacy';
    const full = searchProductKnowledge(question, locale);
    const limited = searchProductKnowledge(question, locale, { fallback: false, limit: 3 });
    assert.deepEqual(limited, full.slice(0, 3));
    assert.ok(limited.length <= 3);
    assert.deepEqual(searchProductKnowledge(question, locale, { limit: 0 }), []);
    assert.ok(searchProductKnowledge(question, locale, { limit: 20 }).length <= 6);
    assert.deepEqual(searchProductKnowledge(question, locale, { limit: -1 }), []);
  }
});

function sectionContent(section: DocumentSection): BilingualText[] {
  return [
    ...(section.paragraphs ?? []),
    ...(section.bullets ?? []),
    ...(section.table?.columns ?? []),
    ...(section.table?.rows.flat() ?? []),
    ...(section.links?.map((link) => link.label) ?? []),
  ];
}

function assertSectionContent(
  record: ProductKnowledgeRecord,
  document: ProductDocument,
  section: DocumentSection,
  locale: Locale
) {
  const index = languageIndex(locale);
  const rendered = normalize(`${record.title}\n${record.text}`);
  for (const text of [document.title, section.title, ...sectionContent(section)]) {
    assert.ok(rendered.includes(normalize(text[index])), `${record.url} omits source text`);
  }
  for (const link of section.links ?? []) {
    assert.ok(record.text.includes(link.href), `${record.url} omits ${link.href}`);
  }
  assert.ok(record.text.includes(document.version), `${record.url} omits its document version`);
  assert.ok(record.text.includes(document.updatedAt), `${record.url} omits its update date`);
}

function findSection(id: string): DocumentSection {
  const section = privacyDocument.sections.find((entry) => entry.id === id);
  assert.ok(section, `The privacy source must contain ${id}`);
  return section;
}

function requireResult(question: string, locale: Locale, url: string): ProductKnowledgeRecord {
  const result = searchProductKnowledge(question, locale).find((record) => record.url === url);
  assert.ok(result, `${JSON.stringify(question)} must retrieve ${url}`);
  return result;
}

for (const locale of locales) {
  test(`${locale} knowledge preserves every real document section and its canonical source`, () => {
    const records = getProductKnowledgeRecords(locale);
    const expectedUrls = documents.flatMap(({ path, document }) =>
      document.sections.map((section) => `${path}#${section.id}`)
    );
    expectedUrls.push('/docs/methodology');
    assert.deepEqual(
      records.map((record) => record.url).sort(),
      expectedUrls.sort(),
      'The corpus must contain only the five documents and methodology navigation summary'
    );
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.ok(records.every((record) => record.id && record.title && record.text));

    for (const { path, document } of documents) {
      for (const section of document.sections) {
        const url = `${path}#${section.id}`;
        const record = records.find((entry) => entry.url === url);
        assert.ok(record, `Missing ${url}`);
        assertSectionContent(record, document, section, locale);
      }
    }
  });

  test(`${locale} records use the requested source language`, () => {
    const index = languageIndex(locale);
    const records = getProductKnowledgeRecords(locale);
    for (const { path, document } of documents) {
      for (const section of document.sections) {
        const record = records.find((entry) => entry.url === `${path}#${section.id}`)!;
        const rendered = normalize(`${record.title}\n${record.text}`);
        for (const text of [section.title, ...sectionContent(section)]) {
          if (text[index] !== text[1 - index] && text[1 - index].length > 12) {
            assert.ok(
              !rendered.includes(normalize(text[1 - index])),
              `${record.url} unexpectedly contains the other language`
            );
          }
        }
      }
    }
  });

  test(`${locale} methodology remains the real navigation summary`, () => {
    const index = languageIndex(locale);
    const metadata = documentMetadata['/docs/methodology'];
    const records = getProductKnowledgeRecords(locale).filter((record) =>
      record.url.startsWith('/docs/methodology')
    );
    assert.equal(records.length, 1);
    const [record] = records;
    assert.equal(record.url, '/docs/methodology');
    assert.ok(`${record.title}\n${record.text}`.includes(metadata.title[index]));
    assert.ok(record.text.includes(metadata.description[index]));
    assert.ok(record.text.includes(metadata.version));
    assert.ok(record.text.includes(metadata.updatedAt));
    const sourceLength = [
      metadata.title[index],
      metadata.description[index],
      metadata.version,
      metadata.updatedAt,
    ].join('\n').length;
    assert.ok(
      record.text.length <= sourceLength + 120,
      'Methodology must not acquire an invented body or extracted React content'
    );
  });
}

test('product identity questions retrieve the actual product description', () => {
  const section = aboutDocument.sections.find((entry) => entry.id === 'product')!;
  for (const question of ['你是谁？', '析光是什么？']) {
    const record = requireResult(question, 'zh', '/docs/about#product');
    assertSectionContent(record, aboutDocument, section, 'zh');
  }
  const record = requireResult('What is Prispect?', 'en', '/docs/about#product');
  assertSectionContent(record, aboutDocument, section, 'en');
});

test('operator questions prioritize the actual team identity rather than financial responsibilities', () => {
  const section = aboutDocument.sections.find((entry) => entry.id === 'product')!;
  const questions: { question: string; locale: Locale }[] = [
    { question: '析光是谁运营的？网站由谁负责？', locale: 'zh' },
    { question: '网站运营团队是谁？', locale: 'zh' },
    { question: 'Who operates Prispect and who is responsible for the website?', locale: 'en' },
  ];
  for (const { question, locale } of questions) {
    const results = searchProductKnowledge(question, locale);
    assert.equal(results[0].url, '/docs/about#product');
    assertSectionContent(results[0], aboutDocument, section, locale);
    const operatorStatement = section.paragraphs!.find((text) => text[0].includes('团队运营'))!;
    assert.ok(results[0].text.includes(operatorStatement[languageIndex(locale)]));
  }
  const financialResponsibilities = searchProductKnowledge('签约和收款退款由谁负责？', 'zh');
  assert.notEqual(financialResponsibilities[0].url, '/docs/about#product');
});

test('platform liability questions prioritize the full published statutory-rights qualifications', () => {
  const section = termsDocument.sections.find((entry) => entry.id === 'responsibility')!;
  const questions: { question: string; locale: Locale }[] = [
    {
      question: '析光是否承担依法不能免除的责任？服务出错会排除我的法定权利吗？',
      locale: 'zh',
    },
    { question: '平台法律责任是什么？', locale: 'zh' },
    { question: 'Can Prispect exclude legal liability or my statutory rights?', locale: 'en' },
  ];
  for (const { question, locale } of questions) {
    const results = searchProductKnowledge(question, locale);
    assert.equal(results[0].url, '/docs/terms#responsibility');
    assertSectionContent(results[0], termsDocument, section, locale);
  }
});

test('training and external-processing questions retain the complete published AI limits', () => {
  const section = findSection('ai');
  const queries: { question: string; locale: Locale }[] = [
    { question: '我的数据会被用于 AI 训练吗？', locale: 'zh' },
    { question: 'AI会训练我的上传文件吗？', locale: 'zh' },
    { question: '哪些资料会外发给 AI？', locale: 'zh' },
    { question: 'Does AI send my data to third parties or use it for training?', locale: 'en' },
  ];
  for (const { question, locale } of queries) {
    const record = requireResult(question, locale, '/docs/privacy#ai');
    assertSectionContent(record, privacyDocument, section, locale);
    assert.ok(record.text.includes('TokenFlux.dev'));
    const unverifiedProviderPolicy = section.bullets?.find((text) => /不承诺.*训练/u.test(text[0]));
    assert.ok(unverifiedProviderPolicy, 'The published provider limitation must remain present');
    assert.ok(record.text.includes(unverifiedProviderPolicy[languageIndex(locale)]));
  }
});

test('everyday English and Chinese questions find information categories and guide instructions', () => {
  const queries: { question: string; locale: Locale; url: string }[] = [
    { question: '你会收集哪些个人信息？', locale: 'zh', url: '/docs/privacy#collection' },
    {
      question: 'What personal data do you collect?',
      locale: 'en',
      url: '/docs/privacy#collection',
    },
    { question: '怎么上传年报？', locale: 'zh', url: '/docs/guide#import' },
    { question: 'How do I upload an annual report?', locale: 'en', url: '/docs/guide#import' },
    { question: '如何开始使用析光？', locale: 'zh', url: '/docs/guide#start' },
    { question: 'How to use Prispect?', locale: 'en', url: '/docs/guide#start' },
  ];
  for (const { question, locale, url } of queries) requireResult(question, locale, url);
});

test('deletion and retention questions include expiry triggers and backup limitations', () => {
  const section = findSection('retention');
  const queries: { question: string; locale: Locale }[] = [
    { question: '删除资料的保存期限是多久？', locale: 'zh' },
    { question: '上传原件什么时候删除？备份会立即删除吗？', locale: 'zh' },
    { question: 'How long do you retain uploaded files and backups after deletion?', locale: 'en' },
  ];
  const expiry = section.table?.rows.find((row) => /24 小时/u.test(row[1][0]));
  const backups = section.table?.rows.find((row) => row[0][1] === 'Backups');
  assert.ok(expiry);
  assert.ok(backups);
  for (const { question, locale } of queries) {
    const record = requireResult(question, locale, '/docs/privacy#retention');
    assertSectionContent(record, privacyDocument, section, locale);
    assert.ok(record.text.includes(expiry[1][languageIndex(locale)]));
    assert.ok(record.text.includes(backups[1][languageIndex(locale)]));
  }
});

test('contact answers preserve the published email and localized contact text', () => {
  const rights = findSection('rights');
  const contact = rights.links?.find((link) => link.href.startsWith('mailto:'));
  assert.ok(contact);
  const email = contact.href.slice('mailto:'.length);
  const queries: { question: string; locale: Locale }[] = [
    { question: '如何联系数据处理负责人？邮箱是什么？', locale: 'zh' },
    { question: 'How can I contact you about my personal data? What is your email?', locale: 'en' },
  ];
  for (const { question, locale } of queries) {
    const results = searchProductKnowledge(question, locale);
    const record = results.find(
      (entry) => entry.url.startsWith('/docs/privacy#') && entry.text.includes(email)
    );
    assert.ok(record, 'Contact retrieval must include the actual policy email');
    const section = privacyDocument.sections.find(
      (entry) => record.url === `/docs/privacy#${entry.id}`
    );
    assert.ok(section);
    assertSectionContent(record, privacyDocument, section, locale);
  }
});

test('empty and unrelated questions fall back to real product and getting-started sections', () => {
  for (const locale of locales) {
    for (const question of ['', '   ', 'zxqv7319 lunar-flamingo fixture']) {
      const results = searchProductKnowledge(question, locale);
      assert.ok(results.length > 0);
      assert.ok(results.some((record) => record.url === '/docs/about#product'));
      assert.ok(results.some((record) => record.url === '/docs/guide#start'));
      const corpus = getProductKnowledgeRecords(locale);
      for (const record of results) {
        assert.deepEqual(
          record,
          corpus.find((entry) => entry.id === record.id)
        );
      }
    }
  }
});

test('broad searches stay within six unique public-source sections and do not echo private input', () => {
  const sentinel = 'PRIVATE_PLAN_7b52e914_ACCOUNT_SECRET';
  const queries: { question: string; locale: Locale }[] = [
    { question: `公司研究 财报核查 材料 隐私 AI 账号 付款 保存 导出 ${sentinel}`, locale: 'zh' },
    {
      question: `Company research financial review materials privacy AI account payment retention export ${sentinel}`,
      locale: 'en',
    },
  ];
  for (const { question, locale } of queries) {
    const records = searchProductKnowledge(question, locale);
    assert.ok(records.length > 0 && records.length <= 6);
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.equal(new Set(records.map((record) => record.url)).size, records.length);
    const corpus = getProductKnowledgeRecords(locale);
    for (const record of records) {
      assert.deepEqual(
        record,
        corpus.find((entry) => entry.id === record.id)
      );
      assert.ok(!JSON.stringify(record).includes(sentinel));
    }
  }
});

test('mutating returned arrays and records cannot change later retrievals', () => {
  for (const locale of locales) {
    const originalCorpus = structuredClone(getProductKnowledgeRecords(locale));
    const mutableCorpus = getProductKnowledgeRecords(locale);
    mutableCorpus[0].text = 'mutated public knowledge';
    mutableCorpus[0].url = '/private-fixture';
    mutableCorpus.pop();
    assert.deepEqual(getProductKnowledgeRecords(locale), originalCorpus);

    const question = locale === 'zh' ? 'AI 隐私 训练' : 'AI privacy training';
    const originalResults = structuredClone(searchProductKnowledge(question, locale));
    const mutableResults = searchProductKnowledge(question, locale);
    assert.ok(mutableResults.length > 0);
    mutableResults[0].title = 'mutated search result';
    mutableResults[0].id = 'private-fixture';
    mutableResults.splice(0, mutableResults.length);
    assert.deepEqual(searchProductKnowledge(question, locale), originalResults);
    assert.deepEqual(getProductKnowledgeRecords(locale), originalCorpus);
  }
});
