import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4320';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8')
);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});
const page = await context.newPage();
const record = {
  baselineSha: 'd748d1ac5c1a9c6fe702301c819980e1cce87312',
  comparisonBoundary:
    'Actual public lookup on same 300893/2025 with no external model. Not the synthetic 4321 provider.',
  startedAt: new Date().toISOString(),
  sourceType: 'actual-public-retrieval',
  externalModelConfigured: false,
  checks: [],
  errors: [],
};
page.on('pageerror', (e) => record.errors.push(String(e)));
const capture = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  record.checks.push({
    name,
    url: page.url(),
    overflow: await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  });
};
try {
  const login = await context.request.post(base + '/api/auth/login', {
    data: { email: account.email, password: account.password },
  });
  const session = await login.json();
  if (!session.user) throw Error('Isolated account login failed');
  const headers = { 'X-CSRF-Token': session.csrfToken, Origin: base };
  const directoryResponse = await context.request.get(base + '/api/companies/directory');
  record.directoryStatus = directoryResponse.status();
  if (directoryResponse.ok()) {
    const d = await directoryResponse.json();
    record.directory = {
      version: d.version,
      fetchedAt: d.fetchedAt,
      candidates: d.companies?.length || d.entries?.length,
    };
  }
  const search = await context.request.get(base + '/api/companies/search?q=300893');
  record.searchStatus = search.status();
  record.search = await search.json();
  if (!search.ok() || !record.search.candidates?.length) {
    await page.goto(base + '/query?query=300893');
    await page.waitForTimeout(1000);
    await capture('desktop-light-live-company-search-boundary');
    throw Error('Actual official source could not resolve candidate; no substitute used');
  }
  const c = record.search.candidates.find((c) => c.securityCode === '300893');
  if (!c) throw Error('Wrong issuer');
  const created = await context.request.post(base + '/api/company-runs', {
    headers,
    data: {
      securityCode: c.securityCode,
      orgId: c.orgId,
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
  });
  record.createStatus = created.status();
  record.initial = await created.json();
  if (!created.ok()) throw Error(JSON.stringify(record.initial));
  const id = record.initial.id;
  record.runId = id;
  await page.goto(base + `/company?run=${id}`);
  await page.waitForTimeout(1200);
  await capture('desktop-light-live-company-running');
  for (let i = 0; i < 140; i++) {
    const r = await context.request.get(base + `/api/company-runs/${id}`);
    record.latest = await r.json();
    if (i % 15 === 0)
      await writeFile(out + '/live-company-receipt.json', JSON.stringify(record, null, 2));
    if (
      !['queued', 'running'].includes(record.latest.status) &&
      !['loading'].includes(record.latest.contextStatus) &&
      !['loading'].includes(record.latest.assessmentStatus)
    )
      break;
    await page.waitForTimeout(2000);
  }
  await page.reload();
  await page.waitForTimeout(1000);
  await capture('desktop-light-live-company-result');
  for (const section of [
    'trends',
    'industry',
    'disclosures',
    'profile',
    'coverage',
    'sources',
    'evidence',
  ]) {
    await page.goto(base + `/company?run=${id}&section=${section}`);
    await page.waitForTimeout(800);
    await capture('desktop-light-live-company-' + section);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(base + `/company?run=${id}`);
  await page.waitForTimeout(800);
  await capture('narrow-dark-live-company');
  await page.goto(base + '/research');
  await page.waitForTimeout(800);
  await capture('narrow-dark-research-library');
} catch (e) {
  record.errors.push(String(e));
} finally {
  record.finishedAt = new Date().toISOString();
  await writeFile(out + '/live-company-receipt.json', JSON.stringify(record, null, 2));
  await browser.close();
}
