import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';
import type { AnalysisTask, Material, Question, Report } from '../shared/contracts.js';
import { buildReviewChecklist, rankReviewQuestions } from '../src/reviewChecklist';

const fixture = await seeds(process.cwd());
function review(material: Material): Report {
  return analyze(
    {
      company: material.company,
      title: '回款材料核查',
      year: 2025,
      materialIds: [material.id],
      excludedMetrics: [],
    },
    [material]
  );
}
function task(report?: Report): AnalysisTask {
  return {
    id: 'review-test',
    title: '付款前核查',
    company: report?.company || '待核公司',
    year: 2025,
    materialIds: report?.snapshot.map((material) => material.id) || [],
    excludedMetrics: [],
    purpose: 'external',
    status: report ? 'completed' : 'queued',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:12:34.000Z',
    stages: [],
    ...(report ? { report } : {}),
  };
}
function withAmount(base: Question, id: string, amount: string): Question {
  assert.ok(base.trigger);
  return { ...base, id, trigger: { ...base.trigger, amount } };
}

test('actual annual cash-use questions follow prerequisites, then cash magnitude, then open general requests and completed work', () => {
  const report = review(fixture.materials[0]!);
  const [collections, inventory] = report.questions;
  assert.equal(collections!.trigger?.amount, '-514221076.54');
  assert.equal(inventory!.trigger?.amount, '-321030062.96');
  const prerequisite = review(fixture.materials[2]!).questions[0]!;
  const general = { ...collections!, id: 'contract-request', trigger: undefined };
  const done = {
    ...withAmount(inventory!, 'past-request', '-999999999999.00'),
    status: 'done' as const,
  };
  report.questions = [inventory!, done, general, collections!, prerequisite];
  const before = JSON.stringify(report);
  const ranked = rankReviewQuestions(report, 'external');
  assert.deepEqual(
    ranked.map(({ question }) => question.id),
    ['supplement', 'collections', 'inventory', 'contract-request', 'past-request']
  );
  assert.deepEqual(
    ranked.map(({ priority }) => priority),
    ['prerequisite', 'follow-up', 'follow-up', 'follow-up', 'recorded']
  );
  assert.match(ranked[1]!.orderReason.zh, /514,221,076\.54/);
  assert.match(ranked[1]!.orderReason.en, /not a risk rating/);
  assert.equal(ranked[1]!.question, collections);
  assert.equal(JSON.stringify(report), before, 'ranking leaves the saved report unchanged');
});

test('cent-exact magnitude ordering distinguishes values beyond safe Number precision and retains equal-amount order', () => {
  const report = review(fixture.materials[0]!);
  const base = report.questions[0]!;
  report.questions = [
    withAmount(base, 'large-lower', '-9007199254740993.01'),
    withAmount(base, 'large-higher', '9007199254740993.02'),
    withAmount(base, 'small-negative', '-20.02'),
    withAmount(base, 'small-positive-tie', '20.02'),
    withAmount(base, 'zero', '-0.00'),
  ];
  assert.deepEqual(
    rankReviewQuestions(report, 'external').map(({ question }) => question.id),
    ['large-higher', 'large-lower', 'small-negative', 'small-positive-tie', 'zero']
  );
  assert.match(
    rankReviewQuestions(report, 'external')[0]!.orderReason.en,
    /9,007,199,254,740,993\.02/
  );
});

test('invalid triggering amounts never win priority and their exact original values remain in the checklist', () => {
  const report = review(fixture.materials[0]!);
  const base = report.questions[0]!;
  report.questions = [
    withAmount(base, 'exponent', '1e19'),
    { ...base, id: 'no-amount', trigger: undefined },
    withAmount(base, 'subcent', '-10000000.001'),
    withAmount(base, 'spaced', ' 999999999.99'),
    withAmount(base, 'not-a-number', 'NaN'),
    withAmount(base, 'infinity', 'Infinity'),
    withAmount(base, 'valid', '-10.0000000000'),
  ];
  const ranked = rankReviewQuestions(report, 'external');
  assert.deepEqual(
    ranked.map(({ question }) => question.id),
    ['valid', 'exponent', 'no-amount', 'subcent', 'spaced', 'not-a-number', 'infinity']
  );
  const markdown = buildReviewChecklist(task(report), 'en');
  for (const amount of ['1e19', '-10000000.001', ' 999999999.99', 'NaN', 'Infinity'])
    assert.ok(markdown.includes(`\n${amount}\n`), `preserve original ${amount}`);
  assert.match(markdown, /original value above was not used for ordering/);
  assert.match(ranked[1]!.orderReason.zh, /未用于金额排序/);
});

test('a completed prerequisite stays behind open work and done records keep their original order', () => {
  const report = review(fixture.materials[0]!);
  const supplement = { ...review(fixture.materials[2]!).questions[0]!, status: 'done' as const };
  const doneCollections = { ...report.questions[0]!, status: 'done' as const };
  report.questions = [supplement, report.questions[1]!, doneCollections];
  const ranked = rankReviewQuestions(report, 'handover');
  assert.deepEqual(
    ranked.map(({ question }) => question.id),
    ['inventory', 'supplement', 'collections']
  );
  assert.equal(ranked[1]!.priority, 'recorded');
  assert.match(ranked[1]!.orderReason.zh, /不表示风险已解除/);
});

test('both purposes suggest roles appropriate to actual questions without asserting the company has those people', () => {
  const report = review(fixture.materials[0]!);
  for (const purpose of ['external', 'handover'] as const) {
    const ranked = rankReviewQuestions(report, purpose);
    assert.match(ranked[0]!.recipient.zh, /财务或客户结算负责人/);
    assert.match(ranked[1]!.recipient.zh, /订单或库存负责人/);
    for (const { recipient } of ranked) {
      assert.match(recipient.zh, /建议.*具体联系人待确认/);
      assert.match(recipient.en, /Suggested.*Confirm the actual contact/);
    }
    assert.match(ranked[0]!.recipient.zh, purpose === 'handover' ? /交接/ : /向对方.*索取材料/);
  }
});

test('bilingual exports share the actual ranking and retain original PDF evidence, context and saved date', () => {
  const report = review(fixture.materials[0]!);
  report.questions.reverse();
  const saved = task(report);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const markdown = buildReviewChecklist(saved, locale);
    assert.ok(markdown.indexOf(' · collections') < markdown.indexOf(' · inventory'));
    assert.ok(markdown.includes('2026-10-02T00:12:34.000Z'));
    assert.ok(markdown.includes('2025'));
    assert.ok(markdown.includes('2024'));
    assert.ok(markdown.includes('material-songyuan-2025'));
    assert.ok(markdown.includes('191'));
    assert.ok(markdown.includes(report.snapshot[0]!.sourceUrl!));
    assert.ok(
      markdown.includes(
        report.questions.find((question) => question.id === 'collections')!.trigger!.sourceRefs[0]!
          .quote
      )
    );
    assert.ok(markdown.includes('-514221076.54'));
    assert.match(
      markdown,
      locale === 'en' ? /Customer aging, bill-settlement details/ : /客户账龄、票据结算明细/
    );
    assert.match(
      markdown,
      locale === 'en' ? /Original excerpt.*not translated/ : /原文（按保存内容保留）/
    );
    assert.match(
      markdown,
      locale === 'en' ? /historical record.*saved report/ : /已保存报告的历史记录/
    );
    assert.match(markdown, locale === 'en' ? /External review/ : /外部核查/);
    saved.purpose = 'handover';
    const handover = buildReviewChecklist(saved, locale);
    assert.match(handover, locale === 'en' ? /Internal handover/ : /内部接手/);
    assert.match(handover, locale === 'en' ? /Suggested handover contact/ : /建议与.*交接/);
    saved.purpose = 'external';
  }
});

test('old questions without trigger facts remain in saved order even with available metrics, and export never fills missing evaluations', () => {
  const report = review(fixture.materials[0]!);
  report.questions = report.questions
    .reverse()
    .map(({ trigger: _trigger, ...question }) => question);
  delete report.crossSignals;
  delete report.crossSignalChecks;
  report.metrics.find((metric) => metric.key === 'inventoryAdjustment')!.value =
    '-9876543212345678.91';
  const saved = JSON.stringify(report);
  const ranked = rankReviewQuestions(report, 'handover');
  assert.deepEqual(
    ranked.map(({ question }) => question.id),
    ['inventory', 'collections']
  );
  assert.ok(ranked.every(({ question }) => question.trigger === undefined));
  const markdown = buildReviewChecklist(task(report), 'en');
  assert.match(markdown, /older report has no saved combination-check state/);
  assert.match(markdown, /No triggering amount was saved/);
  assert.ok(!markdown.includes('9876543212345678.91'));
  assert.ok(!markdown.includes('Saved triggering fact'));
  assert.ok(
    markdown.includes('-514221076.54'),
    'original source quotes stay visible without being promoted into trigger facts'
  );
  assert.equal(JSON.stringify(report), saved);
});

test('missing and conflicted source cases preserve blockers and do not imply that completing the request establishes safety', () => {
  for (const material of [fixture.materials[2]!, fixture.materials[3]!]) {
    const report = review(material);
    report.questions[0]!.status = 'done';
    const markdown = buildReviewChecklist(task(report), 'en');
    assert.match(markdown, /remain unknown/);
    assert.match(markdown, /evidence blocked; unknown/);
    assert.match(markdown, /Follow-up recorded as done/);
    assert.match(markdown, /does not establish risk resolution/);
    assert.match(markdown, /Full consolidated supplementary table/);
    assert.ok(markdown.includes(material.sourceUrl!));
    assert.ok(markdown.includes(material.observations[0]!.quote));
  }
});

test('no-report exports explicitly stop, and untranslated user evidence remains labeled original text', () => {
  const pending = task();
  for (const locale of ['zh-Hans', 'en'] as const) {
    const markdown = buildReviewChecklist(pending, locale);
    assert.match(markdown, locale === 'en' ? /no saved report/ : /尚无已保存报告/);
    assert.ok(!markdown.includes('### 1.'));
  }
  const report = review(fixture.materials[0]!);
  const original = '请核对这一段新补充原文。\n```\n# 原始标题';
  report.questions[0]!.requestedEvidence = original;
  const markdown = buildReviewChecklist(task(report), 'en');
  assert.ok(
    markdown.includes(`Original text (kept as supplied):\n\n\`\`\`\`\n${original}\n\`\`\`\``)
  );
});
