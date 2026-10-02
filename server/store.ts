import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  AnalysisTask,
  CompanyResearchRun,
  DemoCase,
  Material,
  Workspace,
} from '../shared/contracts.js';
import type { DecisionCase } from '../shared/decision-contracts.js';
import type { CompanyGraphProgress } from '../shared/company-contracts.js';
import { ApiFault, validateMaterial } from './validation.js';
import pdfLimits from './pdf-limits.json' with { type: 'json' };

export const UPLOAD_QUOTA_BYTES = 250 * 1024 * 1024;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
interface UploadRecord {
  id: string;
  filename: string;
  sha256: string;
  bytes: number;
  createdAt: string;
  materialId?: string;
}

export interface StoredWorkspace {
  schemaVersion: 1;
  materials: Material[];
  tasks: AnalysisTask[];
  inputs: Record<string, Material[]>;
  uploads: Record<string, UploadRecord>;
  companyRuns?: CompanyResearchRun[];
  decisions?: DecisionCase[];
}
export async function seeds(root: string): Promise<{ materials: Material[]; cases: DemoCase[] }> {
  const names = ['songyuan-2025', 'hikvision-2025', 'missing', 'conflict'];
  const materials: Material[] = [];
  for (const name of names) {
    const input = validateMaterial(
      JSON.parse(await readFile(path.join(root, 'data', 'cases', `${name}.json`), 'utf8'))
    );
    materials.push({ ...input, id: `material-${name}`, createdAt: new Date().toISOString() });
  }
  const cases: DemoCase[] = [
    {
      id: 'songyuan',
      title: '松原安全：利润与现金的反差',
      description: '2025 年年度合并补充表，可独立重算的占款核查。',
      company: materials[0]!.company,
      shortName: materials[0]!.shortName,
      materialIds: [materials[0]!.id],
      year: 2025,
      kind: 'contrast',
    },
    {
      id: 'hikvision',
      title: '海康威视：另一种现金结构',
      description: '经营现金高于净利润的历史反例，不代表企业安全评级。',
      company: materials[1]!.company,
      shortName: materials[1]!.shortName,
      materialIds: [materials[1]!.id],
      year: 2025,
      kind: 'counterpoint',
    },
    {
      id: 'missing',
      title: '人为限制材料：仅提供主要指标',
      description: '只提供第9页；归母利润的合并范围未确认，不从隐藏附注补数。',
      company: materials[2]!.company,
      shortName: materials[2]!.shortName,
      materialIds: [materials[2]!.id],
      year: 2025,
      kind: 'missing',
    },
    {
      id: 'conflict',
      title: '口径冲突：母公司与合并混用',
      description: '真实母公司利润搭配真实合并经营现金，系统应停止计算。',
      company: materials[3]!.company,
      shortName: materials[3]!.shortName,
      materialIds: [materials[3]!.id],
      year: 2025,
      kind: 'conflict',
    },
  ];
  return { materials, cases };
}
export class WorkspaceStore {
  state!: StoredWorkspace;
  cases: DemoCase[] = [];
  private writes = Promise.resolve();
  private uploadOperations = Promise.resolve();
  private lastUploadCleanup = 0;
  constructor(
    public root: string,
    public dataDir: string,
    public uploadQuotaBytes: number = UPLOAD_QUOTA_BYTES
  ) {}
  async initialize() {
    const initial = await seeds(this.root);
    this.cases = initial.cases;
    await mkdir(this.dataDir, { recursive: true });
    try {
      this.state = JSON.parse(
        await readFile(path.join(this.dataDir, 'workspace.json'), 'utf8')
      ) as StoredWorkspace;
      if (
        this.state.schemaVersion !== 1 ||
        !Array.isArray(this.state.materials) ||
        !Array.isArray(this.state.tasks) ||
        !this.state.inputs
      )
        throw new Error('不支持的工作区格式');
      for (const material of this.state.materials) validateMaterial(material);
      this.state.uploads ||= {};
      this.state.companyRuns ||= [];
      this.state.decisions ||= [];
      if (!Array.isArray(this.state.decisions)) throw new Error('决定记录格式无效');
      if (!Array.isArray(this.state.companyRuns)) throw new Error('企业查询记录格式无效');
      for (const run of this.state.companyRuns) {
        if (run.contextStatus === 'loading') {
          run.contextStatus = 'failed';
          run.contextError = '服务重启中断了企业概览更新；已有快照保留，可以重新读取。';
        }
        if (run.status === 'queued' || run.status === 'running') {
          run.status = 'failed';
          run.error = '服务重启中断了公开证据查询，可重新查询；已有原件与任务保留。';
          const agent = (run as CompanyResearchRun & { agent?: CompanyGraphProgress }).agent;
          if (agent?.version === 'langgraph-v1') {
            agent.recoverable = true;
            agent.revision += 1;
            run.error = '服务重启中断了查询，可恢复公开证据步骤；主体与年度快照保持。';
            for (const branch of agent.branches)
              if (branch.status === 'running') {
                branch.status = 'failed';
                branch.finishedAt = new Date().toISOString();
                branch.summary = run.error;
              }
          }
          run.updatedAt = new Date().toISOString();
          for (const entry of run.trace)
            if (entry.status === 'running') {
              entry.status = 'failed';
              entry.finishedAt = run.updatedAt;
              entry.outputSummary = run.error;
            }
        }
      }
      for (const task of this.state.tasks) {
        task.purpose ||= 'external';
        task.contextNotes ||= {};
        if (task.status === 'running' || task.status === 'queued') {
          task.status = 'failed';
          task.error = '服务重启中断了任务，可重试本次保存的输入快照。';
          task.updatedAt = new Date().toISOString();
          for (const stage of task.stages)
            if (stage.status === 'running') {
              stage.status = 'failed';
              stage.finishedAt = task.updatedAt;
              stage.message = task.error;
            }
        }
      }
      await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          '工作区读取失败；未覆盖已有文件。请检查 .cashlens/workspace.json 或恢复备份。'
        );
      this.state = {
        schemaVersion: 1,
        materials: [],
        tasks: [],
        inputs: {},
        uploads: {},
        companyRuns: [],
        decisions: [],
      };
      await this.persist();
    }
    await this.cleanupUploads(true);
  }
  async persist() {
    const content = JSON.stringify(this.state, null, 2) + '\n';
    const operation = this.writes.then(async () => {
      const temporary = path.join(this.dataDir, `.workspace-${randomUUID()}.tmp`);
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, path.join(this.dataDir, 'workspace.json'));
    });
    this.writes = operation.catch(() => undefined);
    await operation;
  }
  workspace(provider: Workspace['provider']): Workspace {
    return structuredClone({ materials: this.state.materials, tasks: this.state.tasks, provider });
  }
  private uploadFilename(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new ApiFault(404, 'UPLOAD_NOT_FOUND', '未找到当前账号的原始上传文件');
    return path.join(this.dataDir, 'uploads', `${id}.blob`);
  }
  private async serializeUploads<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.uploadOperations.then(operation);
    this.uploadOperations = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  private async cleanupUploadsUnlocked(now = Date.now()) {
    const directory = path.join(this.dataDir, 'uploads');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let changed = false;
    for (const [id, record] of Object.entries(this.state.uploads)) {
      if (!record.materialId && Date.parse(record.createdAt) + PENDING_UPLOAD_TTL_MS <= now) {
        await rm(this.uploadFilename(id), { force: true });
        delete this.state.uploads[id];
        changed = true;
      }
    }
    for (const run of this.state.companyRuns || []) {
      const graph = run.agent;
      if (
        run.status === 'failed' &&
        graph?.version === 'langgraph-v1' &&
        graph.recoverable &&
        /^[a-f0-9-]{36}$/.test(run.id) &&
        Number.isFinite(Date.parse(run.createdAt)) &&
        Date.parse(run.createdAt) + PENDING_UPLOAD_TTL_MS <= now
      ) {
        await rm(path.join(this.dataDir, 'company-agent', run.id), {
          recursive: true,
          force: true,
        });
        graph.recoverable = false;
        changed = true;
      }
    }
    // Files written just before a process interruption can lack metadata; remove only
    // known opaque upload files that have aged past the same retention window.
    for (const filename of await readdir(directory)) {
      const match = /^([a-f0-9-]{36})\.blob$/.exec(filename);
      if (!match || this.state.uploads[match[1]!]) continue;
      const info = await stat(path.join(directory, filename));
      if (info.mtimeMs + PENDING_UPLOAD_TTL_MS <= now)
        await rm(path.join(directory, filename), { force: true });
    }
    if (changed) await this.persist();
    this.lastUploadCleanup = now;
  }
  async cleanupUploads(force = false) {
    if (!force && Date.now() - this.lastUploadCleanup < 60000) return;
    await this.serializeUploads(() => this.cleanupUploadsUnlocked());
  }
  async retainUpload(
    buffer: Buffer,
    filename: string,
    expectedHash: string,
    source: 'upload' | 'official' = 'upload'
  ): Promise<string> {
    return this.serializeUploads(async () => {
      await this.cleanupUploadsUnlocked();
      const maximum = source === 'official' ? pdfLimits.officialBytes : pdfLimits.uploadBytes;
      if (buffer.length > maximum)
        throw new ApiFault(413, 'LIMIT_FILE_SIZE', `文件超过 ${maximum / 1024 / 1024}MB 限制`);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      if (sha256 !== expectedHash)
        throw new ApiFault(400, 'UPLOAD_HASH_MISMATCH', '上传预览与原始文件哈希不一致');
      const directory = path.join(this.dataDir, 'uploads');
      let used = 0;
      for (const entry of await readdir(directory)) {
        if (/^[a-f0-9-]{36}\.blob$/.test(entry))
          used += (await stat(path.join(directory, entry))).size;
      }
      if (used + buffer.length > this.uploadQuotaBytes)
        throw new ApiFault(
          413,
          'STORAGE_QUOTA_EXCEEDED',
          '个人原件存储额度已满（默认250MB）；请删除未被任务引用的材料后重试'
        );
      const id = randomUUID();
      const target = this.uploadFilename(id);
      await writeFile(target, buffer, { mode: 0o600, flag: 'wx' });
      this.state.uploads[id] = {
        id,
        filename,
        sha256,
        bytes: buffer.length,
        createdAt: new Date().toISOString(),
      };
      try {
        await this.persist();
      } catch (error) {
        delete this.state.uploads[id];
        await rm(target, { force: true });
        throw error;
      }
      return id;
    });
  }
  private async verifiedUpload(id: string) {
    const record = this.state.uploads[id];
    if (!record) throw new ApiFault(404, 'UPLOAD_NOT_FOUND', '未找到当前账号的原始上传文件');
    if (!record.materialId && Date.parse(record.createdAt) + PENDING_UPLOAD_TTL_MS <= Date.now()) {
      await rm(this.uploadFilename(id), { force: true });
      delete this.state.uploads[id];
      await this.persist();
      throw new ApiFault(410, 'UPLOAD_EXPIRED', '未确认上传已超过24小时，请重新上传');
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(this.uploadFilename(id));
    } catch {
      throw new ApiFault(
        404,
        'UPLOAD_FILE_MISSING',
        '原始上传文件缺失，请重新导入；未声称原件仍存在'
      );
    }
    if (
      buffer.length !== record.bytes ||
      createHash('sha256').update(buffer).digest('hex') !== record.sha256
    )
      throw new ApiFault(409, 'UPLOAD_FILE_CHANGED', '保留原件的大小或哈希不一致，停止使用');
    return { record, buffer };
  }
  async importPublicMaterials(materials: Material[]) {
    return this.serializeUploads(async () => {
      const previous = this.state.materials;
      this.state.materials = [
        ...previous,
        ...materials
          .filter((material) => !previous.some((item) => item.id === material.id))
          .map((material) => structuredClone(material)),
      ];
      try {
        await this.persist();
      } catch (error) {
        this.state.materials = previous;
        throw error;
      }
    });
  }
  async saveMaterial(material: Material) {
    return this.serializeUploads(async () => {
      let record: UploadRecord | undefined;
      if (material.uploadId) {
        record = (await this.verifiedUpload(material.uploadId)).record;
        if (record.materialId)
          throw new ApiFault(
            409,
            'UPLOAD_ALREADY_BOUND',
            '这份上传已经确认保存，需重新上传以建立另一份材料'
          );
        if (record.sha256 !== material.sha256 || record.filename !== material.filename)
          throw new ApiFault(
            400,
            'UPLOAD_METADATA_MISMATCH',
            '原始文件名或哈希被更改，请保留上传元信息后再确认'
          );
        record.materialId = material.id;
      }
      this.state.materials.push(material);
      try {
        await this.persist();
      } catch (error) {
        this.state.materials = this.state.materials.filter((item) => item.id !== material.id);
        if (record) delete record.materialId;
        throw error;
      }
    });
  }
  async materialFile(material: Material) {
    return this.serializeUploads(async () => {
      if (!material.uploadId)
        throw new ApiFault(404, 'NO_UPLOADED_FILE', '该材料为直接结构化输入，没有独立原始上传文件');
      const result = await this.verifiedUpload(material.uploadId);
      if (result.record.materialId !== material.id)
        throw new ApiFault(404, 'UPLOAD_NOT_FOUND', '未找到这份材料的原始上传文件');
      return { buffer: result.buffer, filename: result.record.filename };
    });
  }
  async pendingFile(uploadId: string) {
    return this.serializeUploads(async () => {
      const result = await this.verifiedUpload(uploadId);
      return { buffer: result.buffer, filename: result.record.filename };
    });
  }
  async discardUnconfirmedUpload(uploadId: string) {
    return this.serializeUploads(async () => {
      const record = this.state.uploads[uploadId];
      if (!record || record.materialId) return;
      delete this.state.uploads[uploadId];
      await this.persist();
      await rm(this.uploadFilename(uploadId), { force: true });
    });
  }
  async deleteMaterial(id: string) {
    return this.serializeUploads(async () => {
      const material = this.state.materials.find((item) => item.id === id);
      if (!material) throw new ApiFault(404, 'MATERIAL_NOT_FOUND', '未找到材料');
      if (
        (this.state.decisions || []).some((decision) =>
          decision.versions.some((version) =>
            version.evidence.some((record) => record.materialId === id)
          )
        )
      )
        throw new ApiFault(409, 'MATERIAL_IN_USE', '决定历史版本仍引用这份材料，请保留原件');
      if (this.state.tasks.some((task) => task.materialIds.includes(id)))
        throw new ApiFault(409, 'MATERIAL_IN_USE', '已有任务引用这份材料，请先删除相关任务');
      this.state.materials = this.state.materials.filter((item) => item.id !== id);
      const record = material.uploadId ? this.state.uploads[material.uploadId] : undefined;
      if (material.uploadId) delete this.state.uploads[material.uploadId];
      try {
        await this.persist();
      } catch (error) {
        this.state.materials.push(material);
        if (record) this.state.uploads[record.id] = record;
        throw error;
      }
      if (material.uploadId) await rm(this.uploadFilename(material.uploadId), { force: true });
    });
  }
  async reset() {
    await this.serializeUploads(async () => {
      const previous = this.state;
      this.state = {
        schemaVersion: 1,
        materials: [],
        tasks: [],
        inputs: {},
        uploads: {},
        companyRuns: [],
        decisions: [],
      };
      try {
        await this.persist();
      } catch (error) {
        this.state = previous;
        throw error;
      }
      await rm(path.join(this.dataDir, 'uploads'), { recursive: true, force: true });
      await rm(path.join(this.dataDir, 'company-agent'), { recursive: true, force: true });
      await mkdir(path.join(this.dataDir, 'uploads'), { recursive: true, mode: 0o700 });
    });
  }
}
