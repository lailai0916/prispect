import type express from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AuthStore, AuthContext } from './auth.js';
import type { WorkspaceStore } from './store.js';
import type { ModelConfig } from './model.js';
import { ApiFault } from './validation.js';
import { searchCompanies } from './company-sources.js';
import { retrieveCompanyContext, verificationLinks } from './company-context-sources.js';
import { retrieveIndustrySnapshot } from './company-industry.js';
import { answerCompanyQuestion } from './company-questions.js';

export interface CompanyContextService {
  searchCompanies: typeof searchCompanies;
  context: typeof retrieveCompanyContext;
  industry: typeof retrieveIndustrySnapshot;
  question: typeof answerCompanyQuestion;
}
export function installCompanyContextRoutes(
  app: express.Express,
  options: { auth: AuthStore; model: ModelConfig; service?: CompanyContextService }
) {
  const service = options.service || {
    searchCompanies,
    context: retrieveCompanyContext,
    industry: retrieveIndustrySnapshot,
    question: answerCompanyQuestion,
  };
  const jobs = new Map<string, Promise<void>>();
  const sourceJobs = new Set<string>();
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
          useModel: false,
        },
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        trace: [],
        announcements: [],
        model: { requested: false, status: 'not-requested' },
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
          useModel: z.boolean().default(false),
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
          [...sourceJobs].some((key) => key === run.id || key.startsWith(`${run.id}:`))
      ) || false,
    waitForIdle: async () => {
      await Promise.allSettled(jobs.values());
      while (sourceJobs.size) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
