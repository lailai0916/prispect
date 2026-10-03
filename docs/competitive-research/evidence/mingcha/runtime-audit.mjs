import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const root = '/workspace/prispect-improve/docs/competitive-research/evidence/mingcha';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const requests = [];
const errors = [];
page.on('request', (request) =>
  requests.push({ url: request.url(), resourceType: request.resourceType() })
);
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:4405/assets/report-template.html');
const result = {
  project: 'cosinXx/mingcha-pro',
  sha: '99aae0ab181715361aacdcd108c7a1d342928754',
  executionTime: new Date().toISOString(),
  mode: 'Original unmodified template with unresolved placeholders; no real company research',
};
await page.screenshot({ path: `${root}/desktop-light.png`, fullPage: true });
result.initial = await page.evaluate(() => ({
  title: document.title,
  sections: [...document.querySelectorAll('section')].map((s) => ({
    id: s.id,
    title: s.querySelector('h2')?.textContent,
  })),
  openFolds: [...document.querySelectorAll('.fold')].map((f) => f.classList.contains('open')),
  missingAria: [...document.querySelectorAll('.fold-head')].map((b) => ({
    expanded: b.getAttribute('aria-expanded'),
    controls: b.getAttribute('aria-controls'),
  })),
  unresolvedPlaceholders: document.body.innerText.match(/\{\{[^}]+\}\}/g)?.length,
  barWidths: [...document.querySelectorAll('.bar-fill')].map((b) => b.style.width),
}));
await page.locator('.fold-head').nth(1).click();
result.individualFold = await page
  .locator('.fold')
  .nth(1)
  .evaluate((f) => f.classList.contains('open'));
await page.locator('#foldAll').click();
result.allClosed = {
  open: await page.locator('.fold.open').count(),
  button: await page.locator('#foldAll').textContent(),
};
await page.locator('#foldAll').click();
result.allOpened = {
  open: await page.locator('.fold.open').count(),
  button: await page.locator('#foldAll').textContent(),
};
await page.locator('#nav a[href="#sec-conflict"]').click();
await page.waitForTimeout(400);
result.conflictNavigation = await page.evaluate(() => ({
  hash: location.hash,
  active: document.querySelector('#nav a.active')?.textContent,
  top: document.querySelector('#sec-conflict').getBoundingClientRect().top,
  backtop: getComputedStyle(document.querySelector('#backtop')).display,
}));
await page.screenshot({ path: `${root}/conflict-light.png` });
await page.locator('#backtop').click();
await page.waitForFunction(() => document.documentElement.scrollTop === 0, { timeout: 3000 });
result.backtop = await page.evaluate(() => ({ scrollTop: document.documentElement.scrollTop }));
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: `${root}/desktop-dark.png`, fullPage: true });
result.dark = await page.evaluate(() => ({
  background: getComputedStyle(document.body).backgroundColor,
  ink: getComputedStyle(document.body).color,
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
}));
await page.emulateMedia({ media: 'print' });
result.darkPrint = await page.evaluate(() => ({
  body: getComputedStyle(document.body).backgroundColor,
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
  foldBodyDisplay: [...document.querySelectorAll('.fold-body')].map(
    (f) => getComputedStyle(f).display
  ),
  conclusionBackground: getComputedStyle(document.querySelector('.conclusion-card'))
    .backgroundImage,
  topbar: getComputedStyle(document.querySelector('.topbar')).display,
}));
await page.pdf({ path: `${root}/template-print.pdf`, format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen', colorScheme: 'light', reducedMotion: 'reduce' });
result.reducedMotion = await page
  .locator('.bar-fill')
  .first()
  .evaluate((b) => ({
    duration: getComputedStyle(b).transitionDuration,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  }));
await page.setViewportSize({ width: 375, height: 812 });
await page.goto('http://127.0.0.1:4405/assets/report-template.html');
await page.screenshot({ path: `${root}/mobile-375-light.png`, fullPage: true });
result.mobile375 = await page.evaluate(() => ({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: innerWidth,
  kpiColumns: getComputedStyle(document.querySelector('.kpi-grid')).gridTemplateColumns,
  navigation: {
    client: document.querySelector('.nav').clientWidth,
    scroll: document.querySelector('.nav').scrollWidth,
  },
  foldDirection: getComputedStyle(document.querySelector('.info-item')).flexDirection,
}));
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: `${root}/mobile-375-dark.png`, fullPage: true });
await page.setViewportSize({ width: 320, height: 812 });
result.mobile320 = await page.evaluate(() => ({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: innerWidth,
  overflowElements: [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().right > innerWidth)
    .slice(0, 12)
    .map((e) => ({ class: e.className, tag: e.tagName, right: e.getBoundingClientRect().right })),
}));
await page.screenshot({ path: `${root}/mobile-320-dark.png`, fullPage: true });
result.requests = requests;
result.errors = errors;
await writeFile(`${root}/runtime-results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
