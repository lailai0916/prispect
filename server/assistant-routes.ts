import type express from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AssistantAnswer, AssistantRequest } from '../shared/assistant.js';
import type { AuthContext, AuthStore } from './auth.js';
import type { WorkspaceStore } from './store.js';
import type { ModelConfig } from './model.js';
import { assertCompanyResearchSupported } from './company-sources.js';
import { ApiFault } from './validation.js';
import { searchProductKnowledge } from './product-knowledge.js';
import {
  OwnerAnswerCache,
  ownerAnswerCacheKey,
  bypassOwnerAnswerCache,
  type OwnerAnswerReservation,
} from './owner-answer-cache.js';
import {
  assistantClarification,
  assistantCompanyName,
  assistantPublicRun,
  defaultAssistantService,
  isProductQuestion,
  resolveAssistantCompany,
  type AssistantService,
} from './assistant.js';

const requestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    locale: z.enum(['zh', 'en']),
    currentRunId: z.string().min(1).max(120).optional(),
    previousRunId: z.string().min(1).max(120).optional(),
    reportGeneratedAt: z.iso.datetime({ offset: true }).optional(),
    basis: z.enum(['consolidated', 'parent']).optional(),
    previousQuestions: z.array(z.string().max(500)).max(6).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();

/** An injected provider must not keep a closed request or its concurrency slot alive. */
function awaitAssistant<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => signal.removeEventListener('abort', aborted);
    const aborted = () => {
      finish();
      reject(signal.reason || new DOMException('Assistant request aborted', 'AbortError'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(
      (result) => {
        finish();
        if (signal.aborted) aborted();
        else resolve(result);
      },
      (error) => {
        finish();
        reject(error);
      }
    );
    if (signal.aborted) aborted();
  });
}

export function installAssistantRoutes(
  app: express.Express,
  options: {
    auth: AuthStore;
    model: ModelConfig;
    workspaceForUser: (userId: string) => Promise<WorkspaceStore>;
    workspaceForContext?: (context: AuthContext) => Promise<WorkspaceStore>;
    service?: AssistantService;
  }
) {
  const service = { ...defaultAssistantService, ...options.service };
  const answers = new OwnerAnswerCache<AssistantAnswer>();
  const pending = new Set<Promise<void>>();
  const owners = new Map<string, number>();
  let active = 0;
  app.post('/api/assistant/messages', (req, res, next) => {
    const controller = new AbortController();
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', disconnected);
    res.once('close', disconnected);
    if (req.aborted) controller.abort();
    const timeout = AbortSignal.timeout(90_000);
    const signal = AbortSignal.any([controller.signal, timeout]);
    const work = async () => {
      const body = requestSchema.safeParse(req.body);
      if (!body.success) throw new ApiFault(400, 'ASSISTANT_INPUT', '请输入最多五百字的问题');
      const request: AssistantRequest = body.data;
      const session = await options.auth.workspaceSession(req);
      signal.throwIfAborted();
      if (session) options.auth.verifyCsrf(req, session);
      const owner = session
        ? `${session.user.isGuest ? 'guest' : 'user'}:${session.user.id}`
        : `anonymous:${req.ip}`;
      options.auth.rateLimit(`assistant:${owner}`, session ? 30 : 12, session ? 3_600_000 : 60_000);
      if (active >= 8 || (owners.get(owner) || 0) >= 2)
        throw new ApiFault(429, 'ASSISTANT_BUSY', '助手正在处理其他问题，请稍后重试');
      active++;
      owners.set(owner, (owners.get(owner) || 0) + 1);
      let reservation: OwnerAnswerReservation | undefined;
      try {
        if (!session || isProductQuestion(request.question, request.previousQuestions)) {
          const signedIn = Boolean(session && !session.user.isGuest);
          const key = ownerAnswerCacheKey({
            owner,
            namespace: 'assistant-documentation',
            question: request.question,
            locale: request.locale,
            previousQuestions: request.previousQuestions,
            model: options.model,
            documents: searchProductKnowledge(
              [...(request.previousQuestions || []), request.question].join('\n'),
              request.locale
            ),
          });
          const bypass = bypassOwnerAnswerCache(request.question, request.refresh);
          // Anonymous questions stay uncached: an IP address does not identify a person.
          const cached = session && !bypass ? answers.get(owner, key) : undefined;
          if (cached) {
            signal.throwIfAborted();
            res.json(cached);
            return;
          }
          if (session) {
            if (bypass) answers.invalidate(owner, key);
            reservation = answers.reserve(owner, key);
          }
          const answer = await awaitAssistant(
            service.documentation(
              request.question,
              request.locale,
              signedIn,
              signedIn ? options.model : {},
              signal,
              { previousQuestions: request.previousQuestions }
            ),
            signal
          );
          signal.throwIfAborted();
          if (session && !bypassOwnerAnswerCache(request.question))
            answers.set(owner, key, answer, undefined, reservation);
          res.json(answer);
          return;
        }
        const store = session.user.isGuest
          ? await options.workspaceForContext!(session)
          : await options.workspaceForUser(session.user.id);
        signal.throwIfAborted();
        const runs = store.state.companyRuns || [];
        for (const id of [request.currentRunId, request.previousRunId])
          if (id && !runs.some((run) => run.id === id))
            throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的研究记录');
        const resolution = resolveAssistantCompany(runs, request);
        if (resolution.kind === 'clarification') {
          res.json(assistantClarification(request, resolution.text));
          return;
        }
        const run = resolution.run;
        if (request.reportGeneratedAt && !request.currentRunId)
          throw new ApiFault(
            409,
            'ASSISTANT_REPORT_STALE',
            '无法确认这份报告的研究记录，请重新打开报告后提问'
          );
        // A question that explicitly names another issuer/year overrides page context.
        // The page's report version must never become that other company's report.
        const reportGeneratedAt =
          run.id === request.currentRunId ? request.reportGeneratedAt : undefined;
        const selectedReport = assistantPublicRun(run).assessment;
        if (
          reportGeneratedAt &&
          (!selectedReport || selectedReport.generatedAt !== reportGeneratedAt)
        )
          throw new ApiFault(
            409,
            'ASSISTANT_REPORT_STALE',
            '这份分析报告已被替换或不再可用，请重新打开报告后提问'
          );
        assertCompanyResearchSupported(run.input.securityCode, run.identity?.exchange);
        if (!run.context)
          throw new ApiFault(409, 'CONTEXT_NOT_READY', '企业概览尚未取得，请先读取数据');
        const fingerprint = () =>
          createHash('sha256')
            .update(JSON.stringify(assistantPublicRun(run)))
            .digest('hex');
        const expected = fingerprint();
        let publicRun = assistantPublicRun(run);
        const wantsResearch = service.wantsResearch(request.question);
        const bypass = wantsResearch || bypassOwnerAnswerCache(request.question, request.refresh);
        const cacheOwner = `${owner}:${store.dataDir}`;
        const cacheKey = ownerAnswerCacheKey({
          owner: cacheOwner,
          namespace: 'assistant-company',
          question: request.question,
          locale: request.locale,
          basis: request.basis,
          previousQuestions: request.previousQuestions,
          publicBasis: { run: publicRun, reportGeneratedAt: reportGeneratedAt || null },
          model: options.model,
        });
        const cacheScope = run;
        const expectedWorkspace = store.state;
        const cached = bypass ? undefined : answers.get(cacheOwner, cacheKey, cacheScope);
        if (cached) {
          signal.throwIfAborted();
          res.json(cached);
          return;
        }
        if (bypass) answers.invalidate(cacheOwner, cacheKey, cacheScope);
        reservation = answers.reserve(cacheOwner, cacheKey);
        let research: AssistantAnswer['research'];
        let researchWarning: string | undefined;
        if (wantsResearch) {
          try {
            const retrieved = await awaitAssistant(
              service.research(publicRun, request.question, { signal, bypassCache: true }),
              signal
            );
            if (
              retrieved.run.input.securityCode !== run.input.securityCode ||
              retrieved.run.input.orgId !== run.input.orgId ||
              retrieved.run.input.year !== run.input.year ||
              retrieved.run.context?.securityCode !== run.input.securityCode ||
              retrieved.run.context?.orgId !== run.input.orgId
            )
              throw new Error('ASSISTANT_RESEARCH_SCOPE');
            publicRun = assistantPublicRun(retrieved.run);
            research = retrieved.research;
            researchWarning = retrieved.warning;
          } catch {
            signal.throwIfAborted();
            research = { status: 'unavailable', toolCalls: 0, sources: [] };
            researchWarning =
              request.locale === 'en'
                ? 'New public information could not be retrieved. This answer uses the saved snapshot; an unavailable source does not mean no events occurred.'
                : '本次未取得新的公开资料，回答依据已保存快照；来源不可用不代表没有相关事件。';
          }
        }
        signal.throwIfAborted();
        const answer = await awaitAssistant(
          service.question(
            publicRun,
            request.question,
            request.basis || 'consolidated',
            true,
            options.model,
            signal,
            {
              concise: true,
              locale: request.locale,
              previousQuestions: request.previousQuestions,
              reportGeneratedAt,
            }
          ),
          signal
        );
        signal.throwIfAborted();
        if (!store.state.companyRuns?.includes(run))
          throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '研究记录已移除');
        if (fingerprint() !== expected)
          throw new ApiFault(409, 'CONTEXT_STALE', '回答期间资料已更新，请按新快照重新提问');
        const result: AssistantAnswer = {
          ...answer,
          kind: 'company',
          company: { runId: run.id, name: assistantCompanyName(run), year: run.input.year },
          ...(research ? { research } : {}),
          ...(answer.warning || researchWarning
            ? { warning: [answer.warning, researchWarning].filter(Boolean).join(' ') }
            : {}),
        };
        const previousAnswers = run.questions;
        run.questions = [...(previousAnswers || []), result].slice(-50);
        try {
          await store.persist();
        } catch (error) {
          run.questions = previousAnswers;
          throw error;
        }
        signal.throwIfAborted();
        if (
          !wantsResearch &&
          !bypassOwnerAnswerCache(request.question) &&
          store.state === expectedWorkspace &&
          store.state.companyRuns?.includes(run) &&
          fingerprint() === expected
        )
          answers.set(cacheOwner, cacheKey, result, cacheScope, reservation);
        res.json(result);
      } finally {
        if (reservation) answers.release(reservation);
        active--;
        const count = (owners.get(owner) || 1) - 1;
        if (count) owners.set(owner, count);
        else owners.delete(owner);
      }
    };
    const task = work()
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          next(
            timeout.aborted ? new ApiFault(504, 'ASSISTANT_TIMEOUT', '回答超时，请稍后重试') : error
          );
      })
      .finally(() => {
        pending.delete(task);
        req.removeListener('aborted', disconnected);
        res.removeListener('close', disconnected);
      });
    pending.add(task);
  });
  return {
    waitForIdle: async () => {
      await Promise.allSettled(pending);
    },
  };
}
