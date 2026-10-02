import type Database from 'better-sqlite3';
import { randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import type { BetterAuthOptions } from 'better-auth';

export const AUTH_SCHEMA = 2;
export async function verifyAccountPassword(input: { hash: string; password: string }) {
  if (!input.hash.startsWith('cashlens-v1:')) return verifyPassword(input);
  const match = /^cashlens-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(input.hash);
  if (!match) return false;
  const derived = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      input.password,
      match[1]!,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value))
    )
  );
  return timingSafeEqual(derived, Buffer.from(match[2]!, 'hex'));
}
export { hashPassword };

const schemaTwoColumns: Record<string, string[]> = {
  user: [
    'id',
    'name',
    'email',
    'emailVerified',
    'image',
    'createdAt',
    'updatedAt',
    'twoFactorEnabled',
    'phoneNumber',
    'phoneNumberVerified',
    'bio',
    'company',
    'timezone',
  ],
  session: [
    'id',
    'expiresAt',
    'token',
    'createdAt',
    'updatedAt',
    'ipAddress',
    'userAgent',
    'userId',
  ],
  account: [
    'id',
    'accountId',
    'providerId',
    'userId',
    'accessToken',
    'refreshToken',
    'idToken',
    'accessTokenExpiresAt',
    'refreshTokenExpiresAt',
    'scope',
    'password',
    'createdAt',
    'updatedAt',
  ],
  verification: ['id', 'identifier', 'value', 'expiresAt', 'createdAt', 'updatedAt'],
  twoFactor: [
    'id',
    'secret',
    'backupCodes',
    'userId',
    'verified',
    'failedVerificationCount',
    'lockedUntil',
  ],
  passkey: [
    'id',
    'name',
    'publicKey',
    'userId',
    'credentialID',
    'counter',
    'deviceType',
    'backedUp',
    'transports',
    'createdAt',
    'aaguid',
  ],
  rateLimit: ['id', 'key', 'count', 'lastRequest'],
  cashlens_stepups: ['sessionId', 'userId', 'expiresAt'],
  cashlens_auth_limits: ['key', 'count', 'until'],
  cashlens_auth_migrations: ['version', 'completedAt'],
};
function tableExists(db: Database.Database, name: string) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function validateSchemaTwo(db: Database.Database) {
  for (const [table, required] of Object.entries(schemaTwoColumns)) {
    if (!tableExists(db, table)) throw new Error('认证schema2缺少必要数据表；未启动且不会重建空表');
    const columns = new Set(
      (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
        (row) => row.name
      )
    );
    if (required.some((column) => !columns.has(column)))
      throw new Error('认证schema2缺少必要字段；未启动且不会自动补列');
  }
  const marker = db
    .prepare('SELECT MAX(version) AS version FROM cashlens_auth_migrations')
    .get() as { version: number | null };
  if (marker.version !== AUTH_SCHEMA) throw new Error('认证迁移版本不受当前服务支持');
  if (tableExists(db, 'users') || tableExists(db, 'sessions'))
    throw new Error('schema2仍有可用旧认证表；未启动服务');
  if (tableExists(db, 'cashlens_legacy_users')) {
    const missing = db
      .prepare(
        'SELECT COUNT(*) AS count FROM cashlens_legacy_users l LEFT JOIN "user" u ON u.id=l.id WHERE u.id IS NULL'
      )
      .get() as { count: number };
    if (missing.count) throw new Error('原账号UUID映射缺失；未启动且不会创建替代账号');
  }
}

export async function migrateAccounts(db: Database.Database, options: BetterAuthOptions) {
  // A completed marker is never permission to repair missing tables into an empty account database.
  if (tableExists(db, 'cashlens_auth_migrations')) {
    validateSchemaTwo(db);
    const plan = await getMigrations(options, { throwOnUnsafe: false });
    if (
      plan.schemaProblems.length ||
      plan.unsafeChanges.length ||
      plan.toBeCreated.length ||
      plan.toBeAdded.length ||
      plan.toBeAddedIndexes.length
    )
      throw new Error('认证schema2结构不受当前服务支持；未启动且不会自动迁移');
    return;
  }
  if (tableExists(db, 'user') || tableExists(db, 'session') || tableExists(db, 'account'))
    throw new Error('认证迁移标记缺失；未启动且不会重建现有账号库');
  const plan = await getMigrations(options);
  if (plan.schemaProblems.length) throw new Error('认证数据库 schema 不一致，未启动服务');
  const sql = await plan.compileMigrations();
  db.transaction(() => {
    if (sql.trim() !== ';') db.exec(sql);
    db.exec(
      'CREATE TABLE IF NOT EXISTS cashlens_auth_migrations (version INTEGER PRIMARY KEY, completedAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cashlens_stepups (sessionId TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS cashlens_auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);'
    );
    const marker = db
      .prepare('SELECT version FROM cashlens_auth_migrations WHERE version = 2')
      .get();
    if (marker) return;
    const legacy = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get();
    if (legacy) {
      const rows = db
        .prepare('SELECT id,email,name,salt,password_hash,created_at FROM users')
        .all() as {
        id: string;
        email: string;
        name: string;
        salt: string;
        password_hash: string;
        created_at: string;
      }[];
      const addUser = db.prepare(
        'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,twoFactorEnabled,bio,company,timezone) VALUES (?,?,?,0,?,?,0,?,?,?)'
      );
      const addAccount = db.prepare(
        "INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,'credential',?,?,?,?)"
      );
      for (const row of rows) {
        if (!/^[a-f0-9]{32}$/.test(row.salt) || !/^[a-f0-9]{128}$/.test(row.password_hash))
          throw new Error('旧账号密码格式不支持；迁移事务已停止');
        const createdAt = new Date(row.created_at).getTime();
        if (!Number.isFinite(createdAt)) throw new Error('旧账号创建日期无效；迁移事务已停止');
        addUser.run(
          row.id,
          row.name,
          row.email,
          new Date(createdAt).toISOString(),
          new Date(createdAt).toISOString(),
          '',
          '',
          'Asia/Shanghai'
        );
        addAccount.run(
          randomUUID(),
          row.id,
          row.id,
          `cashlens-v1:${row.salt}:${row.password_hash}`,
          new Date(createdAt).toISOString(),
          new Date(createdAt).toISOString()
        );
      }
      // Never leave a live legacy credential table that an old release could use to bypass factors.
      db.exec('ALTER TABLE users RENAME TO cashlens_legacy_users');
      if (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
          .get()
      ) {
        db.exec('DELETE FROM sessions; ALTER TABLE sessions RENAME TO cashlens_legacy_sessions');
      }
    }
    db.prepare('INSERT INTO cashlens_auth_migrations (version,completedAt) VALUES (2,?)').run(
      new Date().toISOString()
    );
    validateSchemaTwo(db);
  })();
}
