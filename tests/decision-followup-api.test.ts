import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AnalysisTask, AuthSession, DemoCase, Material } from '../shared/contracts.js';
import type {
  DecisionDetail,
  DecisionEvidenceInput,
  DecisionInput,
} from '../shared/decision-contracts.js';
import { deriveDecisionFollowUpRecords } from '../shared/decision-followup.js';
import { createApp } from '../server/app.js';

interface Client {
  cookie: string;
  csrf: string;
  userId: string;
}
async function openService(directory: string, modelBodies: string[]) {
  const app = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {
      apiKey: 'test-only-no-network-followup',
      fetch: async (_url, request) => {
        const body = String(request?.body);
        modelBodies.push(body);
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
type Service = Awaited<ReturnType<typeof openService>>;
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
async function account(service: Service, email: string, login = false): Promise<Client> {
  const response = await service.request(`/api/auth/${login ? 'login' : 'register'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'followup-test-password',
      ...(login ? {} : { name: '合成问询测试' }),
    }),
  });
  assert.equal(response.status, login ? 200 : 201);
  const session = (await response.json()) as AuthSession;
  assert.ok(session.user && session.csrfToken);
  return {
    cookie: response.headers.get('set-cookie')!.split(';')[0]!,
    csrf: session.csrfToken,
    userId: session.user.id,
  };
}
const entity = '合成问询主体';
const asOf = '2026-10-03';
const claimId = 'own-refund-question';
const question = 'PRIVATE_QUESTION_31944 请提供退款到账凭据。';
const claimText = 'PRIVATE_CLAIM_31944 对方说退款已经到账。';
function input(): DecisionInput {
  return {
    title: 'PRIVATE_DECISION_31944 合成交易',
    purpose: 'external',
    transactionEntity: entity,
    promise: 'PRIVATE_PROMISE_31944',
    reportTaskId: null,
    datedCash: null,
    claims: [{ id: claimId, text: claimText, target: 'refunded', question }],
    external: {
      asOf,
      totalAmount: '20000',
      payeeEntity: entity,
      refundEntity: entity,
      alreadyPaid: '10000',
      deliveredAmount: '2000',
      actualRefund: '1000',
      proposedAmount: '3000',
      alternativeAmount: '1000',
      exposureLimit: '10000',
    },
  };
}
function reply(): DecisionEvidenceInput {
  return {
    slot: 'refunded',
    kind: 'counterparty-statement',
    entity,
    asOf,
    values: { amount: '1000' },
    quote: `PRIVATE_REPLY_31944 ${entity} ${asOf} 对方说退款到账1000元。`,
    sourceLabel: 'PRIVATE_REPLY_LABEL_31944',
    claimId,
  };
}
async function createDecision(
  service: Service,
  client: Client,
  draft = input()
): Promise<DecisionDetail> {
  const response = await service.request('/api/decisions', options(client, draft, 'POST'));
  assert.equal(response.status, 201);
  return response.json() as Promise<DecisionDetail>;
}
async function read(service: Service, client: Client, url: string): Promise<DecisionDetail> {
  const response = await service.request(url, options(client));
  assert.equal(response.status, 200);
  return response.json() as Promise<DecisionDetail>;
}
async function mutation(
  service: Service,
  client: Client,
  url: string,
  body: unknown,
  method = 'POST'
): Promise<DecisionDetail> {
  const response = await service.request(url, options(client, body, method));
  assert.equal(response.status, 200, `mutation failed: ${await response.clone().text()}`);
  return response.json() as Promise<DecisionDetail>;
}
async function rejected(
  service: Service,
  client: Client,
  url: string,
  body: unknown,
  status: number,
  code: string
): Promise<void> {
  const response = await service.request(url, options(client, body, 'POST'));
  assert.equal(response.status, status);
  assert.equal((await response.json()).code, code);
}
async function saveMaterial(service: Service, client: Client, quotes: string[]): Promise<Material> {
  const response = await service.request(
    '/api/materials',
    options(
      client,
      {
        title: 'PRIVATE_MATERIAL_31944',
        company: entity,
        shortName: entity,
        filename: 'synthetic-followup.txt',
        origin: 'user-upload',
        documentDate: asOf,
        sha256: 'a'.repeat(64),
        observations: [],
        notes: [],
        excerpts: [{ page: 1, text: quotes.join('\n') }],
      },
      'POST'
    )
  );
  assert.equal(response.status, 201);
  return response.json() as Promise<Material>;
}
const gate = (detail: DecisionDetail, id: string) =>
  detail.evaluation.gates.find((row) => row.id === id)!;

test('private question → reply → original record stays owner-scoped, immutable, concurrent-safe and recoverable through restart without leaking to public models', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-followup-api-'));
  const modelBodies: string[] = [];
  let service: Service | undefined = await openService(directory, modelBodies);
  try {
    const alice = await account(service, 'followup-alice@example.test');
    const bob = await account(service, 'followup-bob@example.test');
    let detail = await createDecision(service, alice);
    const url = `/api/decisions/${detail.decision.id}`;
    const evidenceUrl = url + '/evidence';
    assert.equal((await service.request(url, options(bob))).status, 404);
    await rejected(
      service,
      bob,
      evidenceUrl,
      { baseRevision: 1, evidence: reply() },
      404,
      'DECISION_NOT_FOUND'
    );
    await createDecision(service, alice, {
      ...input(),
      claims: [{ ...input().claims![0]!, id: 'other-decision-claim' }],
    });
    await rejected(
      service,
      alice,
      evidenceUrl,
      { baseRevision: 1, evidence: { ...reply(), claimId: 'other-decision-claim' } },
      404,
      'DECISION_CLAIM_NOT_FOUND'
    );
    const quotePaid = `${entity} ${asOf} 实际付款10000元。PRIVATE_PAID_31944`;
    const quoteDelivered = `${entity} ${asOf} 实际交付对应金额2000元。PRIVATE_DELIVERED_31944`;
    const quoteRefund = `${entity} ${asOf} 实际退款到账1000元。PRIVATE_ORIGINAL_31944`;
    const saved = await saveMaterial(service, alice, [quotePaid, quoteDelivered, quoteRefund]);
    const foreign = await saveMaterial(service, bob, [quoteRefund]);
    const source: DecisionEvidenceInput = {
      ...reply(),
      kind: 'source-record',
      sourceLabel: '合成原件',
      materialId: saved.id,
      page: 1,
      quote: quoteRefund,
    };
    await rejected(
      service,
      alice,
      evidenceUrl,
      { baseRevision: 1, evidence: { ...source, materialId: foreign.id } },
      404,
      'MATERIAL_NOT_FOUND'
    );
    const noCsrf = await service.request(evidenceUrl, {
      ...options(alice, { baseRevision: 1, evidence: reply() }, 'POST'),
      headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
    });
    assert.equal(noCsrf.status, 403);
    const paid = {
      ...source,
      slot: 'paid',
      claimId: undefined,
      quote: quotePaid,
      values: { amount: '10000' },
    };
    detail = await mutation(service, alice, evidenceUrl, { baseRevision: 1, evidence: paid });
    const delivered = {
      ...source,
      slot: 'delivered',
      claimId: undefined,
      quote: quoteDelivered,
      values: { amount: '2000' },
    };
    detail = await mutation(service, alice, evidenceUrl, { baseRevision: 2, evidence: delivered });
    const writes = await Promise.all(
      ['A', 'B'].map((marker) =>
        service!.request(
          evidenceUrl,
          options(
            alice,
            { baseRevision: 3, evidence: { ...reply(), quote: `${reply().quote} ${marker}` } },
            'POST'
          )
        )
      )
    );
    assert.deepEqual(writes.map((response) => response.status).sort(), [200, 409]);
    detail = await read(service, alice, url);
    assert.equal(detail.version.revision, 4);
    assert.equal(detail.version.evidence.filter((row) => row.claimId === claimId).length, 1);
    const submittedReply = detail.version.evidence.find((row) => row.claimId === claimId)!;
    assert.equal(submittedReply.claimQuestion, question);
    assert.equal(submittedReply.claimText, claimText);
    assert.equal(submittedReply.claimTarget, 'refunded');
    assert.deepEqual(detail.followUpChanges?.[0]?.addedReplyIds, [submittedReply.id]);
    assert.equal(detail.followUpChanges?.[0]?.before, 'unknown');
    assert.equal(detail.followUpChanges?.[0]?.after, 'unknown');
    assert.equal(detail.evaluation.external!.recordScenarios[0]!.exposure, null);
    assert.equal(detail.evaluation.external!.assumptionScenarios[0]!.exposure, '10000.00');
    assert.equal(modelBodies.length, 0);
    const store = await service.workspaceForUser(alice.userId);
    const persist = store.persist;
    store.persist = async () => {
      throw new Error('synthetic persistence failure');
    };
    try {
      assert.equal(
        (
          await service.request(
            evidenceUrl,
            options(alice, { baseRevision: 4, evidence: source }, 'POST')
          )
        ).status,
        500
      );
    } finally {
      store.persist = persist;
    }
    detail = await read(service, alice, url);
    assert.equal(detail.version.revision, 4);
    assert.equal(
      detail.version.evidence.length,
      3,
      'failed save leaves no partly submitted original'
    );
    detail = await mutation(service, alice, evidenceUrl, { baseRevision: 4, evidence: source });
    assert.equal(detail.version.revision, 5);
    const originalId = detail.version.evidence.find(
      (row) => row.kind === 'source-record' && row.claimId === claimId
    )!.id;
    assert.deepEqual(detail.followUpChanges?.[0]?.addedRecordIds, [originalId]);
    assert.equal(detail.followUpChanges?.[0]?.before, 'unknown');
    assert.equal(detail.followUpChanges?.[0]?.after, 'matched');
    assert.equal(detail.evaluation.external!.recordScenarios[0]!.exposure, '10000.00');
    detail = await mutation(
      service,
      alice,
      url,
      {
        baseRevision: 5,
        input: {
          ...detail.version.input,
          claims: [
            {
              ...detail.version.input.claims![0]!,
              question: 'PRIVATE_NEW_QUESTION_31944 请补充账户明细。',
            },
          ],
        },
      },
      'PATCH'
    );
    assert.equal(detail.followUpChanges?.[0]?.questionChanged, true);
    assert.equal(detail.followUpChanges?.[0]?.before, detail.followUpChanges?.[0]?.after);
    assert.ok(
      deriveDecisionFollowUpRecords(detail.version, detail.version.input.claims![0]!).every(
        (row) => row.priorQuestion
      )
    );
    detail = await mutation(
      service,
      alice,
      `${evidenceUrl}/${originalId}`,
      { baseRevision: 6, state: 'withdrawn' },
      'PATCH'
    );
    assert.deepEqual(detail.followUpChanges?.[0]?.withdrawnIds, [originalId]);
    assert.equal(detail.evaluation.external!.recordScenarios[0]!.exposure, null);
    assert.equal(gate(detail, 'paid').status, 'matched');
    assert.equal(gate(detail, 'delivered').status, 'matched');
    detail = await mutation(
      service,
      alice,
      `${evidenceUrl}/${originalId}`,
      { baseRevision: 7, state: 'active' },
      'PATCH'
    );
    assert.deepEqual(detail.followUpChanges?.[0]?.restoredIds, [originalId]);
    assert.equal(detail.evaluation.external!.recordScenarios[0]!.exposure, '10000.00');
    assert.equal(
      modelBodies.length,
      0,
      'private changes, retry, withdrawal and restoration never request AI'
    );
    const old = await read(service, alice, url + '?revision=3');
    assert.equal(old.version.input.claims![0]!.question, question);
    assert.deepEqual(deriveDecisionFollowUpRecords(old.version, old.version.input.claims![0]!), []);
    const beforeQuestionEdit = await read(service, alice, url + '?revision=5');
    assert.ok(
      deriveDecisionFollowUpRecords(
        beforeQuestionEdit.version,
        beforeQuestionEdit.version.input.claims![0]!
      ).every((row) => !row.priorQuestion)
    );
    assert.equal(beforeQuestionEdit.evaluation.external!.recordScenarios[0]!.exposure, '10000.00');
    await service.stop();
    service = await openService(directory, modelBodies);
    const relogged = await account(service, 'followup-alice@example.test', true);
    detail = await read(service, relogged, url);
    assert.equal(detail.version.revision, 8);
    assert.equal(
      detail.version.evidence.find((row) => row.id === originalId)!.claimQuestion,
      question
    );
    assert.equal(detail.evaluation.external!.recordScenarios[0]!.exposure, '10000.00');
    const demos = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const demo = demos.find((row) => row.id === 'songyuan')!;
    assert.equal(
      (await service.request(`/api/cases/${demo.id}/import`, options(relogged, {}, 'POST'))).status,
      201
    );
    const taskResponse = await service.request(
      '/api/tasks',
      options(
        relogged,
        {
          title: '公开年度背景核查',
          company: demo.company,
          year: demo.year,
          materialIds: demo.materialIds,
        },
        'POST'
      )
    );
    assert.equal(taskResponse.status, 202);
    const task = (await taskResponse.json()) as AnalysisTask;
    await service.waitForIdle();
    const completed = (await (
      await service.request(`/api/tasks/${task.id}`, options(relogged))
    ).json()) as AnalysisTask;
    assert.equal(completed.report?.model.status, 'completed');
    assert.equal(
      modelBodies.length,
      1,
      'public model capture must be nonempty so leakage assertions are meaningful'
    );
    for (const body of modelBodies) {
      for (const secret of [
        'PRIVATE_QUESTION_31944',
        'PRIVATE_CLAIM_31944',
        'PRIVATE_REPLY_31944',
        'PRIVATE_ORIGINAL_31944',
        'PRIVATE_NEW_QUESTION_31944',
        'PRIVATE_MATERIAL_31944',
        'PRIVATE_DECISION_31944',
        'PRIVATE_PROMISE_31944',
        saved.id,
        foreign.id,
        detail.decision.id,
        'followup-alice@example.test',
        alice.userId,
      ])
        assert.equal(
          body.includes(secret),
          false,
          'private questions, replies and material associations stay outside public-model payloads'
        );
    }
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTTP associations reject missing claims, wrong target or responsibility role, invented cash events, assumptions and forged snapshots without appending a version', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-followup-binding-'));
  const modelBodies: string[] = [];
  const service = await openService(directory, modelBodies);
  try {
    const owner = await account(service, 'followup-binding@example.test');
    const created = await createDecision(service, owner);
    const url = `/api/decisions/${created.decision.id}`;
    const post = url + '/evidence';
    await rejected(
      service,
      owner,
      post,
      { baseRevision: 1, evidence: { ...reply(), claimId: 'missing' } },
      404,
      'DECISION_CLAIM_NOT_FOUND'
    );
    await rejected(
      service,
      owner,
      post,
      { baseRevision: 1, evidence: { ...reply(), slot: 'paid' } },
      400,
      'DECISION_CLAIM_TARGET_MISMATCH'
    );
    await rejected(
      service,
      owner,
      post,
      { baseRevision: 1, evidence: { ...reply(), kind: 'assumption' } },
      400,
      'DECISION_CLAIM_KIND_MISMATCH'
    );
    for (const field of ['claimQuestion', 'claimText', 'claimTarget'])
      await rejected(
        service,
        owner,
        post,
        { baseRevision: 1, evidence: { ...reply(), [field]: 'forged' } },
        400,
        'INVALID_DECISION_EVIDENCE'
      );
    assert.equal((await read(service, owner, url)).version.revision, 1);
    const responsible = await createDecision(service, owner, {
      ...input(),
      claims: [{ ...input().claims![0]!, target: 'refund-entity' }],
    });
    const identityUrl = `/api/decisions/${responsible.decision.id}/evidence`;
    for (const role of [undefined, 'contract', 'payee'] as const)
      await rejected(
        service,
        owner,
        identityUrl,
        {
          baseRevision: 1,
          evidence: { ...reply(), slot: 'identity', values: { entity, ...(role ? { role } : {}) } },
        },
        400,
        'DECISION_CLAIM_TARGET_MISMATCH'
      );
    const linkedIdentity = await mutation(service, owner, identityUrl, {
      baseRevision: 1,
      evidence: { ...reply(), slot: 'identity', values: { entity, role: 'refund' } },
    });
    assert.equal(linkedIdentity.version.evidence[0]!.claimTarget, 'refund-entity');
    const handover = input();
    handover.purpose = 'handover';
    handover.external = null;
    handover.claims = [{ ...input().claims![0]!, target: 'cash-events' }];
    handover.datedCash = {
      asOf,
      openingCash: '100',
      cashFloor: '0',
      proposedAmount: '10',
      proposedDay: 1,
      alternativeDay: 2,
      flows: [
        {
          id: 'own-flow',
          label: '合成收款',
          direction: 'in',
          day: 2,
          amount: '20',
          flexibility: 'fixed',
        },
      ],
    };
    const cash = await createDecision(service, owner, handover);
    const cashUrl = `/api/decisions/${cash.decision.id}/evidence`;
    for (const flowId of [undefined, 'foreign-flow'])
      await rejected(
        service,
        owner,
        cashUrl,
        {
          baseRevision: 1,
          evidence: { ...reply(), slot: 'cash-flow', flowId, values: { amount: '20', day: 2 } },
        },
        400,
        'DECISION_CLAIM_FLOW_MISMATCH'
      );
    const linked = await mutation(service, owner, cashUrl, {
      baseRevision: 1,
      evidence: {
        ...reply(),
        slot: 'cash-flow',
        flowId: 'own-flow',
        values: { amount: '20', day: 2 },
      },
    });
    assert.equal(linked.version.evidence[0]!.flowId, 'own-flow');
    assert.equal(
      linked.evaluation.recordedCash?.primary.status,
      'unknown',
      'linked cash-event statement is not a cash record'
    );
    assert.equal(modelBodies.length, 0);
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
