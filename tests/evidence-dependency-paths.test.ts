import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceDependencyPath } from '../shared/evidence-dependency-paths.js';

function fact(id: string) {
  return { id, kind: 'fact' as const, dependsOn: [] as string[] };
}
function calculation(id: string, dependsOn: string[]) {
  return { id, kind: 'calculation' as const, dependsOn };
}

test('reads a multi-hop dependency path from the withdrawn fact to the result without mutation', () => {
  const nodes = [
    fact('profit'),
    calculation('gap', ['profit']),
    calculation('explanation', ['gap']),
  ];
  const original = JSON.stringify(nodes);
  assert.deepEqual(evidenceDependencyPath(nodes, 'profit', 'explanation'), {
    status: 'found',
    nodeIds: ['profit', 'gap', 'explanation'],
  });
  assert.equal(JSON.stringify(nodes), original);
});

test('chooses one shortest real path when dependencies branch', () => {
  const nodes = [
    fact('profit'),
    fact('cash'),
    calculation('gap', ['cash', 'profit']),
    calculation('indirect', ['gap']),
    calculation('result', ['indirect', 'profit']),
  ];
  assert.deepEqual(evidenceDependencyPath(nodes, 'profit', 'result'), {
    status: 'found',
    nodeIds: ['profit', 'result'],
  });
  assert.deepEqual(evidenceDependencyPath(nodes, 'cash', 'result'), {
    status: 'found',
    nodeIds: ['cash', 'gap', 'indirect', 'result'],
  });
});

test('cycles terminate and never become an invented connection to an independent fact', () => {
  const nodes = [
    fact('profit'),
    calculation('first', ['second']),
    calculation('second', ['first']),
  ];
  assert.deepEqual(evidenceDependencyPath(nodes, 'profit', 'first'), { status: 'none' });
  nodes[2]!.dependsOn.push('profit');
  assert.deepEqual(evidenceDependencyPath(nodes, 'profit', 'first'), {
    status: 'found',
    nodeIds: ['profit', 'second', 'first'],
  });
});

test('independent, unknown and non-fact inputs have no withdrawal path', () => {
  const nodes = [fact('profit'), fact('cash'), calculation('ratio', ['profit'])];
  for (const [from, to] of [
    ['cash', 'ratio'],
    ['missing', 'ratio'],
    ['ratio', 'profit'],
    ['profit', 'missing'],
    ['profit', 'profit'],
  ])
    assert.deepEqual(evidenceDependencyPath(nodes, from!, to!), { status: 'none' });
});

test('bounded or ambiguous graphs are reported as limited rather than claiming no dependency', () => {
  const deep: Array<ReturnType<typeof fact> | ReturnType<typeof calculation>> = [fact('profit')];
  for (let index = 0; index < 13; index++)
    deep.push(calculation(`step-${index}`, [index ? `step-${index - 1}` : 'profit']));
  assert.deepEqual(evidenceDependencyPath(deep, 'profit', 'step-12'), { status: 'limited' });
  assert.deepEqual(evidenceDependencyPath(deep, 'profit', 'step-11'), {
    status: 'found',
    nodeIds: ['profit', ...Array.from({ length: 12 }, (_, index) => `step-${index}`)],
  });
  assert.deepEqual(
    evidenceDependencyPath(
      Array.from({ length: 257 }, (_, index) => fact(String(index))),
      '0',
      '1'
    ),
    { status: 'limited' }
  );
  assert.deepEqual(evidenceDependencyPath([fact('same'), fact('same')], 'same', 'same'), {
    status: 'limited',
  });
});
