import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, Material, DemoCase, AnalysisTask } from '../shared/contracts.js';
import type {
  DecisionDetail,
  DecisionInput,
  DecisionEvidenceInput,
} from '../shared/decision-contracts.js';
import { createApp } from '../server/app.js';

interface Client {
  cookie: string;
  csrf: string;
}
async function openService(directory: string, onModel: (body: string) => void) {
  const app = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {
      apiKey: 'test-only-no-network',
      fetch: async (_url, request) => {
        const body = String(request?.body);
        onModel(body);
        const supplied = JSON.parse(JSON.parse(body).messages[1].content);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    explanations: [
                      { text: '应继续核对公开财报原文。', citations: [supplied.evidence[0].id] },
                    ],
                  }),
                },
              },
            ],
          })
        );
      },
    },
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...app,
    request: (url: string, init: RequestInit = {}) => fetch(base + url, init),
    stop: async () => {
      await app.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.auth.close();
    },
  };
}
function options(client: Client, body?: unknown, method = 'GET'): RequestInit {
  return {
    method,
    headers: {
      Cookie: client.cookie,
      'X-CSRF-Token': client.csrf,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
async function account(
  service: Awaited<ReturnType<typeof openService>>,
  email: string,
  login = false
): Promise<Client> {
  const response = await service.request(`/api/auth/${login ? 'login' : 'register'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'decision-test-password',
      ...(login ? {} : { name: '决定测试' }),
    }),
  });
  assert.equal(response.status, login ? 200 : 201);
  const session = (await response.json()) as AuthSession;
  assert.ok(session.user && session.csrfToken);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: session.csrfToken };
}
function input(): DecisionInput {
  return {
    title: '虚构付款决定',
    transactionEntity: '测试公司',
    purpose: 'external',
    promise: '销售原话，不认证承诺',
    reportTaskId: null,
    datedCash: null,
    external: {
      asOf: '2026-10-02',
      totalAmount: '100000',
      payeeEntity: null,
      refundEntity: null,
      alreadyPaid: '10',
      deliveredAmount: '0',
      actualRefund: '0',
      proposedAmount: '0',
      alternativeAmount: '20000',
      exposureLimit: '20000',
    },
  };
}
async function material(
  service: Awaited<ReturnType<typeof openService>>,
  client: Client,
  texts: string[]
): Promise<Material> {
  const response = await service.request(
    '/api/materials',
    options(
      client,
      {
        title: '虚构用户记录',
        company: '测试公司',
        shortName: '测试公司',
        filename: 'record.json',
        origin: 'user-upload',
        documentDate: '2026-10-02',
        sha256: 'a'.repeat(64),
        observations: [],
        excerpts: [{ page: 1, text: texts.join('\n') }],
        notes: ['用户录入文本，未经鉴真'],
      },
      'POST'
    )
  );
  assert.equal(response.status, 201);
  return response.json() as Promise<Material>;
}
function evidence(materialId: string, quote: string, amount: string): DecisionEvidenceInput {
  return {
    slot: 'paid',
    kind: 'source-record',
    entity: '测试公司',
    asOf: '2026-10-02',
    values: { amount },
    quote,
    sourceLabel: '用户付款记录',
    materialId,
    page: 1,
  };
}
const gate = (detail: DecisionDetail, id: string) =>
  detail.evaluation.gates.find((gate) => gate.id === id)!;

test('distinguishing material review persists through actual HTTP revisions, owner boundaries, withdrawal, restoration and restart without a private model request', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-distinction-api-'));
  let calls = 0;
  const modelBodies: string[] = [];
  const captureModel = (body: string) => {
    calls++;
    modelBodies.push(body);
  };
  let service: Awaited<ReturnType<typeof openService>> | undefined = await openService(
    directory,
    captureModel
  );
  try {
    const alice = await account(service, 'distinction-alice@example.com');
    const bob = await account(service, 'distinction-bob@example.com');
    const demos = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const demo = demos.find((row) => row.id === 'songyuan')!;
    assert.equal(
      (await service.request(`/api/cases/${demo.id}/import`, options(alice, {}, 'POST'))).status,
      201
    );
    const quote = `${demo.company}截至2026-10-02，虚构账龄测试字段100元，不是该公司当前事实。 PRIVATE_COLLECTIONS_73419`;
    const contraryQuote = `${demo.company}截至2026-10-02，虚构账龄测试字段200元，不是该公司当前事实。 PRIVATE_CONTRARY_73419`;
    const saved = await material(service, alice, [quote, contraryQuote]);
    assert.equal(calls, 0, 'saving private material does not request AI');
    const taskResponse = await service.request(
      '/api/tasks',
      options(
        alice,
        {
          title: '真实年度背景',
          company: demo.company,
          year: demo.year,
          materialIds: demo.materialIds,
        },
        'POST'
      )
    );
    assert.equal(taskResponse.status, 202);
    const task = (await taskResponse.json()) as AnalysisTask;
    assert.equal(task.useModel, true);
    await service.waitForIdle();
    const completedTask = (await (
      await service.request(`/api/tasks/${task.id}`, options(alice))
    ).json()) as AnalysisTask;
    assert.equal(completedTask.report?.model.status, 'completed');
    const publicModelBaseline = calls;
    assert.equal(publicModelBaseline, 1, 'the public financial background is analyzed with AI');
    const privateCashFloor = '918273645.67';
    const decisionInput: DecisionInput = {
      ...input(),
      title: 'PRIVATE_DECISION_73419',
      promise: 'PRIVATE_PROMISE_73419',
      tradingName: 'PRIVATE_TRADING_NAME_73419',
      claims: [{ id: 'private-claim', text: 'PRIVATE_CLAIM_73419', target: 'collections' }],
      purpose: 'handover',
      transactionEntity: demo.company,
      reportTaskId: task.id,
      external: null,
      datedCash: {
        asOf: '2026-10-02',
        openingCash: null,
        cashFloor: privateCashFloor,
        proposedAmount: null,
        proposedDay: null,
        alternativeDay: null,
        flows: [],
      },
    };
    const created = await service.request('/api/decisions', options(alice, decisionInput, 'POST'));
    assert.equal(created.status, 201);
    let detail = (await created.json()) as DecisionDetail;
    assert.equal(detail.version.input.tradingName, 'PRIVATE_TRADING_NAME_73419');
    assert.equal(detail.version.input.claims?.[0]?.text, 'PRIVATE_CLAIM_73419');
    assert.equal(detail.changes, undefined);
    const url = `/api/decisions/${detail.decision.id}`;
    const baselineCash = detail.evaluation.cash;
    const payload = {
      ...evidence(saved.id, quote, '100'),
      entity: demo.company,
      slot: 'collections',
    };
    assert.equal(
      (
        await service.request(
          url + '/evidence',
          options(bob, { baseRevision: 1, evidence: payload }, 'POST')
        )
      ).status,
      404
    );
    assert.equal(
      (
        await service.request(url + '/evidence', {
          ...options(alice, { baseRevision: 1, evidence: payload }, 'POST'),
          headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
        })
      ).status,
      403
    );
    const add = await service.request(
      url + '/evidence',
      options(alice, { baseRevision: 1, evidence: payload }, 'POST')
    );
    assert.equal(add.status, 200);
    detail = (await add.json()) as DecisionDetail;
    assert.equal(detail.changes?.fromRevision, 1);
    assert.equal(detail.changes?.toRevision, 2);
    assert.ok(detail.changes?.changes.some((row) => row.kind === 'evidence'));
    const firstEvidenceId = detail.version.evidence[0]!.id;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'ready');
    assert.match(
      detail.evaluation.nextActions.find((row) => row.id === 'request-collections')!
        .requestedEvidence,
      /核对已有/
    );
    assert.ok(
      detail.evaluation.explanations[0]!.evidenceReview?.dependencies.some(
        (dep) =>
          dep.id === firstEvidenceId &&
          dep.materialId === saved.id &&
          dep.binding === 'source-located'
      )
    );
    const withdraw = await service.request(
      url + `/evidence/${firstEvidenceId}`,
      options(alice, { baseRevision: 2, state: 'withdrawn' }, 'PATCH')
    );
    assert.equal(withdraw.status, 200);
    detail = (await withdraw.json()) as DecisionDetail;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'withdrawn');
    assert.deepEqual(detail.evaluation.cash, baselineCash);
    const restore = await service.request(
      url + '/restore',
      options(alice, { baseRevision: 3, revision: 2 }, 'POST')
    );
    assert.equal(restore.status, 200);
    detail = (await restore.json()) as DecisionDetail;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'ready');
    const contrary = await service.request(
      url + '/evidence',
      options(
        alice,
        {
          baseRevision: 4,
          evidence: { ...payload, quote: contraryQuote, values: { amount: '200' } },
        },
        'POST'
      )
    );
    assert.equal(contrary.status, 200);
    detail = (await contrary.json()) as DecisionDetail;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'conflict');
    const secondEvidenceId = detail.version.evidence[1]!.id;
    const withdrawContrary = await service.request(
      url + `/evidence/${secondEvidenceId}`,
      options(alice, { baseRevision: 5, state: 'withdrawn' }, 'PATCH')
    );
    assert.equal(withdrawContrary.status, 200);
    detail = (await withdrawContrary.json()) as DecisionDetail;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'conflict');
    const restoreBeforeConflict = await service.request(
      url + '/restore',
      options(alice, { baseRevision: 6, revision: 2 }, 'POST')
    );
    assert.equal(restoreBeforeConflict.status, 200);
    detail = (await restoreBeforeConflict.json()) as DecisionDetail;
    assert.equal(detail.evaluation.explanations[0]!.evidenceReview?.status, 'conflict');
    assert.deepEqual(detail.evaluation.cash, baselineCash);
    assert.equal(detail.evaluation.recordedCash?.primary.status, 'unknown');
    assert.equal(calls, publicModelBaseline, 'private evidence changes never request AI');
    await service.stop();
    service = await openService(directory, captureModel);
    const restarted = await account(service, 'distinction-alice@example.com', true);
    const current = (await (
      await service.request(url, options(restarted))
    ).json()) as DecisionDetail;
    assert.equal(current.version.revision, 7);
    assert.equal(current.evaluation.explanations[0]!.evidenceReview?.status, 'conflict');
    const historical = (await (
      await service.request(url + '?revision=2', options(restarted))
    ).json()) as DecisionDetail;
    assert.equal(historical.version.revision, 2);
    assert.equal(historical.evaluation.explanations[0]!.evidenceReview?.status, 'ready');
    assert.equal(
      (await service.request(`/api/materials/${saved.id}`, options(restarted, undefined, 'DELETE')))
        .status,
      409
    );
    assert.equal(
      calls,
      publicModelBaseline,
      'private evidence, cash records and reopening never add external model requests'
    );
    for (const body of modelBodies) {
      for (const privateValue of [
        quote,
        contraryQuote,
        'PRIVATE_COLLECTIONS_73419',
        'PRIVATE_CONTRARY_73419',
        decisionInput.title,
        decisionInput.promise,
        privateCashFloor,
        saved.id,
        detail.decision.id,
        'distinction-alice@example.com',
      ])
        assert.ok(
          !body.includes(privateValue),
          'private workspace data is excluded from AI payloads'
        );
      const supplied = JSON.parse(JSON.parse(body).messages[1].content);
      assert.equal(supplied.datedCash, undefined);
      assert.equal(supplied.external, undefined);
      assert.equal(supplied.promise, undefined);
      assert.equal(supplied.decisions, undefined);
    }
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('private decisions enforce owner and CSRF boundaries, serialize revision writes and survive restart without requests beyond their public financial background', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-decision-api-'));
  let calls = 0;
  const modelBodies: string[] = [];
  const captureModel = (body: string) => {
    calls++;
    modelBodies.push(body);
  };
  let service: Awaited<ReturnType<typeof openService>> | undefined = await openService(
    directory,
    captureModel
  );
  try {
    const alice = await account(service, 'decision-alice@example.com');
    const bob = await account(service, 'decision-bob@example.com');
    const privateTotalAmount = '871234567.89';
    const privateInput: DecisionInput = {
      ...input(),
      title: 'PRIVATE_PAYMENT_DECISION_84520',
      promise: 'PRIVATE_PAYMENT_PROMISE_84520',
      external: { ...input().external!, totalAmount: privateTotalAmount },
    };
    assert.equal((await service.request('/api/decisions')).status, 401);
    const create = await service.request('/api/decisions', options(alice, privateInput, 'POST'));
    assert.equal(create.status, 201);
    let detail = (await create.json()) as DecisionDetail;
    const url = `/api/decisions/${detail.decision.id}`;
    assert.equal((await service.request(url, options(bob))).status, 404);
    assert.equal(
      (
        await service.request(url, {
          ...options(alice, { baseRevision: 1, input: privateInput }, 'PATCH'),
          headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await service.request(url, {
          ...options(alice, { baseRevision: 1, input: privateInput }, 'PATCH'),
          headers: { ...options(alice).headers, Origin: 'https://evil.invalid' },
        })
      ).status,
      403
    );
    const writes = await Promise.all(
      ['第一版', '第二版'].map((title) =>
        service!.request(
          url,
          options(alice, { baseRevision: 1, input: { ...privateInput, title } }, 'PATCH')
        )
      )
    );
    assert.deepEqual(writes.map((response) => response.status).sort(), [200, 409]);
    detail = (await (await service.request(url, options(alice))).json()) as DecisionDetail;
    assert.equal(detail.version.revision, 2);
    const quote = '测试公司截至2026-10-02已付10元。 PRIVATE_PAYMENT_QUOTE_84520';
    const original = await material(service, alice, [quote]);
    const foreign = await material(service, bob, [quote]);
    assert.equal(
      (
        await service.request(
          url + '/evidence',
          options(alice, { baseRevision: 2, evidence: evidence(foreign.id, quote, '10') }, 'POST')
        )
      ).status,
      404
    );
    const add = await service.request(
      url + '/evidence',
      options(alice, { baseRevision: 2, evidence: evidence(original.id, quote, '10') }, 'POST')
    );
    assert.equal(add.status, 200);
    detail = (await add.json()) as DecisionDetail;
    assert.equal(gate(detail, 'paid').status, 'matched');
    const recordId = detail.version.evidence[0]!.id;
    assert.equal(
      (
        await service.request(
          url + `/evidence/${recordId}`,
          options(bob, { baseRevision: 3, state: 'withdrawn' }, 'PATCH')
        )
      ).status,
      404
    );
    const withdraw = await service.request(
      url + `/evidence/${recordId}`,
      options(alice, { baseRevision: 3, state: 'withdrawn' }, 'PATCH')
    );
    assert.equal(withdraw.status, 200);
    detail = (await withdraw.json()) as DecisionDetail;
    assert.equal(gate(detail, 'paid').status, 'withdrawn');
    assert.equal(
      (await service.request(`/api/materials/${original.id}`, options(alice, undefined, 'DELETE')))
        .status,
      409
    );
    assert.equal(calls, 0, 'private decisions and evidence do not request the configured model');
    const demos = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(
      (await service.request(`/api/cases/${demos[0]!.id}/import`, options(alice, {}, 'POST')))
        .status,
      201
    );
    const taskResponse = await service.request(
      '/api/tasks',
      options(
        alice,
        {
          title: '历史背景',
          company: demos[0]!.company,
          year: 2025,
          materialIds: demos[0]!.materialIds,
          useModel: false,
        },
        'POST'
      )
    );
    assert.equal(taskResponse.status, 202);
    const task = (await taskResponse.json()) as AnalysisTask;
    assert.equal(task.useModel, true, 'legacy false flags cannot disable public financial AI');
    await service.waitForIdle();
    const completedTask = (await (
      await service.request(`/api/tasks/${task.id}`, options(alice))
    ).json()) as AnalysisTask;
    assert.equal(completedTask.report?.model.status, 'completed');
    const publicModelBaseline = calls;
    assert.equal(publicModelBaseline, 1);
    const link = await service.request(
      url,
      options(
        alice,
        { baseRevision: 4, input: { ...privateInput, reportTaskId: task.id } },
        'PATCH'
      )
    );
    assert.equal(link.status, 200);
    assert.equal(
      (await service.request(`/api/tasks/${task.id}`, options(alice, undefined, 'DELETE'))).status,
      409
    );
    assert.equal(
      calls,
      publicModelBaseline,
      'linking a report never sends private decision inputs'
    );
    await service.stop();
    service = await openService(directory, captureModel);
    const restarted = await account(service, 'decision-alice@example.com', true);
    const saved = (await (await service.request(url, options(restarted))).json()) as DecisionDetail;
    assert.equal(saved.version.revision, 5);
    assert.equal(saved.version.evidence[0]!.state, 'withdrawn');
    const old = (await (
      await service.request(url + '?revision=3', options(restarted))
    ).json()) as DecisionDetail;
    assert.equal(old.version.evidence[0]!.state, 'active');
    assert.equal(gate(old, 'paid').status, 'matched');
    const restored = await service.request(
      url + '/restore',
      options(restarted, { baseRevision: 5, revision: 3 }, 'POST')
    );
    assert.equal(restored.status, 200);
    const restoredDetail = (await restored.json()) as DecisionDetail;
    assert.equal(restoredDetail.version.revision, 6);
    assert.equal(restoredDetail.version.restoredFrom, 3);
    assert.equal(
      (await service.request(`/api/tasks/${task.id}`, options(restarted, undefined, 'DELETE')))
        .status,
      409
    );
    const bobAgain = await account(service, 'decision-bob@example.com', true);
    assert.deepEqual(await (await service.request('/api/decisions', options(bobAgain))).json(), []);
    assert.equal(
      (await service.request('/api/reset', options(restarted, { confirm: 'RESET_DEMO' }, 'POST')))
        .status,
      200
    );
    assert.equal((await service.request(url, options(restarted))).status, 404);
    assert.ok(
      (await (await service.request('/api/workspace', options(bobAgain))).json()).materials.some(
        (item: Material) => item.id === foreign.id
      )
    );
    assert.equal(calls, publicModelBaseline, 'private restore, reset and restart never request AI');
    for (const body of modelBodies) {
      for (const privateValue of [
        quote,
        'PRIVATE_PAYMENT_QUOTE_84520',
        privateInput.title,
        privateInput.promise,
        privateTotalAmount,
        original.id,
        foreign.id,
        detail.decision.id,
        'decision-alice@example.com',
      ])
        assert.ok(
          !body.includes(privateValue),
          'public AI cannot read private payment workspace data'
        );
      const supplied = JSON.parse(JSON.parse(body).messages[1].content);
      assert.equal(supplied.datedCash, undefined);
      assert.equal(supplied.external, undefined);
      assert.equal(supplied.promise, undefined);
      assert.equal(supplied.decisions, undefined);
    }
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('scope correction creates an immutable new version with auditable resolution; history and restore cannot erase unresolved or reopened conflicts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-decision-scope-'));
  const service = await openService(directory, () => {
    throw new Error('No model expected');
  });
  try {
    const alice = await account(service, 'decision-scope@example.com');
    const a = '测试公司截至2026-10-02已付10元。';
    const b = '测试公司截至2026-10-01已付20元，2026-10-02归档。';
    const source = await material(service, alice, [a, b]);
    let detail = (await (
      await service.request('/api/decisions', options(alice, input(), 'POST'))
    ).json()) as DecisionDetail;
    const url = `/api/decisions/${detail.decision.id}`;
    for (const [quote, amount] of [
      [a, '10'],
      [b, '20'],
    ]) {
      const response = await service.request(
        url + '/evidence',
        options(
          alice,
          { baseRevision: detail.version.revision, evidence: evidence(source.id, quote!, amount!) },
          'POST'
        )
      );
      assert.equal(response.status, 200);
      detail = (await response.json()) as DecisionDetail;
    }
    assert.equal(gate(detail, 'paid').status, 'conflict');
    const bId = detail.version.evidence[1]!.id;
    const scopeUrl = url + `/evidence/${bId}/scope`;
    assert.equal(
      (
        await service.request(
          scopeUrl,
          options(
            alice,
            { baseRevision: 3, entity: '未出现的公司', asOf: '2026-10-01', reason: '不能伪造主体' },
            'POST'
          )
        )
      ).status,
      400
    );
    assert.equal(
      (
        await service.request(
          scopeUrl,
          options(
            alice,
            {
              baseRevision: 3,
              entity: '测试公司',
              asOf: '2026-10-01',
              reason: '禁止修改金额',
              values: { amount: '10' },
            },
            'POST'
          )
        )
      ).status,
      400
    );
    const corrected = await service.request(
      scopeUrl,
      options(
        alice,
        {
          baseRevision: 3,
          entity: '测试公司',
          asOf: '2026-10-01',
          reason: '记录原文对应前一天，误将归档日期作为适用日期',
        },
        'POST'
      )
    );
    assert.equal(corrected.status, 200);
    detail = (await corrected.json()) as DecisionDetail;
    assert.equal(detail.version.reason, 'scope-corrected');
    assert.equal(gate(detail, 'paid').status, 'matched');
    assert.equal(detail.evaluation.knownConflicts[0]!.resolvedRevision, 4);
    assert.equal(detail.version.evidence[1]!.quote, b);
    assert.equal(detail.version.evidence[1]!.values.amount, '20');
    const earlier = (await (
      await service.request(url + '?revision=2', options(alice))
    ).json()) as DecisionDetail;
    assert.equal(earlier.evaluation.knownConflicts.length, 0);
    const conflicted = (await (
      await service.request(url + '?revision=3', options(alice))
    ).json()) as DecisionDetail;
    assert.equal(gate(conflicted, 'paid').status, 'conflict');
    assert.equal(conflicted.evaluation.knownConflicts[0]!.resolvedRevision, undefined);
    const restore = await service.request(
      url + '/restore',
      options(alice, { baseRevision: 4, revision: 3 }, 'POST')
    );
    assert.equal(restore.status, 200);
    detail = (await restore.json()) as DecisionDetail;
    assert.equal(gate(detail, 'paid').status, 'conflict');
    assert.equal(detail.evaluation.knownConflicts[0]!.resolutionEvents!.at(-1)!.state, 'reopened');
    const resolvedHistory = (await (
      await service.request(url + '?revision=4', options(alice))
    ).json()) as DecisionDetail;
    assert.equal(gate(resolvedHistory, 'paid').status, 'matched');
    assert.equal(resolvedHistory.evaluation.knownConflicts[0]!.resolvedRevision, 4);
    const withdraw = await service.request(
      url + `/evidence/${bId}`,
      options(alice, { baseRevision: 5, state: 'withdrawn' }, 'PATCH')
    );
    assert.equal(withdraw.status, 200);
    detail = (await withdraw.json()) as DecisionDetail;
    assert.equal(gate(detail, 'paid').status, 'conflict');
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
