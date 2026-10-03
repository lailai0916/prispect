import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceLearningChallenge,
  evaluateEvidenceLearningPrediction,
  evidenceLearningFacts,
  evidenceLearningFingerprint,
} from '../shared/evidence-learning.js';
import {
  evaluateEvidenceLab,
  type EvidenceLabGraph,
  type LabNode,
} from '../shared/evidence-lab.js';

function node(
  id: string,
  kind: LabNode['kind'],
  dependsOn: string[] = [],
  baseState: LabNode['baseState'] = 'available',
  value: string | null = '100.00'
): LabNode {
  return {
    id,
    kind,
    label: [id, id],
    detail: ['只检验依赖', 'Dependencies only'],
    baseState,
    state: baseState,
    baseValue: baseState === 'available' ? value : null,
    value: baseState === 'available' ? value : null,
    unit: 'CNY',
    sourceRefs: [],
    dependsOn,
    blockers: [],
    metricIds: [],
  };
}
function graph(): EvidenceLabGraph {
  return {
    version: 1,
    origin: 'original-report',
    company: 'Synthetic scope',
    year: 2025,
    basis: 'consolidated',
    sourceNotice: ['合成测试', 'Synthetic test'],
    nodes: [
      node('profit', 'fact'),
      node('cash', 'fact', [], 'available', '10.00'),
      node('inventory', 'fact'),
      node('gap', 'calculation', ['profit', 'cash'], 'available', '90.00'),
      node('ratio', 'calculation', ['cash', 'profit'], 'available', '10.00'),
      node('explanation', 'hypothesis', ['gap', 'inventory']),
      { ...node('required-record', 'material'), materialStatus: 'needed' },
    ],
    edges: [],
    defaultSelectionId: 'profit',
    withdrawnFactIds: [],
  };
}

test('prediction uses the same transitive pauses as the lab and retains exact unaffected cash', () => {
  const input = graph();
  const original = JSON.stringify(input);
  const feedback = evaluateEvidenceLearningPrediction(input, 'profit', [
    'gap',
    'ratio',
    'explanation',
  ]);
  assert.equal(feedback.status, 'ready');
  if (feedback.status !== 'ready') return;
  assert.equal(feedback.result.matches, true);
  assert.deepEqual(feedback.result.pausedIds, ['gap', 'ratio', 'explanation']);
  assert.deepEqual(feedback.result.trial, evaluateEvidenceLab(input, ['profit']));
  assert.equal(feedback.result.trial.nodes.find((item) => item.id === 'profit')!.value, null);
  assert.equal(feedback.result.trial.nodes.find((item) => item.id === 'gap')!.value, null);
  assert.equal(feedback.result.independentFacts.find((item) => item.id === 'cash')!.value, '10.00');
  assert.equal(
    feedback.result.candidates.some((item) => item.id === 'required-record'),
    false
  );
  assert.equal(JSON.stringify(input), original);
  assert.equal(
    evaluateEvidenceLab(input, []).nodes.find((item) => item.id === 'gap')!.value,
    '90.00'
  );
});

test('feedback compares missed and extra predictions without inventing a company assessment', () => {
  const feedback = evaluateEvidenceLearningPrediction(graph(), 'inventory', ['ratio']);
  assert.equal(feedback.status, 'ready');
  if (feedback.status !== 'ready') return;
  assert.equal(feedback.result.matches, false);
  assert.deepEqual(feedback.result.missedIds, ['explanation']);
  assert.deepEqual(feedback.result.extraIds, ['ratio']);
  assert.equal(feedback.result.trial.nodes.find((item) => item.id === 'ratio')!.value, '10.00');
  assert.equal('grade' in feedback.result, false);
  assert.equal('companyRisk' in feedback.result, false);
});

test('missing, conflicting, non-fact, null-valued and pre-withdrawn fields cannot become practice facts', () => {
  const input = graph();
  input.nodes.push(
    node('missing', 'fact', [], 'missing'),
    node('conflict', 'fact', [], 'conflict')
  );
  input.nodes.push(node('null-fact', 'fact', [], 'available', null));
  input.withdrawnFactIds = ['inventory'];
  assert.deepEqual(
    evidenceLearningFacts(input).map((item) => item.id),
    ['profit', 'cash']
  );
  for (const id of [
    'missing',
    'conflict',
    'null-fact',
    'inventory',
    'gap',
    'required-record',
    'absent',
  ])
    assert.equal(createEvidenceLearningChallenge(input, id).status, 'unavailable', id);
});

test('preexisting withdrawals and unavailable paths remain unavailable instead of counting as new effects', () => {
  const input = graph();
  input.withdrawnFactIds = ['inventory'];
  const challenge = createEvidenceLearningChallenge(input, 'profit');
  assert.equal(challenge.status, 'ready');
  if (challenge.status !== 'ready') return;
  assert.deepEqual(challenge.challenge.pausedIds, ['gap', 'ratio']);
  assert.equal(
    challenge.challenge.trial.nodes.find((item) => item.id === 'inventory')!.state,
    'withdrawn'
  );
  assert.equal(
    challenge.challenge.trial.nodes.find((item) => item.id === 'explanation')!.state,
    'paused'
  );
  assert.equal(
    challenge.challenge.candidates.some((item) => item.id === 'explanation'),
    false
  );
});

test('a legitimate prediction of no affected results is allowed; unknown option IDs fail closed', () => {
  const input = graph();
  input.nodes.push(node('independent', 'fact'));
  const feedback = evaluateEvidenceLearningPrediction(input, 'independent', []);
  assert.equal(feedback.status, 'ready');
  if (feedback.status === 'ready') {
    assert.equal(feedback.result.matches, true);
    assert.deepEqual(feedback.result.pausedIds, []);
  }
  assert.equal(
    evaluateEvidenceLearningPrediction(input, 'profit', ['old-graph-id']).status,
    'unavailable'
  );
  assert.equal(
    evaluateEvidenceLearningPrediction(input, 'profit', ['profit']).status,
    'unavailable'
  );
});

test('nonpositive-denominator inapplicability remains distinct from a withdrawal pause', () => {
  const input = graph();
  const ratio = input.nodes.find((item) => item.id === 'ratio')!;
  ratio.baseState = ratio.state = 'not-applicable';
  ratio.baseValue = ratio.value = null;
  const profit = input.nodes.find((item) => item.id === 'profit')!;
  profit.baseValue = profit.value = '0.00';
  const unaffected = evaluateEvidenceLearningPrediction(input, 'inventory', ['explanation']);
  assert.equal(unaffected.status, 'ready');
  if (unaffected.status === 'ready') {
    assert.equal(
      unaffected.result.trial.nodes.find((item) => item.id === 'ratio')!.state,
      'not-applicable'
    );
    assert.equal(unaffected.result.trial.nodes.find((item) => item.id === 'ratio')!.value, null);
  }
  const dependent = evaluateEvidenceLearningPrediction(input, 'profit', [
    'gap',
    'ratio',
    'explanation',
  ]);
  assert.equal(dependent.status, 'ready');
  if (dependent.status === 'ready') {
    assert.equal(dependent.result.matches, true);
    assert.equal(dependent.result.trial.nodes.find((item) => item.id === 'ratio')!.state, 'paused');
  }
});

test('empty or entirely blocked calculations yield a reason, not a fabricated challenge', () => {
  const input = graph();
  input.nodes = [node('profit', 'fact'), node('blocked', 'calculation', ['missing'], 'missing')];
  assert.equal(createEvidenceLearningChallenge(input, 'profit').status, 'unavailable');
  input.nodes = [];
  assert.deepEqual(evidenceLearningFacts(input), []);
});

test('known zero and negative amounts remain available facts without guessing company risk', () => {
  const input = graph();
  input.nodes[0]!.baseValue = input.nodes[0]!.value = '0.00';
  input.nodes[1]!.baseValue = input.nodes[1]!.value = '-10.00';
  assert.deepEqual(
    evidenceLearningFacts(input).map((item) => item.value),
    ['0.00', '-10.00', '100.00']
  );
});

test('duplicates do not inflate feedback and graph binding changes on scope, source or dependency updates', () => {
  const input = graph();
  const feedback = evaluateEvidenceLearningPrediction(input, 'inventory', [
    'explanation',
    'explanation',
  ]);
  assert.equal(feedback.status, 'ready');
  if (feedback.status === 'ready') {
    assert.equal(feedback.result.matches, true);
    assert.deepEqual(feedback.result.predictedIds, ['explanation']);
  }
  const key = evidenceLearningFingerprint(input);
  for (const update of [
    (copy: EvidenceLabGraph) => {
      copy.year = 2024;
    },
    (copy: EvidenceLabGraph) => {
      copy.origin = 'public-web';
    },
    (copy: EvidenceLabGraph) => {
      copy.snapshotFetchedAt = '2026-10-03T00:00:00Z';
    },
    (copy: EvidenceLabGraph) => {
      copy.nodes[0]!.sourceRefs = [
        { id: 'new', label: 'new', url: 'https://example.org', sourceQuality: 'excerpt' },
      ];
    },
    (copy: EvidenceLabGraph) => {
      copy.nodes[3]!.dependsOn = ['cash'];
    },
    (copy: EvidenceLabGraph) => {
      copy.sourceNotice = ['来源范围变动', 'Source scope changed'];
    },
    (copy: EvidenceLabGraph) => {
      copy.nodes[3]!.reason = ['口径需核对', 'Basis requires review'];
    },
  ]) {
    const copy = structuredClone(input);
    update(copy);
    assert.notEqual(evidenceLearningFingerprint(copy), key);
  }
});
