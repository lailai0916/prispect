import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyDiscussion,
  type CompanyNews,
} from '../shared/company-workspace.js';
import {
  assessmentDiscussionEvidenceId,
  assessmentNewsEvidenceId,
  buildAssessmentPublicPayload,
  deriveCompanyAssessment,
  readDiscussionPostExcerpt,
  readNewsMediaExcerpt,
} from '../shared/company-assessment.js';

function financial(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: year === 2025 ? '1200.00' : '1000.00',
      netProfit: '200.00',
      ocf: '180.00',
      cash: '200.00',
      shortLoan: '100.00',
      currentPortionDebt: '50.00',
      totalAssets: '1000.00',
      totalLiabilities: '400.00',
      receivables: '100.00',
      inventory: '100.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [`https://datacenter.eastmoney.com/report?year=${year}`],
    originalUrl: null,
  };
}
function run(): CompanyResearchRun {
  return {
    id: 'PRIVATE_RUN_ID',
    input: { securityCode: '300893', orgId: 'gssz0300893', year: 2025 },
    status: 'ready',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'gssz0300893',
      companyName: '松原安全',
      fetchedAt: '2026-10-01T12:00:00.000Z',
      status: 'partial',
      financials: [financial(2024), financial(2025)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}
function news(index = 1, body = false): CompanyNews {
  const url = `https://finance.eastmoney.com/a/20261001${String(index).padStart(10, '0')}.html`;
  return {
    id: `public-news-${index.toString(16).padStart(24, '0')}`,
    title: `松原安全新闻线索 ${index}`,
    date: '2026-09-30',
    media: '公开媒体',
    provider: '东方财富',
    url,
    digest: `NEWS_DIGEST_${index}`,
    contentScope: body ? 'media-excerpt' : 'digest',
    ...(body
      ? {
          excerpt: {
            text: `NEWS_BODY_${index}：这段媒体报道提供公开经营线索，不代表已核实的司法事项。`,
            url,
            sha256: 'a'.repeat(64),
            readAt: '2026-10-01T12:00:00.000Z',
          },
        }
      : {}),
  };
}
function discussion(index = 1, body = false): CompanyDiscussion {
  const url = `https://guba.eastmoney.com/news,300893,${1000 + index}.html`;
  return {
    id: `guba-${1000 + index}`,
    securityCode: '300893',
    title: `松原安全公开观点 ${index}`,
    date: '2026-09-30',
    updatedAt: '2026-10-01',
    url,
    provider: '东方财富股吧',
    textScope: body ? 'post-excerpt' : 'title',
    ...(body
      ? {
          excerpt: {
            text: `POST_BODY_${index}：公开讨论者认为库存需要进一步核对，这只是未核实观点。`,
            url,
            sha256: 'b'.repeat(64),
            readAt: '2026-10-01T12:00:00.000Z',
          },
        }
      : {}),
  };
}

test('news and public opinions retain more source-backed leads without changing financial scores or grades', () => {
  const company = run();
  const before = deriveCompanyAssessment(company);
  company.context!.news = Array.from({ length: 200 }, (_, i) => news(i + 1, i < 2));
  company.context!.discussions = Array.from({ length: 260 }, (_, i) => discussion(i + 1, i < 4));
  const after = deriveCompanyAssessment(company);
  assert.equal(after.coverage.news, 180);
  assert.equal(after.coverage.discussions, 240);
  assert.equal(after.coverage.mediaBodies, 2);
  assert.equal(after.coverage.discussionBodies, 4);
  assert.equal(after.evidence.filter((item) => item.kind === 'news').length, 180);
  assert.equal(after.evidence.filter((item) => item.kind === 'discussion').length, 240);
  assert.equal(after.score, before.score);
  assert.equal(after.grade, before.grade);
  assert.deepEqual(after.ratingConstraints, before.ratingConstraints);
  assert.deepEqual(after.dimensions.slice(0, 4), before.dimensions.slice(0, 4));
  assert.deepEqual(
    after.metrics.filter((item) => item.unit !== 'count'),
    before.metrics.filter((item) => item.unit !== 'count')
  );
});

test('media bodies remain leads and forum bodies remain opinions instead of official event evidence', () => {
  const company = run();
  company.context!.news = [news(1, true)];
  company.context!.discussions = [discussion(1, true), discussion(2)];
  const seed = deriveCompanyAssessment(company);
  const media = seed.evidence.find((item) => item.kind === 'news')!;
  const opinion = seed.evidence.find((item) => item.id === 'guba-1001')!;
  assert.equal(media.sourceQuality, 'headline');
  assert.match(media.quote!, /NEWS_BODY_1/);
  assert.equal(opinion.sourceQuality, 'opinion');
  assert.match(opinion.quote!, /未核实.*POST_BODY_1/);
  assert.match(seed.evidence.find((item) => item.id === 'guba-1002')!.quote!, /仅公开讨论标题/);
  const events = seed.dimensions.find((item) => item.id === 'events')!;
  assert.equal(events.score, null);
  assert.equal(events.status, 'unknown');
  assert.match(events.ruleSummary[0], /公开讨论不构成事实/);
  assert.equal(seed.coverage.excerpts, 0);
});

test('source IDs are stable across reorderings and legacy snapshots preserve news numeric IDs', () => {
  assert.equal(assessmentNewsEvidenceId(news(2), 0), 'news-000000000000000000000002');
  assert.equal(assessmentNewsEvidenceId(news(2), 9), 'news-000000000000000000000002');
  assert.equal(assessmentNewsEvidenceId({ ...news(), id: undefined }, 0), 'news-1');
  assert.equal(assessmentNewsEvidenceId({ ...news(), id: 'unsafe<script>' }, 0), 'news-1');
  assert.equal(assessmentNewsEvidenceId({ ...news(), id: '1' }, 0), 'news-id-1');
  assert.equal(assessmentDiscussionEvidenceId(discussion(2), '300893'), 'guba-1002');
  const company = run();
  company.context!.news = [news(2), news(1)];
  company.context!.discussions = [discussion(2), discussion(1)];
  const before = deriveCompanyAssessment(company)
    .evidence.map((item) => item.id)
    .sort();
  company.context!.news.reverse();
  company.context!.discussions!.reverse();
  assert.deepEqual(
    deriveCompanyAssessment(company)
      .evidence.map((item) => item.id)
      .sort(),
    before
  );
});

test('foreign issuers, other boards, unsafe links and URL-unbound post IDs never enter the opinion ledger', () => {
  const baseline = discussion(1, true);
  const invalid = [
    { ...baseline, securityCode: '600000' },
    { ...baseline, url: 'https://guba.eastmoney.com/news,600000,1001.html' },
    { ...baseline, id: 'guba-1002' },
    { ...baseline, url: 'http://guba.eastmoney.com/news,300893,1001.html' },
    { ...baseline, url: 'https://guba.eastmoney.com.attacker.example/news,300893,1001.html' },
    { ...baseline, url: 'https://user:password@guba.eastmoney.com/news,300893,1001.html' },
    { ...baseline, url: 'https://guba.eastmoney.com:8443/news,300893,1001.html' },
    { ...baseline, url: `${baseline.url}?company=300893` },
    { ...baseline, url: 'javascript:alert(1)' },
    { ...baseline, date: '2026-02-30' },
    { ...baseline, date: 'not-a-date' },
  ];
  for (const candidate of invalid)
    assert.equal(assessmentDiscussionEvidenceId(candidate, '300893'), null);
  const company = run();
  company.context!.discussions = invalid;
  assert.equal(deriveCompanyAssessment(company).coverage.discussions, 0);
  company.context!.discussions = [baseline];
  company.context!.securityCode = '600000';
  assert.equal(deriveCompanyAssessment(company).coverage.discussions, 0);
});

test('invalid post body metadata falls back to unverified titles and never inflates actual-read counts', () => {
  const company = run();
  const baseline = discussion(1, true);
  const excerpts = [
    { ...baseline.excerpt!, sha256: 'not-a-hash' },
    { ...baseline.excerpt!, readAt: 'yesterday' },
    { ...baseline.excerpt!, readAt: '2099-01-01T00:00:00.000Z' },
    { ...baseline.excerpt!, url: 'https://guba.eastmoney.com/news,300893,9999.html' },
    { ...baseline.excerpt!, url: baseline.url.replace('https:', 'http:') },
    { ...baseline.excerpt!, text: ' ' },
  ];
  for (const excerpt of excerpts) {
    company.context!.discussions = [{ ...baseline, excerpt }];
    const seed = deriveCompanyAssessment(company);
    assert.equal(seed.coverage.discussions, 1);
    assert.equal(seed.coverage.discussionBodies, 0);
    assert.doesNotMatch(
      seed.evidence.find((item) => item.kind === 'discussion')!.quote!,
      /POST_BODY/
    );
    assert.equal(readDiscussionPostExcerpt({ ...baseline, excerpt }, '300893'), null);
  }
  company.context!.discussions = [{ ...baseline, textScope: 'title' }];
  assert.equal(deriveCompanyAssessment(company).coverage.discussionBodies, 0);
});

test('Chinese publication dates and UTC body timestamps are compared as instants across midnight', () => {
  const post = discussion(1, true);
  post.date = '2026-10-01 01:00:00';
  post.excerpt!.readAt = '2026-09-30T17:05:00.000Z';
  assert.ok(readDiscussionPostExcerpt(post, '300893'));
  post.excerpt!.readAt = '2026-09-30T12:00:00.000Z';
  assert.equal(readDiscussionPostExcerpt(post, '300893'), null);
  post.date = '2026-09-30T12:00:00+99:99';
  assert.equal(assessmentDiscussionEvidenceId(post, '300893'), null);
});

test('only implemented canonical media article readers qualify bodies, with legacy HTTP record compatibility', () => {
  const baseline = news(1, true);
  assert.ok(readNewsMediaExcerpt(baseline));
  assert.ok(readNewsMediaExcerpt({ ...baseline, url: baseline.url.replace('https:', 'http:') }));
  const sina = {
    ...baseline,
    url: 'https://finance.sina.com.cn/stock/relnews/cn/2026-10-01/doc-inabcdef123.shtml',
    excerpt: {
      ...baseline.excerpt!,
      url: 'https://finance.sina.com.cn/stock/relnews/cn/2026-10-01/doc-inabcdef123.shtml',
    },
  };
  assert.ok(readNewsMediaExcerpt(sina));
  for (const url of [
    'https://attacker.example/article',
    'https://finance.eastmoney.com/unknown/202610010000000001.html',
    'https://finance.eastmoney.com/a/202610010000000001.html?source=test',
    'https://finance.eastmoney.com.attacker.example/a/202610010000000001.html',
    'https://cj.sina.cn/articles/123456789/1234.html',
  ]) {
    const candidate = { ...baseline, url, excerpt: { ...baseline.excerpt!, url } };
    assert.equal(readNewsMediaExcerpt(candidate), null);
    const company = run();
    company.context!.news = [candidate];
    const seed = deriveCompanyAssessment(company);
    assert.equal(seed.coverage.mediaBodies, 0);
    assert.doesNotMatch(seed.evidence.find((item) => item.kind === 'news')!.quote!, /NEWS_BODY/);
  }
  assert.equal(readNewsMediaExcerpt({ ...baseline, contentScope: 'digest' }), null);
  assert.equal(
    readNewsMediaExcerpt({ ...baseline, excerpt: { ...baseline.excerpt!, sha256: 'bad' } }),
    null
  );
});

test('same URLs and source IDs are deduplicated without counting reposts as independent evidence', () => {
  const company = run();
  company.context!.news = [
    news(1),
    news(1),
    { ...news(1), id: 'different-marker', url: news(1).url.replace('https:', 'http:') },
  ];
  company.context!.discussions = [discussion(1), discussion(1), { ...discussion(1), id: '1001' }];
  const seed = deriveCompanyAssessment(company);
  assert.equal(seed.coverage.news, 1);
  assert.equal(seed.coverage.discussions, 1);
  const ids = seed.evidence.map((item) => item.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('public payload contains only source fields and excludes usernames, IP addresses, private records and cached model output', () => {
  const company = run() as CompanyResearchRun & { privateNotes: string };
  company.privateNotes = 'PRIVATE_WORKING_NOTE';
  company.context!.news = [
    { ...news(1, true), privateMeta: 'PRIVATE_NEWS_METADATA' } as CompanyNews,
  ];
  company.context!.discussions = [
    {
      ...discussion(1, true),
      username: 'DO_NOT_SEND_USERNAME',
      ipAddress: 'DO_NOT_SEND_IP',
      privateMeta: 'PRIVATE_DISCUSSION_METADATA',
      cachedModelText: 'DO_NOT_SEND_MODEL_OUTPUT',
    } as CompanyDiscussion,
  ];
  const payload = buildAssessmentPublicPayload(company);
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /NEWS_BODY_1/);
  assert.match(serialized, /POST_BODY_1/);
  assert.doesNotMatch(serialized, /PRIVATE_|DO_NOT_SEND/);
  assert.equal(payload.publicObservationDates.latestDiscussionDate, '2026-09-30');
});
