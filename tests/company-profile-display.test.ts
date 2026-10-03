import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyContextSnapshot, CompanySourceReceipt } from '../shared/company-workspace.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyProfileView } from '../src/CompanyContextViews.js';

function fixture(): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: '600519',
    orgId: 'profile-fixture-org',
    companyName: '扩展核查样本',
    fetchedAt: '2026-10-03T00:00:00Z',
    status: 'partial',
    financials: [],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
}

function source(id: string, dimension: string, url: string): CompanySourceReceipt {
  return {
    id,
    provider: id.startsWith('sina') ? '新浪财经' : '东方财富',
    dimension,
    url,
    status: 'available',
    fetchedAt: '2026-10-03T00:00:00Z',
    latestDate: null,
    count: 1,
    note: '',
    responseHashes: [],
  };
}

function render(
  snapshot: CompanyContextSnapshot,
  locale: 'zh-Hans' | 'en' = 'zh-Hans',
  includeNews = true
) {
  return load(
    renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        {
          value: {
            locale,
            t: (zh: string, en: string) => (locale === 'en' ? en : zh),
          } as AppContextValue,
        },
        createElement(CompanyProfileView, { snapshot, includeNews })
      )
    )
  );
}

test('shareholder ownership distinguishes zero, missing and invalid ratios without fabricated bars', () => {
  const snapshot = fixture();
  snapshot.shareholders = [
    0,
    27.5,
    13.75,
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    100.1,
  ].map((percentage, index) => ({
    name: `比例样本${index + 1}`,
    shares: null,
    percentage,
    change: null,
    period: '2025-12-31',
    url: `https://data.eastmoney.com/holders/ratio-${index + 1}`,
  }));
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(snapshot, locale);
    const rows = $('.company-extended-card[data-card="shareholders"] .company-extended-holder');
    assert.equal(rows.length, snapshot.shareholders.length);
    assert.match(rows.eq(0).text(), /0%/);
    const zeroBar = rows.eq(0).find('.company-extended-holder-bar');
    assert.equal(zeroBar.length, 1, 'a disclosed zero remains a valid ownership ratio');
    assert.match(zeroBar.find('span').attr('style') || '', /(?:^|;)width:0(?:%|px)?(?:;|$)/);
    assert.match(rows.eq(1).text(), /27\.5%/);
    assert.equal(rows.eq(1).find('.company-extended-holder-bar').length, 1);
    assert.equal(
      rows.eq(1).find('.company-extended-holder-bar > span').attr('style'),
      'width:100%'
    );
    assert.match(rows.eq(2).text(), /13\.75%/);
    assert.equal(rows.eq(2).find('.company-extended-holder-bar > span').attr('style'), 'width:50%');
    for (let index = 3; index < snapshot.shareholders.length; index++) {
      const row = rows.eq(index);
      assert.equal(
        row.find('.company-extended-holder-bar').length,
        0,
        `${locale}: invalid ratio ${index}`
      );
      assert.match(row.text(), /—/);
      assert.doesNotMatch(row.text(), /NaN|Infinity|%/);
    }
  }
});

test('each extended-check card exposes truthful missing data when no public records were acquired', () => {
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(fixture(), locale);
    assert.equal($('.company-extended-checks > .company-extended-card').length, 4);
    for (const card of ['profile', 'shareholders', 'news', 'verification']) {
      const panel = $(`.company-extended-card[data-card="${card}"]`);
      assert.equal(panel.length, 1, `${locale}: missing ${card} card`);
      assert.match(
        panel.text(),
        locale === 'en'
          ? /not retrieved|no .*(?:retrieved|available)|not available/i
          : /未取得|未提供|暂无/,
        `${locale}: ${card} must explain its absent data`
      );
    }
    assert.equal($('.company-extended-card[data-card="profile"] dd').length, 0);
    assert.equal($('.company-extended-holder-bar').length, 0);
    assert.equal($('a').length, 0, 'no sources or verification services may be invented');
    assert.doesNotMatch($.root().text(), /0%|NaN|Infinity/);
  }
});

test('extended checks retain the recorded profile and shareholder sources for every acquired period', () => {
  const snapshot = fixture();
  snapshot.profile = { orgName: '扩展核查样本', creditCode: 'FIXTURE-CREDIT-CODE' };
  snapshot.sources = [
    source('em-profile', '公司公开资料', 'https://data.eastmoney.com/profile/fixture'),
    source('sina-profile', '公司公开资料', 'https://vip.stock.finance.sina.com.cn/profile/fixture'),
    source('shareholders', '已披露十大股东', 'https://data.eastmoney.com/holders/fixture'),
  ];
  snapshot.shareholders = ['2025-12-31', '2024-12-31'].map((period, index) => ({
    name: `股东样本${index + 1}`,
    shares: null,
    percentage: 25,
    change: null,
    period,
    url: `https://data.eastmoney.com/holders/fixture?period=${period}`,
  }));

  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(snapshot, locale);
    assert.match($.root().text(), /FIXTURE-CREDIT-CODE/);
    for (const receipt of snapshot.sources) {
      const link = $('a').filter((_index, element) => $(element).attr('href') === receipt.url);
      assert.ok(link.length, `${locale}: missing recorded source ${receipt.id}`);
      assert.equal(link.first().attr('target'), '_blank');
      assert.match(link.first().attr('rel') || '', /noreferrer/);
    }
    for (const shareholder of snapshot.shareholders) {
      const row = $('.company-extended-holder').filter(
        (_index, element) => $(element).find('a').text() === shareholder.name
      );
      assert.equal(row.length, 1, `${locale}: missing shareholder ${shareholder.name}`);
      assert.equal(row.find('a').attr('href'), shareholder.url);
      assert.equal(row.attr('data-period'), shareholder.period);
      assert.match(
        row.closest('.company-extended-holder-period').children('h3').text(),
        new RegExp(shareholder.period)
      );
    }
  }
});

test('extended checks preserve all news links when the default summary is exceeded', () => {
  const snapshot = fixture();
  snapshot.news = Array.from({ length: 12 }, (_value, index) => ({
    title: `已取得新闻${index + 1}`,
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    media: '样本媒体',
    provider: '东方财富',
    url: `https://finance.eastmoney.com/fixture-news-${index + 1}.html`,
    digest: `新闻摘要${index + 1}`,
  }));
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(snapshot, locale);
    for (const item of snapshot.news) {
      const link = $('a').filter((_index, element) => $(element).attr('href') === item.url);
      assert.equal(link.length, 1, `${locale}: news ${item.title} must remain accessible once`);
      assert.match(link.text(), new RegExp(item.title));
    }
    const overflow = $('details').filter((_index, element) =>
      $(element)
        .find('a')
        .is(`[href="${snapshot.news.at(-1)!.url}"]`)
    );
    assert.equal(
      overflow.length,
      1,
      'additional acquired news is available in an expandable section'
    );
    assert.ok(overflow.children('summary').text().trim(), 'overflow has an actionable disclosure');
    assert.equal(overflow.attr('open'), undefined, 'extra news starts collapsed');
    const newsLinks = $('a').filter((_index, element) =>
      snapshot.news.some((item) => item.url === $(element).attr('href'))
    );
    assert.equal(
      newsLinks.filter((_index, element) => !$(element).closest('details').length).length,
      8
    );
    assert.equal(overflow.find('a').length, 4);
  }
});

test('the optional news card preserves includeNews=false for existing callers', () => {
  const snapshot = fixture();
  snapshot.news = [
    {
      title: '可选新闻样本',
      date: '2026-10-01',
      media: '样本媒体',
      provider: '东方财富',
      url: 'https://finance.eastmoney.com/optional-fixture.html',
      digest: '可选新闻摘要',
    },
  ];
  const $ = render(snapshot, 'zh-Hans', false);
  assert.equal($('.company-extended-card[data-card="news"]').length, 0);
  assert.equal($('a[href="https://finance.eastmoney.com/optional-fixture.html"]').length, 0);
  assert.equal($('.company-extended-checks > .company-extended-card').length, 3);
});
