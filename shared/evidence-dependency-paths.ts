import type { LabNode } from './evidence-lab.js';

type DependencyNode = Pick<LabNode, 'id' | 'kind' | 'dependsOn'>;
export type EvidenceDependencyPath =
  | { status: 'found'; nodeIds: string[] }
  | { status: 'none' }
  | { status: 'limited' };

/** Reads calculation dependencies, never visual edges or financial causation. */
export function evidenceDependencyPath(
  nodes: readonly DependencyNode[],
  factId: string,
  resultId: string
): EvidenceDependencyPath {
  const maximumNodes = 256;
  const maximumDepth = 12;
  if (nodes.length > maximumNodes) return { status: 'limited' };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) return { status: 'limited' };
  if (byId.get(factId)?.kind !== 'fact' || !byId.has(resultId) || factId === resultId)
    return { status: 'none' };
  const queue = [[resultId]];
  const visited = new Set([resultId]);
  let limited = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = queue[cursor]!;
    const current = byId.get(path[path.length - 1]!)!;
    for (const id of current.dependsOn) {
      if (!byId.has(id) || visited.has(id)) continue;
      if (path.length > maximumDepth) {
        limited = true;
        continue;
      }
      if (id === factId) return { status: 'found', nodeIds: [...path, id].reverse() };
      visited.add(id);
      queue.push([...path, id]);
    }
  }
  return { status: limited ? 'limited' : 'none' };
}
