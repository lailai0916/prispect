import type express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { rm, access } from 'node:fs/promises';
import { z } from 'zod';
import type { CompanyResearchRun, Material } from '../shared/contracts.js';
import type { AuthContext, AuthStore } from './auth.js';
import type { ModelConfig } from './model.js';
import {
  initialCompanyGraphProgress,
  runCompanyResearch,
  searchCompanies,
} from './company-agent.js';
import type { WorkspaceStore } from './store.js';
import { ApiFault, validateMaterial } from './validation.js';
import { GUEST_RECORD_LIMIT, GuestWorkspaceStore } from './guest-workspace.js';
import { assertCompanyResearchSupported } from './company-sources.js';
import { findReusableCompanyRun } from '../shared/company-run-reuse.js';
import { retrieveCompanyContext } from './company-context-sources.js';
import {
  initialFinancialCompanyProgress,
  isFinancialCompanyRun,
} from './company-research-policy.js';

export interface CompanyService {
  searchCompanies: typeof searchCompanies;
  runCompanyResearch: typeof runCompanyResearch;
}
export function installCompanyRoutes(
  app: express.Express,
  options: {
    root: string;
    auth: AuthStore;
    model: ModelConfig;
    service?: CompanyService;
    context?: typeof retrieveCompanyContext;
    onFinancialContextReady?: (store: WorkspaceStore, run: CompanyResearchRun) => Promise<void>;
  }
) {
  const service = options.service || { searchCompanies, runCompanyResearch };
  const active = new Set<string>();
  const controllers = new Map<string, AbortController>();
  const executions = new Map<string, symbol>();
  const financialCancellations = new Map<string, Promise<void>>();
  const financialOwners = new Map<string, WorkspaceStore>();
  const publishing = new Set<string>();
  const adopting = new Set<string>();
  const schema = z
    .object({
      securityCode: z.string().regex(/^(?:\d{6}|[A-Za-z]{1,10}(?:[.-][A-Za-z]{1,3})?)$/),
      orgId: z.string().regex(/^[A-Za-z0-9]{1,40}$/),
      year: z
        .number()
        .int()
        .min(2010)
        .max(new Date().getUTCFullYear() - 1),
      purpose: z.enum(['external', 'handover']).default('external'),
      // The legacy flag does not select the execution pipeline. Deep research is explicit.
      useModel: z.boolean().optional(),
      researchMode: z.enum(['financial', 'deep']).default('financial'),
      reuseExisting: z.boolean().optional(),
    })
    .strict();
  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      handler(req, res).catch(next);
    };
  const records = (store: WorkspaceStore) => (store.state.companyRuns ||= []);
  const byId = (store: WorkspaceStore, id: string) => {
    const run = records(store).find((item) => item.id === id);
    if (!run) throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的研究记录');
    return run;
  };
  // Context and challenge routes are installed after these routes. Historical
  // unsupported records remain readable, but cannot start new research there.
  const researchOperations = new Set([
    '/context',
    '/assessment',
    '/industry',
    '/questions',
    '/challenge',
  ]);
  app.use('/api/company-runs/:id', (req, res, next) => {
    const operation = req.path.toLowerCase().replace(/\/+$/, '');
    if (req.method !== 'POST' || !researchOperations.has(operation)) {
      next();
      return;
    }
    try {
      const run = byId(res.locals.store as WorkspaceStore, String(req.params.id));
      if (
        !run.informationGap ||
        run.input.securityCode !== '' ||
        run.input.orgId !== '' ||
        run.identity?.exchange === 'us'
      )
        assertCompanyResearchSupported(run.input.securityCode, run.identity?.exchange);
      next();
    } catch (error) {
      next(error);
    }
  });
  const busy = (store: WorkspaceStore) =>
    records(store).some((run) => active.has(run.id) || adopting.has(run.id));
  const deletionBlocked = (run: CompanyResearchRun) =>
    active.has(run.id) ||
    publishing.has(run.id) ||
    adopting.has(run.id) ||
    run.status === 'queued' ||
    run.status === 'running' ||
    run.contextStatus === 'loading' ||
    run.assessmentStatus === 'loading' ||
    run.challenge?.status === 'loading';
  const executeFinancial = (run: CompanyResearchRun, store: WorkspaceStore) => {
    const controller = new AbortController();
    const execution = Symbol(run.id);
    controllers.set(run.id, controller);
    executions.set(run.id, execution);
    financialOwners.set(run.id, store);
    let contextRevision: number | undefined;
    const ownsExecution = () =>
      executions.get(run.id) === execution &&
      financialOwners.get(run.id) === store &&
      store.state.companyRuns?.includes(run);
    const isCurrent = () =>
      ownsExecution() && (contextRevision === undefined || run.contextRevision === contextRevision);
    const assertCurrent = async () => {
      await financialCancellations.get(run.id);
      if (!isCurrent() || controller.signal.aborted)
        throw new ApiFault(499, 'COMPANY_CANCELLED', '本次公开资料读取已取消');
    };
    setImmediate(() => {
      void (async () => {
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const identityBudget = { used: 0, maximum: 2 };
        const step = async (
          id: 'identity' | 'finance',
          status: 'running' | 'completed',
          summary: string
        ) => {
          await assertCurrent();
          const now = new Date().toISOString();
          const branch = run.agent!.branches.find((branch) => branch.id === id)!;
          branch.status = status;
          branch.summary = summary;
          branch.startedAt ||= now;
          if (status === 'completed') branch.finishedAt = now;
          const traceId = `financial-${id}-${run.agent!.revision}`;
          const index = run.trace.findIndex((entry) => entry.id === traceId);
          const entry = {
            id: traceId,
            branchId: id,
            tool: id === 'identity' ? 'resolve-official-identity' : 'collect-public-context',
            label: id === 'identity' ? '核对上市主体' : '读取公开财务与资料',
            status,
            startedAt: branch.startedAt,
            ...(branch.finishedAt ? { finishedAt: branch.finishedAt } : {}),
            inputSummary: `${run.input.securityCode} · ${run.input.year} 年`,
            outputSummary: summary,
            sources: [],
          };
          if (index === -1) run.trace.push(entry);
          else run.trace[index] = entry;
          run.updatedAt = now;
          await store.persist();
        };
        try {
          await assertCurrent();
          run.status = 'running';
          run.contextStatus = 'loading';
          run.contextError = undefined;
          run.contextRevision = (run.contextRevision || 0) + 1;
          contextRevision = run.contextRevision;
          await step('identity', 'running', '正在通过官方披露平台核对证券代码与机构标识。');
          const response = await service.searchCompanies(run.input.securityCode, {
            signal: controller.signal,
            budget: identityBudget,
          });
          await assertCurrent();
          run.agent!.budget.sourceRequests = identityBudget.used;
          const identity = response.candidates.find(
            (item) => item.securityCode === run.input.securityCode && item.orgId === run.input.orgId
          );
          if (!identity)
            throw new ApiFault(
              422,
              'CONTEXT_IDENTITY',
              '官方来源未确认所选上市主体，未使用相似名称替代'
            );
          assertCompanyResearchSupported(identity.securityCode, identity.exchange);
          run.identity = structuredClone(identity);
          await step('identity', 'completed', '官方证券代码与机构标识相符。');
          await step('finance', 'running', '正在读取同主体财务报表、来源比对与公开资料。');
          const snapshot = await (options.context || retrieveCompanyContext)(identity, {
            signal: controller.signal,
            disclosureExcerpts: false,
            onAcquisitionProgress: async (requests) => {
              await assertCurrent();
              run.agent!.budget.sourceRequests = identityBudget.used + requests;
            },
            onSnapshot: async (snapshot) => {
              await assertCurrent();
              if (
                snapshot.securityCode !== run.input.securityCode ||
                snapshot.orgId !== run.input.orgId
              )
                throw new ApiFault(422, 'CONTEXT_SUBJECT_CONFLICT', '公开快照主体与研究记录不一致');
              run.context = structuredClone(snapshot);
              run.updatedAt = new Date().toISOString();
              await store.persist();
            },
          });
          await assertCurrent();
          if (
            snapshot.securityCode !== run.input.securityCode ||
            snapshot.orgId !== run.input.orgId
          )
            throw new ApiFault(422, 'CONTEXT_SUBJECT_CONFLICT', '公开快照主体与研究记录不一致');
          run.context = structuredClone(snapshot);
          run.contextStatus = 'ready';
          run.contextError = undefined;
          await step(
            'finance',
            'completed',
            '公开快照已保存；缺失和冲突字段保留其来源与未知状态。'
          );
          await assertCurrent();
          publishing.add(run.id);
          // Queue research while the base run still polls as running. Its failure must
          // never turn successfully acquired public data into a failed acquisition.
          try {
            await options.onFinancialContextReady?.(store, run);
          } catch {
            run.assessmentStatus = 'failed';
            run.assessmentError = '后台研究未能开始；已取得财务资料保留，可以重新研究。';
          }
          await assertCurrent();
          run.status = 'ready';
          run.agent!.recoverable = false;
          run.updatedAt = new Date().toISOString();
          await store.persist();
        } catch (error) {
          await financialCancellations.get(run.id);
          if (!isCurrent()) return;
          run.status = 'failed';
          run.contextStatus = 'failed';
          run.updatedAt = new Date().toISOString();
          run.error = controller.signal.aborted
            ? '公开资料读取已中止；已取得的快照保留，可以重试。'
            : error instanceof ApiFault
              ? error.message
              : '公开资料本次未完成；已取得的快照保留，可以重试。';
          run.contextError = run.error;
          run.agent!.recoverable = true;
          run.agent!.budget.sourceRequests = Math.max(
            run.agent!.budget.sourceRequests,
            identityBudget.used
          );
          for (const branch of run.agent!.branches)
            if (branch.status === 'running' || branch.status === 'pending') {
              branch.status = branch.status === 'running' ? 'failed' : 'skipped';
              branch.finishedAt = run.updatedAt;
              branch.summary = run.error;
            }
          for (const entry of run.trace)
            if (entry.status === 'running') {
              entry.status = 'failed';
              entry.finishedAt = run.updatedAt;
              entry.outputSummary = run.error;
            }
          await store.persist().catch(() => undefined);
        } finally {
          await financialCancellations.get(run.id);
          clearTimeout(timeout);
          if (ownsExecution()) {
            publishing.delete(run.id);
            executions.delete(run.id);
            controllers.delete(run.id);
            financialOwners.delete(run.id);
            active.delete(run.id);
          }
        }
      })();
    });
  };
  const financialContextRunning = (store: WorkspaceStore, run: CompanyResearchRun) =>
    store.state.companyRuns?.includes(run) &&
    isFinancialCompanyRun(run.input) &&
    financialOwners.get(run.id) === store &&
    active.has(run.id) &&
    controllers.has(run.id);
  const cancelFinancialContext = async (
    store: WorkspaceStore,
    run: CompanyResearchRun,
    revision: number
  ) => {
    await financialCancellations.get(run.id);
    if (
      !financialContextRunning(store, run) ||
      run.contextStatus !== 'loading' ||
      revision !== run.contextRevision ||
      publishing.has(run.id)
    )
      throw new ApiFault(409, 'RESEARCH_STALE_REVISION', '公开资料版本已变化，请刷新后取消');
    const controller = controllers.get(run.id)!;
    const previous = {
      contextRevision: run.contextRevision,
      contextStatus: run.contextStatus,
      status: run.status,
      updatedAt: run.updatedAt,
      error: run.error,
      contextError: run.contextError,
      agent: structuredClone(run.agent),
      trace: structuredClone(run.trace),
    };
    let finish!: () => void;
    const transaction = new Promise<void>((resolve) => (finish = resolve));
    financialCancellations.set(run.id, transaction);
    const now = new Date().toISOString();
    run.contextRevision = revision + 1;
    run.contextStatus = 'failed';
    run.status = 'failed';
    run.updatedAt = now;
    run.error = '公开资料读取已中止；已取得的快照保留，可以重试。';
    run.contextError = run.error;
    run.agent!.revision++;
    run.agent!.recoverable = true;
    run.agent!.cancelRequested = true;
    run.agent!.cancelledAt = now;
    for (const branch of run.agent!.branches)
      if (branch.status === 'running' || branch.status === 'pending') {
        branch.status = branch.status === 'running' ? 'failed' : 'skipped';
        branch.finishedAt = now;
        branch.summary = run.error;
      }
    for (const entry of run.trace)
      if (entry.status === 'running') {
        entry.status = 'failed';
        entry.finishedAt = now;
        entry.outputSummary = run.error;
      }
    try {
      await store.persist();
      controller.abort();
      // The old callback remains fenced by its reservation identity.
      executions.delete(run.id);
      controllers.delete(run.id);
      financialOwners.delete(run.id);
      active.delete(run.id);
    } catch (error) {
      Object.assign(run, previous);
      await store.persist().catch(() => undefined);
      throw error;
    } finally {
      if (financialCancellations.get(run.id) === transaction) financialCancellations.delete(run.id);
      finish();
    }
  };
  const execute = (run: CompanyResearchRun, store: WorkspaceStore, resume: boolean) => {
    if (isFinancialCompanyRun(run.input)) {
      executeFinancial(run, store);
      return;
    }
    run.input.useModel = true;
    run.model.requested = true;
    if (run.model.status === 'not-requested') {
      run.model.status = options.model.apiKey ? 'not-called' : 'not-configured';
    }
    const controller = new AbortController();
    controllers.set(run.id, controller);
    const execution = Symbol(run.id);
    executions.set(run.id, execution);
    const isCurrent = () => executions.get(run.id) === execution;
    setImmediate(() => {
      void (async () => {
        const timeout = setTimeout(() => controller.abort(), 480_000);
        let graphCompleted = false;
        try {
          if (!isCurrent()) return;
          if (controller.signal.aborted)
            throw new ApiFault(499, 'COMPANY_CANCELLED', '本次原件检索已取消');
          run.status = 'running';
          run.updatedAt = new Date().toISOString();
          await store.persist();
          const directory = path.join(store.dataDir, 'company-agent', run.id);
          const existing =
            resume &&
            (await access(path.join(directory, 'scope.json')).then(
              () => true,
              () => false
            ));
          const output = await service.runCompanyResearch(run.input, {
            root: options.root,
            model: options.model,
            signal: controller.signal,
            // Visitors use memory checkpoints; retained official files have a
            // separate global reservation rather than unbounded checkpoint files.
            checkpoint:
              store instanceof GuestWorkspaceStore
                ? undefined
                : { directory, threadId: run.id, resume: existing },
            previousProgress: run.agent,
            onUpdate: async (entry) => {
              if (!isCurrent()) return;
              const index = run.trace.findIndex((item) => item.id === entry.id);
              if (index === -1) run.trace.push(structuredClone(entry));
              else run.trace[index] = structuredClone(entry);
              run.updatedAt = new Date().toISOString();
              await store.persist();
            },
            onProgress: async (progress) => {
              if (!isCurrent()) return;
              run.agent = {
                ...structuredClone(progress),
                revision: run.agent?.revision || progress.revision,
                ...(run.agent?.requestKey ? { requestKey: run.agent.requestKey } : {}),
                cancelRequested: run.agent?.cancelRequested || progress.cancelRequested,
                ...(run.agent?.cancelledAt ? { cancelledAt: run.agent.cancelledAt } : {}),
              };
              run.updatedAt = new Date().toISOString();
              await store.persist();
            },
          });
          graphCompleted = true;
          if (!isCurrent()) return;
          if (controller.signal.aborted)
            throw new ApiFault(499, 'COMPANY_CANCELLED', '本次原件检索已取消');
          if (output.preview && output.buffer) {
            const prior = run.preview?.material;
            let uploadId: string | undefined;
            if (
              prior?.uploadId &&
              prior.sha256 === output.preview.material.sha256 &&
              prior.filename === output.preview.material.filename &&
              prior.sourceUrl === output.preview.material.sourceUrl
            ) {
              const existing = await store.pendingFile(prior.uploadId).catch(() => undefined);
              if (
                existing &&
                createHash('sha256').update(existing.buffer).digest('hex') ===
                  output.preview.material.sha256
              )
                uploadId = prior.uploadId;
            }
            uploadId ||= await store.retainUpload(
              output.buffer,
              output.preview.material.filename,
              output.preview.material.sha256,
              'official'
            );
            if (!isCurrent()) return;
            output.preview.material.uploadId = uploadId;
            output.preview.material.rawSourceId = undefined;
            output.preview.warnings.push(
              '原件仅向当前账号开放；未采用原件24小时后过期，确认后随材料保留。'
            );
            // Preserve the retained file identity even when publication is interrupted.
            // Recovery of a completed graph can publish this exact candidate without
            // downloading or retaining a second copy of the source.
            run.preview = structuredClone(output.preview);
          }
          if (!isCurrent()) return;
          if (controller.signal.aborted)
            throw new ApiFault(499, 'COMPANY_CANCELLED', '本次原件检索已取消');
          // Once the short final commit begins, cancellation cannot truthfully stop
          // the already-completed graph. Keep the runner lock until persistence ends.
          publishing.add(run.id);
          const { buffer: _buffer, agent, ...safeOutput } = output;
          Object.assign(run, safeOutput);
          if (agent)
            run.agent = {
              ...(run.agent?.requestKey ? { requestKey: run.agent.requestKey } : {}),
              ...agent,
              revision: run.agent?.revision || agent.revision,
              recoverable: false,
            };
          run.status = 'ready';
          run.updatedAt = new Date().toISOString();
          await store.persist();
          if (!(store instanceof GuestWorkspaceStore))
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        } catch (error) {
          if (!isCurrent()) return;
          run.status = 'failed';
          run.updatedAt = new Date().toISOString();
          run.error = controller.signal.aborted
            ? store instanceof GuestWorkspaceStore
              ? '本次执行已中止；可以重新研究公开资料。'
              : '本次执行已中止；可以恢复已保存的公开步骤。'
            : error instanceof ApiFault
              ? error.message
              : store instanceof GuestWorkspaceStore
                ? '公开研究未完成；已取得的资料保留，可以重新研究。'
                : '原件核查未完成；可以恢复核查，或自行导入材料。';
          if (run.agent) {
            run.agent.recoverable =
              store instanceof GuestWorkspaceStore
                ? false
                : graphCompleted || run.agent.recoverable || controller.signal.aborted;
            if (controller.signal.aborted) {
              run.agent.cancelRequested = true;
              run.agent.cancelledAt ||= run.updatedAt;
            }
          }
          for (const entry of run.trace)
            if (entry.status === 'running') {
              entry.status = 'failed';
              entry.finishedAt = run.updatedAt;
              entry.outputSummary = run.error;
            }
          await store.persist().catch(() => undefined);
        } finally {
          clearTimeout(timeout);
          if (isCurrent()) {
            publishing.delete(run.id);
            executions.delete(run.id);
            controllers.delete(run.id);
            active.delete(run.id);
          }
        }
      })();
    });
  };
  app.post(
    '/api/company-runs/:id/cancel',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const run = byId(store, String(req.params.id));
      const body = z.object({ revision: z.number().int().positive() }).strict().safeParse(req.body);
      if (!body.success || body.data.revision !== run.agent?.revision)
        throw new ApiFault(409, 'COMPANY_STALE_REVISION', '研究记录版本已变化，请刷新后取消');
      if (publishing.has(run.id))
        throw new ApiFault(
          409,
          'COMPANY_PUBLISHING',
          '研究步骤已完成，正在保存研究记录；请稍后查看'
        );
      const controller = controllers.get(run.id);
      if (!controller || !active.has(run.id))
        throw new ApiFault(409, 'COMPANY_NOT_RUNNING', '本次研究没有正在运行的步骤');
      if (isFinancialCompanyRun(run.input)) {
        await cancelFinancialContext(store, run, run.contextRevision!);
        res.status(202).json(structuredClone(run));
        return;
      }
      run.agent ||= initialCompanyGraphProgress();
      run.agent.cancelRequested = true;
      run.agent.cancelledAt = new Date().toISOString();
      run.agent.revision++;
      controller.abort();
      await store.persist();
      res.status(202).json(structuredClone(run));
    })
  );
  app.post(
    '/api/company-runs/:id/resume',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const run = byId(store, String(req.params.id));
      assertCompanyResearchSupported(run.input.securityCode, run.identity?.exchange);
      const body = z.object({ revision: z.number().int().positive() }).strict().safeParse(req.body);
      if (!body.success || body.data.revision !== run.agent?.revision)
        throw new ApiFault(409, 'COMPANY_STALE_REVISION', '研究记录版本已变化，请刷新后恢复');
      if (
        isFinancialCompanyRun(run.input) &&
        (run.contextStatus === 'loading' || run.assessmentStatus === 'loading')
      )
        throw new ApiFault(
          409,
          'COMPANY_SOURCE_BUSY',
          '公开资料或综合研究正在更新，请完成或取消后重试'
        );
      if (run.status !== 'failed' || !run.agent.recoverable || run.adoptedMaterialId)
        throw new ApiFault(409, 'COMPANY_NOT_RECOVERABLE', '本次结果不支持断点恢复，请新建研究');
      if (active.size >= 2 || busy(store))
        throw new ApiFault(429, 'COMPANY_AGENT_BUSY', '公司研究正在进行，请稍后重试');
      if (
        !isFinancialCompanyRun(run.input) &&
        Date.now() - Date.parse(run.createdAt) > 24 * 60 * 60 * 1000
      ) {
        await rm(path.join(store.dataDir, 'company-agent', run.id), {
          recursive: true,
          force: true,
        });
        run.agent.recoverable = false;
        await store.persist();
        throw new ApiFault(
          409,
          'COMPANY_CHECKPOINT_EXPIRED',
          '断点原件已过期，请新建研究；研究记录保留'
        );
      }
      options.auth.rateLimit(
        `company-resume:${(res.locals.auth as AuthContext).user.id}`,
        12,
        3_600_000
      );
      run.agent = isFinancialCompanyRun(run.input)
        ? initialFinancialCompanyProgress(run.agent)
        : initialCompanyGraphProgress(run.agent);
      run.agent.revision++;
      run.status = 'queued';
      run.error = undefined;
      run.updatedAt = new Date().toISOString();
      active.add(run.id);
      try {
        await store.persist();
      } catch (error) {
        active.delete(run.id);
        run.status = 'failed';
        throw error;
      }
      execute(run, store, true);
      res.status(202).json(structuredClone(run));
    })
  );
  app.get('/api/company-runs', (_req, res) =>
    res.json(records(res.locals.store as WorkspaceStore))
  );
  app.get('/api/company-runs/:id', (req, res, next) => {
    try {
      res.json(byId(res.locals.store as WorkspaceStore, String(req.params.id)));
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/company-runs',
    wrap(async (req, res) => {
      const input = schema.safeParse(req.body);
      if (!input.success)
        throw new ApiFault(400, 'INVALID_COMPANY_RUN', '公司代码、标识、年度或研究选项无效');
      assertCompanyResearchSupported(input.data.securityCode);
      const { reuseExisting, ...parsedInput } = input.data;
      const financial = parsedInput.researchMode === 'financial';
      const runInput = { ...parsedInput, useModel: !financial };
      const store = res.locals.store as WorkspaceStore;
      const requestKey = req.get('Idempotency-Key');
      if (requestKey && !/^[a-f0-9-]{36}$/.test(requestKey))
        throw new ApiFault(400, 'COMPANY_REQUEST_KEY', '请求标识格式无效');
      const existing = requestKey
        ? records(store).find((item) => item.agent?.requestKey === requestKey)
        : undefined;
      if (existing) {
        if (
          existing.input.securityCode !== runInput.securityCode ||
          existing.input.orgId !== runInput.orgId ||
          existing.input.year !== runInput.year ||
          (existing.input.purpose || 'external') !== runInput.purpose ||
          (existing.input.researchMode || 'deep') !== runInput.researchMode ||
          Boolean(existing.input.useModel) !== runInput.useModel
        )
          throw new ApiFault(
            409,
            'COMPANY_REQUEST_KEY_REUSED',
            '相同请求标识不能用于另一主体或年度'
          );
        res
          .status(200)
          .json({ ...structuredClone(existing), ...(reuseExisting ? { reused: true } : {}) });
        return;
      }
      // Opening saved research is read-only, including during other jobs or at the record limit.
      // Legacy API clients retain explicit new-record creation unless they request reuse.
      const cached = reuseExisting ? findReusableCompanyRun(records(store), runInput) : undefined;
      if (cached) {
        res.status(200).json({ ...structuredClone(cached), reused: true });
        return;
      }
      const guest = Boolean((res.locals.auth as AuthContext).user.isGuest);
      if (records(store).length >= (guest ? GUEST_RECORD_LIMIT : 30))
        throw new ApiFault(
          429,
          'COMPANY_RUN_LIMIT',
          guest ? '访客研究记录额度已满' : '最多保留30份研究记录，请整理历史后重试'
        );
      if (active.size >= 2 || busy(store))
        throw new ApiFault(429, 'COMPANY_AGENT_BUSY', '公司研究正在进行，请稍后重试');
      options.auth.rateLimit(
        `company-run:${(res.locals.auth as AuthContext).user.id}`,
        12,
        3_600_000
      );
      const now = new Date().toISOString();
      const run: CompanyResearchRun = {
        id: randomUUID(),
        input: runInput,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        trace: [],
        announcements: [],
        agent: {
          ...(financial ? initialFinancialCompanyProgress() : initialCompanyGraphProgress()),
          ...(requestKey ? { requestKey } : {}),
        },
        model: {
          requested: !financial,
          status: financial
            ? 'not-requested'
            : options.model.apiKey
              ? 'not-called'
              : 'not-configured',
        },
      };
      records(store).unshift(run);
      active.add(run.id);
      try {
        await store.persist();
      } catch (error) {
        active.delete(run.id);
        records(store).splice(records(store).indexOf(run), 1);
        throw error;
      }
      res.status(202).json(structuredClone(run));
      execute(run, store, false);
    })
  );
  app.get(
    '/api/company-runs/:id/file',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const run = byId(store, String(req.params.id));
      const uploadId = run.preview?.material.uploadId;
      if (!uploadId)
        throw new ApiFault(404, 'COMPANY_REPORT_UNAVAILABLE', '本次没有保留可下载的原件');
      const file = await store.pendingFile(uploadId);
      const encodedName = encodeURIComponent(file.filename).replace(
        /['()*]/g,
        (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase()
      );
      const isPdf = path.extname(file.filename).toLowerCase() === '.pdf';
      res
        .type(isPdf ? 'pdf' : 'application/octet-stream')
        .setHeader(
          'Content-Disposition',
          `${isPdf ? 'inline' : 'attachment'}; filename="company-annual-report${isPdf ? '.pdf' : ''}"; filename*=UTF-8''${encodedName}`
        )
        .send(file.buffer);
    })
  );
  app.post(
    '/api/company-runs/:id/adopt',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const run = byId(store, String(req.params.id));
      if (run.adoptedMaterialId) {
        const material = store.state.materials.find((item) => item.id === run.adoptedMaterialId);
        if (material) {
          await store.persist();
          res.json({ material, run });
          return;
        }
        throw new ApiFault(409, 'ADOPTED_MATERIAL_REMOVED', '此前采用的材料已删除，请新建研究');
      }
      if (run.status !== 'ready' || !run.preview?.material.uploadId)
        throw new ApiFault(409, 'COMPANY_PREVIEW_NOT_READY', '原件和候选输入尚未准备好');
      if (adopting.has(run.id)) throw new ApiFault(409, 'COMPANY_ADOPT_BUSY', '正在保存这份材料');
      if (req.body?.confirmed !== true)
        throw new ApiFault(400, 'CONFIRM_REQUIRED', '采用前须确认公司、年度、单位、合并范围与原件');
      const inputMaterial = validateMaterial(req.body.material);
      const original = run.preview.material;
      for (const key of [
        'filename',
        'sha256',
        'sourceUrl',
        'uploadId',
        'documentDate',
        'company',
        'shortName',
      ] as const)
        if (inputMaterial[key] !== original[key])
          throw new ApiFault(
            400,
            'COMPANY_SOURCE_MISMATCH',
            '原件的主体、文件名、日期、链接和哈希不可更改；观测字段可在确认时修正'
          );
      // A crash can occur after the material is durably bound but before the run is
      // marked adopted. Recover that exact adoption rather than bind the file twice.
      const recovered = store.state.materials.find((item) => item.uploadId === original.uploadId);
      if (recovered) {
        const sameSource = (
          [
            'filename',
            'sha256',
            'sourceUrl',
            'uploadId',
            'documentDate',
            'company',
            'shortName',
          ] as const
        ).every((key) => recovered[key] === original[key]);
        if (
          !sameSource ||
          !recovered.notes.some((note) => note.startsWith(`公开证据Agent查询 ${run.id}；`))
        )
          throw new ApiFault(
            409,
            'COMPANY_UPLOAD_BOUND',
            '本次原件已被另一份材料采用，请从工作区继续，或新建研究'
          );
        run.adoptedMaterialId = recovered.id;
        run.status = 'adopted';
        run.updatedAt = new Date().toISOString();
        await store.persist();
        res.json({ material: recovered, run });
        return;
      }
      if (store.state.materials.length >= 100)
        throw new ApiFault(429, 'MATERIAL_LIMIT', '工作区最多100份材料，请整理后重试');
      const material: Material = {
        ...inputMaterial,
        origin: 'public-report',
        rawSourceId: undefined,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        notes: [
          ...inputMaterial.notes.slice(0, 97),
          `公开证据Agent查询 ${run.id}；用户确认后的观测输入，不代表独立尽调或原件内容完全核验。`,
        ],
      };
      adopting.add(run.id);
      try {
        await store.saveMaterial(material);
        run.adoptedMaterialId = material.id;
        run.status = 'adopted';
        run.updatedAt = new Date().toISOString();
        await store.persist();
        res.status(201).json({ material, run });
      } finally {
        adopting.delete(run.id);
      }
    })
  );
  app.delete(
    '/api/company-runs/:id',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const run = byId(store, String(req.params.id));
      if (deletionBlocked(run))
        throw new ApiFault(409, 'COMPANY_AGENT_BUSY', '研究或保存中不能删除研究记录');
      const index = records(store).indexOf(run);
      const before = records(store)[index - 1];
      const after = records(store)[index + 1];
      records(store).splice(index, 1);
      try {
        await store.persist();
      } catch (error) {
        // Restore relative order without overwriting records added during persistence.
        const following = after ? records(store).indexOf(after) : -1;
        const preceding = before ? records(store).indexOf(before) : -1;
        const restoreIndex =
          following >= 0
            ? following
            : preceding >= 0
              ? preceding + 1
              : Math.min(index, records(store).length);
        records(store).splice(restoreIndex, 0, run);
        throw error;
      }
      // Delete originals only after the record removal is durable. Cleanup failure must
      // not report a failed deletion for an already-removed record; unconfirmed uploads
      // remain subject to the existing expiry cleanup. Adopted files are never removed.
      if (run.preview?.material.uploadId)
        await store.discardUnconfirmedUpload(run.preview.material.uploadId).catch(() => undefined);
      await rm(path.join(store.dataDir, 'company-agent', run.id), {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      res.json({ ok: true });
    })
  );
  return {
    busy,
    deletionBlocked,
    financialContextRunning,
    cancelFinancialContext,
    waitForIdle: async () => {
      while (active.size || adopting.size) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
