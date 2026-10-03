import type express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  DecisionCase,
  DecisionDetail,
  DecisionSummary,
  DecisionVersion,
} from '../shared/decision-contracts.js';
import type { AuthContext, AuthStore } from './auth.js';
import type { WorkspaceStore } from './store.js';
import { ApiFault } from './validation.js';
import { deriveDecisionChanges } from '../shared/decision-change.js';
import {
  evaluateDecision,
  validateDecisionInput,
  validateDecisionEvidence,
  correctEvidenceScope,
  resolveCorrectedScopeIssues,
} from './decision-engine.js';

export function installDecisionRoutes(app: express.Express, options: { auth: AuthStore }) {
  const writes = new WeakMap<WorkspaceStore, Promise<unknown>>();
  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      handler(req, res).catch(next);
    };
  const records = (store: WorkspaceStore) => (store.state.decisions ||= []);
  const byId = (store: WorkspaceStore, id: string) => {
    const item = records(store).find((record) => record.id === id);
    if (!item) throw new ApiFault(404, 'DECISION_NOT_FOUND', '未找到当前账号的核查事项');
    return item;
  };
  const head = (record: DecisionCase) =>
    record.versions.find((version) => version.revision === record.currentRevision)!;
  const summary = (record: DecisionCase): DecisionSummary => ({
    id: record.id,
    title: head(record).input.title,
    purpose: head(record).input.purpose,
    transactionEntity: head(record).input.transactionEntity,
    currentRevision: record.currentRevision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
  const detail = (
    record: DecisionCase,
    store: WorkspaceStore,
    revision = record.currentRevision
  ): DecisionDetail => {
    const version = record.versions.find((item) => item.revision === revision);
    if (!version) throw new ApiFault(404, 'DECISION_VERSION_NOT_FOUND', '未找到所选输入版本');
    const evaluation = evaluateDecision(version, {
      tasks: store.state.tasks,
      materials: store.state.materials,
      knownConflicts: record.knownConflicts,
    });
    const previous = record.versions.find((item) => item.revision === version.revision - 1);
    return {
      decision: summary(record),
      version: structuredClone(version),
      evaluation,
      ...(previous
        ? {
            changes: deriveDecisionChanges(
              previous,
              version,
              evaluateDecision(previous, {
                tasks: store.state.tasks,
                materials: store.state.materials,
                knownConflicts: record.knownConflicts,
              }),
              evaluation
            ),
          }
        : {}),
      revisions: record.versions.map(({ revision, createdAt, reason, restoredFrom }) => ({
        revision,
        createdAt,
        reason,
        ...(restoredFrom ? { restoredFrom } : {}),
      })),
    };
  };
  const ownedTask = (store: WorkspaceStore, taskId: string | null) => {
    if (taskId && !store.state.tasks.some((task) => task.id === taskId))
      throw new ApiFault(404, 'TASK_NOT_FOUND', '未找到当前账号的财报核查');
  };
  const baseSchema = z.object({ baseRevision: z.number().int().min(1) });
  const serialized = async <T>(store: WorkspaceStore, operation: () => Promise<T>): Promise<T> => {
    const promise = (writes.get(store) || Promise.resolve()).catch(() => undefined).then(operation);
    writes.set(store, promise);
    return promise;
  };
  const append = async (
    store: WorkspaceStore,
    record: DecisionCase,
    baseRevision: number,
    reason: DecisionVersion['reason'],
    update: (version: DecisionVersion) => void,
    updateIssues?: (
      issues: DecisionCase['knownConflicts'],
      version: DecisionVersion
    ) => DecisionCase['knownConflicts']
  ) => {
    if (record.currentRevision !== baseRevision)
      throw new ApiFault(
        409,
        'DECISION_REVISION_CONFLICT',
        '核查事项已有新版本，请重新读取后再保存；未覆盖他人修改'
      );
    if (record.versions.length >= 100)
      throw new ApiFault(429, 'DECISION_VERSION_LIMIT', '每个核查事项最多100个输入版本');
    const next = structuredClone(record);
    const now = new Date().toISOString();
    const version: DecisionVersion = {
      ...structuredClone(head(record)),
      revision: record.currentRevision + 1,
      createdAt: now,
      reason,
    };
    delete version.restoredFrom;
    update(version);
    ownedTask(store, version.input.reportTaskId);
    next.versions.push(version);
    next.currentRevision = version.revision;
    next.updatedAt = now;
    next.knownConflicts = evaluateDecision(version, {
      tasks: store.state.tasks,
      materials: store.state.materials,
      knownConflicts: updateIssues
        ? updateIssues(record.knownConflicts, version)
        : record.knownConflicts,
    }).knownConflicts;
    const index = records(store).indexOf(record);
    records(store)[index] = next;
    try {
      await store.persist();
    } catch (error) {
      records(store)[index] = record;
      throw error;
    }
    return detail(next, store);
  };
  app.get('/api/decisions', (_req, res) =>
    res.json(records(res.locals.store as WorkspaceStore).map(summary))
  );
  app.get('/api/decisions/:id', (req, res, next) => {
    try {
      const store = res.locals.store as WorkspaceStore;
      const revision =
        req.query.revision === undefined
          ? undefined
          : z.coerce.number().int().min(1).parse(req.query.revision);
      res.json(detail(byId(store, String(req.params.id)), store, revision));
    } catch (error) {
      next(
        error instanceof z.ZodError ? new ApiFault(400, 'INVALID_REVISION', '版本号无效') : error
      );
    }
  });
  app.post(
    '/api/decisions',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      options.auth.rateLimit(
        `decisions:${(res.locals.auth as AuthContext).user.id}`,
        60,
        3_600_000
      );
      const input = validateDecisionInput(req.body);
      ownedTask(store, input.reportTaskId);
      const result = await serialized(store, async () => {
        if (records(store).length >= 50)
          throw new ApiFault(429, 'DECISION_LIMIT', '当前账号最多50个核查事项');
        const now = new Date().toISOString();
        const version: DecisionVersion = {
          revision: 1,
          createdAt: now,
          reason: 'created',
          input,
          evidence: [],
        };
        const record: DecisionCase = {
          id: randomUUID(),
          currentRevision: 1,
          createdAt: now,
          updatedAt: now,
          versions: [version],
          knownConflicts: [],
        };
        record.knownConflicts = evaluateDecision(version, {
          tasks: store.state.tasks,
          materials: store.state.materials,
        }).knownConflicts;
        records(store).unshift(record);
        try {
          await store.persist();
        } catch (error) {
          records(store).splice(records(store).indexOf(record), 1);
          throw error;
        }
        return detail(record, store);
      });
      res.status(201).json(result);
    })
  );
  app.patch(
    '/api/decisions/:id',
    wrap(async (req, res) => {
      const parsed = baseSchema.extend({ input: z.unknown() }).strict().safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(400, 'INVALID_DECISION_PATCH', '需提供baseRevision及完整input');
      const input = validateDecisionInput(parsed.data.input);
      const store = res.locals.store as WorkspaceStore;
      res.json(
        await serialized(store, () =>
          append(
            store,
            byId(store, String(req.params.id)),
            parsed.data.baseRevision,
            'edited',
            (version) => {
              version.input = input;
            }
          )
        )
      );
    })
  );
  app.post(
    '/api/decisions/:id/evidence',
    wrap(async (req, res) => {
      const parsed = baseSchema.extend({ evidence: z.unknown() }).strict().safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(400, 'INVALID_DECISION_EVIDENCE', '需提供baseRevision及evidence');
      const evidence = validateDecisionEvidence(parsed.data.evidence);
      const store = res.locals.store as WorkspaceStore;
      if (evidence.materialId) {
        const material = store.state.materials.find((record) => record.id === evidence.materialId);
        if (!material) throw new ApiFault(404, 'MATERIAL_NOT_FOUND', '未找到当前账号的绑定材料');
        if (
          evidence.observationId &&
          !material.observations.some(
            (row) =>
              row.id === evidence.observationId &&
              (evidence.page == null || row.page === evidence.page)
          )
        )
          throw new ApiFault(
            400,
            'EVIDENCE_REFERENCE_MISMATCH',
            '观测或页码不属于所选材料；没有替换绑定来源'
          );
      } else if (evidence.observationId)
        throw new ApiFault(400, 'EVIDENCE_REFERENCE_MISMATCH', '观测绑定需明确材料');
      res.json(
        await serialized(store, () =>
          append(
            store,
            byId(store, String(req.params.id)),
            parsed.data.baseRevision,
            'evidence-added',
            (version) => {
              if (version.evidence.length >= 50)
                throw new ApiFault(429, 'DECISION_EVIDENCE_LIMIT', '每个核查事项最多50条证据记录');
              version.evidence.push({
                ...evidence,
                id: randomUUID(),
                state: 'active',
                createdAt: new Date().toISOString(),
              });
            }
          )
        )
      );
    })
  );
  app.patch(
    '/api/decisions/:id/evidence/:evidenceId',
    wrap(async (req, res) => {
      const parsed = baseSchema
        .extend({ state: z.enum(['active', 'withdrawn']) })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(
          400,
          'INVALID_EVIDENCE_STATE',
          '证据状态需active或withdrawn及baseRevision'
        );
      const store = res.locals.store as WorkspaceStore;
      res.json(
        await serialized(store, () =>
          append(
            store,
            byId(store, String(req.params.id)),
            parsed.data.baseRevision,
            parsed.data.state === 'active' ? 'evidence-restored' : 'evidence-withdrawn',
            (version) => {
              const evidence = version.evidence.find(
                (record) => record.id === req.params.evidenceId
              );
              if (!evidence)
                throw new ApiFault(
                  404,
                  'DECISION_EVIDENCE_NOT_FOUND',
                  '未找到该核查事项的证据记录'
                );
              evidence.state = parsed.data.state;
            }
          )
        )
      );
    })
  );
  app.post(
    '/api/decisions/:id/evidence/:evidenceId/scope',
    wrap(async (req, res) => {
      const parsed = baseSchema
        .extend({
          entity: z.string(),
          asOf: z.string().nullable(),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(
          400,
          'INVALID_EVIDENCE_SCOPE',
          '需提供baseRevision、entity、asOf和更正理由'
        );
      const store = res.locals.store as WorkspaceStore;
      const evidenceId = String(req.params.evidenceId);
      res.json(
        await serialized(store, () =>
          append(
            store,
            byId(store, String(req.params.id)),
            parsed.data.baseRevision,
            'scope-corrected',
            (version) => {
              const index = version.evidence.findIndex((record) => record.id === evidenceId);
              if (index < 0)
                throw new ApiFault(
                  404,
                  'DECISION_EVIDENCE_NOT_FOUND',
                  '未找到该核查事项的证据记录'
                );
              version.evidence[index] = correctEvidenceScope(
                version.evidence[index]!,
                { entity: parsed.data.entity, asOf: parsed.data.asOf },
                store.state.materials
              );
            },
            (issues, version) =>
              resolveCorrectedScopeIssues(
                issues,
                version,
                evidenceId,
                parsed.data.reason,
                store.state.materials
              )
          )
        )
      );
    })
  );
  app.post(
    '/api/decisions/:id/restore',
    wrap(async (req, res) => {
      const parsed = baseSchema
        .extend({ revision: z.number().int().min(1) })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(400, 'INVALID_DECISION_RESTORE', '需提供baseRevision及目标revision');
      const store = res.locals.store as WorkspaceStore;
      res.json(
        await serialized(store, () => {
          const record = byId(store, String(req.params.id));
          const old = record.versions.find((version) => version.revision === parsed.data.revision);
          if (!old) throw new ApiFault(404, 'DECISION_VERSION_NOT_FOUND', '未找到恢复目标版本');
          return append(store, record, parsed.data.baseRevision, 'restored-version', (version) => {
            version.input = structuredClone(old.input);
            version.evidence = structuredClone(old.evidence);
            version.restoredFrom = old.revision;
          });
        })
      );
    })
  );
}
