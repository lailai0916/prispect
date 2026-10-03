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

test('company navigation and content resolve missing, invalid and legacy sections consistently', () => {
  for (const section of [null, undefined, '', 'unknown', 'qa', 'Overview'])
    assert.equal(resolveCompanySection(section), 'overview');
  for (const section of ['overview', 'financial', 'sources', 'evidence'])
    assert.equal(resolveCompanySection(section), section);
  for (const [oldSection, section] of [
    ['trends', 'financial'],
    ['industry', 'financial'],
    ['disclosures', 'sources'],
    ['profile', 'sources'],
    ['coverage', 'sources'],
  ])
    assert.equal(resolveCompanySection(oldSection), section);
});

test('saved company links reach their merged content through navigation and login returns', () => {
  for (const [oldSection, newSection, focus] of [
    ['trends', 'financial', 'history'],
    ['industry', 'financial', 'industry'],
    ['disclosures', 'sources', 'announcements'],
    ['profile', 'sources', 'profile'],
    ['coverage', 'sources', 'coverage'],
  ]) {
    const oldPath = `/company?run=record%2Fwith%20spaces&section=${oldSection}&from=saved`;
    const canonical = `/company?run=record%2Fwith+spaces&section=${newSection}&from=saved&focus=${focus}`;
    assert.equal(appPath(oldPath, origin), canonical);
    assert.equal(appLinkPath(oldPath, origin), canonical);
    assert.equal(legacyRoute('#' + oldPath, origin), canonical);
    assert.equal(loginDestination(oldPath, origin), canonical);
    assert.equal(appPath(canonical, origin), canonical);
  }
  for (const section of ['overview', 'financial', 'sources', 'evidence'] as const) {
    const path = companyPath('record/with spaces', section);
    assert.equal(new URL(path, origin).searchParams.get('run'), 'record/with spaces');
    assert.equal(appPath(path, origin), path);
  }
});

test('report data and news links reveal their new page while retaining native source fragments', () => {
  assert.equal(
    appPath('/company?run=record&focus=data', origin),
    '/company?run=record&focus=data&section=financial'
  );
  assert.equal(
    appPath('/company?run=record&focus=news', origin),
    '/company?run=record&focus=news&section=sources'
  );
  assert.equal(
    appPath('/company?run=record#company-public-data', origin),
    '/company?run=record&section=financial&focus=data#company-financial-data'
  );
  assert.equal(
    appPath('/company?run=record#company-public-signals', origin),
    '/company?run=record&section=sources&focus=news#company-public-signals'
  );
  assert.equal(
    appPath('/company?run=record&section=evidence#page=12', origin),
    '/company?run=record&section=evidence#page=12'
  );
  assert.equal(appLinkPath('/company?run=record#company-public-data', origin), null);
});

test('source and financial links retain exact focus without permitting arbitrary disclosure targets', () => {
  assert.equal(
    companyPath('record', 'coverage'),
    '/company?run=record&section=sources&focus=coverage'
  );
  assert.equal(
    companyPath('record', 'industry'),
    '/company?run=record&section=financial&focus=industry'
  );
  assert.equal(
    companyPath('record', 'sources', 'source-comparison'),
    '/company?run=record&section=sources&focus=source-comparison'
  );
  assert.equal(resolveCompanyFocus('sources', 'coverage'), 'company-data-coverage');
  assert.equal(resolveCompanyFocus('financial', 'industry'), 'company-industry');
  assert.equal(resolveCompanyFocus('overview', 'lab'), 'company-evidence-lab');
  assert.equal(resolveCompanyFocus('financial', 'coverage'), null);
  assert.equal(resolveCompanyFocus('sources', '__proto__'), null);
  assert.deepEqual(resolveCompanyLocation('trends', 'goal'), {
    section: 'financial',
    focus: 'history',
  });
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
  assert.equal(loginDestination('/research', origin), '/research');
});

test('SPA links leave originals, downloads, external sites and page anchors to the browser', () => {
  assert.equal(appLinkPath('/docs?section=privacy', origin), '/docs/guide?section=privacy');
  assert.equal(appLinkPath(origin + '/account', origin), '/account');
  assert.equal(appLinkPath('/research', origin), '/research');
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
