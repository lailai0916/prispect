import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { getRequest, setResponse } from 'better-call/node';
import { APIError } from 'better-auth/api';
import { installAccountRoutes } from './account-routes.js';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import type { AnalysisTask, CreateTaskInput, Material, Stage } from '../shared/contracts.js';
import { analyze } from './engine.js';
import { reportHtml } from './export.js';
import { previewUpload } from './import.js';
import { DEFAULT_MODEL, explainWithModel, modelConfigFromEnv, type ModelConfig } from './model.js';
import { seeds, WorkspaceStore } from './store.js';
import { AuthStore, authentication, type AuthContext } from './auth.js';
import { installDecisionRoutes } from './decision-routes.js';
import { installCompanyRoutes, type CompanyService } from './company-routes.js';
import {
  installCompanyContextRoutes,
  type CompanyContextService,
} from './company-context-routes.js';
import { ApiFault, taskContextSchema, taskInputSchema, validateMaterial } from './validation.js';

export interface AppOptions {
  root?: string;
  dataDir?: string;
  model?: ModelConfig;
  companyService?: CompanyService;
  companyContextService?: CompanyContextService;
  registrationEnabled?: boolean;
}
export async function createApp(options: AppOptions = {}) {
  const root = options.root || process.cwd();
  const dataDir = options.dataDir || process.env.CASHLENS_DATA_DIR || path.join(root, '.cashlens');
  const auth = await AuthStore.open(
    dataDir,
    process.env.NODE_ENV === 'production',
    options.registrationEnabled
  );
  const initial = await seeds(root);
  const stores = new Map<string, Promise<WorkspaceStore>>();
  const workspaceForUser = async (userId: string) => {
    let promise = stores.get(userId);
    if (!promise) {
      const store = new WorkspaceStore(root, path.join(dataDir, 'users', userId));
      promise = store.initialize().then(() => store);
      stores.set(userId, promise);
      promise.catch(() => stores.delete(userId));
    }
    return promise;
  };
  const model = options.model || modelConfigFromEnv();
  const provider = {
    name: model.apiKey ? ('openai-compatible' as const) : ('rules' as const),
    configured: !!model.apiKey,
  };
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'loopback') app.set('trust proxy', 'loopback');
  else if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== 'false')
    throw new Error('TRUST_PROXY 仅接受 loopback 或 false');
  app.use((req, res, next) => {
    req.headers['x-cashlens-client-ip'] = req.ip || req.socket.remoteAddress || 'unknown';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
    if (process.env.NODE_ENV === 'production')
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin).origin;
        const allowed = process.env.APP_ORIGIN
          ? [new URL(process.env.APP_ORIGIN).origin]
          : [
              'http://127.0.0.1:4317',
              'http://127.0.0.1:4318',
              'http://localhost:4317',
              'http://localhost:4318',
            ];
        if (!allowed.includes(origin)) throw new Error('cross origin');
      } catch {
        next(new ApiFault(403, 'INVALID_ORIGIN', '请求来源与本机服务不一致'));
        return;
      }
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('Sec-Fetch-Site') === 'cross-site'
    ) {
      next(new ApiFault(403, 'INVALID_ORIGIN', '拒绝跨站写入请求'));
      return;
    }
    next();
  });
  app.all('/api/identity/*splat', async (req, res, next) => {
    try {
      if (Number(req.headers['content-length'] || 0) > 65536)
        throw new ApiFault(413, 'BODY_TOO_LARGE', '认证请求超过64KB限制');
      await setResponse(
        res,
        await auth.identity.handler(
          getRequest({ request: req, base: auth.origin, bodySizeLimit: 65536 })
        )
      );
    } catch (error) {
      next(error);
    }
  });
  app.use(express.json({ limit: '2mb' }));
  const running = new Set<string>();
  const scheduled = new Set<string>();
  const manifest = JSON.parse(
    await readFile(path.join(root, 'data/source-manifest.json'), 'utf8')
  ) as { sources: { id: string; localFile: string; sha256: string }[] };
  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      handler(req, res).catch(next);
    };
  const taskById = (id: string, store: WorkspaceStore) => {
    const task = store.state.tasks.find((item) => item.id === id);
    if (!task) throw new ApiFault(404, 'TASK_NOT_FOUND', '未找到核查任务');
    return task;
  };
  const run = async (taskId: string, store: WorkspaceStore) => {
    if (running.has(taskId)) return;
    scheduled.delete(taskId);
    running.add(taskId);
    const task = taskById(taskId, store);
    const changeStage = async (index: number, status: Stage['status'], message: string) => {
      const stage = task.stages[index]!;
      stage.status = status;
      stage.message = message;
      const now = new Date().toISOString();
      if (status === 'running') stage.startedAt = now;
      else stage.finishedAt = now;
      task.updatedAt = now;
      await store.persist();
    };
    try {
      task.status = 'running';
      task.useModel = true;
      await changeStage(0, 'running', '读取本次保存的输入快照。');
      const inputs = store.state.inputs[taskId];
      if (!inputs?.length) throw new Error('本次任务缺少保存的输入快照');
      await changeStage(0, 'completed', `已读取 ${inputs.length} 份材料；不访问隐藏案例。`);
      await changeStage(1, 'running', '核验输入声明的字段、单位与金额精度。');
      for (const material of inputs) validateMaterial(material);
      await changeStage(1, 'completed', '输入字段与精度检查完成；口径冲突与现金桥进入确定性分析。');
      await changeStage(2, 'running', '按人民币分计算金额，并核验现金桥原始分组行。');
      const report = analyze(task, inputs);
      task.report = report;
      await changeStage(
        2,
        'completed',
        report.bridge ? '现金桥已按原始调整行闭合。' : '未满足现金桥条件，已停止没有依据的归因。'
      );
      await changeStage(
        3,
        'running',
        model.apiKey
          ? report.verdict === 'conflict'
            ? '输入冲突，不调用模型；规则核查保留。'
            : '正在生成智能解释与询证问题。'
          : '未配置模型，采用确定性规则解释与询证问题。'
      );
      task.report = await explainWithModel(report, model, task.excludedMetrics, true);
      await changeStage(
        3,
        'completed',
        task.report.model.status === 'completed'
          ? '模型输出的引用 ID 与格式已检查；解释含义需人工复核。'
          : task.report.model.error?.includes('未调用')
            ? task.report.model.error
            : task.report.model.status === 'failed'
              ? '模型未完成；规则报告完整保留。'
              : '规则解释完成；未执行模型调用。'
      );
      await changeStage(4, 'running', '保存报告、问题状态与全部输入快照。');
      task.status = 'completed';
      task.error = undefined;
      await changeStage(4, 'completed', '核查报告已持久保存，可重开与导出。');
    } catch {
      task.status = 'failed';
      task.error = '任务处理或保存失败，请检查本机工作区后重试。';
      task.updatedAt = new Date().toISOString();
      const stage = task.stages.find((item) => item.status === 'running');
      if (stage) {
        stage.status = 'failed';
        stage.finishedAt = task.updatedAt;
        stage.message = task.error;
      }
      await store.persist().catch(() => undefined);
    } finally {
      running.delete(taskId);
    }
  };
  const stages = (): Stage[] =>
    ['读取输入快照', '核验口径与冲突', '重算金额与现金桥', '解释与询证问题', '保存报告'].map(
      (label, index) => ({
        key: ['read', 'validate', 'calculate', 'explain', 'save'][index]!,
        label,
        status: 'pending',
      })
    );
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/public/research-capabilities', (_req, res) => {
    res.json({
      modelConfigured: Boolean(model.apiKey),
      modelName: model.model || DEFAULT_MODEL,
      tools: [
        'get_financial_history',
        'fetch_industry',
        'search_disclosures',
        'search_news',
        'read_disclosure',
      ],
      limits: { planningTurns: 3, toolCalls: 8, supplementaryRequests: 12, retainedNews: 48 },
    });
  });
  app.get('/api/cases', (_req, res) => {
    res.json(initial.cases);
  });
  app.get('/api/public/examples', (_req, res) => {
    res.json(
      initial.cases.slice(0, 2).map((item, index) => {
        const material = initial.materials[index]!;
        const report = analyze(
          {
            title: item.title,
            company: item.company,
            year: item.year,
            materialIds: item.materialIds,
          },
          [material]
        );
        return {
          ...item,
          metrics: report.metrics.filter((metric) =>
            [
              'netProfit',
              'operatingCashFlow',
              'cashConversion',
              'profitGrowth',
              'cashGrowth',
            ].includes(metric.key)
          ),
          source: {
            url: material.sourceUrl,
            title: material.title,
            documentDate: material.documentDate,
            sha256: material.sha256,
          },
          disclaimer: '历史年度合并财务事实，不是实时状态、企业评级或投资建议。',
        };
      })
    );
  });
  app.get('/api/public/input-template', (req, res, next) => {
    try {
      const material = structuredClone(initial.materials[0]!);
      if (req.query.format === 'csv') {
        const columns = [
          'company',
          'shortName',
          'year',
          'key',
          'value',
          'unit',
          'currency',
          'scope',
          'period',
          'page',
          'quote',
          'documentDate',
          'sourceUrl',
        ];
        const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = material.observations
          .filter((obs) => obs.key !== 'otherAdjustments')
          .map((obs) =>
            columns
              .map((column) =>
                escape(
                  column in obs
                    ? obs[column as keyof typeof obs]
                    : material[column as keyof typeof material]
                )
              )
              .join(',')
          );
        res
          .setHeader('Content-Disposition', 'attachment; filename="prispect-input.csv"')
          .type('text/csv')
          .send('\uFEFF' + columns.join(',') + '\n' + rows.join('\n') + '\n');
      } else if (req.query.format === 'json') {
        const { id, createdAt, ...input } = material;
        res
          .setHeader('Content-Disposition', 'attachment; filename="prispect-input.json"')
          .json(input);
      } else throw new ApiFault(400, 'INVALID_FORMAT', '样例格式仅支持 json 或 csv');
    } catch (error) {
      next(error);
    }
  });
  app.get(
    '/api/auth/session',
    wrap(async (req, res) => {
      res.json(auth.response(await auth.session(req)));
    })
  );
  app.post('/api/auth/password-reset', (_req, _res, next) =>
    next(new ApiFault(503, 'EMAIL_UNAVAILABLE', '邮件服务尚未配置，未发送重置邮件'))
  );
  app.post(
    '/api/auth/register',
    wrap(async (req, res) => {
      res.status(201).json(await auth.register(req.body, req, res));
    })
  );
  app.post(
    '/api/auth/login',
    wrap(async (req, res) => {
      res.json(await auth.login(req.body, req, res));
    })
  );
  app.use('/api/auth', authentication(auth));
  app.post(
    '/api/auth/logout',
    wrap(async (req, res) => {
      await auth.logout(res.locals.auth as AuthContext, req, res);
      res.json({ user: null, csrfToken: null });
    })
  );
  app.patch('/api/auth/profile', (req, res, next) => {
    try {
      res.json(auth.profile(req.body, res.locals.auth as AuthContext));
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/auth/password',
    wrap(async (req, res) => {
      res.json(await auth.changePassword(req.body, res.locals.auth as AuthContext, req, res));
    })
  );
  app.use('/api', authentication(auth), (_req, res, next) => {
    workspaceForUser((res.locals.auth as AuthContext).user.id)
      .then(async (store) => {
        await store.cleanupUploads();
        res.locals.store = store;
        next();
      })
      .catch(next);
  });
  installAccountRoutes(app, auth, dataDir);
  app.post(
    '/api/cases/:id/import',
    wrap(async (req, res) => {
      const selected = initial.cases.find((item) => item.id === req.params.id);
      if (!selected) throw new ApiFault(404, 'CASE_NOT_FOUND', '公开案例不存在');
      const store = res.locals.store as WorkspaceStore;
      await store.importPublicMaterials(
        initial.materials.filter((material) => selected.materialIds.includes(material.id))
      );
      res.status(201).json({ materialIds: selected.materialIds });
    })
  );
  app.get('/api/workspace', (_req, res) => {
    res.json((res.locals.store as WorkspaceStore).workspace(provider));
  });
  installDecisionRoutes(app, { auth });
  const company = installCompanyRoutes(app, { root, auth, model, service: options.companyService });
  const companyContext = installCompanyContextRoutes(app, {
    auth,
    model,
    service: options.companyContextService,
  });
  let uploads = 0;
  const limitUpload = (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (uploads >= 2) {
      next(new ApiFault(429, 'UPLOAD_BUSY', '已有材料正在解析，请稍后重试'));
      return;
    }
    uploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        uploads--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1000 },
  });
  app.post(
    '/api/materials/preview',
    limitUpload,
    upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) throw new ApiFault(400, 'FILE_REQUIRED', '请选择上传文件');
      const store = res.locals.store as WorkspaceStore;
      const controller = new AbortController();
      const disconnected = () => {
        if (!res.writableEnded) controller.abort();
      };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      if (req.aborted) controller.abort();
      try {
        const preview = await previewUpload(
          req.file.buffer,
          req.file.originalname,
          {
            company: typeof req.body.company === 'string' ? req.body.company : undefined,
            shortName: typeof req.body.shortName === 'string' ? req.body.shortName : undefined,
            documentDate:
              typeof req.body.documentDate === 'string' ? req.body.documentDate : undefined,
          },
          controller.signal
        );
        if (controller.signal.aborted)
          throw new ApiFault(499, 'UPLOAD_CANCELLED', '材料预览已中止');
        const uploadId = await store.retainUpload(
          req.file.buffer,
          preview.material.filename,
          preview.material.sha256
        );
        preview.uploadId = uploadId;
        preview.material.uploadId = uploadId;
        preview.warnings.push(
          '原始文件已暂存于当前账号；请在24小时内确认保存，未确认文件会过期清理。确认后随材料保留，个人额度250MB。'
        );
        res.json(preview);
      } finally {
        req.removeListener('aborted', disconnected);
        res.removeListener('close', disconnected);
      }
    })
  );
  app.post(
    '/api/materials',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      if (store.state.materials.length >= 100)
        throw new ApiFault(429, 'MATERIAL_LIMIT', '个人工作区最多 100 份材料，请整理后重试');
      const input = validateMaterial(req.body);
      if (input.rawSourceId && !manifest.sources.some((source) => source.id === input.rawSourceId))
        throw new ApiFault(400, 'INVALID_SOURCE', '本机原件 ID 不在已核验来源清单内');
      const material: Material = {
        ...input,
        origin: 'user-upload',
        rawSourceId: undefined,
        notes: [
          ...input.notes,
          '用户导入材料；来源链接与数值未经平台独立核验。',
          ...(input.uploadId
            ? ['原始上传文件已随本材料保留；预览编辑不改变原始文件。']
            : ['直接结构化输入，没有独立原始上传文件；已保存输入字段快照。']),
        ],
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await store.saveMaterial(material);
      res.status(201).json(material);
    })
  );
  app.delete(
    '/api/materials/:id',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const id = String(req.params.id);
      await store.deleteMaterial(id);
      res.json({ ok: true });
    })
  );
  app.get(
    '/api/materials/:id/file',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const material = store.state.materials.find((item) => item.id === req.params.id);
      if (!material) throw new ApiFault(404, 'MATERIAL_NOT_FOUND', '未找到当前账号的材料');
      const file = await store.materialFile(material);
      const extension = path.extname(file.filename).toLowerCase();
      const disposition = extension === '.pdf' ? 'inline' : 'attachment';
      const encodedName = encodeURIComponent(file.filename).replace(
        /['()*]/g,
        (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase()
      );
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="prispect-original${extension}"; filename*=UTF-8''${encodedName}`
      );
      res
        .type(
          extension === '.pdf'
            ? 'application/pdf'
            : extension === '.csv'
              ? 'text/csv; charset=utf-8'
              : 'application/json'
        )
        .send(file.buffer);
    })
  );
  app.get(
    '/api/sources/:id/pdf',
    wrap(async (req, res) => {
      const source = manifest.sources.find((item) => item.id === req.params.id);
      if (!source) throw new ApiFault(404, 'SOURCE_NOT_FOUND', '来源不在已核验清单内');
      const filename = path.resolve(root, source.localFile);
      if (!filename.startsWith(path.resolve(root, 'data/raw') + path.sep))
        throw new ApiFault(404, 'SOURCE_NOT_FOUND', '来源路径无效');
      try {
        await access(filename);
      } catch {
        throw new ApiFault(
          404,
          'SOURCE_NOT_DOWNLOADED',
          '本机尚未下载原件；请打开公开原件链接或执行来源下载脚本'
        );
      }
      const bytes = await readFile(filename);
      if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
        throw new ApiFault(
          409,
          'SOURCE_HASH_MISMATCH',
          '本机原件哈希与已核验清单不同，未发送文件；请恢复已核验原件'
        );
      res.type('pdf').send(bytes);
    })
  );
  app.post(
    '/api/tasks',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      auth.rateLimit(`tasks:${(res.locals.auth as AuthContext).user.id}`, 60, 60 * 60 * 1000);
      if (store.state.tasks.length >= 200)
        throw new ApiFault(429, 'TASK_LIMIT', '个人工作区最多 200 份任务，请整理历史后重试');
      if (
        store.state.tasks.filter((task) => task.status === 'queued' || task.status === 'running')
          .length >= 2 ||
        running.size + scheduled.size >= 4
      )
        throw new ApiFault(429, 'TASK_BUSY', '正在执行的任务较多，请稍后重试');
      const parsed = taskInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(400, 'INVALID_TASK', parsed.error.issues[0]?.message || '任务参数无效');
      const input: CreateTaskInput = parsed.data;
      const materials = input.materialIds.map((id) => {
        const material = store.state.materials.find((item) => item.id === id);
        if (!material) throw new ApiFault(404, 'MATERIAL_NOT_FOUND', '选定材料不存在');
        return material;
      });
      const now = new Date().toISOString();
      const task: AnalysisTask = {
        ...input,
        id: randomUUID(),
        excludedMetrics: input.excludedMetrics || [],
        contextNotes: {},
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        stages: stages(),
      };
      store.state.inputs[task.id] = structuredClone(materials);
      store.state.tasks.unshift(task);
      await store.persist();
      scheduled.add(task.id);
      res.status(202).json(structuredClone(task));
      setImmediate(() => {
        void run(task.id, store);
      });
    })
  );
  app.get('/api/tasks/:id', (req, res, next) => {
    try {
      res.json(taskById(String(req.params.id), res.locals.store as WorkspaceStore));
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/tasks/:id/retry',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const task = taskById(String(req.params.id), res.locals.store as WorkspaceStore);
      if (
        store.state.tasks.filter((item) => item.status === 'queued' || item.status === 'running')
          .length >= 2 ||
        running.size + scheduled.size >= 4
      )
        throw new ApiFault(429, 'TASK_BUSY', '正在执行的任务较多，请稍后重试');
      if (running.has(task.id) || task.status === 'queued')
        throw new ApiFault(409, 'TASK_RUNNING', '任务正在执行，请等待结束');
      task.status = 'queued';
      task.useModel = true;
      task.error = undefined;
      task.stages = stages();
      task.updatedAt = new Date().toISOString();
      delete task.report;
      await store.persist();
      scheduled.add(task.id);
      res.status(202).json(structuredClone(task));
      setImmediate(() => {
        void run(task.id, store);
      });
    })
  );
  app.patch(
    '/api/tasks/:id/context',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const task = taskById(String(req.params.id), store);
      const parsed = taskContextSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ApiFault(
          400,
          'INVALID_CONTEXT',
          parsed.error.issues[0]?.message || '场景信息无效'
        );
      const input = parsed.data;
      if (input.purpose !== undefined) task.purpose = input.purpose;
      if (input.contextNotes !== undefined)
        task.contextNotes = { ...task.contextNotes, ...input.contextNotes };
      if (input.cashPlan === null) delete task.cashPlan;
      else if (input.cashPlan !== undefined)
        task.cashPlan = { ...input.cashPlan, updatedAt: new Date().toISOString() };
      task.purpose ||= 'external';
      task.contextNotes ||= {};
      task.updatedAt = new Date().toISOString();
      await store.persist();
      res.json(task);
    })
  );
  app.patch(
    '/api/tasks/:id/questions/:questionId',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const task = taskById(String(req.params.id), res.locals.store as WorkspaceStore);
      if (task.status !== 'completed') throw new ApiFault(409, 'REPORT_NOT_READY', '报告尚未完成');
      if (req.body?.status !== 'open' && req.body?.status !== 'done')
        throw new ApiFault(400, 'INVALID_STATUS', '问题状态仅接受 open 或 done');
      const question = task.report?.questions.find((item) => item.id === req.params.questionId);
      if (!question) throw new ApiFault(404, 'QUESTION_NOT_FOUND', '未找到此核查问题');
      question.status = req.body.status;
      task.updatedAt = new Date().toISOString();
      await store.persist();
      res.json(task);
    })
  );
  app.delete(
    '/api/tasks/:id',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      const task = taskById(String(req.params.id), res.locals.store as WorkspaceStore);
      if (running.has(task.id) || task.status === 'queued')
        throw new ApiFault(409, 'TASK_RUNNING', '执行中的任务不能删除');
      if (
        (store.state.decisions || []).some((decision) =>
          decision.versions.some((version) => version.input.reportTaskId === task.id)
        )
      )
        throw new ApiFault(409, 'TASK_IN_USE', '决定历史版本仍引用这份财报任务，请保留报告');
      store.state.tasks = store.state.tasks.filter((item) => item.id !== task.id);
      delete store.state.inputs[task.id];
      await store.persist();
      res.json({ ok: true });
    })
  );
  app.get('/api/tasks/:id/export', (req, res, next) => {
    try {
      const task = taskById(String(req.params.id), res.locals.store as WorkspaceStore);
      if (
        req.query.expectedUpdatedAt !== undefined &&
        req.query.expectedUpdatedAt !== task.updatedAt
      )
        throw new ApiFault(409, 'TASK_EXPORT_CHANGED', '报告已更新，请重新读取报告后再导出。');
      if (task.status !== 'completed' || !task.report)
        throw new ApiFault(409, 'REPORT_NOT_READY', '报告尚未完成');
      if (req.query.format === 'json')
        res
          .setHeader('Content-Disposition', `attachment; filename="prispect-${task.id}.json"`)
          .json(task);
      else if (req.query.format === 'html')
        res
          .setHeader('Content-Disposition', `attachment; filename="prispect-${task.id}.html"`)
          .type('html')
          .send(reportHtml(task));
      else throw new ApiFault(400, 'INVALID_EXPORT_FORMAT', '导出格式仅支持 html 或 json');
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/reset',
    wrap(async (req, res) => {
      const store = res.locals.store as WorkspaceStore;
      if (req.body?.confirm !== 'RESET_DEMO')
        throw new ApiFault(400, 'CONFIRM_REQUIRED', '重置需明确确认 RESET_DEMO');
      if (store.state.tasks.some((task) => running.has(task.id) || scheduled.has(task.id)))
        throw new ApiFault(409, 'TASK_RUNNING', '存在执行中的任务，暂时不能重置');
      if (company.busy(store) || companyContext.busy(store))
        throw new ApiFault(409, 'COMPANY_AGENT_BUSY', '公开证据查询或保存中，暂时不能重置');
      await store.reset();
      res.json(store.workspace(provider));
    })
  );
  app.use('/api', (_req, _res, next) => {
    next(new ApiFault(404, 'ENDPOINT_NOT_FOUND', '未找到接口'));
  });
  const dist = path.join(root, 'dist');
  app.use(express.static(dist, { dotfiles: 'deny' }));
  app.get('/{*path}', (_req, res, next) => {
    res.sendFile(path.join(dist, 'index.html'), (error) => {
      if (error)
        next(
          new ApiFault(
            404,
            'FRONTEND_NOT_BUILT',
            '前端尚未构建；开发时打开 4318，或执行 npm run build'
          )
        );
    });
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof APIError) {
      res.status(error.statusCode).json({
        error: error.statusCode >= 500 ? '认证服务暂不可用' : error.message,
        code: typeof error.body?.code === 'string' ? error.body.code : 'AUTH_FAILED',
      });
      return;
    }
    if (error instanceof ApiFault) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? _req.path.startsWith('/api/account/avatar')
              ? '头像超过2MB限制'
              : '文件超过 25MB 限制'
            : '上传字段或文件数量不合法',
        code: error.code,
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: '请求 JSON 格式无效', code: 'INVALID_JSON' });
      return;
    }
    if ((error as { type?: string })?.type === 'entity.too.large') {
      res.status(413).json({ error: '结构化请求超过 2MB 限制', code: 'BODY_TOO_LARGE' });
      return;
    }
    res.status(500).json({ error: '本机服务处理失败，请检查工作区后重试', code: 'INTERNAL_ERROR' });
  };
  app.use(errorHandler);
  return {
    app,
    auth,
    workspaceForUser,
    waitForIdle: async () => {
      await company.waitForIdle();
      await companyContext.waitForIdle();
      while (running.size || scheduled.size)
        await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
