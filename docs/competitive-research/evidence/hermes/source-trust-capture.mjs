import { chromium } from '/workspace/prispect/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/hermes';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(
  'http://127.0.0.1:5402/docs/competitive-research/evidence/hermes/source-trust-fixture.html'
);
await page.getByRole('heading', { name: '来源与读取范围' }).waitFor();
await page.screenshot({ path: out + '/source-trust-desktop-collapsed.png', fullPage: true });
await page.locator('.source-trust-detail summary').click();
assert.equal(await page.locator('.source-trust-detail tbody tr').count(), 12);
await page.screenshot({ path: out + '/source-trust-desktop-expanded.png', fullPage: true });
await page.getByRole('button', { name: '下一页', exact: true }).click();
await page.getByRole('button', { name: '下一页', exact: true }).click();
assert.equal(await page.locator('.source-trust-detail tbody tr').count(), 12);
await page.locator('.source-trust-detail summary').click();
await page.emulateMedia({ media: 'print' });
assert.equal(await page.locator('.source-trust-print tbody tr:visible').count(), 49);
assert.equal(await page.locator('.source-trust-detail').isVisible(), false);
await page.pdf({ path: out + '/source-trust-print.pdf', format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
await page.screenshot({ path: out + '/source-trust-narrow-dark.png', fullPage: true });
const overflow = await page.evaluate(() => ({
  viewport: innerWidth,
  document: document.documentElement.scrollWidth,
}));
assert.equal(overflow.viewport, overflow.document);
await page.locator('.source-trust-detail summary').click();
await page.screenshot({ path: out + '/source-trust-narrow-expanded.png', fullPage: true });
const expandedOverflow = await page.evaluate(() => ({
  viewport: innerWidth,
  document: document.documentElement.scrollWidth,
}));
assert.equal(expandedOverflow.viewport, expandedOverflow.document);
await page.evaluate(() =>
  window.renderSourceTrust({
    ...window.fixtureRun,
    context: { ...window.fixtureRun.context, orgId: 'different' },
  })
);
await page.getByText('主体或年度范围不一致，未采用这些来源。请先核对主体与报告年度。').waitFor();
assert.equal(await page.locator('.source-trust-summary').count(), 0);
await page.screenshot({ path: out + '/source-trust-scope-withheld.png', fullPage: true });
assert.deepEqual(errors, []);
await writeFile(
  out + '/source-trust-browser.json',
  JSON.stringify(
    {
      kind: 'fixture',
      input: 'source-trust-fixture.html',
      pageSize: 12,
      printedRowsWithClosedDetailsAfterPaging: 49,
      narrowOverflow: overflow,
      narrowExpandedOverflow: expandedOverflow,
      scopeMismatchWithheld: true,
      errors,
    },
    null,
    2
  )
);
await browser.close();
