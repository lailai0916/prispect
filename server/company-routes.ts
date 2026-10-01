import type express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CompanyResearchRun, Material } from '../shared/contracts.js';
import type { AuthContext, AuthStore } from './auth.js';
import type { ModelConfig } from './model.js';
import { runCompanyResearch, searchCompanies } from './company-agent.js';
import type { WorkspaceStore } from './store.js';
import { ApiFault, validateMaterial } from './validation.js';

export interface CompanyService {
  searchCompanies: typeof searchCompanies;
  runCompanyResearch: typeof runCompanyResearch;
}
export function installCompanyRoutes(
  app: express.Express,
  options: { root: string; auth: AuthStore; model: ModelConfig; service?: CompanyService }
) {
  const service = options.service || { searchCompanies, runCompanyResearch };
  const active = new Set<string>();
  const adopting = new Set<string>();
  const schema = z
    .object({
      securityCode: z.string().regex(/^\d{6}$/),
      orgId: z.string().regex(/^[A-Za-z0-9]{1,40}$/),
      year: z
        .number()
        .int()
        .min(2010)
        .max(new Date().getUTCFullYear() - 1),
      purpose: z.enum(['external', 'handover']).default('external'),
      useModel: z.boolean().default(false),
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
    if (!run) throw new ApiFault(404, 'COMPANY_RUN_NOT_FOUND', '未找到当前账号的企业查询');
    return run;
  };
  const busy = (store: WorkspaceStore) =>
    records(store).some((run) => active.has(run.id) || adopting.has(run.id));
  app.get(
    '/api/companies/search',
    wrap(async (req, res) => {
      const query = z.string().trim().min(1).max(80).safeParse(req.query.q);
      if (!query.success)
        throw new ApiFault(400, 'INVALID_COMPANY_QUERY', '请输入公司简称或六位证券代码');
      options.auth.rateLimit(
        `company-search:${(res.locals.auth as AuthContext).user.id}`,
        30,
        60_000
      );
      res.json(await service.searchCompanies(query.data));
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
        throw new ApiFault(400, 'INVALID_COMPANY_RUN', '公司代码、标识、年度或查询选项无效');
      const store = res.locals.store as WorkspaceStore;
      if (records(store).length >= 30)
        throw new ApiFault(429, 'COMPANY_RUN_LIMIT', '最多保留30份公开查询，请整理历史后重试');
      if (active.size >= 1 || busy(store))
        throw new ApiFault(429, 'COMPANY_AGENT_BUSY', '公开证据Agent正在查询，请稍后重试');
      options.auth.rateLimit(
        `company-run:${(res.locals.auth as AuthContext).user.id}`,
        12,
        3_600_000
      );
      const now = new Date().toISOString();
      const run: CompanyResearchRun = {
        id: randomUUID(),
        input: input.data,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        trace: [],
        announcements: [],
        model: {
          requested: input.data.useModel,
          status: input.data.useModel
            ? options.model.apiKey
              ? 'not-called'
              : 'not-configured'
            : 'not-requested',
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
      setImmediate(() => {
        void (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 150_000);
          try {
            run.status = 'running';
            run.updatedAt = new Date().toISOString();
            await store.persist();
            const output = await service.runCompanyResearch(run.input, {
              root: options.root,
              model: options.model,
              signal: controller.signal,
              onUpdate: async (entry) => {
                const index = run.trace.findIndex((item) => item.id === entry.id);
                if (index === -1) run.trace.push(structuredClone(entry));
                else run.trace[index] = structuredClone(entry);
                run.updatedAt = new Date().toISOString();
                await store.persist();
              },
            });
            if (controller.signal.aborted) throw new Error('Query timeout');
            if (output.preview && output.buffer) {
              const uploadId = await store.retainUpload(
                output.buffer,
                output.preview.material.filename,
                output.preview.material.sha256
              );
              output.preview.material.uploadId = uploadId;
              output.preview.material.rawSourceId = undefined;
              output.preview.warnings.push(
                '原件仅向当前账号开放；未采用原件24小时后过期，确认后随材料保留。'
              );
            }
            const { buffer: _buffer, ...safeOutput } = output;
            Object.assign(run, safeOutput);
            run.status = 'ready';
            run.updatedAt = new Date().toISOString();
            await store.persist();
          } catch (error) {
            run.status = 'failed';
            run.updatedAt = new Date().toISOString();
            run.error =
              error instanceof ApiFault
                ? error.message
                : '公开证据查询未完成。可重新查询，或自行导入材料。';
            for (const entry of run.trace)
              if (entry.status === 'running') {
                entry.status = 'failed';
                entry.finishedAt = run.updatedAt;
                entry.outputSummary = run.error;
              }
            await store.persist().catch(() => undefined);
          } finally {
            clearTimeout(timeout);
            active.delete(run.id);
          }
        })();
      });
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
      res
        .type('pdf')
        .setHeader('Content-Disposition', 'inline; filename="company-annual-report.pdf"')
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
        throw new ApiFault(409, 'ADOPTED_MATERIAL_REMOVED', '此前采用的材料已删除，请重新查询');
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
            '本次原件已被另一份材料采用，请从工作区继续，或重新查询'
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
      if (active.has(run.id) || adopting.has(run.id))
        throw new ApiFault(409, 'COMPANY_AGENT_BUSY', '查询或保存中不能删除');
      if (run.preview?.material.uploadId)
        await store.discardUnconfirmedUpload(run.preview.material.uploadId);
      store.state.companyRuns = records(store).filter((item) => item.id !== run.id);
      await store.persist();
      res.json({ ok: true });
    })
  );
  return {
    busy,
    waitForIdle: async () => {
      while (active.size || adopting.size) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
