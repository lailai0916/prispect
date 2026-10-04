import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts';
import { deriveCompanyAssessment } from '../shared/company-assessment';
import { contextAmountFields } from '../shared/company-workspace';
import {
  COMPANY_CACHE_ENTRY_BYTES,
  COMPANY_CACHE_MAX_BYTES,
  COMPANY_CACHE_MAX_ENTRIES,
  COMPANY_CACHE_PREFIX,
  CompanyRunCache,
  publicCompanyCacheRun,
} from '../src/company-run-cache';

const acquiredAt = '2026-10-03T00:00:00.000Z';
const analyzedAt = '2026-10-03T00:03:00.000Z';
const sentinel = 'PRIVATE-UPLOAD-QUESTION-PLAN-SECRET';
const storageKey = (owner: string) => `${COMPANY_CACHE_PREFIX}${encodeURIComponent(owner)}`;

test('a delayed record list cannot prune a new snapshot acquired after the request began', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  cache.save('alice', fixture('old-record'));
  const checked = cache.ids('alice');
  cache.save('alice', fixture('new-record'));
  cache.retain('alice', [], checked);
  assert.equal(cache.read('alice', 'old-record'), null);
  assert.ok(cache.read('alice', 'new-record'));
  cache.save('alice', fixture('old-record'));
  assert.equal(cache.read('alice', 'old-record'), null);
});

class MemoryStorage {
  readonly values = new Map<string, string>();
  denied = false;
  allowedBytes = Infinity;
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.denied || value.length * 2 > this.allowedBytes)
      throw new DOMException('Storage denied or full', 'QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function fixture(id = 'research-1'): CompanyResearchRun {
  const run: CompanyResearchRun = {
    id,
    input: { securityCode: '600519', orgId: 'org-600519', year: 2025, purpose: 'external' },
    identity: {
      securityCode: '600519',
      orgId: 'org-600519',
      shortName: '公开样本',
      companyName: '公开样本股份有限公司',
      exchange: 'sse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: acquiredAt,
    updatedAt: analyzedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'org-600519',
      companyName: '公开样本股份有限公司',
      fetchedAt: acquiredAt,
      status: 'available',
      financials: [
        {
          period: '2025-12-31',
          annual: true,
          noticeDate: '2026-03-01',
          amounts: Object.fromEntries(
            contextAmountFields.map((field) => [
              field,
              field === 'netProfit' ? '1000000' : field === 'ocf' ? '600000' : null,
            ])
          ) as NonNullable<CompanyResearchRun['context']>['financials'][number]['amounts'],
          ratios: { grossMargin: null, roe: null, revenueGrowth: null },
          auditOpinion: null,
          fieldSources: { netProfit: 'public-finance', ocf: 'public-finance' },
          sourceUrls: ['https://datacenter.eastmoney.com/'],
          originalUrl: null,
        },
      ],
      sources: [
        {
          id: 'public-finance',
          provider: 'eastmoney',
          dimension: 'finance',
          url: 'https://datacenter.eastmoney.com/',
          status: 'available',
          fetchedAt: acquiredAt,
          latestDate: '2025-12-31',
          count: 1,
          note: '公开网页年度合并字段',
          responseHashes: ['a'.repeat(64)],
        },
      ],
      comparisons: [],
      profile: { name: '公开样本股份有限公司' },
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
    assessmentStatus: 'ready',
  };
  run.assessment = deriveCompanyAssessment(run);
  run.assessment.generatedAt = analyzedAt;
  return run;
}

function privateFixture(): CompanyResearchRun {
  const run = fixture();
  run.assessmentFocus = sentinel;
  run.assessmentTrace = [
    {
      id: 'custom-focus',
      tool: 'planning',
      label: 'Plan',
      status: 'completed',
      startedAt: acquiredAt,
      finishedAt: analyzedAt,
      summary: sentinel,
    },
  ];
  run.assessment!.research = {
    goal: sentinel,
    steps: [...run.assessmentTrace],
    modelCalls: 2,
    toolCalls: 3,
  };
  run.questions = [
    {
      question: sentinel,
      text: sentinel,
      citations: [],
      mode: 'model',
      createdAt: analyzedAt,
      snapshotFetchedAt: acquiredAt,
    },
  ];
  run.preview = {
    material: {
      company: sentinel,
      shortName: sentinel,
      title: sentinel,
      filename: sentinel,
      origin: 'user-upload',
      documentDate: '2026-10-03',
      sha256: 'b'.repeat(64),
      observations: [],
      excerpts: [{ page: 1, text: sentinel }],
      uploadId: sentinel,
      rawSourceId: sentinel,
      notes: [sentinel],
    },
    reviewRequired: true,
    warnings: [sentinel],
    checks: [],
    tablePages: [1],
  };
  run.adoptedMaterialId = sentinel;
  run.agent = { checkpointPath: sentinel } as unknown as CompanyResearchRun['agent'];
  run.trace = [
    {
      id: 'private-trace',
      tool: 'read_original',
      label: 'Original',
      status: 'completed',
      startedAt: acquiredAt,
      inputSummary: sentinel,
      outputSummary: sentinel,
      sources: [],
    },
  ];
  run.error = sentinel;
  run.contextError = sentinel;
  run.assessmentError = sentinel;
  run.model.error = sentinel;
  return run;
}

test('local lookup uses the same mode boundary as the server, including legacy original-document records', () => {
  const cache = new CompanyRunCache(() => null);
  cache.activate('alice');
  const legacy = fixture('legacy');
  const financial = fixture('financial');
  financial.input.researchMode = 'financial';
  cache.save('alice', legacy);
  assert.equal(cache.find('alice', { ...legacy.input, researchMode: 'financial' }), null);
  cache.save('alice', financial);
  assert.equal(cache.find('alice', financial.input)!.id, financial.id);
  assert.equal(cache.find('alice', { ...legacy.input, researchMode: 'deep' })!.id, legacy.id);
});

test('late responses cannot overwrite a newer source generation or revive an already finished analysis', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  const older = fixture();
  older.input.researchMode = 'financial';
  older.contextRevision = 1;
  older.assessmentRevision = 1;
  const newer = structuredClone(older);
  newer.contextRevision = 2;
  newer.assessmentRevision = 3;
  newer.context!.fetchedAt = '2026-10-03T02:00:00.000Z';
  newer.assessment!.snapshotFetchedAt = newer.context!.fetchedAt;
  newer.assessment!.generatedAt = '2026-10-03T02:03:00.000Z';
  cache.save('alice', newer);
  cache.save('alice', older);
  assert.equal(cache.read('alice', newer.id)!.contextRevision, 2);
  const loading = structuredClone(newer);
  loading.assessmentStatus = 'loading';
  cache.save('alice', loading);
  assert.equal(cache.read('alice', newer.id)!.assessmentStatus, 'ready');
  const next = structuredClone(loading);
  next.assessmentRevision = 4;
  cache.save('alice', next);
  assert.equal(cache.read('alice', newer.id)!.assessmentStatus, 'loading');
  cache.save('alice', newer);
  assert.equal(cache.read('alice', newer.id)!.assessmentRevision, 4);
  next.assessmentStatus = 'ready';
  cache.save('alice', next);
  const reloaded = new CompanyRunCache(() => storage);
  reloaded.activate('alice');
  assert.equal(reloaded.read('alice', next.id)!.assessmentStatus, 'ready');
  assert.equal(reloaded.read('alice', next.id)!.context!.fetchedAt, newer.context!.fetchedAt);
});

test('persistent cache excludes private originals, questions, arbitrary goals and execution summaries', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  const original = privateFixture();
  cache.save('alice', original);
  const serialized = storage.getItem(storageKey('alice'))!;
  assert.ok(serialized);
  assert.ok(!serialized.includes(sentinel));
  const saved = cache.read('alice', original.id)!;
  assert.equal(saved.preview, undefined);
  assert.equal(saved.questions, undefined);
  assert.equal(saved.agent, undefined);
  assert.equal(saved.adoptedMaterialId, undefined);
  assert.equal(saved.assessmentFocus, undefined);
  assert.equal(saved.assessmentTrace, undefined);
  assert.equal(saved.assessment!.research!.goal, '');
  assert.equal(saved.assessment!.research!.steps[0]!.summary, '');
  assert.equal(saved.context!.fetchedAt, acquiredAt);
  assert.equal(saved.assessment!.snapshotFetchedAt, acquiredAt);
  assert.equal(original.assessment!.research!.goal, sentinel);
});

test('a new browser cache instance restores the same saved sources and report without changing dates', () => {
  const storage = new MemoryStorage();
  const first = new CompanyRunCache(
    () => storage,
    () => 100
  );
  first.activate('alice');
  first.save('alice', fixture());
  const reopened = new CompanyRunCache(
    () => storage,
    () => 100_000_000
  );
  reopened.activate('alice');
  const saved = reopened.read('alice', 'research-1')!;
  assert.equal(saved.context!.fetchedAt, acquiredAt);
  assert.equal(saved.assessment!.generatedAt, analyzedAt);
  assert.equal(
    saved.assessment!.metrics.find((metric) => metric.id === 'cash-profit')!.value,
    '60.00'
  );
  assert.equal(saved.context!.financials[0]!.amounts.ocf, '600000');
});

test('cached data is independently cloned on save and every read', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  const original = fixture();
  cache.save('alice', original);
  original.context!.financials[0]!.amounts.ocf = '1';
  const first = cache.read('alice', original.id)!;
  assert.equal(first.context!.financials[0]!.amounts.ocf, '600000');
  first.context!.financials[0]!.amounts.ocf = '2';
  first.context!.sources[0]!.responseHashes.push('untrusted');
  assert.equal(cache.read('alice', original.id)!.context!.financials[0]!.amounts.ocf, '600000');
  assert.deepEqual(cache.read('alice', original.id)!.context!.sources[0]!.responseHashes, [
    'a'.repeat(64),
  ]);
});

test('company reuse requires the exact account, issuer, organization, year and purpose', () => {
  const cache = new CompanyRunCache(() => newStorage);
  const newStorage = new MemoryStorage();
  cache.activate('alice');
  const run = fixture();
  cache.save('alice', run);
  assert.equal(cache.find('alice', { ...run.input, purpose: undefined })!.id, run.id);
  for (const input of [
    { ...run.input, securityCode: '000001' },
    { ...run.input, orgId: 'another-issuer' },
    { ...run.input, year: 2024 },
    { ...run.input, purpose: 'handover' as const },
  ])
    assert.equal(cache.find('alice', input), null);
  assert.equal(cache.read('bob', run.id), null);
  cache.activate('bob');
  assert.equal(cache.read('alice', run.id), null);
  assert.equal(cache.find('alice', run.input), null);
  cache.save('alice', fixture('late-alice'));
  assert.equal(newStorage.getItem(storageKey('bob')), null);
  cache.activate(null);
  assert.equal(cache.read('alice', run.id), null);
});

test('unsettled source, analysis and challenge refreshes never replace the last acquired cache', () => {
  const cache = new CompanyRunCache(() => null);
  cache.activate('alice');
  const original = fixture();
  cache.save('alice', original);
  const newer = fixture();
  newer.context!.fetchedAt = '2026-10-03T01:00:00.000Z';
  for (const pending of [
    { ...newer, status: 'running' as const },
    { ...newer, contextStatus: 'loading' as const },
    { ...newer, assessmentStatus: 'loading' as const },
    { ...newer, challenge: { status: 'loading' } as CompanyResearchRun['challenge'] },
  ]) {
    cache.save('alice', pending);
    assert.equal(cache.read('alice', original.id)!.context!.fetchedAt, acquiredAt);
  }
});

test('mismatched issuer, annual report or source snapshot is not reusable as a cache', () => {
  for (const transform of [
    (run: CompanyResearchRun) => (run.identity!.orgId = 'different-org'),
    (run: CompanyResearchRun) => (run.context!.securityCode = '000001'),
    (run: CompanyResearchRun) => (run.assessment!.year = 2024),
    (run: CompanyResearchRun) => (run.assessment!.snapshotFetchedAt = 'previous-snapshot'),
    (run: CompanyResearchRun) => (run.identity!.exchange = 'us'),
    (run: CompanyResearchRun) => (run.informationGap = { name: 'Unknown', reason: 'Unknown' }),
  ]) {
    const run = fixture();
    transform(run);
    assert.equal(publicCompanyCacheRun(run), null);
  }
});

test('cache count and least recently used eviction include actual reads', () => {
  const storage = new MemoryStorage();
  let tick = 0;
  const cache = new CompanyRunCache(
    () => storage,
    () => ++tick
  );
  cache.activate('alice');
  for (let index = 0; index < COMPANY_CACHE_MAX_ENTRIES; index++)
    cache.save('alice', fixture(`research-${index}`));
  assert.ok(cache.read('alice', 'research-0'));
  cache.save('alice', fixture('research-new'));
  const envelope = JSON.parse(storage.getItem(storageKey('alice'))!);
  assert.equal(Object.keys(envelope.entries).length, COMPANY_CACHE_MAX_ENTRIES);
  assert.ok(cache.read('alice', 'research-0'));
  assert.equal(cache.read('alice', 'research-1'), null);
  assert.ok(cache.read('alice', 'research-new'));
});

test('total and individual UTF-16 size limits evict public snapshots instead of breaking navigation', () => {
  const storage = new MemoryStorage();
  let tick = 0;
  const cache = new CompanyRunCache(
    () => storage,
    () => ++tick
  );
  cache.activate('alice');
  for (let index = 0; index < 8; index++) {
    const run = fixture(`large-${index}`);
    run.context!.profile.publicExcerpt = '公'.repeat(280_000);
    cache.save('alice', run);
  }
  const serialized = storage.getItem(storageKey('alice'))!;
  assert.ok(serialized.length * 2 <= COMPANY_CACHE_MAX_BYTES);
  assert.equal(cache.read('alice', 'large-0'), null);
  assert.ok(cache.read('alice', 'large-7'));
  const oversize = fixture('too-large');
  oversize.context!.profile.publicExcerpt = '公'.repeat(COMPANY_CACHE_ENTRY_BYTES / 2);
  cache.save('alice', oversize);
  assert.equal(cache.read('alice', 'too-large'), null);
  assert.ok(cache.read('alice', 'large-7'));
});

test('denied browser writes retain an account-isolated readable memory fallback', () => {
  const storage = new MemoryStorage();
  storage.denied = true;
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  cache.save('alice', fixture());
  assert.equal(storage.getItem(storageKey('alice')), null);
  assert.ok(cache.read('alice', 'research-1'));
  assert.ok(cache.read('alice', 'research-1'));
  const reopened = new CompanyRunCache(() => storage);
  reopened.activate('alice');
  assert.equal(reopened.read('alice', 'research-1'), null);
  cache.activate('bob');
  assert.equal(cache.read('alice', 'research-1'), null);
});

test('quota eviction preserves the newly acquired report when an older version can make space', () => {
  const storage = new MemoryStorage();
  let tick = 0;
  const cache = new CompanyRunCache(
    () => storage,
    () => ++tick
  );
  cache.activate('alice');
  cache.save('alice', fixture('old'));
  storage.allowedBytes = storage.getItem(storageKey('alice'))!.length * 2 + 400;
  cache.save('alice', fixture('new'));
  assert.equal(cache.read('alice', 'old'), null);
  assert.ok(cache.read('alice', 'new'));
});

test('corrupt JSON, changed checksums, malformed records and owner substitutions become cache misses', () => {
  for (const damage of [
    () => '{not-json',
    (raw: string) => raw.replace('600000', '999999'),
    (raw: string) => JSON.stringify({ ...JSON.parse(raw), owner: 'bob' }),
    (raw: string) => JSON.stringify({ ...JSON.parse(raw), version: 999 }),
    (raw: string) => {
      const envelope = JSON.parse(raw);
      envelope.entries['research-1'].payload = '{}';
      return JSON.stringify(envelope);
    },
    (raw: string) => {
      const envelope = JSON.parse(raw);
      envelope.entries['research-1'] = null;
      return JSON.stringify(envelope);
    },
  ]) {
    const storage = new MemoryStorage();
    const writer = new CompanyRunCache(() => storage);
    writer.activate('alice');
    writer.save('alice', fixture());
    storage.setItem(storageKey('alice'), damage(storage.getItem(storageKey('alice'))!));
    const reader = new CompanyRunCache(() => storage);
    reader.activate('alice');
    assert.equal(reader.read('alice', 'research-1'), null);
  }
});

test('malformed sibling entries cannot break reading or saving an otherwise usable report', () => {
  const storage = new MemoryStorage();
  const writer = new CompanyRunCache(() => storage);
  writer.activate('alice');
  writer.save('alice', fixture('kept'));
  for (let index = 1; index < COMPANY_CACHE_MAX_ENTRIES; index++)
    writer.save('alice', fixture(`sibling-${index}`));
  const envelope = JSON.parse(storage.getItem(storageKey('alice'))!);
  envelope.entries.nullEntry = null;
  envelope.entries.stringEntry = 'damaged';
  envelope.entries.invalidPayload = { payload: '{}', checksum: 'damaged', touchedAt: 'bad' };
  storage.setItem(storageKey('alice'), JSON.stringify(envelope));
  const reader = new CompanyRunCache(() => storage);
  reader.activate('alice');
  assert.doesNotThrow(() => reader.read('alice', 'kept'));
  assert.equal(reader.read('alice', 'kept')!.context!.fetchedAt, acquiredAt);
  assert.doesNotThrow(() => reader.save('alice', fixture('new')));
  assert.ok(reader.read('alice', 'new'));
  assert.equal(reader.read('alice', 'nullEntry'), null);
});

test('successful record deletion tombstones the ID and rejects a late response save', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  const original = fixture();
  cache.save('alice', original);
  cache.remove('alice', original.id);
  cache.save('alice', original);
  assert.equal(cache.read('alice', original.id), null);
  const reopened = new CompanyRunCache(() => storage);
  reopened.activate('alice');
  assert.equal(reopened.read('alice', original.id), null);
});

test('a deletion reconciled from another tab rejects that tab’s pending save and preserves unrelated IDs', () => {
  const storage = new MemoryStorage();
  const deleting = new CompanyRunCache(() => storage);
  const waiting = new CompanyRunCache(() => storage);
  deleting.activate('alice');
  waiting.activate('alice');
  deleting.save('alice', fixture('removed'));
  deleting.save('alice', fixture('kept'));
  assert.ok(waiting.read('alice', 'removed'));
  deleting.remove('alice', 'removed');
  waiting.externalRemoval('alice', ['removed']);
  waiting.save('alice', fixture('removed'));
  assert.equal(waiting.read('alice', 'removed'), null);
  assert.ok(waiting.read('alice', 'kept'));
});

test('successful authoritative-record reconciliation prunes deletions, and clearing keeps earlier tombstones', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  cache.save('alice', fixture('removed'));
  cache.save('alice', fixture('kept'));
  cache.retain('alice', ['kept']);
  assert.equal(cache.read('alice', 'removed'), null);
  assert.ok(cache.read('alice', 'kept'));
  cache.clear('alice');
  cache.save('alice', fixture('removed'));
  cache.save('alice', fixture('kept'));
  assert.equal(cache.read('alice', 'removed'), null);
  assert.equal(cache.read('alice', 'kept'), null);
  assert.equal(storage.getItem(storageKey('alice')), null);
});

test('a new confirmed sign-in can cache existing research again after logout cleared its old copy', () => {
  const storage = new MemoryStorage();
  const cache = new CompanyRunCache(() => storage);
  cache.activate('alice');
  const original = fixture();
  cache.save('alice', original);
  cache.clear('alice');
  cache.activate(null);
  assert.equal(cache.read('alice', original.id), null);
  cache.save('alice', original);
  assert.equal(storage.getItem(storageKey('alice')), null);
  cache.activate('alice');
  cache.save('alice', original);
  assert.ok(cache.read('alice', original.id));
});

test('API-first public data restores immediately in a new cache instance while background analysis remains loading', () => {
  const storage = new MemoryStorage();
  const writer = new CompanyRunCache(() => storage);
  writer.activate('alice');
  const run = privateFixture();
  run.input.researchMode = 'financial';
  run.assessmentStatus = 'loading';
  run.assessmentRevision = 2;
  run.assessmentTrace![0]!.status = 'running';
  Object.assign(run.assessmentTrace![0]!, {
    diagnostics: sentinel,
    sources: [{ privateSource: sentinel }],
  });
  delete run.assessment;
  const before = structuredClone(run);
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests++;
    throw Error('restoring a public reading cache must not retrieve or start analysis');
  };
  try {
    writer.save('alice', run);
    const reopened = new CompanyRunCache(() => storage);
    reopened.activate('alice');
    const restored = reopened.read('alice', run.id)!;
    assert.ok(restored);
    assert.equal(restored.input.researchMode, 'financial');
    assert.equal(restored.status, 'ready');
    assert.equal(restored.contextStatus, 'ready');
    assert.equal(restored.context!.financials[0]!.amounts.ocf, '600000');
    assert.equal(restored.context!.fetchedAt, acquiredAt);
    assert.equal(restored.assessmentStatus, 'loading');
    assert.equal(restored.assessmentRevision, 2);
    assert.equal(restored.assessment, undefined);
    assert.deepEqual(restored.assessmentTrace, [
      {
        id: 'custom-focus',
        tool: 'planning',
        label: 'Plan',
        status: 'running',
        startedAt: acquiredAt,
        finishedAt: analyzedAt,
        summary: '',
      },
    ]);
    assert.equal(requests, 0);
    assert.ok(!storage.getItem(storageKey('alice'))!.includes(sentinel));
    assert.deepEqual(run, before, 'cache projection must not modify the running server response');
    writer.remove('alice', run.id);
    writer.save('alice', run);
    assert.equal(
      writer.read('alice', run.id),
      null,
      'late background progress cannot revive a deleted record'
    );
    reopened.activate('bob');
    assert.equal(reopened.read('alice', run.id), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('financial background analysis retains a matching old report without relabeling it as the completed new revision', () => {
  const storage = new MemoryStorage();
  const writer = new CompanyRunCache(() => storage);
  writer.activate('alice');
  const run = privateFixture();
  run.input.researchMode = 'financial';
  run.assessmentStatus = 'loading';
  run.assessmentRevision = 2;
  writer.save('alice', run);
  const reader = new CompanyRunCache(() => storage);
  reader.activate('alice');
  const restored = reader.read('alice', run.id)!;
  assert.equal(restored.assessmentStatus, 'loading');
  assert.equal(restored.assessment!.generatedAt, analyzedAt);
  assert.equal(restored.assessment!.snapshotFetchedAt, restored.context!.fetchedAt);
  assert.equal(restored.assessmentTrace![0]!.summary, '');
  assert.ok(!storage.getItem(storageKey('alice'))!.includes(sentinel));
});

test('pending API context, legacy analysis, challenge refresh and mismatched previous report do not overwrite the acquired cache', () => {
  const cache = new CompanyRunCache(() => null);
  cache.activate('alice');
  const original = fixture();
  cache.save('alice', original);
  const pending = fixture();
  pending.input.researchMode = 'financial';
  pending.assessmentStatus = 'loading';
  pending.context!.fetchedAt = '2026-10-03T01:00:00.000Z';
  pending.assessment!.snapshotFetchedAt = pending.context!.fetchedAt;
  for (const change of [
    (run: CompanyResearchRun) => {
      run.contextStatus = 'loading';
    },
    (run: CompanyResearchRun) => {
      delete run.input.researchMode;
    },
    (run: CompanyResearchRun) => {
      run.input.researchMode = 'deep';
    },
    (run: CompanyResearchRun) => {
      run.status = 'running';
    },
    (run: CompanyResearchRun) => {
      run.challenge = { status: 'loading' } as CompanyResearchRun['challenge'];
    },
    (run: CompanyResearchRun) => {
      run.assessment!.snapshotFetchedAt = acquiredAt;
    },
  ]) {
    const run = structuredClone(pending);
    change(run);
    cache.save('alice', run);
    assert.equal(cache.read('alice', original.id)!.context!.fetchedAt, acquiredAt);
    assert.equal(cache.read('alice', original.id)!.assessmentStatus, 'ready');
  }
});
