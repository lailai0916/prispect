import Database from 'better-sqlite3';
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AccountUser, AuthSession } from '../shared/contracts.js';
import { ApiFault } from './validation.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const csrfFor = (token: string) => hash(`cashlens-csrf-v1:${token}`);
const password = z.string().min(10, '密码至少 10 个字符').max(128, '密码最多 128 个字符');
const email = z
  .string()
  .trim()
  .email('请输入有效邮箱')
  .max(254)
  .transform((value) => value.toLowerCase());
export const registerSchema = z.object({ email, password, name: z.string().trim().min(1).max(80) });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const profileSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
  salt: string;
  password_hash: string;
}
interface SessionRow {
  user_id: string;
  expires_at: number;
}
export interface AuthContext {
  user: AccountUser;
  token: string;
}
function account(row: UserRow): AccountUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}
function readCookie(req: Request) {
  const raw = req.headers.cookie || '';
  for (const pair of raw.split(';')) {
    const [name, ...values] = pair.trim().split('=');
    if (name === 'cashlens_session') {
      const value = values.join('=');
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}
async function derive(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      value,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      }
    );
  });
}

export class AuthStore {
  private db: Database.Database;
  private secure: boolean;
  private limits = new Map<string, { count: number; until: number }>();
  private dummySalt = randomBytes(16).toString('hex');
  constructor(filename: string, secure: boolean) {
    this.db = new Database(filename);
    this.secure = secure;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);'
    );
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  }
  static async open(dataDir: string, secure: boolean) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const filename = path.join(dataDir, 'accounts.sqlite');
    const store = new AuthStore(filename, secure);
    await chmod(filename, 0o600);
    return store;
  }
  close() {
    this.db.close();
  }
  rateLimit(key: string, count: number, duration: number) {
    const now = Date.now();
    let record = this.limits.get(key);
    if (!record || record.until < now) {
      record = { count: 0, until: now + duration };
      this.limits.set(key, record);
    }
    record.count++;
    if (record.count > count) throw new ApiFault(429, 'RATE_LIMITED', '尝试过于频繁，请稍后重试');
    if (this.limits.size > 10000)
      for (const [entry, item] of this.limits) if (item.until < now) this.limits.delete(entry);
  }
  session(req: Request): AuthContext | null {
    const token = readCookie(req);
    if (!token) return null;
    const session = this.db
      .prepare('SELECT user_id,expires_at FROM sessions WHERE token_hash = ?')
      .get(hash(token)) as SessionRow | undefined;
    if (!session) return null;
    if (session.expires_at <= Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
      return null;
    }
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as
      | UserRow
      | undefined;
    return row ? { user: account(row), token } : null;
  }
  require(req: Request): AuthContext {
    const context = this.session(req);
    if (!context) throw new ApiFault(401, 'AUTH_REQUIRED', '请先登录以打开个人工作区');
    return context;
  }
  verifyCsrf(req: Request, context: AuthContext) {
    const received = req.get('X-CSRF-Token');
    const expected = csrfFor(context.token);
    if (
      !received ||
      received.length !== expected.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      throw new ApiFault(403, 'CSRF_INVALID', '请求安全令牌无效，请刷新页面后重试');
  }
  response(context: AuthContext | null): AuthSession {
    return context
      ? { user: context.user, csrfToken: csrfFor(context.token) }
      : { user: null, csrfToken: null };
  }
  private issue(user: AccountUser, res: Response): AuthContext {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
      .run(hash(token), user.id, Date.now() + 24 * 60 * 60 * 1000);
    res.cookie('cashlens_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return { user, token };
  }
  async register(input: unknown, req: Request, res: Response): Promise<AuthSession> {
    this.rateLimit(`register:${req.ip}`, 5, 60 * 60 * 1000);
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiFault(400, 'INVALID_ACCOUNT', parsed.error.issues[0]?.message || '账号信息无效');
    if (this.db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email))
      throw new ApiFault(409, 'EMAIL_EXISTS', '此邮箱已有账号，请登录');
    const salt = randomBytes(16).toString('hex'),
      passwordHash = (await derive(parsed.data.password, salt)).toString('hex');
    const user: AccountUser = {
      id: randomUUID(),
      email: parsed.data.email,
      name: parsed.data.name,
      createdAt: new Date().toISOString(),
    };
    try {
      this.db
        .prepare(
          'INSERT INTO users (id,email,name,salt,password_hash,created_at) VALUES (?,?,?,?,?,?)'
        )
        .run(user.id, user.email, user.name, salt, passwordHash, user.createdAt);
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
        throw new ApiFault(409, 'EMAIL_EXISTS', '此邮箱已有账号，请登录');
      throw error;
    }
    const previous = this.session(req);
    if (previous)
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(previous.token));
    return this.response(this.issue(user, res));
  }
  async login(input: unknown, req: Request, res: Response): Promise<AuthSession> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new ApiFault(400, 'INVALID_ACCOUNT', '邮箱或密码格式无效');
    this.rateLimit(`login-ip:${req.ip}`, 30, 15 * 60 * 1000);
    this.rateLimit(`login-email:${parsed.data.email}`, 10, 15 * 60 * 1000);
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email) as
      | UserRow
      | undefined;
    const computed = await derive(parsed.data.password, row?.salt || this.dummySalt);
    const expected = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(computed, expected) || !row)
      throw new ApiFault(401, 'INVALID_CREDENTIALS', '邮箱或密码不正确');
    const previous = this.session(req);
    if (previous)
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(previous.token));
    return this.response(this.issue(account(row), res));
  }
  logout(context: AuthContext, res: Response) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(context.token));
    res.clearCookie('cashlens_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
    });
  }
  profile(input: unknown, context: AuthContext): AuthSession {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw new ApiFault(400, 'INVALID_ACCOUNT', '姓名必须为 1–80 字符');
    this.db
      .prepare('UPDATE users SET name = ? WHERE id = ?')
      .run(parsed.data.name, context.user.id);
    context.user.name = parsed.data.name;
    return this.response(context);
  }
  async changePassword(
    input: unknown,
    context: AuthContext,
    req: Request,
    res: Response
  ): Promise<AuthSession> {
    this.rateLimit(`password:${context.user.id}`, 10, 15 * 60 * 1000);
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiFault(400, 'INVALID_ACCOUNT', parsed.error.issues[0]?.message || '密码信息无效');
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(context.user.id) as UserRow;
    const computed = await derive(parsed.data.currentPassword, row.salt);
    if (!timingSafeEqual(computed, Buffer.from(row.password_hash, 'hex')))
      throw new ApiFault(401, 'INVALID_CREDENTIALS', '当前密码不正确');
    const salt = randomBytes(16).toString('hex'),
      passwordHash = (await derive(parsed.data.newPassword, salt)).toString('hex');
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
        .run(salt, passwordHash, context.user.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(context.user.id);
    })();
    return this.response(this.issue(context.user, res));
  }
}
export function authentication(auth: AuthStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = auth.require(req);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) auth.verifyCsrf(req, context);
      res.locals.auth = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}
