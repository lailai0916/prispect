import type express from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  companyChallengeTargets,
  type CompanyChallengeResult,
  type CompanyChallengeState,
  type CompanyChallengeTarget,
} from '../shared/company-challenge.js';
import type { AssessmentResearchStep } from '../shared/company-assessment.js';
import type { AuthContext, AuthStore } from './auth.js';
import type { WorkspaceStore } from './store.js';
import type { ModelConfig } from './model.js';
import { ApiFault } from './validation.js';
import {
  challengeCompanyExplanation,
  companyChallengeScopeValid,
  publicChallengeRun,
  type CompanyChallengeService,
} from './company-challenge.js';

export interface CompanyChallengeRouteService extends CompanyChallengeService {
  challenge?: typeof challengeCompanyExplanation;
}
/** Include public content, not just timestamps: in-place source additions also invalidate results. */
export function companyChallengeInputHash(
  run: CompanyResearchRun,
  target: CompanyChallengeTarget
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        securityCode: run.input.securityCode,
        orgId: run.input.orgId,
        year: run.input.year,
        target,
        contextRevision: run.contextRevision,
        context: run.context,
        industry: run.industry?.[String(run.input.year) + '-12-31'],
      })
    )
    .digest('hex');
}
export function installCompanyChallengeRoutes(
  app: express.Express,
  options: { auth: AuthStore; model: ModelConfig; service?: CompanyChallengeRouteService }
) {
  const jobs = new Map<string, Promise<void>>(),
    controllers = new Map<string, AbortController>();
  const service = options.service || {};
  const jobKey = (store: WorkspaceStore, run: CompanyResearchRun) =>
    JSON.stringify([store.dataDir, run.id]);
  const resultMatches = (
    run: CompanyResearchRun,
    target: CompanyChallengeTarget,
    result: CompanyChallengeResult | undefined
  ): result is CompanyChallengeResult =>
    !!result &&
    result.version === 1 &&
    result.target === target &&
    result.securityCode === run.input.securityCode &&
    result.year === run.input.year &&
    result.basis === 'consolidated' &&
    result.snapshotFetchedAt === run.context?.fetchedAt &&
    Array.isArray(result.research?.steps);
  const readyResults = (run: CompanyResearchRun) => {
    const results: NonNullable<CompanyResearchRun['challengeResults']> = {};
    // Pick only the fixed targets, so malformed/legacy records cannot grow this cache.
    for (const target of companyChallengeTargets) {
      const entry = run.challengeResults?.[target];
      if (
        entry?.version === 1 &&
        /^[a-f0-9]{64}$/.test(entry.inputHash) &&
        entry.result?.version === 1 &&
        entry.result.target === target
      )
        results[target] = entry;
    }
    const previous = run.challenge;
    if (
      previous?.status === 'ready' &&
      companyChallengeTargets.includes(previous.target) &&
      previous.inputHash === companyChallengeInputHash(run, previous.target) &&
      resultMatches(run, previous.target, previous.result)
    )
      results[previous.target] = {
        version: 1,
        inputHash: previous.inputHash,
        result: structuredClone(previous.result),
      };
    return results;
  };
  const byId = (res: express.Response, id: string) => {
    const store = res.locals.store as WorkspaceStore;
    const run = store.state.companyRuns?.find((item) => item.id === id);
    if (!run) throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的企业记录');
    return { store, run };
  };
  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      void handler(req, res).catch(next);
    };
  const envelope = (run: CompanyResearchRun) => ({
    challenge: run.challenge || null,
    stale:
      !!run.challenge &&
      run.challenge.inputHash !== companyChallengeInputHash(run, run.challenge.target),
  });
  const failRunningSteps = (steps: AssessmentResearchStep[], summary: string) =>
    steps.map((step) =>
      step.status === 'running'
        ? { ...step, status: 'failed' as const, finishedAt: new Date().toISOString(), summary }
        : step
    );
  const schedule = async (
    store: WorkspaceStore,
    run: CompanyResearchRun,
    target: CompanyChallengeTarget,
    refresh: boolean
  ) => {
    if (jobs.size >= 2)
      throw new ApiFault(429, 'CHALLENGE_CAPACITY', '已有解释补查在执行，请稍后重试');
    const previous = run.challenge;
    const previousResults = run.challengeResults;
    const retainedResults = readyResults(run);
    const key = jobKey(store, run);
    const inputHash = companyChallengeInputHash(run, target);
    const revision = (previous?.revision || 0) + 1;
    const controller = new AbortController();
    const state: CompanyChallengeState = {
      status: 'loading',
      target,
      revision,
      inputHash,
      trace: [],
      ...(previous?.target === target && previous.inputHash === inputHash && previous.result
        ? { result: previous.result }
        : {}),
    };
    const exists = () => store.state.companyRuns?.includes(run) && run.challenge === state;
    const snapshotCurrent = () => companyChallengeInputHash(run, target) === inputHash;
    const stillCurrent = () =>
      exists() && state.status === 'loading' && !controller.signal.aborted && snapshotCurrent();
    run.challenge = state;
    // Retain a legacy single result before switching targets, even if the new job fails.
    if (Object.keys(retainedResults).length) run.challengeResults = retainedResults;
    controllers.set(key, controller);
    let start!: () => void;
    const gate = new Promise<void>((resolve) => (start = resolve));
    const job = gate.then(async () => {
      try {
        if (!stillCurrent()) return;
        const result = await (service.challenge || challengeCompanyExplanation)(
          publicChallengeRun(run, target),
          target,
          options.model,
          {
            research: service.research,
            industry: service.industry,
            fetch: service.fetch,
            bypassCache: refresh,
            signal: controller.signal,
            onStep: async (step) => {
              if (!stillCurrent()) {
                controller.abort();
                return;
              }
              const index = state.trace.findIndex((item) => item.id === step.id);
              if (index < 0) state.trace.push(step);
              else state.trace[index] = step;
              state.trace = state.trace.slice(-40);
              await store.persist();
            },
          }
        );
        if (!stillCurrent()) return;
        if (!resultMatches(run, target, result))
          throw new ApiFault(422, 'CHALLENGE_SCOPE', '解释补查结果与本次主体、年度或快照不一致');
        const previousResult = state.result;
        const previousTrace = state.trace;
        const beforePublication = run.challengeResults;
        const nextResults = readyResults(run);
        state.result = result;
        state.trace = result.research.steps;
        state.status = 'ready';
        state.error = undefined;
        run.challengeResults = {
          ...nextResults,
          [target]: { version: 1, inputHash, result: structuredClone(result) },
        };
        try {
          await store.persist();
        } catch (error) {
          state.result = previousResult;
          state.trace = previousTrace;
          state.status = 'failed';
          run.challengeResults = beforePublication;
          throw error;
        }
      } catch (error) {
        if (!exists() || (state.status !== 'loading' && state.status !== 'failed')) return;
        if (state.error === '本次挑战已取消；未发布新线索。') return;
        state.status = 'failed';
        state.error = !snapshotCurrent()
          ? '研究期间公开快照已变化，旧线索未发布；请按新资料重新挑战。'
          : error instanceof ApiFault
            ? error.message
            : '本次解释补查未完成；实际已取得资料与上次同快照结果保留，可以重试。';
        if (!snapshotCurrent()) state.result = undefined;
        state.trace = failRunningSteps(state.trace, state.error);
        await store.persist().catch(() => undefined);
      } finally {
        if (exists() && state.status === 'loading') {
          state.status = 'failed';
          state.error = '研究期间公开快照已变化，旧线索未发布；请按新资料重新挑战。';
          state.result = undefined;
          state.trace = failRunningSteps(state.trace, state.error);
          await store.persist().catch(() => undefined);
        }
        if (jobs.get(key) === job) jobs.delete(key);
        if (controllers.get(key) === controller) controllers.delete(key);
      }
    });
    jobs.set(key, job);
    try {
      await store.persist();
      start();
    } catch (error) {
      run.challenge = previous;
      run.challengeResults = previousResults;
      controller.abort();
      if (jobs.get(key) === job) jobs.delete(key);
      if (controllers.get(key) === controller) controllers.delete(key);
      start();
      throw error;
    }
  };
  app.get(
    '/api/company-runs/:id/challenge',
    wrap(async (req, res) => {
      const { run } = byId(res, String(req.params.id));
      res.json(envelope(run));
    })
  );
  app.post(
    '/api/company-runs/:id/challenge',
    wrap(async (req, res) => {
      const body = z
        .object({ target: z.enum(companyChallengeTargets), refresh: z.boolean().default(false) })
        .strict()
        .safeParse(req.body);
      if (!body.success)
        throw new ApiFault(
          400,
          'CHALLENGE_INPUT',
          '请选择支持的解释；补查参数不能包含私人试验状态或任意网址'
        );
      const { store, run } = byId(res, String(req.params.id));
      if (!run.context || run.contextStatus === 'loading' || run.assessmentStatus === 'loading')
        throw new ApiFault(
          409,
          'CHALLENGE_SOURCE_BUSY',
          '公开资料或综合研究正在更新，请完成后挑战解释'
        );
      if (!companyChallengeScopeValid(run))
        throw new ApiFault(422, 'CHALLENGE_SCOPE', '尚未取得匹配主体的公开资料，不能补查这个解释');
      if (jobs.has(jobKey(store, run))) {
        if (run.challenge?.status !== 'loading' || run.challenge.target !== body.data.target)
          throw new ApiFault(409, 'CHALLENGE_BUSY', '当前补查仍在执行或取消中，请完成后更换解释');
        res.status(202).json(envelope(run));
        return;
      }
      const inputHash = companyChallengeInputHash(run, body.data.target);
      if (
        !body.data.refresh &&
        run.challenge?.status === 'ready' &&
        run.challenge.target === body.data.target &&
        run.challenge.inputHash === inputHash &&
        resultMatches(run, body.data.target, run.challenge.result)
      ) {
        res.json({ ...envelope(run), cached: true });
        return;
      }
      const cached = run.challengeResults?.[body.data.target];
      if (
        !body.data.refresh &&
        cached?.version === 1 &&
        cached.inputHash === inputHash &&
        resultMatches(run, body.data.target, cached.result)
      ) {
        const previous = run.challenge;
        const state: CompanyChallengeState = {
          status: 'ready',
          target: body.data.target,
          revision: (previous?.revision || 0) + 1,
          inputHash,
          trace: structuredClone(cached.result.research.steps),
          result: structuredClone(cached.result),
        };
        run.challenge = state;
        try {
          await store.persist();
        } catch (error) {
          if (run.challenge === state) run.challenge = previous;
          throw error;
        }
        if (!store.state.companyRuns?.includes(run))
          throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的企业记录');
        if (run.challenge !== state || companyChallengeInputHash(run, state.target) !== inputHash)
          throw new ApiFault(409, 'CHALLENGE_SOURCE_CHANGED', '公开资料已变化，请按新资料重新挑战');
        res.json({ ...envelope(run), cached: true });
        return;
      }
      if (jobs.size >= 2)
        throw new ApiFault(429, 'CHALLENGE_CAPACITY', '已有解释补查在执行，请稍后重试');
      options.auth.rateLimit(
        'company-challenge:' + (res.locals.auth as AuthContext).user.id,
        6,
        3_600_000
      );
      await schedule(store, run, body.data.target, body.data.refresh);
      res.status(202).json(envelope(run));
    })
  );
  app.post(
    '/api/company-runs/:id/challenge/cancel',
    wrap(async (req, res) => {
      if (!z.object({}).strict().safeParse(req.body).success)
        throw new ApiFault(400, 'CHALLENGE_INPUT', '取消请求参数无效');
      const { store, run } = byId(res, String(req.params.id));
      const state = run.challenge,
        controller = controllers.get(jobKey(store, run));
      if (!state || state.status !== 'loading' || !controller) {
        res.json(envelope(run));
        return;
      }
      controller.abort();
      state.status = 'failed';
      state.error = '本次挑战已取消；未发布新线索。';
      if (state.inputHash !== companyChallengeInputHash(run, state.target))
        state.result = undefined;
      state.trace = failRunningSteps(state.trace, state.error);
      await store.persist();
      res.json(envelope(run));
    })
  );
  return {
    busy: (store: WorkspaceStore) =>
      store.state.companyRuns?.some(
        (run) => run.challenge?.status === 'loading' || jobs.has(jobKey(store, run))
      ) || false,
    waitForIdle: async () => {
      await Promise.allSettled(jobs.values());
    },
  };
}
