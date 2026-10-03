import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const root = '/workspace/prispect-improve/docs/competitive-research/evidence/mingcha';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [],
  apiRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.url().includes('/api/')) apiRequests.push(request.url());
});
await page.goto(
  'http://127.0.0.1:5405/docs/competitive-research/evidence/mingcha/framework-preview.html'
);
await page.locator('#company-research-framework').waitFor();
const result = {
  executionTime: new Date().toISOString(),
  mode: 'Synthetic component acceptance fixture; no real company query',
  componentFiles: ['shared/research-plan.ts', 'src/ResearchPlan.tsx', 'src/research-plan.css'],
};
result.initialClosed = await page.locator('#company-research-framework').evaluate((el) => !el.open);
await page.getByRole('button', { name: '现金质量', exact: true }).click();
result.templateFillsOnlyGoal = await page.locator('#test-goal').inputValue();
await page.locator('#company-research-framework > summary').click();
await page.screenshot({ path: `${root}/framework-desktop-light.png`, fullPage: true });
await page.getByRole('button', { name: '查看依据', exact: true }).click();
result.evidenceDialog = await page.getByRole('dialog').innerText();
await page.keyboard.press('Escape');
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: '下载核查框架', exact: true }).click();
const download = await downloadPromise;
result.download = {
  filename: download.suggestedFilename(),
  text: await readFile(await download.path(), 'utf8'),
};
await page.evaluate(() =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error('fixture-clipboard-denied');
      },
    },
  })
);
await page.getByRole('button', { name: '复制核查框架', exact: true }).click();
result.copyFailure = {
  textAvailable: await page.getByRole('textbox', { name: '核查框架文本' }).isVisible(),
  focused: await page
    .getByRole('textbox', { name: '核查框架文本' })
    .evaluate((el) => document.activeElement === el),
  notice: await page.locator('.research-plan-actions [role="status"]').textContent(),
};
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('previous');
result.previousSnapshot = await page.locator('.research-plan-notes').innerText();
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('conflict');
result.conflict = await page.locator('.research-plan-questions').innerText();
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('mismatch');
result.mismatch = await page.locator('.research-plan-body').innerText();
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('missing');
result.missing = await page.locator('.research-plan-body').innerText();
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('failed');
result.failed = await page.locator('.research-plan-notes').innerText();
await page.getByRole('combobox', { name: '场景', exact: true }).selectOption('current');
await page.getByRole('button', { name: '切换主题', exact: true }).click();
await page.screenshot({ path: `${root}/framework-desktop-dark.png`, fullPage: true });
await page.setViewportSize({ width: 375, height: 812 });
await page.screenshot({ path: `${root}/framework-mobile-375-dark.png`, fullPage: true });
result.mobile375 = await page.evaluate(() => ({
  viewport: innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  tableScroll: document.querySelector('.research-plan-table-wrap').scrollWidth,
  tableViewport: document.querySelector('.research-plan-table-wrap').clientWidth,
}));
await page.getByRole('button', { name: '切换主题', exact: true }).click();
await page.screenshot({ path: `${root}/framework-mobile-375-light.png`, fullPage: true });
await page.setViewportSize({ width: 320, height: 812 });
result.mobile320 = await page.evaluate(() => ({
  viewport: innerWidth,
  documentWidth: document.documentElement.scrollWidth,
}));
await page.getByRole('combobox', { name: '语言', exact: true }).selectOption('en');
await page.screenshot({ path: `${root}/framework-mobile-320-en.png`, fullPage: true });
await page.locator('#company-research-framework > summary').click();
await page.emulateMedia({ media: 'print' });
result.printClosedFramework = await page
  .locator('.research-plan-body')
  .evaluate((el) => ({
    display: getComputedStyle(el).display,
    height: el.getBoundingClientRect().height,
    contentVisibility: getComputedStyle(el.parentElement, '::details-content').contentVisibility,
  }));
await page.pdf({ path: `${root}/framework-print.pdf`, format: 'A4', printBackground: true });
result.errors = errors;
result.apiRequests = apiRequests;
await writeFile(`${root}/framework-results.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      executionTime: result.executionTime,
      initialClosed: result.initialClosed,
      copyFailure: result.copyFailure,
      mobile375: result.mobile375,
      mobile320: result.mobile320,
      printClosedFramework: result.printClosedFramework,
      errors,
      apiRequests,
    },
    null,
    2
  )
);
await browser.close();
