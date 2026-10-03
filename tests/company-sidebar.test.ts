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

test('initial loading and empty routes retain all fixed items as real disabled controls', () => {
  for (const route of ['/query', '/research', '/materials', '/company?run=unverified']) {
    const markup = renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        { value: context },
        createElement(
          CompanyRecordsProvider,
          null,
          createElement(CompanySidebar, { route, onClose: () => {} })
        )
      )
    );
    const $ = load(markup);
    const menu = $('.company-sidebar-navigation');
    assert.deepEqual(
      menu
        .children()
        .toArray()
        .map((element) => $(element).text()),
      ['公司概览', '历史财务走势', '行业对比', '公告线索', '扩展核查', '数据覆盖', '来源比对'],
      route
    );
    assert.equal(menu.find('button:disabled').length, 7, route);
    assert.equal(menu.find('[href]').length, 0, route);
    assert.equal($('.sidebar-company-context > .sidebar-group-label').length, 0, route);
    assert.equal($('.sidebar-company-context').text().includes('企业研究'), false, route);
    assert.equal($('.sidebar-tools-group').length, 0, route);
    assert.equal($('.sidebar-company-list').text().includes('正在读取'), true, route);
  }
});
