import { request } from '/workspace/prispect/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4319';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-before';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-before-account.json', 'utf8')
);
const ids = JSON.parse(await readFile(out + '/record-ids.json', 'utf8'));
const owner = await request.newContext({ baseURL: base });
const session = await (
  await owner.post('/api/auth/login', {
    data: { email: account.email, password: account.password },
  })
).json();
assert.ok(session.user);
const result = {
  recordedAt: new Date().toISOString(),
  mode: process.argv[2] || 'before-restart',
  checks: [],
  sha: 'd748d1ac5c1a9c6fe702301c819980e1cce87312',
};
for (const path of [
  `/api/tasks/${ids.taskId}`,
  `/api/decisions/${ids.decisionId}`,
  `/api/materials/${ids.materialId}/file`,
]) {
  const r = await owner.get(path);
  assert.equal(r.status(), 200);
  result.checks.push({
    path,
    ownerStatus: r.status(),
    sha256: createHash('sha256')
      .update(await r.body())
      .digest('hex'),
  });
}
if (result.mode === 'before-restart') {
  await writeFile(
    out + '/decision-before-restart.json',
    JSON.stringify(await (await owner.get(`/api/decisions/${ids.decisionId}`)).json(), null, 2)
  );
  const anonymous = await request.newContext({ baseURL: base });
  for (const path of result.checks.map((c) => c.path)) {
    const r = await anonymous.get(path);
    assert.equal(r.status(), 401);
    result.checks.find((c) => c.path === path).anonymousStatus = r.status();
  }
  await anonymous.dispose();
  const other = await request.newContext({ baseURL: base });
  const registered = await other.post('/api/auth/register', {
    data: {
      email: `baseline-other-${Date.now()}@example.test`,
      name: '合成第二账号',
      password: 'Isolation!26Private$Paper',
    },
  });
  assert.equal(registered.status(), 201);
  for (const path of [
    ...result.checks.map((c) => c.path),
    `/api/tasks/${ids.taskId}/export?format=json`,
  ]) {
    const r = await other.get(path);
    assert.equal(r.status(), 404);
    result.checks.push({ path, otherOwnerStatus: r.status() });
  }
  await other.dispose();
  const headers = { 'X-CSRF-Token': session.csrfToken, Origin: 'https://unrelated.example.test' };
  const blocked = await owner.patch(`/api/decisions/${ids.decisionId}`, {
    headers,
    data: { baseRevision: 6, input: {} },
  });
  assert.equal(blocked.status(), 403);
  result.checks.push({ name: 'cross-origin-write-rejected', status: blocked.status() });
} else {
  const before = JSON.parse(await readFile(out + '/isolation-before-restart.json', 'utf8'));
  for (const check of result.checks) {
    const earlier = before.checks.find((c) => c.path === check.path && c.ownerStatus);
    if (!check.path.includes('/api/decisions/')) {
      assert.equal(check.sha256, earlier.sha256);
      check.exactRetainedBody = true;
    } else {
      const after = await (await owner.get(check.path)).json();
      const beforeDecision = JSON.parse(
        await readFile(out + '/decision-before-restart.json', 'utf8')
      );
      assert.deepEqual(after.version, beforeDecision.version);
      assert.deepEqual(after.decision, beforeDecision.decision);
      assert.deepEqual(after.evaluation.external, beforeDecision.evaluation.external);
      check.retainedVersionAndCalculatedScenarios = true;
    }
  }
}
await writeFile(out + `/isolation-${result.mode}.json`, JSON.stringify(result, null, 2));
await owner.dispose();
