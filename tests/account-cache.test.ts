import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { WorkspaceStore } from '../server/store.js';
import { initialCompanyGraphProgress } from '../server/company-agent.js';

test('expired recoverable public cache is removed only for its owner and failed run; history stays', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'cashlens-cache-test-'));
  try {
    const first = new WorkspaceStore(process.cwd(), path.join(parent, 'first'));
    const second = new WorkspaceStore(process.cwd(), path.join(parent, 'second'));
    await first.initialize();
    await second.initialize();
    const expiredId = randomUUID(),
      runningId = randomUUID(),
      recentId = randomUUID();
    const make = (
      id: string,
      status: CompanyResearchRun['status'],
      age: number
    ): CompanyResearchRun => ({
      id,
      status,
      input: {
        securityCode: '300893',
        orgId: '9900039861',
        year: 2025,
        useModel: false,
      },
      createdAt: new Date(Date.now() - age).toISOString(),
      updatedAt: new Date().toISOString(),
      trace: [],
      announcements: [],
      model: { requested: false, status: 'not-requested' },
      agent: { ...initialCompanyGraphProgress(), recoverable: true },
    });
    first.state.companyRuns = [
      make(expiredId, 'failed', 25 * 3600000),
      make(runningId, 'running', 25 * 3600000),
      make(recentId, 'failed', 1000),
    ];
    second.state.companyRuns = [make(expiredId, 'failed', 25 * 3600000)];
    for (const [store, ids] of [
      [first, [expiredId, runningId, recentId]],
      [second, [expiredId]],
    ] as const)
      for (const id of ids) {
        const directory = path.join(store.dataDir, 'company-agent', id);
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, 'scope.json'), 'public only');
      }
    await first.cleanupUploads(true);
    await assert.rejects(access(path.join(first.dataDir, 'company-agent', expiredId)));
    assert.equal(first.state.companyRuns[0]!.agent!.recoverable, false);
    await access(path.join(first.dataDir, 'company-agent', runningId));
    await access(path.join(first.dataDir, 'company-agent', recentId));
    await access(path.join(second.dataDir, 'company-agent', expiredId));
    const persisted = JSON.parse(
      await readFile(path.join(first.dataDir, 'workspace.json'), 'utf8')
    );
    assert.equal(persisted.companyRuns.length, 3);
    assert.equal(persisted.companyRuns[0].agent.recoverable, false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
