import { buildAssessmentPublicPayload } from '../../../../server/company-assessment.ts';
import { writeFile } from 'node:fs/promises';
const capturedAt = new Date().toISOString();
const date = '2026-10-02T00:00:00.000Z';
const news = [1, 2].map((i) => ({
  id: 'public-news-' + String(i).repeat(24),
  title: '合成公开媒体' + i,
  date: '2026-10-01',
  url: 'https://finance.eastmoney.com/a/202610010000000' + i + '.html',
  provider: '东方财富',
  media: '合成媒体',
  digest: '',
  clusterId: 'one-cluster',
  contentScope: 'media-excerpt',
  excerpt: {
    text: ('独特正文' + i + '：').repeat(30),
    url: 'https://finance.eastmoney.com/a/202610010000000' + i + '.html',
    sha256: String(i).repeat(64),
    readAt: date,
  },
}));
const run = {
  id: 'PRIVATE_ACCOUNT_SENTINEL',
  input: { securityCode: '300893', orgId: 'issuer', year: 2025 },
  status: 'ready',
  createdAt: date,
  updatedAt: date,
  trace: [],
  announcements: [],
  model: { requested: true, status: 'not-called' },
  privatePlan: 'PRIVATE_PLAN_SENTINEL',
  context: {
    version: 1,
    securityCode: '300893',
    orgId: 'issuer',
    companyName: '合成只读复核夹具',
    fetchedAt: date,
    status: 'partial',
    financials: [],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news,
    discussions: [],
    verificationLinks: [],
    warnings: [],
  },
};
Object.assign(news[0], { privateNote: 'PRIVATE_NOTE_SENTINEL' });
const payload = buildAssessmentPublicPayload(run);
const result = {
  capturedAt,
  mode: 'Synthetic read-only public model payload review; no real company query',
  news: payload.news.map((row) => ({
    id: row.sourceId,
    chars: row.includedCharacters,
    duplicateTextOf: row.duplicateTextOf,
  })),
  relations: payload.sourceFamilies.families,
  independence: payload.sourceFamilies.independence,
  privateTextLeaked: JSON.stringify(payload).includes('PRIVATE_'),
};
console.log(JSON.stringify(result, null, 2));
await writeFile(
  new URL(process.argv[2] || './source-family-current.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n'
);
