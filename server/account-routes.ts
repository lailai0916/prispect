import type { Express, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type {
  AccountOverview,
  AccountSessionSummary,
  AccountPasskeySummary,
} from '../shared/account-contracts.js';
import { AuthStore, type AuthContext } from './auth.js';
import { ApiFault } from './validation.js';

export function installAccountRoutes(app: Express, auth: AuthStore, dataDir: string) {
  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: (error?: unknown) => void) => {
      void fn(req, res).catch(next);
    };
  const context = (res: Response) => res.locals.auth as AuthContext;
  const avatarPath = (id: string) =>
    path.join(dataDir, 'avatars', createHash('sha256').update(id).digest('hex') + '.webp');
  const overview = (current: AuthContext): AccountOverview => ({
    user: auth.profileFor(current.user.id),
    capabilities: {
      email: {
        configured: auth.mail.configured,
        reason: auth.mail.configured ? null : 'not-configured',
      },
      sms: { configured: false, reason: 'not-configured' },
      totp: true,
      passkey: true,
    },
    freshAuthUntil: auth.freshUntil(current.sessionId, current.user.id)
      ? new Date(auth.freshUntil(current.sessionId, current.user.id)!).toISOString()
      : null,
    authSchema: 2,
  });
  app.get('/api/account', (_req, res) => res.json(overview(context(res))));
  app.patch('/api/account/profile', (req, res, next) => {
    try {
      auth.profile(req.body, context(res));
      res.json(overview(context(res)));
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/account/re-auth',
    wrap(async (req, res) => {
      res.json(await auth.reauthenticate(req.body, context(res), req, res));
    })
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post(
    '/api/account/avatar',
    upload.single('file'),
    wrap(async (req, res) => {
      auth.rateLimit(`avatar:${context(res).user.id}`, 10, 3600000);
      if (!req.file) throw new ApiFault(400, 'FILE_REQUIRED', '请选择头像图片');
      let image: Buffer;
      try {
        const decoder = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
        const metadata = await decoder.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1)
          throw new Error('format');
        image = await decoder
          .rotate()
          .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw new ApiFault(
          400,
          'INVALID_AVATAR',
          '头像仅支持实际可解码的单张PNG、JPEG或WebP（最多2MB/1600万像素）'
        );
      }
      const filename = avatarPath(context(res).user.id),
        temporary = filename + '.' + randomUUID() + '.tmp';
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      await writeFile(temporary, image, { mode: 0o600 });
      await rename(temporary, filename);
      const url = `/api/account/avatar?v=${createHash('sha256').update(image).digest('hex').slice(0, 16)}`;
      auth.db
        .prepare('UPDATE "user" SET image=?,updatedAt=? WHERE id=?')
        .run(url, new Date().toISOString(), context(res).user.id);
      res.json(overview(context(res)));
    })
  );
  app.get(
    '/api/account/avatar',
    wrap(async (_req, res) => {
      try {
        res
          .type('image/webp')
          .setHeader('Cache-Control', 'private, no-store')
          .send(await readFile(avatarPath(context(res).user.id)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new ApiFault(404, 'AVATAR_NOT_FOUND', '尚未上传头像');
        throw error;
      }
    })
  );
  app.delete(
    '/api/account/avatar',
    wrap(async (_req, res) => {
      await rm(avatarPath(context(res).user.id), { force: true });
      auth.db
        .prepare('UPDATE "user" SET image=NULL,updatedAt=? WHERE id=?')
        .run(new Date().toISOString(), context(res).user.id);
      res.json(overview(context(res)));
    })
  );
  app.get('/api/account/sessions', (_req, res) => {
    const current = context(res);
    const rows = auth.db
      .prepare('SELECT id,createdAt,expiresAt,userAgent FROM session WHERE userId=?')
      .all(current.user.id) as {
      id: string;
      createdAt: number | string;
      expiresAt: number | string;
      userAgent: string | null;
    }[];
    res.json(
      rows
        .filter((row) => new Date(row.expiresAt).getTime() > Date.now())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt).toISOString(),
          expiresAt: new Date(row.expiresAt).toISOString(),
          current: row.id === current.sessionId,
        })) satisfies AccountSessionSummary[]
    );
  });
  app.post('/api/account/sessions/:id/revoke', (req, res, next) => {
    try {
      const current = context(res);
      const found = auth.db
        .prepare('SELECT id FROM session WHERE id=? AND userId=?')
        .get(req.params.id, current.user.id);
      if (!found) throw new ApiFault(404, 'SESSION_NOT_FOUND', '此账号会话不存在');
      auth.db
        .prepare('DELETE FROM session WHERE id=? AND userId=?')
        .run(req.params.id, current.user.id);
      auth.db.prepare('DELETE FROM cashlens_stepups WHERE sessionId=?').run(req.params.id);
      res.json({ revoked: true, current: req.params.id === current.sessionId });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/account/passkeys', (_req, res) => {
    const rows = auth.db
      .prepare(
        'SELECT id,name,createdAt,deviceType,backedUp FROM passkey WHERE userId=? ORDER BY createdAt DESC'
      )
      .all(context(res).user.id) as {
      id: string;
      name: string | null;
      createdAt: number | null;
      deviceType: string;
      backedUp: number;
    }[];
    res.json(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        backedUp: !!row.backedUp,
      })) satisfies AccountPasskeySummary[]
    );
  });
  const unavailable = (code: 'EMAIL_UNAVAILABLE' | 'SMS_UNAVAILABLE') => {
    throw new ApiFault(
      503,
      code,
      code === 'EMAIL_UNAVAILABLE'
        ? '邮件服务尚未配置，未发送邮件'
        : '短信服务尚未配置，未发送验证码'
    );
  };
  app.post(
    '/api/account/email/verify',
    wrap(async (req, res) => {
      if (!auth.mail.configured) unavailable('EMAIL_UNAVAILABLE');
      auth.requireFresh(context(res));
      auth.rateLimit(`email:${context(res).user.id}`, 3, 3600000);
      const result = await auth.identity.api.sendVerificationEmail({
        body: { email: context(res).user.email, callbackURL: auth.origin + '/#/account' },
        headers: new Headers({ cookie: req.headers.cookie || '', origin: auth.origin }),
        asResponse: true,
      });
      if (!result.ok) throw new ApiFault(result.status, 'EMAIL_DELIVERY_FAILED', '邮件发送未完成');
      res.json({ accepted: true });
    })
  );
  app.post(
    '/api/account/email/change',
    wrap(async (req, res) => {
      if (!auth.mail.configured) unavailable('EMAIL_UNAVAILABLE');
      auth.requireFresh(context(res));
      if (typeof req.body?.email !== 'string')
        throw new ApiFault(400, 'INVALID_ACCOUNT', '邮箱无效');
      const result = await auth.identity.api.changeEmail({
        body: { newEmail: req.body.email, callbackURL: auth.origin + '/#/account' },
        headers: new Headers({ cookie: req.headers.cookie || '', origin: auth.origin }),
        asResponse: true,
      });
      if (!result.ok)
        throw new ApiFault(result.status, 'EMAIL_DELIVERY_FAILED', '邮箱变更验证未完成');
      res.json({ accepted: true });
    })
  );
  app.post('/api/account/phone/send', (req, _res, next) => {
    try {
      if (
        typeof req.body?.phoneNumber !== 'string' ||
        !parsePhoneNumberFromString(req.body.phoneNumber)?.isValid()
      )
        throw new ApiFault(400, 'INVALID_PHONE', '请输入含国家区号的有效手机号');
      unavailable('SMS_UNAVAILABLE');
    } catch (error) {
      next(error);
    }
  });
  for (const endpoint of ['verify', 'remove'])
    app.post(`/api/account/phone/${endpoint}`, (_req, _res, next) => {
      try {
        unavailable('SMS_UNAVAILABLE');
      } catch (error) {
        next(error);
      }
    });
}
