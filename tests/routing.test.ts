import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appPath,
  appLinkPath,
  legacyRoute,
  loginDestination,
  resolveCompanySection,
} from '../src/routing.js';
import {
  companyPath,
  resolveCompanyFocus,
  resolveCompanyLocation,
} from '../shared/company-workspace.js';

const origin = 'https://prispect.com';

test('retired company-comparison links return to research without importing unrelated review IDs', () => {
  for (const query of ['', '?a=record%2Fone&b=record%3Ftwo&basis=consolidated', '?a=&b=']) {
    const path = '/companies/compare' + query;
    assert.equal(appPath(path, origin), '/query');
    assert.equal(appLinkPath(origin + path, origin), '/query');
    assert.equal(loginDestination(path, origin), '/query');
    assert.equal(legacyRoute('#' + path, origin), '/query');
  }
  assert.equal(appPath('/compare?first=private-review', origin), '/compare?first=private-review');
  assert.equal(appLinkPath('https://foreign.example/companies/compare?a=record', origin), null);
  assert.equal(appPath('/api/company-runs/record', origin), null);
});

test('retired Lite company pages retain the owning saved record and open the corresponding full page', () => {
  for (const [page, section, focus] of [
    ['finance', null, null],
    ['overview', null, null],
    ['numbers', 'trends', null],
    ['public', 'disclosures', 'announcements'],
    ['reputation', 'disclosures', 'news'],
    ['questions', 'disclosures', 'news'],
    ['original', 'sources', null],
    ['sources', 'sources', null],
  ]) {
    const old =
      '/company?run=record%2Fone&experience=lite&page=' +
      page +
      '&year=2025&basis=parent&claim=c&source=s&generation=old';
    const path = appPath(old, origin)!;
    const params = new URL(path, origin).searchParams;
    assert.equal(params.get('run'), 'record/one');
    assert.equal(params.get('year'), '2025');
    assert.equal(params.get('cached'), '1');
    assert.equal(params.get('section'), section);
    assert.equal(params.get('focus'), focus);
    for (const key of ['experience', 'page', 'basis', 'claim', 'source', 'generation'])
      assert.equal(params.has(key), false);
    assert.equal(appPath(path, origin), path);
    assert.equal(legacyRoute('#' + old, origin), path);
    assert.equal(loginDestination(old, origin), path);
  }
  assert.equal(
    appPath('/company?run=record&experience=pro&report=ai', origin),
    '/company?run=record&report=ai'
  );
  assert.equal(
    appPath('/company?run=record&experience=lite&page=finance#lite-original', origin),
    '/company?run=record&section=sources&cached=1'
  );
});

test('retired home entry links resolve to research and canonical documentation', () => {
  assert.equal(
    appPath('/?view=search&query=abc&year=2025#showcase-query', origin),
    '/query?query=abc&year=2025'
  );
  assert.equal(appPath('/?view=guide', origin), '/docs/guide');
  assert.equal(appPath('/?view=example', origin), '/');
  assert.equal(appPath('/?view=story', origin), '/?view=story');
});

test('fixed company pages resolve consistently and old combined routes remain readable', () => {
  for (const section of [null, undefined, '', 'unknown', 'qa', 'Overview'])
    assert.equal(resolveCompanySection(section), 'overview');
  for (const section of [
    'overview',
    'trends',
    'industry',
    'disclosures',
    'profile',
    'coverage',
    'financial',
    'sources',
    'evidence',
  ])
    assert.equal(resolveCompanySection(section), section);
});

test('fixed company links retain encoded record IDs through navigation and login returns', () => {
  for (const section of [
    'overview',
    'trends',
    'industry',
    'disclosures',
    'profile',
    'coverage',
    'sources',
    'financial',
    'evidence',
  ] as const) {
    const path = companyPath('record/with spaces', section);
    assert.equal(new URL(path, origin).searchParams.get('run'), 'record/with spaces');
    assert.equal(appPath(path, origin), path);
    assert.equal(appLinkPath(path, origin), path);
    assert.equal(legacyRoute('#' + path, origin), path);
    assert.equal(loginDestination(path, origin), path);
  }
});

test('saved focused links reach the corresponding fixed page and preserve native source fragments', () => {
  for (const [oldSection, newSection, focus] of [
    ['financial', 'industry', 'industry'],
    ['sources', 'disclosures', 'announcements'],
    ['sources', 'profile', 'profile'],
    ['sources', 'coverage', 'coverage'],
  ]) {
    const oldPath = `/company?run=record&section=${oldSection}&focus=${focus}`;
    const canonical = `/company?run=record&section=${newSection}&focus=${focus}`;
    assert.equal(appPath(oldPath, origin), canonical);
    assert.equal(appPath(canonical, origin), canonical);
  }
  assert.equal(
    appPath('/company?run=record&focus=data', origin),
    '/company?run=record&focus=data&section=trends'
  );
  assert.equal(
    appPath('/company?run=record&focus=news', origin),
    '/company?run=record&focus=news&section=disclosures'
  );
  assert.equal(
    appPath('/company?run=record#company-public-signals', origin),
    '/company?run=record&section=disclosures&focus=news#company-public-signals'
  );
  assert.equal(
    appPath('/company?run=record&section=evidence#page=12', origin),
    '/company?run=record&section=evidence#page=12'
  );
  assert.equal(appLinkPath('/company?run=record#company-public-data', origin), null);
});

test('fixed pages validate disclosure targets and focused comparison links', () => {
  assert.equal(companyPath('record', 'coverage'), '/company?run=record&section=coverage');
  assert.equal(companyPath('record', 'industry'), '/company?run=record&section=industry');
  assert.equal(
    companyPath('record', 'sources', 'source-comparison'),
    '/company?run=record&section=sources&focus=source-comparison'
  );
  assert.equal(
    companyPath('record', 'sources', 'trust'),
    '/company?run=record&section=coverage&focus=trust'
  );
  assert.equal(resolveCompanyFocus('coverage', 'coverage'), 'company-data-coverage');
  assert.equal(resolveCompanyFocus('industry', 'industry'), 'company-industry');
  assert.equal(resolveCompanyFocus('overview', 'lab'), 'company-evidence-lab');
  assert.equal(resolveCompanyFocus('financial', 'coverage'), null);
  assert.equal(resolveCompanyFocus('sources', '__proto__'), null);
  assert.deepEqual(resolveCompanyLocation('trends', 'goal'), { section: 'trends', focus: null });
  assert.deepEqual(resolveCompanyLocation('__proto__', 'constructor'), {
    section: 'overview',
    focus: null,
  });
});

test('legacy links retain encoded task IDs, query values and document sections', () => {
  assert.equal(legacyRoute('#/docs?section=materials', origin), '/docs/guide?section=materials');
  assert.equal(legacyRoute('#/docs', origin), '/docs');
  assert.equal(legacyRoute('#/method#method-privacy', origin), '/docs/methodology#method-privacy');
  assert.equal(legacyRoute('#/tasks/a%20b?from=compare', origin), '/tasks/a%20b?from=compare');
  assert.equal(
    legacyRoute('#/login?next=%2Fdecisions%3Fid%3Da', origin),
    '/login?next=%2Fdecisions%3Fid%3Da'
  );
  assert.equal(legacyRoute('#method-privacy', origin), null);
});

test('login return paths cannot redirect outside the app or into server endpoints', () => {
  for (const unsafe of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\nevil.example',
    '/api/account',
    '/assets/app.js',
    '/login?next=/account',
    '/register',
    '/%2f%2fevil.example',
  ]) {
    assert.equal(loginDestination(unsafe, origin), '/workspace', unsafe);
  }
  assert.equal(loginDestination('/decisions?new=handover', origin), '/decisions?new=handover');
  assert.equal(loginDestination('/tasks/report-id', origin), '/tasks/report-id');
  assert.equal(loginDestination('/research', origin), '/query');
});

test('SPA links leave originals, downloads, external sites and page anchors to the browser', () => {
  assert.equal(appLinkPath('/docs?section=privacy', origin), '/docs/guide?section=privacy');
  assert.equal(appLinkPath(origin + '/account', origin), '/account');
  assert.equal(appLinkPath('/research', origin), '/query');
  for (const native of [
    '/api/materials/id/file',
    '/appearance-init.js',
    '#main',
    '#method-privacy',
    '/method#method-privacy',
    '/docs/methodology#method-privacy',
    '/docs/guide?section=materials#main',
    'https://other.example/docs',
    'mailto:contact@example.test',
  ])
    assert.equal(appLinkPath(native, origin), null, native);
});

test('trailing slashes normalize without losing queries or genuine fragments', () => {
  assert.equal(appPath('/docs/?section=import#main', origin), '/docs/guide?section=import#main');
  assert.equal(
    appPath('/docs/guide/?section=import#main', origin),
    '/docs/guide?section=import#main'
  );
  assert.equal(appPath('/docs/', origin), '/docs');
  assert.equal(appPath('/', origin), '/');
});

test('retired research-library links return to query, including saved login and hash links', () => {
  const query = '?search=saved%20company&status=ready';
  for (const oldPath of ['/research', '/research/']) {
    assert.equal(appPath(oldPath, origin), '/query');
    assert.equal(appPath(oldPath + query + '#records', origin), '/query' + query + '#records');
    assert.equal(legacyRoute('#' + oldPath + query, origin), '/query' + query);
    assert.equal(appLinkPath(origin + oldPath + query, origin), '/query' + query);
    assert.equal(loginDestination(oldPath + query, origin), '/query' + query);
  }
  assert.equal(appPath('/research/not-a-page', origin), null);
  assert.equal(appLinkPath('https://other.example/research', origin), null);
});

test('documentation hub and article routes work for navigation and login returns', () => {
  for (const path of [
    '/docs',
    '/docs/about',
    '/docs/guide',
    '/docs/methodology',
    '/docs/privacy',
    '/docs/terms',
    '/docs/copyright',
  ]) {
    assert.equal(appPath(path, origin), path, path);
    assert.equal(appLinkPath(origin + path, origin), path, path);
    assert.equal(loginDestination(path, origin), path, path);
  }
  assert.equal(
    loginDestination('/docs/guide?section=materials#main', origin),
    '/docs/guide?section=materials#main'
  );
});

test('old documentation routes canonicalize while preserving queries and fragments', () => {
  for (const [alias, canonical] of [
    ['/about', '/docs/about'],
    ['/method', '/docs/methodology'],
    ['/privacy', '/docs/privacy'],
    ['/terms', '/docs/terms'],
    ['/copyright', '/docs/copyright'],
  ]) {
    assert.equal(appPath(alias + '/?from=footer#main', origin), canonical + '?from=footer#main');
    assert.equal(legacyRoute('#' + alias + '?from=footer', origin), canonical + '?from=footer');
    assert.equal(appLinkPath(alias + '?from=footer', origin), canonical + '?from=footer');
    assert.equal(loginDestination(alias, origin), canonical);
  }
});

test('old guide section links retain the full query and native document anchor', () => {
  const query = '?from=footer&section=materials%2Fimport&section=review';
  assert.equal(appPath('/docs' + query + '#main', origin), '/docs/guide' + query + '#main');
  assert.equal(legacyRoute('#/docs/' + query + '#main', origin), '/docs/guide' + query + '#main');
  assert.equal(appLinkPath('/docs' + query, origin), '/docs/guide' + query);
  assert.equal(appPath('/docs?from=footer#main', origin), '/docs?from=footer#main');
});

test('unknown documentation articles and external documentation URLs remain rejected', () => {
  for (const path of ['/docs/evil', '/docs/guide/extra', '/docs/evil?section=materials']) {
    assert.equal(appPath(path, origin), null, path);
    assert.equal(legacyRoute('#' + path, origin), null, path);
    assert.equal(appLinkPath(path, origin), null, path);
    assert.equal(loginDestination(path, origin), '/workspace', path);
  }
  assert.equal(appLinkPath('https://evil.example/docs/guide', origin), null);
  assert.equal(loginDestination('https://evil.example/docs/guide', origin), '/workspace');
});
