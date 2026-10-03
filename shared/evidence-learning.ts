/** Optional local dependency practice. No grading, adoption, model or persistence side effects. */
import { evaluateEvidenceLab, type EvidenceLabGraph, type LabNode } from './evidence-lab.js';
import type { AssessmentText } from './company-assessment.js';

export interface EvidenceLearningChallenge {
  fact: LabNode;
  candidates: LabNode[];
  baseline: EvidenceLabGraph;
  trial: EvidenceLabGraph;
  pausedIds: string[];
  independentFacts: LabNode[];
}
export type EvidenceLearningAvailability =
  | { status: 'ready'; challenge: EvidenceLearningChallenge }
  | { status: 'unavailable'; reason: AssessmentText };
export interface EvidenceLearningResult extends EvidenceLearningChallenge {
  predictedIds: string[];
  missedIds: string[];
  extraIds: string[];
  matches: boolean;
}
export type EvidenceLearningFeedback =
  | { status: 'ready'; result: EvidenceLearningResult }
  | { status: 'unavailable'; reason: AssessmentText };

/** Binding includes dependency and scope changes, even when displayed amounts stay the same. */
export function evidenceLearningFingerprint(graph: EvidenceLabGraph): string {
  return JSON.stringify([
    graph.version,
    graph.origin,
    graph.company,
    graph.year,
    graph.basis,
    graph.snapshotFetchedAt,
    graph.sourceNotice,
    graph.withdrawnFactIds,
    graph.nodes.map((node) => [
      node.id,
      node.kind,
      node.label,
      node.baseState,
      node.baseValue,
      node.unit,
      node.dependsOn,
      node.sourceRefs,
      node.formula,
      node.detail,
      node.reason,
      node.blockers,
      node.metricIds,
      node.hypothesisId,
      node.challengeFocus,
      node.materialStatus,
    ]),
    graph.edges,
  ]);
}

export function evidenceLearningFacts(graph: EvidenceLabGraph): LabNode[] {
  return evaluateEvidenceLab(graph, graph.withdrawnFactIds).nodes.filter(
    (node) =>
      node.kind === 'fact' &&
      node.state === 'available' &&
      node.baseState === 'available' &&
      node.value !== null
  );
}

export function createEvidenceLearningChallenge(
  graph: EvidenceLabGraph,
  factId: string
): EvidenceLearningAvailability {
  const baseline = evaluateEvidenceLab(graph, graph.withdrawnFactIds);
  const fact = evidenceLearningFacts(graph).find((node) => node.id === factId);
  if (!fact)
    return {
      status: 'unavailable',
      reason: [
        '先选一条可核对、金额可用的来源事实；缺失、冲突或已撤回的事实不能再作撤回练习。',
        'Choose an inspectable source fact with an available amount. Missing, conflicting or already withdrawn facts cannot be withdrawn for this practice.',
      ],
    };
  const candidates = baseline.nodes.filter(
    (node) =>
      ['calculation', 'hypothesis'].includes(node.kind) &&
      ['available', 'not-applicable'].includes(node.state)
  );
  if (!candidates.length)
    return {
      status: 'unavailable',
      reason: [
        '当前来源尚未形成可演练的计算或解释关系。先补齐或核对依据。',
        'The current sources do not yet provide calculation or explanation relationships for practice. Obtain or reconcile the evidence first.',
      ],
    };
  const trial = evaluateEvidenceLab(graph, [...graph.withdrawnFactIds, factId]);
  const trialById = new Map(trial.nodes.map((node) => [node.id, node]));
  return {
    status: 'ready',
    challenge: {
      fact,
      baseline,
      trial,
      candidates,
      pausedIds: candidates
        .filter((node) => trialById.get(node.id)?.state === 'paused')
        .map((node) => node.id),
      independentFacts: trial.nodes.filter(
        (node) => node.kind === 'fact' && node.state === 'available' && node.value !== null
      ),
    },
  };
}

/** The answer is computed by the same evaluator as the evidence lab, never by a second rule set. */
export function evaluateEvidenceLearningPrediction(
  graph: EvidenceLabGraph,
  factId: string,
  predictedIds: readonly string[]
): EvidenceLearningFeedback {
  const availability = createEvidenceLearningChallenge(graph, factId);
  if (availability.status === 'unavailable') return availability;
  const { challenge } = availability;
  const candidates = new Set(challenge.candidates.map((node) => node.id));
  if (predictedIds.some((id) => !candidates.has(id)))
    return {
      status: 'unavailable',
      reason: [
        '选项与当前证据图不一致，请按当前来源重新选择。',
        'The selection does not match the current evidence graph. Choose again from the current sources.',
      ],
    };
  const predicted = [...new Set(predictedIds)];
  const actual = new Set(challenge.pausedIds);
  const predictedSet = new Set(predicted);
  const missedIds = challenge.pausedIds.filter((id) => !predictedSet.has(id));
  const extraIds = predicted.filter((id) => !actual.has(id));
  return {
    status: 'ready',
    result: {
      ...challenge,
      predictedIds: predicted,
      missedIds,
      extraIds,
      matches: missedIds.length === 0 && extraIds.length === 0,
    },
  };
}
