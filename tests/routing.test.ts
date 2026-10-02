import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appPath,
  appLinkPath,
  legacyRoute,
  loginDestination,
  resolveCompanySection,
} from '../src/routing.js';

const origin = 'https://prispect.com';

test('company navigation and content resolve missing, invalid and legacy sections consistently', () => {
  for (const section of [null, undefined, '', 'unknown', 'qa', 'Overview'])
    assert.equal(resolveCompanySection(section), 'overview');
  for (const section of [
    'overview',
    'trends',
    'industry',
    'disclosures',
    'profile',
    'coverage',
    'sources',
    'evidence',
  ])
    assert.equal(resolveCompanySection(section), section);
});

test('legacy links retain encoded task IDs, query values and document sections', () => {
  assert.equal(legacyRoute('#/docs?section=materials', origin), '/docs?section=materials');
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
});

test('SPA links leave originals, downloads, external sites and page anchors to the browser', () => {
  assert.equal(appLinkPath('/docs?section=privacy', origin), '/docs?section=privacy');
  assert.equal(appLinkPath(origin + '/account', origin), '/account');
  for (const native of [
    '/api/materials/id/file',
    '/appearance-init.js',
    '#main',
    '#method-privacy',
    '/method#method-privacy',
    'https://other.example/docs',
    'mailto:contact@example.test',
  ])
    assert.equal(appLinkPath(native, origin), null, native);
});

test('trailing slashes normalize without losing queries or genuine fragments', () => {
  assert.equal(appPath('/docs/?section=import#main', origin), '/docs?section=import#main');
  assert.equal(appPath('/', origin), '/');
});
