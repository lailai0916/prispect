import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyNews } from '../shared/company-workspace.js';
import type { CompanyAssessment } from '../shared/company-assessment.js';
import {
  deriveSourceTrust,
  SOURCE_TRUST_LIMITS,
  sourceTrustPublicPayload,
} from '../shared/source-trust.js';
import { buildAssessmentPublicPayload } from '../server/company-assessment.js';

const timestamp = '2026-10-02T00:00:00.000Z';
const url = (id: number) =>
  `https://finance.eastmoney.com/a/20261001${String(id).padStart(8, '0')}.html`;
const body = (
  id: number,
  hash = 'a'.repeat(64),
  text = '这是已读取的媒体正文节选。'
): CompanyNews => ({
  title: `媒体报道 ${id}`,
  date: '2026-10-01',
  url: url(id),
  provider: '东方财富',
  media: '示例媒体',
  digest: '',
  contentScope: 'media-excerpt',
  excerpt: { text, url: url(id), sha256: hash, readAt: timestamp },
});
function fixture(): CompanyResearchRun {
  return {
    id: 'private-run-sentinel',
    input: { securityCode: '300893', orgId: 'example-org', year: 2025 },
    status: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'example-org',
      companyName: '示例公司',
      fetchedAt: timestamp,
      status: 'partial',
      financials: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      verificationLinks: [],
      warnings: [],
      sources: [
        {
          id: 'news-feed',
          provider: '公开新闻',
          dimension: '新闻接口响应',
          url: 'https://example.com/feed',
          status: 'error',
          fetchedAt: timestamp,
          latestDate: null,
          count: 0,
          note: '本轮读取失败，不能解释为无风险。',
          responseHashes: ['f'.repeat(64)],
        },
      ],
      news: [],
      discussions: [],
      announcements: [],
    },
  };
}

test('known location, cluster and body relationships retain different meanings', () => {
  const run = fixture();
  run.context!.news = [
    body(1),
    body(2),
    { ...body(3, 'b'.repeat(64), '不同正文'), clusterId: 'cluster-a' },
    { ...body(4, 'c'.repeat(64), '另一正文'), clusterId: 'cluster-a' },
    {
      ...body(5, 'd'.repeat(64), '修订正文'),
      url: url(1),
      excerpt: { ...body(5).excerpt!, url: url(1), text: '修订正文', sha256: 'd'.repeat(64) },
    },
  ];
  const view = deriveSourceTrust(run);
  assert.equal(view.independence, 'unknown');
  const first = view.families.find((family) => family.memberIds.includes('news-1'))!;
  assert.deepEqual(first.memberIds.sort(), ['news-1', 'news-2', 'news-5']);
  assert.deepEqual(
    first.relations.find((relation) => relation.kind === 'same-content')!.memberIds,
    ['news-1', 'news-2']
  );
  assert.deepEqual(
    first.relations.find((relation) => relation.kind === 'same-location')!.memberIds,
    ['news-1', 'news-5']
  );
  assert.equal(first.differingContent, true);
  const clustered = view.families.find((family) => family.memberIds.includes('news-3'))!;
  assert.deepEqual(
    clustered.relations.map((relation) => relation.kind),
    ['same-cluster']
  );
  assert.equal(clustered.differingContent, true);
  assert.equal(view.reading['media-excerpt'], 5);
});

test('platform names, titles and response hashes do not certify common content or independence', () => {
  const run = fixture();
  run.context!.sources.push({
    ...run.context!.sources[0],
    id: 'another',
    provider: '另一平台',
    url: 'https://example.org/feed',
  });
  run.context!.news = [
    {
      title: '同名标题',
      date: '2026-10-01',
      url: url(1),
      digest: '',
      provider: '平台甲',
      media: '媒体甲',
    },
    {
      title: '同名标题',
      date: '2026-10-01',
      url: url(2),
      digest: '',
      provider: '平台乙',
      media: '媒体乙',
    },
  ];
  const view = deriveSourceTrust(run);
  assert.deepEqual(view.families, []);
  assert.equal(view.reading.headline, 2);
  assert.equal(view.states.error, 2);
  const output = JSON.stringify(view);
  assert.equal(output.includes('independentSources'), false);
  assert.equal(output.includes('confidence'), false);
  assert.equal(output.includes('f'.repeat(64)), false);
});

test('same recorded hash with different retrieved excerpts is not labelled identical content', () => {
  const run = fixture();
  run.context!.news = [body(1), body(2, 'a'.repeat(64), '不同的实际节选')];
  assert.deepEqual(deriveSourceTrust(run).families, []);
});

test('bounded metadata does not invent a cluster relationship by truncating distinct long IDs', () => {
  const run = fixture();
  run.context!.news = [
    { ...body(1, 'a'.repeat(64), '一种正文'), clusterId: 'x'.repeat(200) + 'a' },
    { ...body(2, 'b'.repeat(64), '另一正文'), clusterId: 'x'.repeat(200) + 'b' },
  ];
  const view = deriveSourceTrust(run);
  assert.deepEqual(view.families, []);
  assert.ok(view.rows.every((row) => row.clusterId === null));
});

test('scope labels use accepted readers and distinguish titles, digests and public opinions', () => {
  const run = fixture();
  const valid = body(1);
  run.context!.news = [
    valid,
    { ...body(2), excerpt: { ...body(2).excerpt!, url: url(99) }, digest: '媒体摘要' },
    { ...body(3), contentScope: 'headline', excerpt: undefined },
  ];
  run.context!.discussions = [
    {
      id: '7',
      securityCode: '300893',
      title: '论坛观点',
      date: '2026-10-01',
      url: 'https://guba.eastmoney.com/news,300893,7.html',
      provider: '股吧',
      textScope: 'post-excerpt',
      excerpt: {
        text: '公开观点，并非已核实事实。',
        url: 'https://guba.eastmoney.com/news,300893,7.html',
        readAt: timestamp,
        sha256: 'b'.repeat(64),
      },
    },
    {
      id: '8',
      securityCode: '600000',
      title: '其他公司',
      date: '2026-10-01',
      url: 'https://guba.eastmoney.com/news,600000,8.html',
      provider: '股吧',
      textScope: 'title',
    },
  ];
  const view = deriveSourceTrust(run);
  assert.equal(view.reading['media-excerpt'], 1);
  assert.equal(view.reading.digest, 1);
  assert.equal(view.reading.headline, 1);
  assert.equal(view.reading['post-excerpt'], 1);
  assert.equal(view.rejectedDiscussions, 1);
  assert.equal(view.rows.find((row) => row.id === 'news-2')!.contentHash, null);
});

test('a PDF response hash is not mistaken for equality of different quoted passages', () => {
  const run = fixture();
  run.context!.announcements = [1, 2].map((id) => ({
    id: `${id}`,
    title: `公告${id}`,
    date: '2026-10-01',
    url: `https://example.com/report${id}.pdf`,
    sources: [{ provider: '公告源', url: 'https://example.com' }],
    category: '年度',
    attention: 'high',
    matched: '',
    meaning: '',
    nextQuestion: '',
    excerpt: {
      page: id,
      pagesRead: 3,
      quote: `不同页摘录${id}`,
      url: `https://example.com/report${id}.pdf`,
      sha256: 'a'.repeat(64),
    },
  }));
  const view = deriveSourceTrust(run);
  assert.equal(view.reading['disclosure-excerpt'], 2);
  assert.equal(view.rows.find((row) => row.kind === 'disclosure')!.readAt, null);
  assert.equal(view.snapshotFetchedAt, timestamp);
  assert.deepEqual(view.families, []);
});

test('model text packing retains different and opposing bodies inside the same collector cluster', () => {
  const run = fixture();
  run.context!.news = [
    { ...body(1, 'a'.repeat(64), '支持性叙述：'.repeat(30)), clusterId: 'same-topic' },
    {
      ...body(2, 'b'.repeat(64), '反方叙述：现金解释存在其他可能。'.repeat(20)),
      clusterId: 'same-topic',
    },
  ];
  const before = structuredClone(run);
  const payload = buildAssessmentPublicPayload(run) as unknown as {
    news: { text: string; duplicateTextOf?: string; clusterId?: string }[];
    sourceFamilies: ReturnType<typeof sourceTrustPublicPayload>;
  };
  assert.equal(payload.news.length, 2);
  assert.ok(payload.news[0].text.includes('支持性'));
  assert.ok(payload.news[1].text.includes('反方'));
  assert.ok(payload.news.every((row) => row.duplicateTextOf === undefined));
  assert.ok(payload.news.every((row) => row.clusterId === 'same-topic'));
  assert.match(payload.sourceFamilies.idNamespace, /not valid metricIds or evidenceIds/);
  assert.deepEqual(run, before);
});

test('matching packed prefixes cannot discard a differing original excerpt ending', () => {
  const run = fixture();
  const prefix = '相同已读正文前段。'.repeat(500);
  run.context!.news = [
    body(1, 'a'.repeat(64), prefix + '支持性结尾'),
    body(2, 'b'.repeat(64), prefix + '反向结尾'),
  ];
  const payload = buildAssessmentPublicPayload(run) as unknown as {
    news: { text: string; duplicateTextOf?: string }[];
  };
  assert.ok(payload.news.every((row) => row.text.length === 4000));
  assert.ok(payload.news.every((row) => row.duplicateTextOf === undefined));
  assert.equal(JSON.stringify(payload).includes('deduplicationText'), false);
});

test('issuer, identity, annual scope and unresolved entity gaps withhold source summaries', () => {
  for (const change of [
    (run: CompanyResearchRun) => {
      run.context!.orgId = 'wrong';
    },
    (run: CompanyResearchRun) => {
      run.identity = {
        securityCode: '600000',
        orgId: 'wrong',
        shortName: '错误主体',
        companyName: null,
        exchange: 'sse',
        sourceUrl: '',
      };
    },
    (run: CompanyResearchRun) => {
      run.assessment = { year: 2024, basis: 'consolidated' } as CompanyAssessment;
    },
    (run: CompanyResearchRun) => {
      run.assessment = { year: 2025, basis: 'parent' } as unknown as CompanyAssessment;
    },
    (run: CompanyResearchRun) => {
      run.informationGap = { name: '主体', reason: '待确认' };
    },
  ]) {
    const run = fixture();
    run.context!.news = [body(1)];
    change(run);
    const view = deriveSourceTrust(run);
    assert.equal(view.scope, 'mismatch');
    assert.deepEqual(view.rows, []);
    assert.equal(view.snapshotFetchedAt, null);
  }
});

test('source updates remain separate from a saved assessment snapshot', () => {
  const run = fixture();
  run.assessment = {
    year: 2025,
    basis: 'consolidated',
    snapshotFetchedAt: '2026-09-30T00:00:00.000Z',
  } as CompanyAssessment;
  assert.equal(deriveSourceTrust(run).scope, 'previous');
  assert.equal(deriveSourceTrust(run).reportSnapshotFetchedAt, '2026-09-30T00:00:00.000Z');
  delete run.context;
  assert.equal(deriveSourceTrust(run).scope, 'missing');
});

test('large snapshots have bounded rows, relationships and strings with explicit omissions', () => {
  const run = fixture();
  run.context!.news = Array.from({ length: 1000 }, (_, i) => ({
    ...body(i + 1),
    title: 'x'.repeat(3000),
    media: 'm'.repeat(1000),
    clusterId: 'same-cluster',
  }));
  const view = deriveSourceTrust(run);
  assert.equal(view.rows.length, SOURCE_TRUST_LIMITS.news + 1);
  assert.equal(view.omitted, 1000 - SOURCE_TRUST_LIMITS.news);
  assert.equal(view.rows[1].label.length, 200);
  assert.equal(view.rows[1].provider.length, 80);
  assert.ok(JSON.stringify(sourceTrustPublicPayload(run)).length < 100_000);
});

test('read model and public model payload retain only public allowlisted metadata without mutating the run', () => {
  const run = fixture();
  run.context!.news = [body(1), body(2)];
  Object.assign(run, {
    accountId: 'private-account-sentinel',
    privatePlan: 'private-plan-sentinel',
  });
  Object.assign(run.context!.news[0], { privateNote: 'private-note-sentinel' });
  const before = structuredClone(run);
  const payload = buildAssessmentPublicPayload(run);
  assert.ok('sourceFamilies' in payload);
  assert.equal(
    (payload.sourceFamilies as ReturnType<typeof sourceTrustPublicPayload>).families.length,
    1
  );
  const serialized = JSON.stringify(payload.sourceFamilies);
  assert.equal(serialized.includes('private-'), false);
  assert.equal(serialized.includes('这是已读取的媒体正文节选'), false);
  assert.equal(serialized.includes('grade'), false);
  const view = deriveSourceTrust(run);
  view.rows[0].label = 'local';
  view.families[0].memberIds.push('local');
  assert.deepEqual(run, before);
});

test('unsafe or credential-bearing URLs are withheld and exact revision URLs remain separate', () => {
  const run = fixture();
  run.context!.news = [
    'javascript:alert(1)',
    'https://user:secret@example.com/x',
    'https://example.com/x?v=1',
    'https://example.com/x?v=2',
  ].map((value, i) => ({
    title: `标题${i}`,
    url: value,
    date: '',
    provider: '源',
    media: '',
    digest: '',
  }));
  const view = deriveSourceTrust(run);
  assert.equal(view.rows[1].url, null);
  assert.equal(view.rows[2].url, null);
  assert.deepEqual(view.families, []);
  assert.equal(view.rows[1].date, null);
});
