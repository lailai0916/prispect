import Database from 'better-sqlite3';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { twoFactor, phoneNumber } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import type { AccountUser, AuthSession } from '../shared/contracts.js';
import type { AccountProfile, LoginResult } from '../shared/account-contracts.js';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validNewPassword,
} from '../shared/password-strength.js';
import { ApiFault } from './validation.js';
import { migrateAccounts, hashPassword, verifyAccountPassword } from './auth-migration.js';
import { emailProviderFromEnv, smsProvider } from './auth-providers.js';

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export function registrationEnabledFromEnv(
  _secure: boolean,
  configured = process.env.CASHLENS_REGISTRATION_ENABLED
) {
  if (configured === undefined || configured === '') return true;
  if (configured !== 'true' && configured !== 'false')
    throw new Error('CASHLENS_REGISTRATION_ENABLED must be true or false');
  return configured === 'true';
}
export const registerSchema = z
  .object({
    email,
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    name: z.string().trim().min(1).max(80),
  })
  .strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    phoneNumber: z
      .string()
      .trim()
      .max(30)
      .refine(
        (value) =>
          !value ||
          parsePhoneNumberFromString(value, { defaultCountry: 'CN', extract: false })?.isValid()
      )
      .transform((value) =>
        value
          ? parsePhoneNumberFromString(value, { defaultCountry: 'CN', extract: false })!.number
          : null
      )
      .nullable()
      .optional(),
    bio: z.string().trim().max(500).optional(),
    company: z.string().trim().max(120).optional(),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
  })
  .strict();
export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict();
export interface AuthContext {
  user: AccountUser;
  token: string;
  sessionId: string;
}
const sensitivePaths = new Set([
  '/change-password',
  '/set-password',
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/get-totp-uri',
  '/two-factor/generate-backup-codes',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
  '/change-email',
  '/revoke-sessions',
]);

async function authSecret(dataDir: string, secure: boolean) {
  const configured = process.env.BETTER_AUTH_SECRET;
  if (configured) {
    if (configured.length < 32) throw new Error('BETTER_AUTH_SECRET 至少32字符');
    return configured;
  }
  if (secure) throw new Error('生产模式必须设置 BETTER_AUTH_SECRET 并安全备份');
  const file = path.join(dataDir, 'auth-secret');
  try {
    await writeFile(file, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const secret = (await readFile(file, 'utf8')).trim();
  if (secret.length < 32) throw new Error('本机认证密钥损坏，未启动服务');
  await chmod(file, 0o600);
  return secret;
}
export class AuthStore {
  readonly db: Database.Database;
  identity!: ReturnType<typeof betterAuth<ReturnType<AuthStore['options']>>>;
  private trustedOrigins: string[];
  readonly mail = emailProviderFromEnv();
  readonly sms = smsProvider;
  readonly origin: string;
  private constructor(
    filename: string,
    private secret: string,
    private secure: boolean,
    readonly registrationEnabled: boolean
  ) {
    this.origin = process.env.APP_ORIGIN || 'http://localhost:4318';
    if (secure && new URL(this.origin).protocol !== 'https:')
      throw new Error('生产认证必须使用HTTPS APP_ORIGIN');
    this.trustedOrigins = secure
      ? [new URL(this.origin).origin]
      : [
          ...new Set([
            new URL(this.origin).origin,
            'http://127.0.0.1:4317',
            'http://127.0.0.1:4318',
            'http://localhost:4317',
            'http://localhost:4318',
          ]),
        ];
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }
  private options() {
    const { trustedOrigins, secure, secret } = this;
    return {
      appName: '析光 Prispect',
      baseURL: this.origin,
      basePath: '/api/identity',
      secret,
      database: this.db,
      trustedOrigins,
      logger: { disabled: true },
      telemetry: { enabled: false },
      emailAndPassword: {
        enabled: true,
        disableSignUp: !this.registrationEnabled,
        minPasswordLength: PASSWORD_MIN_LENGTH,
        maxPasswordLength: PASSWORD_MAX_LENGTH,
        password: { hash: hashPassword, verify: verifyAccountPassword },
        sendResetPassword: async ({ user, url }) => {
          await this.mail.send(
            user.email,
            '析光：重置密码',
            `请在有效期内打开链接重置密码：\n${url}`
          );
        },
        revokeSessionsOnPasswordReset: true,
      },
      emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
          await this.mail.send(
            user.email,
            '析光：验证邮箱',
            `请在有效期内打开链接验证邮箱：\n${url}`
          );
        },
        sendOnSignUp: false,
        sendOnSignIn: false,
      },
      user: {
        changeEmail: { enabled: true },
        additionalFields: {
          bio: { type: 'string', required: false, defaultValue: '', input: false },
          company: { type: 'string', required: false, defaultValue: '', input: false },
          timezone: {
            type: 'string',
            required: false,
            defaultValue: 'Asia/Shanghai',
            input: false,
          },
        },
      },
      session: { expiresIn: 86400, updateAge: 3600, freshAge: 0, cookieCache: { enabled: false } },
      advanced: {
        useSecureCookies: secure,
        cookiePrefix: 'cashlens-auth',
        defaultCookieAttributes: { sameSite: 'strict', httpOnly: true, secure, path: '/' },
        database: { generateId: () => randomUUID() },
        trustedProxyHeaders: false,
        ipAddress: { ipAddressHeaders: ['x-cashlens-client-ip'] },
      },
      rateLimit: {
        enabled: true,
        storage: 'database',
        window: 60,
        max: 100,
        customRules: {
          '/sign-in/email': { window: 60, max: 10 },
          '/sign-up/email': { window: 3600, max: 5 },
          '/two-factor/*': { window: 60, max: 10 },
          '/passkey/*': { window: 60, max: 20 },
        },
      },
      plugins: [
        twoFactor({
          issuer: '析光 Prispect',
          twoFactorCookieMaxAge: 300,
          backupCodeOptions: { storeBackupCodes: 'encrypted' },
        }),
        phoneNumber({
          sendOTP: async ({ phoneNumber: phone, code }) => this.sms.send(phone, code),
        }),
        passkey({
          rpID: new URL(this.origin).hostname,
          rpName: '析光 Prispect',
          origin: trustedOrigins,
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          registration: {
            requireSession: true,
            afterVerification: async ({ verification }) => {
              if (!verification.registrationInfo?.userVerified)
                throw new APIError('BAD_REQUEST', {
                  code: 'PASSKEY_UV_REQUIRED',
                  message: '通行密钥必须完成设备用户验证',
                });
            },
          },
        }),
      ],
      disabledPaths: [
        ...(!this.registrationEnabled ? ['/sign-up/email'] : []),
        '/delete-user',
        '/delete-user/callback',
        '/link-social',
        '/sign-in/social',
        '/sign-in/phone-number',
        '/unlink-account',
      ],
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === '/sign-up/email') {
            const parsed = registerSchema.safeParse(ctx.body);
            if (
              !parsed.success ||
              !validNewPassword(parsed.data.password, [parsed.data.email, parsed.data.name])
            )
              throw new APIError('BAD_REQUEST', {
                code: 'WEAK_PASSWORD',
                message: '使用至少8字符且不易猜测的密码',
              });
            // Registration may never carry arbitrary avatar URLs or verified claims.
            return { context: { body: parsed.data } };
          }
          if (
            ctx.path === '/change-password' ||
            ctx.path === '/reset-password' ||
            ctx.path === '/set-password'
          ) {
            if (!validNewPassword(ctx.body?.newPassword || ctx.body?.password))
              throw new APIError('BAD_REQUEST', {
                code: 'WEAK_PASSWORD',
                message: '使用至少8字符且不易猜测的密码',
              });
            if (ctx.path === '/change-password') ctx.body.revokeOtherSessions = true;
          }
          if (
            [
              '/send-verification-email',
              '/change-email',
              '/request-password-reset',
              '/reset-password',
              '/verify-email',
            ].includes(ctx.path) &&
            !this.mail.configured
          )
            throw new APIError('SERVICE_UNAVAILABLE', {
              code: 'EMAIL_UNAVAILABLE',
              message: '邮件服务尚未配置，未发送邮件',
            });
          if (ctx.path.startsWith('/phone-number/') && !this.sms.configured)
            throw new APIError('SERVICE_UNAVAILABLE', {
              code: 'SMS_UNAVAILABLE',
              message: '短信服务尚未配置，未发送验证码',
            });
          if (ctx.body?.trustDevice)
            throw new APIError('BAD_REQUEST', {
              code: 'TRUST_DEVICE_DISABLED',
              message: '本服务每次密码登录均需两步验证',
            });
          if (ctx.path === '/update-user')
            throw new APIError('FORBIDDEN', {
              code: 'PROFILE_ENDPOINT_REQUIRED',
              message: '请使用账号资料接口',
            });
          if (ctx.path === '/sign-in/email' && typeof ctx.body?.email === 'string') {
            try {
              this.rateLimit(`login-email:${ctx.body.email.trim().toLowerCase()}`, 10, 900000);
            } catch {
              throw new APIError('TOO_MANY_REQUESTS', {
                code: 'RATE_LIMITED',
                message: '尝试过于频繁，请稍后重试',
              });
            }
          }
          if (ctx.path === '/passkey/verify-authentication') {
            const data = ctx.body?.response?.response?.authenticatorData;
            const bytes = typeof data === 'string' ? Buffer.from(data, 'base64url') : null;
            if (!bytes || bytes.length < 37 || !(bytes[32]! & 4))
              throw new APIError('BAD_REQUEST', {
                code: 'PASSKEY_UV_REQUIRED',
                message: '通行密钥必须完成设备用户验证',
              });
          }
          if (sensitivePaths.has(ctx.path)) {
            const session = await getSessionFromCtx(ctx);
            if (!session)
              throw new APIError('UNAUTHORIZED', { code: 'AUTH_REQUIRED', message: '请先登录' });
            if (!this.freshUntil(session.session.id, session.user.id))
              throw new APIError('FORBIDDEN', {
                code: 'FRESH_AUTH_REQUIRED',
                message: '请先重新验证密码及已启用的两步验证码',
              });
          }
        }),
        after: createAuthMiddleware(async (ctx) => {
          if (
            ctx.path === '/passkey/generate-authenticate-options' &&
            ctx.context.returned &&
            typeof ctx.context.returned === 'object'
          )
            return ctx.json({ ...ctx.context.returned, userVerification: 'required' });
          const session = ctx.context.newSession;
          if (
            session &&
            [
              '/sign-up/email',
              '/sign-in/email',
              '/two-factor/verify-totp',
              '/two-factor/verify-backup-code',
              '/passkey/verify-authentication',
            ].includes(ctx.path)
          ) {
            this.markFresh(session.session.id, session.user.id);
          }
          const enabledNow =
            ctx.path === '/two-factor/verify-totp' &&
            ctx.context.session?.user.id &&
            !ctx.context.session.user.twoFactorEnabled;
          if ((enabledNow || ctx.path === '/two-factor/disable') && session) {
            // A newly enabled/changed factor invalidates older password-only sessions.
            this.db
              .prepare('DELETE FROM session WHERE userId = ? AND id != ?')
              .run(session.user.id, session.session.id);
            this.db
              .prepare('DELETE FROM cashlens_stepups WHERE userId = ? AND sessionId != ?')
              .run(session.user.id, session.session.id);
          }
        }),
      },
    } satisfies BetterAuthOptions;
  }
  static async open(
    dataDir: string,
    secure: boolean,
    registrationEnabled = registrationEnabledFromEnv(secure)
  ) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const store = new AuthStore(
      path.join(dataDir, 'accounts.sqlite'),
      await authSecret(dataDir, secure),
      secure,
      registrationEnabled
    );
    try {
      await migrateAccounts(store.db, store.options());
      // Display contacts can be shared by accounts and carry no authentication claim.
      // Keep the legacy phone authentication columns intact for schema2 compatibility.
      store.db.transaction(() => {
        store.db.exec(
          'CREATE TABLE IF NOT EXISTS cashlens_profile_contacts (userId TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, phoneNumber TEXT);'
        );
        store.db.exec(
          'INSERT OR IGNORE INTO cashlens_profile_contacts (userId,phoneNumber) SELECT id,phoneNumber FROM "user" WHERE phoneNumber IS NOT NULL;'
        );
      })();
      store.identity = betterAuth(store.options());
      const context = await store.identity.$context;
      await context.checkSchema?.();
      await chmod(path.join(dataDir, 'accounts.sqlite'), 0o600);
      return store;
    } catch (error) {
      store.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  rateLimit(key: string, count: number, duration: number) {
    const now = Date.now();
    const allowed = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT count,until FROM cashlens_auth_limits WHERE key = ?')
        .get(key) as { count: number; until: number } | undefined;
      const current =
        !row || row.until <= now
          ? { count: 1, until: now + duration }
          : { ...row, count: row.count + 1 };
      this.db
        .prepare(
          'INSERT INTO cashlens_auth_limits (key,count,until) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until'
        )
        .run(key, current.count, current.until);
      this.db.prepare('DELETE FROM cashlens_auth_limits WHERE until <= ?').run(now);
      return current.count <= count;
    })();
    if (!allowed) throw new ApiFault(429, 'RATE_LIMITED', '尝试过于频繁，请稍后重试');
  }
  private csrfFor(id: string, userId: string) {
    return createHmac('sha256', this.secret)
      .update(`cashlens-csrf-v2:${id}:${userId}`)
      .digest('hex');
  }
  async session(req: Request): Promise<AuthContext | null> {
    const result = await this.identity.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return result
      ? {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            timezone:
              (result.user as typeof result.user & { timezone?: string }).timezone ||
              'Asia/Shanghai',
            createdAt: new Date(
              result.user.createdAt instanceof Date
                ? result.user.createdAt.getTime()
                : (result.user.createdAt as string | number)
            ).toISOString(),
          },
          token: result.session.token,
          sessionId: result.session.id,
        }
      : null;
  }
  async require(req: Request) {
    const context = await this.session(req);
    if (!context) throw new ApiFault(401, 'AUTH_REQUIRED', '请先登录以打开个人工作区');
    return context;
  }
  verifyCsrf(req: Request, context: AuthContext) {
    const got = req.get('X-CSRF-Token'),
      expected = this.csrfFor(context.sessionId, context.user.id);
    if (
      !got ||
      got.length !== expected.length ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
    )
      throw new ApiFault(403, 'CSRF_INVALID', '请求安全令牌无效，请刷新页面后重试');
  }
  response(context: AuthContext | null): AuthSession {
    return context
      ? {
          user: context.user,
          csrfToken: this.csrfFor(context.sessionId, context.user.id),
          registrationEnabled: this.registrationEnabled,
        }
      : { user: null, csrfToken: null, registrationEnabled: this.registrationEnabled };
  }
  profileFor(id: string): AccountProfile {
    const user = this.db
      .prepare(
        'SELECT u.*,c.phoneNumber AS displayPhoneNumber FROM "user" u LEFT JOIN cashlens_profile_contacts c ON c.userId=u.id WHERE u.id = ?'
      )
      .get(id) as {
      id: string;
      email: string;
      name: string;
      createdAt: number;
      image: string | null;
      emailVerified: number;
      displayPhoneNumber: string | null;
      twoFactorEnabled: number;
      bio: string;
      company: string;
      timezone: string;
    };
    if (!user) throw new ApiFault(401, 'AUTH_REQUIRED', '请先登录');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: new Date(user.createdAt).toISOString(),
      image: user.image || null,
      emailVerified: !!user.emailVerified,
      phoneNumber: user.displayPhoneNumber || null,
      phoneNumberVerified: false,
      twoFactorEnabled: !!user.twoFactorEnabled,
      bio: user.bio || '',
      company: user.company || '',
      timezone: user.timezone || 'Asia/Shanghai',
    };
  }
  freshUntil(sessionId: string, userId: string) {
    const row = this.db
      .prepare('SELECT expiresAt FROM cashlens_stepups WHERE sessionId = ? AND userId = ?')
      .get(sessionId, userId) as { expiresAt: number } | undefined;
    return row && row.expiresAt > Date.now() ? row.expiresAt : null;
  }
  markFresh(sessionId: string, userId: string) {
    const expires = Date.now() + 300000;
    this.db
      .prepare(
        'INSERT INTO cashlens_stepups (sessionId,userId,expiresAt) VALUES (?,?,?) ON CONFLICT(sessionId) DO UPDATE SET expiresAt=excluded.expiresAt'
      )
      .run(sessionId, userId, expires);
    return expires;
  }
  requireFresh(context: AuthContext) {
    if (!this.freshUntil(context.sessionId, context.user.id))
      throw new ApiFault(403, 'FRESH_AUTH_REQUIRED', '请先重新验证密码及已启用的两步验证码');
  }
  async reauthenticate(input: unknown, context: AuthContext, req: Request, res: Response) {
    this.rateLimit(`reauth:${context.user.id}`, 5, 300000);
    const parsed = z
      .object({
        password: z.string().min(1).max(128),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new ApiFault(400, 'INVALID_ACCOUNT', '重新验证信息无效');
    const credential = this.db
      .prepare("SELECT password FROM account WHERE userId = ? AND providerId = 'credential'")
      .get(context.user.id) as { password: string } | undefined;
    if (
      !credential ||
      !(await verifyAccountPassword({ hash: credential.password, password: parsed.data.password }))
    )
      throw new ApiFault(401, 'INVALID_CREDENTIALS', '密码或验证码不正确');
    if (this.profileFor(context.user.id).twoFactorEnabled) {
      if (!parsed.data.code) throw new ApiFault(400, 'TOTP_REQUIRED', '请输入两步验证码');
      const result = await this.identity.api.verifyTOTP({
        headers: fromNodeHeaders(req.headers),
        body: { code: parsed.data.code, trustDevice: false },
        asResponse: true,
      });
      await this.accept(result, req, res);
    }
    return {
      freshAuthUntil: new Date(this.markFresh(context.sessionId, context.user.id)).toISOString(),
    };
  }
  private async accept(response: globalThis.Response, req: Request, res: Response) {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const code = String(body.code || 'AUTH_FAILED');
      const mapped = code.includes('USER_ALREADY_EXISTS')
        ? 'EMAIL_EXISTS'
        : ['INVALID_PASSWORD', 'INVALID_EMAIL_OR_PASSWORD', 'INVALID_CODE'].includes(code)
          ? 'INVALID_CREDENTIALS'
          : code;
      throw new ApiFault(response.status, mapped, String(body.message || '认证请求未完成'));
    }
    if (cookies.length) {
      const jar = new Map(
        (req.headers.cookie || '')
          .split(';')
          .filter(Boolean)
          .map((part) => {
            const [name, ...value] = part.trim().split('=');
            return [name!, value.join('=')];
          })
      );
      for (const cookie of cookies) {
        const [first] = cookie.split(';');
        const [name, ...value] = first!.split('=');
        if (value.join('=')) jar.set(name!, value.join('='));
        else jar.delete(name!);
      }
      req.headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    return body;
  }
  async register(input: unknown, req: Request, res: Response) {
    if (!this.registrationEnabled) throw new ApiFault(404, 'NOT_FOUND', '未找到接口');
    this.rateLimit(`register:${req.ip}`, 5, 3600000);
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      if (parsed.error.issues.every((issue) => issue.path[0] === 'password'))
        throw new ApiFault(400, 'WEAK_PASSWORD', '使用8–128字符且不易猜测的密码');
      throw new ApiFault(400, 'INVALID_ACCOUNT', '请输入有效邮箱和 1–80 字符的姓名');
    }
    if (!validNewPassword(parsed.data.password, [parsed.data.email, parsed.data.name]))
      throw new ApiFault(400, 'WEAK_PASSWORD', '使用8–128字符且不易猜测的密码');
    const result = await this.identity.api.signUpEmail({
      body: parsed.data,
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    await this.accept(result, req, res);
    return this.response(await this.session(req));
  }
  async login(input: unknown, req: Request, res: Response): Promise<LoginResult> {
    this.rateLimit(`login:${req.ip}`, 30, 900000);
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new ApiFault(400, 'INVALID_ACCOUNT', '请输入有效邮箱和密码');
    const result = await this.identity.api.signInEmail({
      body: parsed.data,
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    const body = await this.accept(result, req, res);
    if (body.twoFactorRedirect)
      return { ...this.response(null), twoFactorRequired: true, methods: ['totp', 'backup-code'] };
    return this.response(await this.session(req));
  }
  async logout(_context: AuthContext, req: Request, res: Response) {
    await this.accept(
      await this.identity.api.signOut({ headers: fromNodeHeaders(req.headers), asResponse: true }),
      req,
      res
    );
  }
  profile(input: unknown, context: AuthContext) {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw new ApiFault(400, 'INVALID_ACCOUNT', '资料字段无效');
    const old = this.profileFor(context.user.id),
      next = { ...old, ...parsed.data };
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE "user" SET name=?,bio=?,company=?,timezone=?,updatedAt=? WHERE id=?')
        .run(
          next.name,
          next.bio,
          next.company,
          next.timezone,
          new Date().toISOString(),
          context.user.id
        );
      this.db
        .prepare(
          'INSERT INTO cashlens_profile_contacts (userId,phoneNumber) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET phoneNumber=excluded.phoneNumber'
        )
        .run(context.user.id, next.phoneNumber);
    })();
    return this.response({
      ...context,
      user: { ...context.user, name: next.name, timezone: next.timezone },
    });
  }
  async changePassword(input: unknown, context: AuthContext, req: Request, res: Response) {
    this.requireFresh(context);
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) {
      if (parsed.error.issues.every((issue) => issue.path[0] === 'newPassword'))
        throw new ApiFault(400, 'WEAK_PASSWORD', '使用8–128字符且不易猜测的密码');
      throw new ApiFault(400, 'INVALID_ACCOUNT', '请输入当前密码和有效的新密码');
    }
    if (!validNewPassword(parsed.data.newPassword, [context.user.name, context.user.email]))
      throw new ApiFault(400, 'WEAK_PASSWORD', '使用8–128字符且不易猜测的密码');
    await this.accept(
      await this.identity.api.changePassword({
        headers: fromNodeHeaders(req.headers),
        body: { ...parsed.data, revokeOtherSessions: true },
        asResponse: true,
      }),
      req,
      res
    );
    const next = await this.session(req);
    if (next) this.markFresh(next.sessionId, next.user.id);
    return this.response(next);
  }
}
export const authentication =
  (auth: AuthStore) => (req: Request, res: Response, next: NextFunction) => {
    void auth
      .require(req)
      .then((context) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) auth.verifyCsrf(req, context);
        res.locals.auth = context;
        next();
      })
      .catch(next);
  };
