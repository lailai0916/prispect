import { lstat, mkdir, readdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceStore } from './store.js';
import { ApiFault } from './validation.js';

export const GUEST_WORKSPACE_LIMIT = 500;
export const GUEST_RECORD_LIMIT = 12;
export const GUEST_TOTAL_BYTES = 2 * 1024 ** 3;
export const GUEST_WORKSPACE_BYTES = 50 * 1024 ** 2;
export const GUEST_UPLOAD_BYTES = 25 * 1024 ** 2;
const validId = /^guest-[a-f0-9]{48}$/;
export interface GuestDiskStatistics {
  blocks: number;
  bfree: number;
  bavail: number;
  bsize: number;
}

/** A fixed admission/storage boundary; existing visitor files are never pruned here. */
export class GuestWorkspaceBudget {
  private writes = Promise.resolve();
  readonly directory: string;
  constructor(
    private dataDir: string,
    private diskStatistics: () => Promise<GuestDiskStatistics> = () => statfs(dataDir)
  ) {
    this.directory = path.join(dataDir, 'guests');
  }
  async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.then(operation);
    this.writes = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  }
  async available(additionalBytes = 0) {
    const { blocks, bfree, bavail, bsize } = await this.diskStatistics();
    const used = (blocks - bfree) * bsize;
    const usable = used + bavail * bsize;
    // Reserve a complete next public original and its atomic working-paper write.
    if (usable <= 0 || (used + additionalBytes + GUEST_UPLOAD_BYTES) / usable >= 0.85)
      throw new ApiFault(503, 'GUEST_STORAGE_BUSY', '公开研究存储暂不可用，请稍后重试');
  }
  async check(directory: string, additionalBytes: number) {
    await this.available(additionalBytes);
    const ownBytes = await this.bytes(directory);
    const totalBytes = await this.bytes(this.directory);
    if (
      ownBytes + additionalBytes > GUEST_WORKSPACE_BYTES ||
      totalBytes + additionalBytes > GUEST_TOTAL_BYTES
    )
      throw new ApiFault(413, 'GUEST_STORAGE_LIMIT', '访客研究存储额度已满');
  }
  async admit(id: string) {
    if (!validId.test(id)) throw new ApiFault(401, 'VISITOR_SESSION_REQUIRED', '访客会话无效');
    return this.serialized(async () => {
      await this.available();
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const parent = await lstat(this.directory);
      if (!parent.isDirectory() || parent.isSymbolicLink() || parent.mode & 0o077)
        throw new ApiFault(503, 'GUEST_STORAGE_BUSY', '公开研究存储暂不可用，请稍后重试');
      const target = path.join(this.directory, id);
      try {
        const existing = await lstat(target);
        if (!existing.isDirectory() || existing.isSymbolicLink() || existing.mode & 0o077)
          throw new ApiFault(503, 'GUEST_STORAGE_BUSY', '公开研究存储暂不可用，请稍后重试');
        return target;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if ((await readdir(this.directory)).length >= GUEST_WORKSPACE_LIMIT)
        throw new ApiFault(503, 'GUEST_CAPACITY_REACHED', '访客研究容量暂不可用，请稍后重试');
      await mkdir(target, { mode: 0o700 });
      return target;
    });
  }
  async exists(id: string) {
    if (!validId.test(id)) return false;
    try {
      const entry = await lstat(path.join(this.directory, id));
      return entry.isDirectory() && !entry.isSymbolicLink() && !(entry.mode & 0o077);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async bytes(directory: string): Promise<number> {
    let count = 0;
    const read = async (name: string, depth: number): Promise<number> => {
      if (++count > 50_000 || depth > 8)
        throw new ApiFault(503, 'GUEST_STORAGE_BUSY', '公开研究存储暂不可用，请稍后重试');
      const entry = await lstat(name);
      if (entry.isFile()) return entry.size;
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new ApiFault(503, 'GUEST_STORAGE_BUSY', '公开研究存储暂不可用，请稍后重试');
      let total = 0;
      for (const child of await readdir(name))
        total += await read(path.join(name, child), depth + 1);
      return total;
    };
    return read(directory, 0);
  }
}

export class GuestWorkspaceStore extends WorkspaceStore {
  constructor(
    root: string,
    directory: string,
    private budget: GuestWorkspaceBudget
  ) {
    super(root, directory, GUEST_UPLOAD_BYTES);
  }
  override async initialize() {
    await super.initialize();
    let changed = false;
    for (const run of this.state.companyRuns || []) {
      if (
        run.agent?.version === 'langgraph-v1' &&
        run.status === 'failed' &&
        run.agent.recoverable
      ) {
        run.agent.recoverable = false;
        run.error = '本次执行没有可恢复的访客检查点；已取得的公开资料保留，可以重新研究。';
        changed = true;
      }
    }
    if (changed) await this.persist();
  }
  override async persist() {
    const content = JSON.stringify(this.state, null, 2) + '\n';
    const nextBytes = Buffer.byteLength(content);
    await this.budget.serialized(async () => {
      // Include the temporary atomic-write copy, not only the final replacement size.
      await this.budget.check(this.dataDir, nextBytes);
      await this.persistSnapshot(content);
    });
  }
  override async retainUpload(
    buffer: Buffer,
    filename: string,
    expectedHash: string,
    source: 'upload' | 'official' = 'upload'
  ) {
    if (source !== 'official') throw new ApiFault(401, 'AUTH_REQUIRED', '请先登录以导入私人材料');
    return super.retainUpload(buffer, filename, expectedHash, source);
  }
  protected override async writeRetainedOriginal(target: string, buffer: Buffer) {
    // Keep the preflight and the actual write in one global critical section.
    // Once written, real metadata accounts for the blob before another writer can enter.
    await this.budget.serialized(async () => {
      await this.budget.check(this.dataDir, buffer.length + 512 * 1024);
      await super.writeRetainedOriginal(target, buffer);
    });
  }
}
