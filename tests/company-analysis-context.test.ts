import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment, type AssessmentEvidence } from '../shared/company-assessment.js';
import { contextAmountFields, type CompanyNews } from '../shared/company-workspace.js';
import { buildAssessmentPublicPayload } from '../server/company-assessment.js';
import {
  normalizePublicText,
  publicGoalTerms,
  PUBLIC_TEXT_SEPARATOR,
  selectPublicText,
} from '../server/company-analysis-context.js';

const acquiredAt = '2026-10-01T12:00:00.000Z';
const body = normalizePublicText(
  '媒体说明：这是一份合成研究样本。' +
    '公司参加行业交流，展示产品和企业形象。'.repeat(450) +
    '2025 年合并口径，金额以人民币万元计。公司解释备货是现金下降的主要原因。' +
    '然而，主要客户应收回款尚未证实，存货滞销是竞争解释，不能据订单增长认定扩张已经兑现。'
);
function news(index: number, text = body): CompanyNews {
  const url = `https://finance.eastmoney.com/a/20260930${String(index).padStart(10, '0')}.html`;
  return {
    id: `public-news-${index.toString(16).padStart(24, '0')}`,
    title: `合成样本公开线索 ${index}`,
    date: '2026-09-30',
    media: '合成公开媒体',
    provider: '东方财富检索',
    digest: '',
    url,
    contentScope: 'media-excerpt',
    excerpt: { text, url, sha256: String(index % 10).repeat(64), readAt: acquiredAt },
  };
}
function company(): CompanyResearchRun {
  return {
    id: 'private-run-id-not-forwarded',
    input: { securityCode: '300893', orgId: 'synthetic-org', year: 2025 },
    status: 'ready',
    createdAt: acquiredAt,
    updatedAt: acquiredAt,
    model: { requested: true, status: 'not-called' },
    trace: [],
    announcements: [],
    assessmentFocus: '核对回款与存货，是否只是扩张备货',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'synthetic-org',
      companyName: '合成研究样本（非真实企业）',
      fetchedAt: acquiredAt,
      status: 'available',
      financials: [2025, 2024].map((year) => ({
        period: `${year}-12-31`,
        annual: true,
        noticeDate: '2026-04-01',
        amounts: Object.fromEntries(contextAmountFields.map((field) => [field, '100.00'])) as never,
        ratios: { grossMargin: 20, roe: 15, revenueGrowth: 0 },
        auditOpinion: null,
        fieldSources: {},
        sourceUrls: [],
        originalUrl: null,
      })),
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [news(1)],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}

test('same acquired text keeps a tail counter explanation and its scope while the old prefix loses both', () => {
  const selection = selectPublicText(body, 4000, publicGoalTerms('回款与存货'));
  assert.doesNotMatch(body.slice(0, 4000), /回款尚未证实|人民币万元/);
  assert.match(selection.text, /回款尚未证实/);
  assert.match(selection.text, /2025 年合并口径，金额以人民币万元计/);
  assert.match(selection.text, /不能据订单增长认定扩张已经兑现/);
  assert.equal(selection.text.length, 4000);
  assert.ok(selection.fragments.some((fragment) => fragment.reasons.includes('counter-cue')));
  assert.equal(
    selection.text,
    selection.fragments
      .map((fragment) => body.slice(fragment.start, fragment.end))
      .join(PUBLIC_TEXT_SEPARATOR)
  );
  assert.equal(selection.sourceCharacters + selection.omittedCharacters, body.length);
  assert.equal(selection.sourceCharacters + selection.separatorCharacters, selection.text.length);
});

test('reselecting under byte pressure retains actual counter passages rather than cropping the packed prefix', () => {
  for (const cap of [2400, 1600, 900, 600, 300]) {
    const selection = selectPublicText(body, cap, publicGoalTerms('回款与存货'));
    assert.ok(selection.text.length <= cap);
    assert.match(selection.text, /回款尚未证实|然而/);
    assert.equal(
      selection.text,
      selection.fragments
        .map((fragment) => body.slice(fragment.start, fragment.end))
        .join(PUBLIC_TEXT_SEPARATOR)
    );
    assert.ok(
      selection.fragments.every((fragment) => fragment.start >= 0 && fragment.end <= body.length)
    );
  }
});

test('short excerpts are verbatim and zero space reports omission without inventing a summary', () => {
  const text = normalizePublicText('  2025 年\n合并现金为 0 元，但母公司资料未取得。\u0001 ');
  assert.equal(selectPublicText(text, 4000).text, text);
  assert.deepEqual(selectPublicText(text, 0), {
    text: '',
    fragments: [],
    sourceCharacters: 0,
    omittedCharacters: text.length,
    separatorCharacters: 0,
  });
});

test('payload keeps receipts and dates, packs selected original text once, and leaves retained facts immutable', () => {
  const run = company();
  Object.assign(run, { privateNote: 'PRIVATE_NOTE', preview: { text: 'PRIVATE_UPLOAD' } });
  const before = structuredClone(run);
  const seed = deriveCompanyAssessment(run);
  const payload = buildAssessmentPublicPayload(run, seed);
  assert.ok('news' in payload);
  const row = payload.news[0]!;
  assert.match(row.text, /回款尚未证实/);
  assert.equal(row.sourceId, 'news-000000000000000000000001');
  assert.equal(row.date, '2026-09-30');
  assert.equal(row.periodRelation, 'after-selected-year');
  assert.equal(row.sourceQuality, 'headline');
  assert.deepEqual(row.excerptReceipt, {
    url: run.context!.news[0]!.url,
    sha256: '1'.repeat(64),
    readAt: acquiredAt,
  });
  assert.ok(row.textFragments.every((fragment) => body.slice(fragment.start, fragment.end)));
  assert.equal(JSON.stringify(payload).split('回款尚未证实').length - 1, 1);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /PRIVATE_|private-run-id-not-forwarded|selectionSources|deduplicationText/
  );
  assert.deepEqual(run, before);
  assert.equal(payload.screen.grade, seed.grade);
  assert.equal(payload.screen.score, seed.score);
});

test('whole available text deduplication never merges differing source endings or shared clusters', () => {
  const run = company();
  run.context!.news = [
    news(1, body),
    news(2, body),
    news(3, body + '相反，客户否认订单已经兑现。'),
  ];
  run.context!.news.forEach((row) => (row.clusterId = 'same-cluster'));
  const payload = buildAssessmentPublicPayload(run);
  assert.ok('news' in payload);
  assert.equal(payload.news.length, 3);
  assert.equal(payload.publicInformationCoverage.duplicatedTextRecords, 1);
  assert.equal(payload.news[1]!.text, '');
  assert.equal(
    (payload.news[1] as (typeof payload.news)[1] & { duplicateTextOf?: string }).duplicateTextOf,
    payload.news[0]!.sourceId
  );
  assert.match(payload.news[2]!.text, /客户否认订单已经兑现/);
  assert.notEqual(payload.news[0]!.sourceId, payload.news[2]!.sourceId);
});

test('public metadata deduplicates exact repeated quote text with references while preserving source identities', () => {
  const run = company();
  const quote = '这是公开来源的实际读取范围说明，不是公司审计意见或新增独立证明。'.repeat(4);
  run.context!.sources = [1, 2].map((index) => ({
    id: `source-${index}`,
    provider: `来源${index}`,
    dimension: '公开财务来源',
    url: `https://www.cninfo.com.cn/source-${index}`,
    status: 'available',
    fetchedAt: acquiredAt,
    latestDate: '2025-12-31',
    count: 1,
    note: quote,
    responseHashes: [],
  }));
  const seed = deriveCompanyAssessment(run);
  const payload = buildAssessmentPublicPayload(run, seed);
  assert.ok('publicContextCompression' in payload);
  assert.ok(payload.publicContextCompression.evidenceQuoteReferences >= 2);
  for (const id of ['source-1', 'source-2']) {
    const source: AssessmentEvidence & { quoteReference?: string } = payload.screen.evidence.find(
      (item) => item.id === `source-${id}`
    )!;
    assert.equal(source.quote, undefined);
    assert.equal(source.quoteReference, 'sourceQuality.source-1.note');
    assert.equal(seed.evidence.find((item) => item.id === `source-${id}`)!.quote, quote);
  }
  assert.equal(payload.publicContextCompression.sourceNoteReferences, 1);
  assert.equal(payload.sourceQuality[0]!.note, quote);
  assert.equal(payload.sourceQuality[1]!.noteReference, 'sourceQuality.source-1.note');
  assert.equal(JSON.stringify(payload).split(quote).length - 1, 1);
});

test('an eighty-character budget preserves the full legal denial rather than its leading however', () => {
  const denial =
    '然而，在本次诉讼的主体身份、证据提出方和法律程序阶段都仍有待核实的情况下，本文所谓违约只是原告主张，被告并未被认定违约。';
  const text = '标题曾写公司已确认违约。' + '与研究无关的栏目和常规介绍。'.repeat(100) + denial;
  const selection = selectPublicText(text, 80);
  assert.match(selection.text, /所谓违约只是原告主张，被告并未被认定违约/);
  assert.ok(selection.text.includes(denial));
  assert.ok(selection.text.length <= 80);
});

test('insufficient sentence context omits a body instead of reversing its negative statement', () => {
  const text =
    '公司已确认违约。' + '然而，' + '诉讼身份与程序仍需完整核对，'.repeat(20) + '并未被认定违约。';
  const selection = selectPublicText(text, 80);
  assert.equal(selection.text, '');
  assert.equal(selection.omissionReason, 'sentence-context-exceeds-budget');
  assert.equal(selection.omittedCharacters, text.length);
  assert.equal(selectPublicText(text, 24).text, '');
});

test('many acquired public texts stay within both limits with honest selected and omitted character totals', () => {
  const run = company();
  run.context!.news = Array.from({ length: 180 }, (_, index) =>
    news(index + 1, body + `不同来源 ${index}`)
  );
  const payload = buildAssessmentPublicPayload(run);
  assert.ok('news' in payload);
  const coverage = payload.publicInformationCoverage;
  assert.equal(payload.news.length, 180);
  assert.ok(coverage.textChars <= 140_000);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(payload))) <= 790_000);
  assert.equal(
    coverage.textChars,
    payload.news.reduce((sum, row) => sum + row.text.length, 0)
  );
  assert.equal(
    coverage.includedSourceChars,
    payload.news.reduce((sum, row) => sum + row.includedSourceCharacters, 0)
  );
  assert.equal(
    coverage.availableTextChars,
    coverage.includedSourceChars + coverage.omittedTextChars
  );
  assert.ok(payload.news.every((row) => row.text.includes('回款尚未证实')));
});

test('combined news and opinion pressure preserves complete counter sentences after actual byte fitting', () => {
  const run = company();
  run.context!.news = Array.from({ length: 180 }, (_, index) =>
    news(index + 1, body + `来源结尾 ${index}`)
  );
  run.context!.discussions = Array.from({ length: 240 }, (_, index) => {
    const id = String(1000 + index),
      url = `https://guba.eastmoney.com/news,300893,${id}.html`;
    return {
      id,
      securityCode: '300893',
      title: `合成公开观点 ${index}`,
      date: '2026-09-30',
      provider: '东方财富股吧',
      url,
      textScope: 'post-excerpt',
      excerpt: {
        text: body + `观点结尾 ${index}`,
        url,
        sha256: 'b'.repeat(64),
        readAt: acquiredAt,
      },
    };
  });
  const payload = buildAssessmentPublicPayload(run);
  assert.ok('news' in payload);
  const rows = [...payload.news, ...payload.discussions];
  assert.equal(rows.length, 420);
  assert.ok(payload.publicInformationCoverage.textChars <= 140_000);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(payload))) <= 790_000);
  assert.ok(
    rows.every(
      (row) =>
        !row.text ||
        row.text.includes(
          '然而，主要客户应收回款尚未证实，存货滞销是竞争解释，不能据订单增长认定扩张已经兑现。'
        )
    )
  );
  assert.equal(
    payload.publicInformationCoverage.selectedCounterCueRecords,
    rows.filter((row) => row.text.includes('然而')).length
  );
  assert.ok(payload.discussions.every((row) => row.sourceQuality === 'opinion'));
});
