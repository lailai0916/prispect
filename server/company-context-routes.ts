import type express from 'express';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AuthStore, AuthContext } from './auth.js';
import type { WorkspaceStore } from './store.js';
import type { ModelConfig } from './model.js';
import { ApiFault, modelEnabledSchema } from './validation.js';
import { searchCompanies } from './company-sources.js';
import { retrieveCompanyContext, verificationLinks } from './company-context-sources.js';
import { retrieveIndustrySnapshot } from './company-industry.js';
import { answerCompanyQuestion } from './company-questions.js';
import { analyzeCompanyWithModel } from './company-assessment.js';
import { runCompanyResearchAgent } from './company-research-agent.js';

export interface CompanyContextService {
  searchCompanies: typeof searchCompanies;
  context: typeof retrieveCompanyContext;
  industry: typeof retrieveIndustrySnapshot;
  question: typeof answerCompanyQuestion;
  assessment?: typeof analyzeCompanyWithModel;
  research?: typeof runCompanyResearchAgent;
}
export function installCompanyContextRoutes(
  app: express.Express,
  options: {
    auth: AuthStore;
    model: ModelConfig;
    service?: CompanyContextService;
    deletionBlocked?: (run: CompanyResearchRun) => boolean;
  }
) {
  const service = options.service || {
    searchCompanies,
    context: retrieveCompanyContext,
    industry: retrieveIndustrySnapshot,
    question: answerCompanyQuestion,
  };
  const jobs = new Map<string, Promise<void>>();
  const sourceJobs = new Set<string>();
  const assessmentJobs = new Map<string, Promise<void>>();
  const assessmentControllers = new Map<string, AbortController>();
  const limits = (res: express.Response, key: string, count: number) =>
    options.auth.rateLimit(`${key}:${(res.locals.auth as AuthContext).user.id}`, count, 3_600_000);
  const byId = (res: express.Response, id: string) => {
    const store = res.locals.store as WorkspaceStore;
    const run = store.state.companyRuns?.find((run) => run.id === id);
    if (!run) throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的企业记录');
    return { store, run };
  };
  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      void handler(req, res).catch(next);
    };
  const refreshSchema = z.object({ refresh: z.boolean().default(false) }).strict();
  const current = (store: WorkspaceStore, run: CompanyResearchRun, revision: number) =>
    store.state.companyRuns?.includes(run) && run.contextRevision === revision;
  const assessmentHash = (run: CompanyResearchRun) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          code: run.input.securityCode,
          orgId: run.input.orgId,
          year: run.input.year,
          context: run.context?.fetchedAt,
          revision: run.contextRevision,
          industry: run.industry?.[`${run.input.year}-12-31`]?.fetchedAt,
          focus: run.assessmentFocus || '',
        })
      )
      .digest('hex');
  const publicRun = (run: CompanyResearchRun): CompanyResearchRun => ({
    id: run.id,
    input: {
      securityCode: run.input.securityCode,
      orgId: run.input.orgId,
      year: run.input.year,
      purpose: run.input.purpose,
      useModel: true,
    },
    identity: run.identity ? structuredClone(run.identity) : undefined,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    context: run.context ? structuredClone(run.context) : undefined,
    industry: run.industry ? structuredClone(run.industry) : undefined,
    informationGap: run.informationGap ? structuredClone(run.informationGap) : undefined,
    assessmentFocus: run.assessmentFocus,
  });
  const scheduleAssessment = async (store: WorkspaceStore, run: CompanyResearchRun) => {
    if (!run.context || run.informationGap || assessmentJobs.has(run.id)) return;
    if ([...sourceJobs].some((key) => key.startsWith(`${run.id}:industry:`)))
      throw new ApiFault(409, 'ASSESSMENT_SOURCE_BUSY', '同行资料正在更新，请完成后开始研究');
    const key = `${run.id}:assessment`;
    if (sourceJobs.size >= 3)
      throw new ApiFault(429, 'CONTEXT_BUSY', '已有研究任务在执行，请稍后重试');
    const expected = run.context;
    const revision = (run.assessmentRevision || 0) + 1;
    const controller = new AbortController();
    const previous = {
      status: run.assessmentStatus,
      error: run.assessmentError,
      revision: run.assessmentRevision,
      trace: run.assessmentTrace,
    };
    const stillCurrent = () =>
      store.state.companyRuns?.includes(run) &&
      run.assessmentRevision === revision &&
      run.context === expected &&
      !controller.signal.aborted;
    run.assessmentStatus = 'loading';
    run.assessmentError = undefined;
    run.assessmentRevision = revision;
    run.assessmentTrace = [];
    sourceJobs.add(key);
    assessmentControllers.set(run.id, controller);
    // Reserve before persistence so simultaneous requests cannot double-run.
    let start!: () => void;
    const gate = new Promise<void>((resolve) => (start = resolve));
    const job = gate.then(async () => {
      try {
        if (!stillCurrent()) return;
        const researched = await (service.research || runCompanyResearchAgent)(
          publicRun(run),
          options.model,
          {
            industry: service.industry,
            signal: controller.signal,
            onStep: async (step) => {
              if (!stillCurrent()) return;
              const steps = run.assessmentTrace || [];
              const index = steps.findIndex((item) => item.id === step.id);
              if (index < 0) steps.push(step);
              else steps[index] = step;
              run.assessmentTrace = steps.slice(-40);
              await store.persist();
            },
          }
        );
        if (!stillCurrent()) return;
        const synthesis = {
          id: `assessment-synthesis-${revision}`,
          tool: 'synthesize',
          label: '综合判断与报告',
          status: 'running' as const,
          startedAt: new Date().toISOString(),
          summary: '正在核对指标与引用，整理六个维度的判断。',
        };
        run.assessmentTrace = [...researched.steps, synthesis];
        await store.persist();
        let reviewStartedAt: string | undefined;
        const result = await (service.assessment || analyzeCompanyWithModel)(
          researched.run,
          options.model,
          controller.signal,
          {
            onReviewStart: async () => {
              if (!stillCurrent()) throw new ApiFault(409, 'ASSESSMENT_STALE', '公开快照已变化');
              reviewStartedAt = new Date().toISOString();
              run.assessmentTrace = [
                ...researched.steps,
                {
                  ...synthesis,
                  status: 'completed',
                  finishedAt: reviewStartedAt,
                  summary: '已形成初稿，开始独立核查反向依据与来源。',
                },
                {
                  id: `assessment-review-${revision}`,
                  tool: 'review',
                  label: '交叉核查与反向复核',
                  status: 'running',
                  startedAt: reviewStartedAt,
                  summary: '检查支持与反向依据、报道冲突和仍缺失的材料。',
                },
              ];
              await store.persist();
            },
          }
        );
        if (!stillCurrent()) return;
        if (
          result.year !== run.input.year ||
          result.basis !== 'consolidated' ||
          result.snapshotFetchedAt !== expected.fetchedAt
        )
          throw new ApiFault(422, 'ASSESSMENT_SCOPE', '研究结果与本次主体、年度或快照不一致');
        const completedSynthesis = {
          ...synthesis,
          status: 'completed' as const,
          finishedAt: new Date().toISOString(),
          summary:
            result.model.status === 'completed'
              ? '已生成六维判断，评级和指标由规则计算，引用已通过检查。'
              : result.model.status === 'not-configured'
                ? 'AI 尚未配置，已生成公开数据的规则评级与判断。'
                : 'AI 未返回有效分析，已保留规则评级与判断。',
        };
        const completedSteps = [
          ...researched.steps,
          completedSynthesis,
          ...(reviewStartedAt
            ? [
                {
                  id: `assessment-review-${revision}`,
                  tool: 'review',
                  label: '交叉核查与反向复核',
                  status: result.model.warning ? ('failed' as const) : ('completed' as const),
                  startedAt: reviewStartedAt,
                  finishedAt: new Date().toISOString(),
                  summary: result.model.warning || '已完成独立反向复核，正文数字与引用通过检查。',
                },
              ]
            : []),
        ];
        result.research = {
          goal: run.assessmentFocus || '综合分析经营、现金、偿付与公开重大事项',
          steps: completedSteps,
          modelCalls: researched.modelCalls + (result.model.calls || 0),
          toolCalls: researched.toolCalls,
        };
        const period = `${run.input.year}-12-31`;
        const peer = researched.run.industry?.[period];
        const priorPublication = {
          assessment: run.assessment,
          inputHash: run.assessmentInputHash,
          industry: run.industry ? { ...run.industry } : undefined,
        };
        if (peer && peer.securityCode === run.input.securityCode && peer.period === period)
          (run.industry ||= {})[period] = peer;
        // Public research supplements never become adopted original evidence.
        if (researched.run.context) {
          run.context = {
            ...expected,
            news: researched.run.context.news,
            discussions: researched.run.context.discussions,
            publicSignals: researched.run.context.publicSignals,
            market: researched.run.context.market,
            announcements: researched.run.context.announcements,
            sources: researched.run.context.sources,
          };
        }
        run.assessment = result;
        run.assessmentTrace = completedSteps;
        run.assessmentStatus = 'ready';
        run.assessmentError = undefined;
        run.assessmentInputHash = assessmentHash(run);
        try {
          await store.persist();
        } catch (error) {
          run.assessment = priorPublication.assessment;
          run.assessmentInputHash = priorPublication.inputHash;
          run.industry = priorPublication.industry;
          run.context = expected;
          throw error;
        }
      } catch (error) {
        if (!store.state.companyRuns?.includes(run) || run.assessmentRevision !== revision) return;
        run.assessmentStatus = 'failed';
        run.assessmentTrace = run.assessmentTrace?.map((step) =>
          step.status === 'running'
            ? {
                ...step,
                status: 'failed',
                finishedAt: new Date().toISOString(),
                summary: '本次研究未完成，未发布新结论。',
              }
            : step
        );
        run.assessmentError =
          run.context !== expected || controller.signal.aborted
            ? '研究期间公开快照已变化，旧结论未发布；请按新资料重新研究。'
            : error instanceof ApiFault
              ? error.message
              : '研究本次未完成；已有数据与上次报告保留，可以重试。';
        await store.persist().catch(() => undefined);
      } finally {
        if (
          store.state.companyRuns?.includes(run) &&
          run.assessmentRevision === revision &&
          run.assessmentStatus === 'loading' &&
          !stillCurrent()
        ) {
          run.assessmentStatus = 'failed';
          run.assessmentError = '研究期间公开快照已变化，旧结论未发布；请按新资料重新研究。';
          run.assessmentTrace = run.assessmentTrace?.map((step) =>
            step.status === 'running'
              ? {
                  ...step,
                  status: 'failed',
                  finishedAt: new Date().toISOString(),
                  summary: '公开快照已变化，这一步未发布新结论。',
                }
              : step
          );
          await store.persist().catch(() => undefined);
        }
        sourceJobs.delete(key);
        assessmentJobs.delete(run.id);
        if (assessmentControllers.get(run.id) === controller) assessmentControllers.delete(run.id);
      }
    });
    assessmentJobs.set(run.id, job);
    try {
      await store.persist();
      start();
    } catch (error) {
      Object.assign(run, {
        assessmentStatus: previous.status,
        assessmentError: previous.error,
        assessmentRevision: previous.revision,
        assessmentTrace: previous.trace,
      });
      controller.abort();
      sourceJobs.delete(key);
      assessmentJobs.delete(run.id);
      assessmentControllers.delete(run.id);
      start();
      throw error;
    }
  };
  app.get('/api/company-records', (_req, res) => {
    const store = res.locals.store as WorkspaceStore;
    res.json(
      (store.state.companyRuns || []).map((run) => ({
        id: run.id,
        input: {
          securityCode: run.input.securityCode,
          orgId: run.input.orgId,
          year: run.input.year,
        },
        name:
          run.informationGap?.name ||
          run.identity?.shortName ||
          run.context?.companyName ||
          run.input.securityCode,
        status: run.status,
        createdAt: run.createdAt,
        deletionBlocked:
          options.deletionBlocked?.(run) ||
          run.status === 'queued' ||
          run.status === 'running' ||
          run.contextStatus === 'loading' ||
          run.assessmentStatus === 'loading' ||
          run.challenge?.status === 'loading',
      }))
    );
  });
  app.post(
    '/api/company-gaps',
    wrap(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(160),
          year: z
            .number()
            .int()
            .min(2010)
            .max(new Date().getFullYear() - 1),
          purpose: z.enum(['external', 'handover']),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) throw new ApiFault(400, 'CONTEXT_INPUT', '请输入企业名称和支持的年度');
      const matches = await service.searchCompanies(body.data.name);
      if (matches.candidates.length || matches.truncated)
        throw new ApiFault(409, 'CONTEXT_IDENTITY', '检索存在候选或尚未完整，请先选择证券主体');
      limits(res, 'company-gap', 12);
      const store = res.locals.store as WorkspaceStore;
      if ((store.state.companyRuns?.length || 0) >= 30)
        throw new ApiFault(400, 'COMPANY_RUN_LIMIT', '最多保存三十条企业查询，请先移除旧记录');
      const now = new Date().toISOString();
      const reason =
        '本次未匹配到支持的上市主体。没有自动获取非上市企业财务、工商或司法数据；需补充主体和授权材料。';
      const run: CompanyResearchRun = {
        id: randomUUID(),
        input: {
          securityCode: '',
          orgId: '',
          year: body.data.year,
          purpose: body.data.purpose,
          useModel: true,
        },
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        trace: [],
        announcements: [],
        model: {
          requested: true,
          status: options.model.apiKey ? 'not-called' : 'not-configured',
          error: reason,
        },
        informationGap: { name: body.data.name, reason },
        contextStatus: 'ready',
        context: {
          version: 1,
          securityCode: '',
          orgId: '',
          companyName: body.data.name,
          fetchedAt: now,
          status: 'unavailable',
          financials: [],
          sources: [],
          comparisons: [],
          profile: {},
          shareholders: [],
          announcements: [],
          news: [],
          verificationLinks: verificationLinks(body.data.name, ''),
          warnings: [reason],
        },
      };
      (store.state.companyRuns ||= []).unshift(run);
      try {
        await store.persist();
      } catch (error) {
        store.state.companyRuns.splice(store.state.companyRuns.indexOf(run), 1);
        throw error;
      }
      res.status(201).json(run);
    })
  );
  app.post(
    '/api/company-runs/:id/context',
    wrap(async (req, res) => {
      const body = refreshSchema.safeParse(req.body);
      if (!body.success) throw new ApiFault(400, 'CONTEXT_INPUT', '数据更新参数无效');
      const { store, run } = byId(res, String(req.params.id));
      if (run.informationGap) {
        res.json(run);
        return;
      }
      if (jobs.has(run.id) || sourceJobs.has(run.id)) {
        res.status(202).json(run);
        return;
      }
      const age = run.context ? Date.now() - Date.parse(run.context.fetchedAt) : Infinity;
      if (!body.data.refresh && run.context && age >= 0 && age < 24 * 3_600_000) {
        res.json(run);
        return;
      }
      if (sourceJobs.size >= 3)
        throw new ApiFault(429, 'CONTEXT_BUSY', '已有公开来源查询在执行，请稍后重试');
      limits(res, 'company-context', 12);
      const previous = {
        status: run.contextStatus,
        error: run.contextError,
        revision: run.contextRevision,
      };
      assessmentControllers.get(run.id)?.abort();
      sourceJobs.add(run.id);
      run.contextStatus = 'loading';
      run.contextError = undefined;
      run.contextRevision = (run.contextRevision || 0) + 1;
      const revision = run.contextRevision;
      try {
        await store.persist();
      } catch (error) {
        run.contextStatus = previous.status;
        run.contextError = previous.error;
        run.contextRevision = previous.revision;
        sourceJobs.delete(run.id);
        throw error;
      }
      const job = (async () => {
        try {
          let identity = run.identity;
          if (!identity) {
            const response = await service.searchCompanies(run.input.securityCode);
            identity = response.candidates.find(
              (item) =>
                item.securityCode === run.input.securityCode && item.orgId === run.input.orgId
            );
          }
          if (!identity)
            throw new ApiFault(
              422,
              'CONTEXT_IDENTITY',
              '无法定位该查询的证券主体，未使用相似名称替代'
            );
          const snapshot = await service.context(identity, {
            onSnapshot: async (snapshot) => {
              if (!current(store, run, revision)) return;
              if (
                snapshot.securityCode !== run.input.securityCode ||
                snapshot.orgId !== run.input.orgId
              )
                throw new ApiFault(422, 'CONTEXT_SUBJECT_CONFLICT', '概览主体与查询记录不一致');
              run.context = snapshot;
              run.identity ||= identity;
              await store.persist();
            },
          });
          if (
            snapshot.securityCode !== run.input.securityCode ||
            snapshot.orgId !== run.input.orgId
          )
            throw new ApiFault(422, 'CONTEXT_SUBJECT_CONFLICT', '概览主体与查询记录不一致');
          if (!current(store, run, revision)) return;
          run.context = snapshot;
          run.contextStatus = 'ready';
          run.contextError = undefined;
          run.identity ||= identity;
          await store.persist();
          sourceJobs.delete(run.id);
          await scheduleAssessment(store, run).catch(async () => {
            run.assessmentStatus = 'failed';
            run.assessmentError = '综合研究尚未开始，可以在报告中重试；公开数据已保留。';
            await store.persist().catch(() => undefined);
          });
        } catch (error) {
          if (!current(store, run, revision)) return;
          run.contextStatus = 'failed';
          run.contextError =
            error instanceof ApiFault
              ? error.message
              : '企业公开数据本次未完成；已有快照保留，可重试更新';
          await store.persist().catch(() => undefined);
        } finally {
          sourceJobs.delete(run.id);
          jobs.delete(run.id);
        }
      })();
      jobs.set(run.id, job);
      res.status(202).json(structuredClone(run));
    })
  );
  app.post(
    '/api/company-runs/:id/assessment',
    wrap(async (req, res) => {
      const body = z
        .object({
          refresh: z.boolean().default(false),
          focus: z.string().trim().max(1000).optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success)
        throw new ApiFault(400, 'ASSESSMENT_INPUT', '研究目标最多一千字，更新参数必须有效');
      const { store, run } = byId(res, String(req.params.id));
      if (!run.context || run.contextStatus === 'loading')
        throw new ApiFault(409, 'CONTEXT_NOT_READY', '公开资料仍在读取，请稍后开始研究');
      if (run.informationGap)
        throw new ApiFault(422, 'ASSESSMENT_SCOPE', '尚未定位支持的上市主体，请补充主体资料');
      if (assessmentJobs.has(run.id)) {
        if (body.data.focus !== undefined && body.data.focus !== (run.assessmentFocus || ''))
          throw new ApiFault(409, 'ASSESSMENT_BUSY', '当前研究正在执行，请完成后更换研究目标');
        res.status(202).json(structuredClone(run));
        return;
      }
      const previousFocus = run.assessmentFocus;
      if (body.data.focus !== undefined) run.assessmentFocus = body.data.focus || undefined;
      if (
        !body.data.refresh &&
        run.assessmentStatus === 'ready' &&
        run.assessment &&
        run.assessmentInputHash === assessmentHash(run)
      ) {
        res.json(run);
        return;
      }
      try {
        limits(res, 'company-assessment', 12);
        await scheduleAssessment(store, run);
      } catch (error) {
        run.assessmentFocus = previousFocus;
        throw error;
      }
      res.status(202).json(structuredClone(run));
    })
  );
  app.post(
    '/api/company-runs/:id/industry',
    wrap(async (req, res) => {
      const body = z
        .object({
          period: z.string().regex(/^20\d{2}-12-31$/),
          refresh: z.boolean().default(false),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success) throw new ApiFault(400, 'INDUSTRY_INPUT', '请选择完整年报报告期');
      const { store, run } = byId(res, String(req.params.id)),
        key = `${run.id}:industry:${body.data.period}`;
      if (run.informationGap)
        throw new ApiFault(422, 'INDUSTRY_SCOPE', '尚未定位上市主体，行业对比不可用');
      const old = run.industry?.[body.data.period],
        age = old ? Date.now() - Date.parse(old.fetchedAt) : Infinity;
      if (old && !body.data.refresh && age >= 0 && age < 24 * 3_600_000) {
        res.json({ snapshot: old, stale: false, cached: true });
        return;
      }
      if (assessmentJobs.has(run.id))
        throw new ApiFault(409, 'ASSESSMENT_BUSY', '公司研究正在执行，完成后可更新同行资料');
      if (sourceJobs.has(key) || sourceJobs.size >= 3)
        throw new ApiFault(429, 'CONTEXT_BUSY', '行业来源正在读取，请稍后重试');
      limits(res, 'company-industry', 20);
      sourceJobs.add(key);
      try {
        const snapshot = await service.industry(run.input.securityCode, body.data.period);
        if (
          snapshot.securityCode !== run.input.securityCode ||
          snapshot.period !== body.data.period
        )
          throw new ApiFault(422, 'INDUSTRY_SUBJECT_CONFLICT', '行业对比主体或报告期不一致');
        if (!store.state.companyRuns?.includes(run))
          throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '企业记录已移除');
        (run.industry ||= {})[body.data.period] = snapshot;
        await store.persist();
        res.json({ snapshot, stale: false, cached: false });
      } catch (error) {
        if (old)
          res.json({
            snapshot: old,
            stale: true,
            cached: true,
            warning: '本次更新失败，显示上次行业快照；获取时间没有改成当前时间。',
          });
        else throw error;
      } finally {
        sourceJobs.delete(key);
      }
    })
  );
  app.post(
    '/api/company-runs/:id/questions',
    wrap(async (req, res) => {
      const body = z
        .object({
          question: z.string().trim().min(1).max(500),
          basis: z.enum(['parent', 'consolidated']),
          useModel: modelEnabledSchema,
        })
        .strict()
        .safeParse(req.body);
      if (!body.success)
        throw new ApiFault(
          400,
          'COMPANY_QUESTION_INPUT',
          '请输入最多五百字的企业问题，并选择指标口径'
        );
      const { store, run } = byId(res, String(req.params.id));
      if (!run.context)
        throw new ApiFault(409, 'CONTEXT_NOT_READY', '企业概览尚未取得，请先读取数据');
      const expected = run.context;
      limits(res, 'company-question', 30);
      const answer = await service.question(
        structuredClone(run),
        body.data.question,
        body.data.basis,
        body.data.useModel,
        options.model
      );
      if (!store.state.companyRuns?.includes(run))
        throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '企业记录已移除');
      if (run.context !== expected)
        throw new ApiFault(409, 'CONTEXT_STALE', '回答期间数据已更新，请按新快照重新提问');
      (run.questions ||= []).push(answer);
      run.questions = run.questions.slice(-50);
      await store.persist();
      res.json(answer);
    })
  );
  return {
    busy: (store: WorkspaceStore) =>
      store.state.companyRuns?.some(
        (run) =>
          run.contextStatus === 'loading' ||
          run.assessmentStatus === 'loading' ||
          [...sourceJobs].some((key) => key === run.id || key.startsWith(`${run.id}:`))
      ) || false,
    waitForIdle: async () => {
      await Promise.allSettled(jobs.values());
      await Promise.allSettled(assessmentJobs.values());
      while (sourceJobs.size) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
