import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyQuestionAnswer } from '../shared/company-workspace.js';
import { appendCompanyAnswer } from '../src/company-question-state.js';

function answer(question: string, snapshotFetchedAt = '2026-10-03T00:01:00Z') {
  return {
    question,
    text: `回答：${question}`,
    citations: [],
    mode: 'model',
    createdAt: '2026-10-03T00:02:00Z',
    snapshotFetchedAt,
  } satisfies CompanyQuestionAnswer;
}

function run(questions: CompanyQuestionAnswer[]): CompanyResearchRun {
  return {
    id: 'company-latest',
    input: { securityCode: '600519', orgId: 'fixture-org', year: 2025 },
    status: 'adopted',
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:01:00Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextRevision: 2,
    questions,
  };
}

test('a delayed answer preserves the latest company state and independently saved questions', () => {
  const saved = answer('较新的已保存问题');
  const latest = run([saved]);
  const delayed = answer('延迟送达的问题', '2026-10-03T00:00:00Z');
  const merged = appendCompanyAnswer(latest, delayed);
  assert.equal(merged.id, latest.id);
  assert.equal(merged.status, 'adopted');
  assert.equal(merged.contextRevision, 2);
  assert.equal(merged.updatedAt, latest.updatedAt);
  assert.equal(merged.input, latest.input);
  assert.deepEqual(merged.questions, [saved, delayed]);
  assert.deepEqual(latest.questions, [saved]);
});

test('answers already received by refresh are not duplicated and history keeps its newest 50', () => {
  const saved = answer('刷新已取得的问题');
  const latest = run([saved]);
  assert.equal(appendCompanyAnswer(latest, structuredClone(saved)), latest);
  const history = Array.from({ length: 50 }, (_, index) => answer(`问题 ${index}`));
  const newAnswer = answer('新增问题');
  const bounded = appendCompanyAnswer(run(history), newAnswer);
  assert.equal(bounded.questions?.length, 50);
  assert.equal(bounded.questions?.[0], history[1]);
  assert.equal(bounded.questions?.at(-1), newAnswer);
  assert.equal(history.length, 50);
});
