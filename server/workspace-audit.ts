import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { ApiFault } from './validation.js';

export type WorkspaceAuditAction =
  | 'upload-expired'
  | 'orphan-upload-expired'
  | 'upload-discarded'
  | 'material-deleted'
  | 'research-deleted'
  | 'checkpoint-removed'
  | 'workspace-reset';
export interface WorkspaceAuditDetails {
  ids: string[];
  reason: 'ttl' | 'user' | 'research-completed' | 'resume-expired';
  createdAt?: string;
  eligibleAt?: string;
  materialBound?: boolean;
  count?: number;
  agentState?: { status: 'failed'; version: 'langgraph-v1'; recoverable: true };
}

// Account-local metadata only. Never record filenames, paths, content or credentials.
export class WorkspaceAudit {
  private pending = Promise.resolve();
  constructor(private directory: string) {}
  private async append(event: Record<string, unknown>) {
    const operation = this.pending.then(async () => {
      const directory = path.join(this.directory, '.audit');
      // Do not follow a substituted workspace or audit directory.
      for (let current = path.resolve(this.directory); ; current = path.dirname(current)) {
        if (!(await lstat(current)).isDirectory()) throw new Error('unsafe directory');
        if (current === path.dirname(current)) break;
      }
      await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const workspace = await open(
        this.directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      try {
        await workspace.sync();
      } finally {
        await workspace.close();
      }
      const info = await lstat(directory);
      if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077)
        throw new Error('unsafe audit directory');
      const file = await open(
        path.join(directory, 'events.jsonl'),
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
        0o600
      );
      try {
        const info = await file.stat();
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          info.uid !== process.getuid?.() ||
          info.mode & 0o077
        )
          throw new Error('unsafe audit file');
        await file.writeFile(JSON.stringify(event) + '\n');
        await file.sync();
        const parent = await open(
          directory,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
        );
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
      } finally {
        await file.close();
      }
    });
    this.pending = operation.catch(() => undefined);
    await operation;
  }
  async run<T>(
    action: WorkspaceAuditAction,
    details: WorkspaceAuditDetails,
    work: () => Promise<T>
  ): Promise<T> {
    const operationId = randomUUID();
    const event = {
      schemaVersion: 1,
      operationId,
      action,
      reason: details.reason,
      targetHashes: details.ids.map((id) => createHash('sha256').update(id).digest('hex')),
      ...(details.createdAt && Number.isFinite(Date.parse(details.createdAt))
        ? { createdAt: new Date(details.createdAt).toISOString() }
        : {}),
      ...(details.eligibleAt && Number.isFinite(Date.parse(details.eligibleAt))
        ? { eligibleAt: new Date(details.eligibleAt).toISOString() }
        : {}),
      ...(typeof details.materialBound === 'boolean'
        ? { materialBound: details.materialBound }
        : {}),
      ...(Number.isSafeInteger(details.count) ? { count: details.count } : {}),
      ...(details.agentState ? { agentState: details.agentState } : {}),
    };
    try {
      await this.append({ ...event, phase: 'intent', at: new Date().toISOString() });
    } catch {
      throw new ApiFault(503, 'AUDIT_UNAVAILABLE', '无法保存资料变更记录，本次清理未执行');
    }
    let result: T;
    try {
      result = await work();
    } catch (error) {
      await this.finish(event, 'failed');
      throw error;
    }
    await this.finish(event, 'completed');
    return result;
  }
  private async finish(event: Record<string, unknown>, phase: string) {
    try {
      await this.append({ ...event, phase, at: new Date().toISOString() });
    } catch {
      // Keep the durable intent and primary result; never claim a completed audit.
      console.warn(
        JSON.stringify({
          event: 'workspace-audit-incomplete',
          operationId: event.operationId,
          phase,
        })
      );
    }
  }
}
