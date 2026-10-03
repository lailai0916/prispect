import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { CompanySidebar } from '../src/CompanySidebar.js';
import { CompanyRecordsProvider } from '../src/CompanyRecordsContext.js';
import { AppContext, type AppContextValue } from '../src/context.js';

const context: AppContextValue = {
  locale: 'zh-Hans',
  t: (zh) => zh,
  workspace: null,
  cases: [],
  user: { id: 'owner', name: 'Owner', email: 'owner@example.test', createdAt: '' },
  registrationEnabled: true,
  refresh: async () => {},
  navigate: () => {},
  execute: async (action) => action(),
  confirm: () => {},
  showEvidence: () => {},
  busy: false,
};

test('initial loading and empty routes retain seven visible destinations as real disabled controls', () => {
  const routes = [
    '/query',
    '/research',
    '/materials',
    '/company?run=unverified',
    '/company?run=unverified&section=financial',
    '/company?run=unverified&section=evidence',
  ];
  for (const locale of ['zh-Hans', 'en'] as const) {
    for (const route of routes) {
      const translated = {
        ...context,
        locale,
        t: (zh: string, en: string) => (locale === 'en' ? en : zh),
      };
      const markup = renderToStaticMarkup(
        createElement(
          AppContext.Provider,
          { value: translated },
          createElement(
            CompanyRecordsProvider,
            null,
            createElement(CompanySidebar, { route, onClose: () => {} })
          )
        )
      );
      const $ = load(markup);
      const menu = $('.company-navigation-links');
      assert.deepEqual(
        menu
          .find('.company-navigation-link-copy > span')
          .toArray()
          .map((element) => $(element).text()),
        locale === 'en'
          ? [
              'Research report',
              'Financial trends',
              'Industry comparison',
              'Disclosure leads',
              'Extended checks',
              'Data coverage',
              'Source comparison',
            ]
          : ['研究报告', '财务走势', '行业对比', '公告线索', '扩展核查', '数据覆盖', '来源比对'],
        route
      );
      assert.equal(menu.find('button:disabled').length, 7, route);
      assert.equal(menu.find('[href]').length, 0, route);
      assert.equal(menu.find('.company-navigation-link').length, 7, route);
      assert.equal(menu.closest('details').length, 0, route);
      assert.equal($('.company-navigation-destinations > .sidebar-group-label').length, 0, route);
      assert.equal(
        $('.company-navigation-destinations').text().includes('Company questions'),
        false,
        route
      );
      assert.equal($('.sidebar-tools-group').length, 0, route);
      assert.equal(
        $('.sidebar-company-list')
          .text()
          .includes(locale === 'en' ? 'Loading' : '正在读取'),
        true,
        route
      );
      assert.equal($('.company-navigation-preview').length, 1, route);
      assert.equal($('.company-navigation-preview [href]').length, 0, route);
      assert.equal(
        $('.company-navigation-preview')
          .text()
          .includes(locale === 'en' ? 'Start research' : '新建研究后'),
        true,
        route
      );
    }
  }
});
