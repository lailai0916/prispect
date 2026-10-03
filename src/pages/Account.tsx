import { productTerms } from '../../shared/product-terms';
import { Select } from '../Select';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import QRCode from 'react-qr-code';
import { Dialog } from '@base-ui/react/dialog';
import {
  Camera,
  UserRound,
  ShieldCheck,
  KeyRound,
  LogOut,
  Mail,
  Trash2,
  Check,
  Database,
  Laptop,
  LoaderCircle,
  X,
} from 'lucide-react';
import type {
  AccountOverview,
  AccountPasskeySummary,
  AccountSessionSummary,
} from '../../shared/account-contracts';
import { api, post, RequestError, requestErrorText } from '../api';
import { identityClient, identityResult } from '../auth-client';
import { useApp } from '../context';
import { date } from '../format';
import { ROUTE_CHANGE_EVENT } from '../routing';
import { PasswordMeter } from './Auth';
import { useFileDrop, validateFileSelection, type FileSelectionError } from '../useFileDrop';
import '../account.css';
import '../styles/avatar-upload.css';

const avatarPolicy = { extensions: ['png', 'jpg', 'jpeg', 'webp'], maxBytes: 2 * 1024 * 1024 };
const avatarPixelLimit = 16000000;
type AvatarImageError = 'decode' | 'pixels' | 'animated';
type AvatarMessage = readonly [string, string];
type SecureAction = (password: string, current: () => boolean) => Promise<unknown>;

// Read dimensions before asking the browser to decode a potentially large compressed image.
function avatarImageInfo(bytes: Uint8Array): {
  width: number;
  height: number;
  mime: string;
  animated: boolean;
} | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    text(12, 4) === 'IHDR'
  ) {
    let animated = false;
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const size = view.getUint32(offset),
        kind = text(offset + 4, 4);
      if (size > bytes.length - offset - 12) break;
      if (kind === 'acTL' && size >= 8) animated = view.getUint32(offset + 8) > 1;
      if (kind === 'IDAT' || kind === 'IEND') break;
      offset += size + 12;
    }
    return { width: view.getUint32(16), height: view.getUint32(20), mime: 'image/png', animated };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 <= bytes.length; ) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const size = view.getUint16(offset);
      if (size < 2 || size > bytes.length - offset) return null;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker
        )
      ) {
        if (size < 7) return null;
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
          mime: 'image/jpeg',
          animated: false,
        };
      }
      offset += size;
    }
  }
  if (bytes.length >= 20 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    let dimensions: { width: number; height: number } | null = null,
      frames = 0;
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const kind = text(offset, 4),
        size = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (size > bytes.length - start) return null;
      if (kind === 'ANMF') frames++;
      if (kind === 'VP8X' && size >= 10) {
        dimensions = {
          width: 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16),
          height: 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16),
        };
      } else if (!dimensions && kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        const packed = view.getUint32(start + 1, true);
        dimensions = { width: 1 + (packed & 0x3fff), height: 1 + ((packed >>> 14) & 0x3fff) };
      } else if (
        !dimensions &&
        kind === 'VP8 ' &&
        size >= 10 &&
        text(start + 3, 3) === '\u009d\u0001\u002a'
      ) {
        dimensions = {
          width: view.getUint16(start + 6, true) & 0x3fff,
          height: view.getUint16(start + 8, true) & 0x3fff,
        };
      }
      offset = start + size + (size & 1);
    }
    if (dimensions) return { ...dimensions, mime: 'image/webp', animated: frames > 1 };
  }
  return null;
}

async function validateAvatarImage(file: File): Promise<AvatarImageError | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer()),
      info = avatarImageInfo(bytes);
    if (!info || !info.width || !info.height) return 'decode';
    if (info.animated) return 'animated';
    if (info.width * info.height > avatarPixelLimit) return 'pixels';
    const image = new Blob([bytes], { type: info.mime });
    if (typeof createImageBitmap === 'function') {
      const decoded = await createImageBitmap(image);
      try {
        if (!decoded.width || !decoded.height) return 'decode';
        if (decoded.width * decoded.height > avatarPixelLimit) return 'pixels';
      } finally {
        decoded.close();
      }
    } else {
      const url = URL.createObjectURL(image);
      try {
        const decoded = new Image();
        decoded.src = url;
        await decoded.decode();
        if (!decoded.naturalWidth || !decoded.naturalHeight) return 'decode';
        if (decoded.naturalWidth * decoded.naturalHeight > avatarPixelLimit) return 'pixels';
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return null;
  } catch {
    return 'decode';
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="account-section">
      <div className="account-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="account-section-content">{children}</div>
    </section>
  );
}
function deviceLabel(agent: string | null) {
  if (!agent) return null;
  const browser = /Edg(?:e|A|iOS)?\//.test(agent)
    ? 'Edge'
    : /(?:Firefox|FxiOS)\//.test(agent)
      ? 'Firefox'
      : /(?:Chrome|Chromium|CriOS|HeadlessChrome)\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : null;
  const system = /iPhone|iPad|iPod/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : null;
  return browser ? `${browser}${system ? ` (${system})` : ''}` : null;
}
export function AccountPage() {
  const { t, locale, user, execute, busy, refresh, navigate, confirm } = useApp();
  const [overview, setOverview] = useState<AccountOverview | null>(null),
    [tab, setTab] = useState<'profile' | 'security' | 'data'>('profile'),
    [failure, setFailure] = useState('');
  const [loadFailed, setLoadFailed] = useState(false),
    [keysFailed, setKeysFailed] = useState(false),
    [sessionsFailed, setSessionsFailed] = useState(false),
    [keysLoading, setKeysLoading] = useState(true),
    [sessionsLoading, setSessionsLoading] = useState(true),
    [reloadFailed, setReloadFailed] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0),
    [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false),
    loadGeneration = useRef(0),
    accountScope = useRef(0),
    accountOwner = useRef(user?.id);
  accountOwner.current = user?.id;
  const listFailed = keysFailed || sessionsFailed;
  useEffect(() => {
    setFailure('');
  }, [tab]);
  const submitOnce = async (action: () => Promise<void>) => {
    if (busy || submitLock.current || avatarLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      await action();
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const [name, setName] = useState(''),
    [bio, setBio] = useState(''),
    [company, setCompany] = useState(''),
    [timezone, setTimezone] = useState('Asia/Shanghai');
  const [keys, setKeys] = useState<AccountPasskeySummary[]>([]),
    [sessions, setSessions] = useState<AccountSessionSummary[]>([]);
  const [password, setPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<{ totpURI: string; backupCodes: string[] } | null>(
      null
    ),
    [enrollCode, setEnrollCode] = useState(''),
    [codes, setCodes] = useState<string[]>([]);
  const [reauthAction, setReauthAction] = useState<SecureAction | null>(null),
    [reauthPassword, setReauthPassword] = useState(''),
    [reauthCode, setReauthCode] = useState(''),
    [reauthFailure, setReauthFailure] = useState('');
  const [newEmail, setNewEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [keyName, setKeyName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null),
    dialogRef = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState<'checking' | 'uploading' | 'deleting' | null>(null),
    [avatarFeedback, setAvatarFeedback] = useState<{ error: boolean; text: AvatarMessage } | null>(
      null
    ),
    [avatarRetry, setAvatarRetry] = useState<File | null>(null);
  const avatarLock = useRef(false),
    avatarAlive = useRef(false),
    avatarOwner = useRef(user?.id),
    avatarRequest = useRef<AbortController | null>(null);
  avatarOwner.current = user?.id;
  const pending = busy || submitting || Boolean(avatarBusy);
  useEffect(() => {
    avatarAlive.current = true;
    setAvatarBusy(null);
    setAvatarFeedback(null);
    setAvatarRetry(null);
    const leaveAccount = () => {
      if (location.pathname === '/account') return;
      accountScope.current++;
      // A lazy next page may briefly keep this component mounted after navigation.
      avatarRequest.current?.abort();
      avatarRequest.current = null;
      avatarLock.current = false;
      setAvatarBusy(null);
      setAvatarRetry(null);
    };
    window.addEventListener('popstate', leaveAccount);
    window.addEventListener('hashchange', leaveAccount);
    window.addEventListener(ROUTE_CHANGE_EVENT, leaveAccount);
    return () => {
      window.removeEventListener('popstate', leaveAccount);
      window.removeEventListener('hashchange', leaveAccount);
      window.removeEventListener(ROUTE_CHANGE_EVENT, leaveAccount);
      avatarAlive.current = false;
      accountScope.current++;
      avatarRequest.current?.abort();
      avatarRequest.current = null;
      avatarLock.current = false;
    };
  }, [user?.id]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const owner = accountOwner.current,
      generation = ++loadGeneration.current;
    setKeysLoading(true);
    setSessionsLoading(true);
    const keyList = Promise.allSettled([
      api<AccountPasskeySummary[]>('/account/passkeys', { signal }),
    ]);
    const sessionList = Promise.allSettled([
      api<AccountSessionSummary[]>('/account/sessions', { signal }),
    ]);
    let account: AccountOverview;
    try {
      account = await api<AccountOverview>('/account', { signal });
    } catch (error) {
      if (
        !signal?.aborted &&
        owner === accountOwner.current &&
        generation === loadGeneration.current
      ) {
        setKeysLoading(false);
        setSessionsLoading(false);
      }
      throw error;
    }
    const current = () =>
      !signal?.aborted &&
      owner === accountOwner.current &&
      account.user.id === owner &&
      generation === loadGeneration.current;
    if (current()) {
      setOverview(account);
      setLoadFailed(false);
      setReloadFailed(false);
    }
    void keyList.then(([result]) => {
      if (!current()) return;
      if (result.status === 'fulfilled') setKeys(result.value);
      setKeysFailed(result.status === 'rejected');
      setKeysLoading(false);
    });
    void sessionList.then(([result]) => {
      if (!current()) return;
      if (result.status === 'fulfilled') setSessions(result.value);
      setSessionsFailed(result.status === 'rejected');
      setSessionsLoading(false);
    });
    return account;
  }, []);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController(),
      owner = user.id;
    setOverview(null);
    setKeys([]);
    setSessions([]);
    setLoadFailed(false);
    setKeysFailed(false);
    setSessionsFailed(false);
    setReloadFailed(false);
    setFailure('');
    setEnrollment(null);
    setCodes([]);
    setReauthAction(null);
    setPassword('');
    setNewPassword('');
    setConfirmation('');
    setCode('');
    setReauthPassword('');
    setReauthCode('');
    setReauthFailure('');
    void load(controller.signal)
      .then((account) => {
        if (!controller.signal.aborted && accountOwner.current === owner) {
          setName(account.user.name);
          setBio(account.user.bio);
          setCompany(account.user.company);
          setPhone(account.user.phoneNumber || '');
          setTimezone(account.user.timezone);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && accountOwner.current === owner) setLoadFailed(true);
      });
    return () => {
      controller.abort();
    };
  }, [user?.id, load, loadAttempt]);
  const secure = (action: SecureAction) => {
    if (pending) return;
    returnFocus.current = document.activeElement as HTMLElement;
    setReauthPassword('');
    setReauthCode('');
    setReauthFailure('');
    setReauthAction(() => action);
  };
  const reauth = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async () => {
      const action = reauthAction;
      if (!action) return;
      const owner = user?.id;
      const scope = accountScope.current;
      const current = () =>
        owner === accountOwner.current &&
        scope === accountScope.current &&
        avatarAlive.current &&
        location.pathname === '/account';
      let completed = false;
      setReauthFailure('');
      const result = await execute(async () => {
        try {
          await post('/account/re-auth', {
            password: reauthPassword,
            ...(overview?.user.twoFactorEnabled ? { code: reauthCode } : {}),
          });
          if (!current()) return false;
          await action(reauthPassword, current);
          completed = true;
          if (!current()) return true;
          await load();
          return true;
        } catch (error) {
          if (current()) {
            if (completed) setReloadFailed(true);
            else setReauthFailure(requestErrorText(error, locale));
          }
          throw error;
        }
      });
      if ((result || completed) && current()) {
        setReauthAction(null);
        setReauthPassword('');
        setReauthCode('');
        returnFocus.current?.focus();
      }
    });
  };
  const logout = async () => {
    await submitOnce(async () => {
      await execute(async () => {
        const result = await post('/auth/logout', {});
        navigate('/');
        return result;
      });
    });
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async () => {
      setFailure('');
      if (!name.trim()) {
        setFailure(t('请填写姓名或昵称。', 'Enter your name.'));
        return;
      }
      await execute(
        async () => {
          const account = await api<AccountOverview>('/account/profile', {
            method: 'PATCH',
            body: JSON.stringify({ name: name.trim(), bio, company, timezone, phoneNumber: phone }),
          });
          if (account.user.id === accountOwner.current) {
            setOverview(account);
            setPhone((currentPhone) =>
              currentPhone === phone ? account.user.phoneNumber || '' : currentPhone
            );
          }
          return account;
        },
        t('个人信息已保存', 'Profile saved')
      );
    });
  };
  const avatarSelectionError = (code: FileSelectionError | AvatarImageError) => {
    if (avatarLock.current || !avatarAlive.current) return;
    const messages: Record<FileSelectionError | AvatarImageError, AvatarMessage> = {
      multiple: ['请一次选择一张头像图片。', 'Choose one avatar image at a time.'],
      type: ['请选择 PNG、JPEG 或 WebP 图片。', 'Choose a PNG, JPEG or WebP image.'],
      size: [
        '图片超过 2 MiB，请选择较小的文件。',
        'This image exceeds 2 MiB. Choose a smaller file.',
      ],
      empty: ['这张图片是空文件，请重新选择。', 'This image file is empty. Choose another file.'],
      directory: ['请拖入一张图片，而不是文件夹。', 'Drop one image, not a folder.'],
      decode: [
        '这张图片无法读取，请选择有效的 PNG、JPEG 或 WebP。',
        'This image could not be read. Choose a valid PNG, JPEG or WebP.',
      ],
      pixels: [
        '图片超过 1600 万像素，请缩小后重试。',
        'This image exceeds 16 million pixels. Resize it and retry.',
      ],
      animated: [
        '头像只支持单张静态图片，请选择其他文件。',
        'Avatars support a single still image. Choose another file.',
      ],
    };
    setAvatarRetry(null);
    setAvatarFeedback({ error: true, text: messages[code] });
  };
  const updateAvatar = async (file?: File) => {
    const owner = user?.id;
    if (!owner || pending || submitLock.current || avatarLock.current || !avatarAlive.current)
      return;
    // The ref is set before validation or the first await, including picker/drop/delete races.
    avatarLock.current = true;
    const controller = new AbortController();
    avatarRequest.current = controller;
    const current = () =>
      avatarAlive.current &&
      avatarOwner.current === owner &&
      avatarRequest.current === controller &&
      !controller.signal.aborted;
    setAvatarFeedback(null);
    setAvatarRetry(null);
    setAvatarBusy(file ? 'checking' : 'deleting');
    try {
      if (file) {
        const selected = validateFileSelection([file], avatarPolicy);
        const invalid = typeof selected === 'string' ? selected : await validateAvatarImage(file);
        if (!current()) return;
        if (invalid) {
          avatarLock.current = false;
          avatarSelectionError(invalid);
          return;
        }
        setAvatarRetry(file);
        setAvatarBusy('uploading');
      }
      const body = file ? new FormData() : undefined;
      if (file) body!.append('file', file);
      const account = await api<AccountOverview>('/account/avatar', {
        method: file ? 'POST' : 'DELETE',
        body,
        signal: controller.signal,
      });
      if (!current() || account.user.id !== owner) return;
      setOverview(account);
      setAvatarRetry(null);
      setAvatarFeedback({
        error: false,
        text: file ? ['头像已更新', 'Avatar updated'] : ['头像已移除', 'Avatar removed'],
      });
      void refresh().catch(() => {});
    } catch (error) {
      if (!current()) return;
      const text: AvatarMessage =
        error instanceof RequestError && error.code === 'INVALID_AVATAR'
          ? [
              '图片未被接受。请选择有效的单张 PNG、JPEG 或 WebP，最多 2 MiB、1600 万像素。',
              'This image was not accepted. Choose a valid single PNG, JPEG or WebP, up to 2 MiB and 16 million pixels.',
            ]
          : error instanceof RequestError && error.code === 'LIMIT_FILE_SIZE'
            ? [
                '图片超过 2 MiB，请选择较小的文件。',
                'This image exceeds 2 MiB. Choose a smaller file.',
              ]
            : [requestErrorText(error, 'zh-Hans'), requestErrorText(error, 'en')];
      setAvatarFeedback({ error: true, text });
      if (error instanceof RequestError && ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code))
        void refresh().catch(() => {});
    } finally {
      if (avatarRequest.current === controller) {
        avatarRequest.current = null;
        avatarLock.current = false;
        if (avatarAlive.current && avatarOwner.current === owner) setAvatarBusy(null);
      }
    }
  };
  const { isDragging: avatarDragging, dropProps: avatarDropProps } = useFileDrop({
    ...avatarPolicy,
    disabled: pending || Boolean(avatarBusy),
    onFile: (file) => void updateAvatar(file),
    onError: avatarSelectionError,
  });
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async () => {
      const scope = accountScope.current,
        owner = user?.id;
      const current = () =>
        scope === accountScope.current &&
        owner === accountOwner.current &&
        avatarAlive.current &&
        location.pathname === '/account';
      setFailure('');
      if (newPassword !== confirmation) {
        setFailure(t('两次输入的新密码不一致。', 'The new passwords do not match.'));
        return;
      }
      let weak: boolean;
      try {
        weak = !(await import('../../shared/password-strength')).validNewPassword(newPassword, [
          user?.name || '',
          user?.email || '',
        ]);
      } catch {
        if (current())
          setFailure(
            t('密码强度检查未载入，请重试。', 'The password strength check did not load. Retry.')
          );
        return;
      }
      if (!current()) return;
      if (weak) {
        setFailure(
          t(
            '新密码太容易猜测，请换用更长且独特的密码。',
            'Choose a longer, unique password that is harder to guess.'
          )
        );
        return;
      }
      let completed = false;
      const result = await execute(
        async () => {
          await post('/account/re-auth', {
            password,
            ...(overview?.user.twoFactorEnabled ? { code } : {}),
          });
          if (!current()) return false;
          await post('/auth/password', { currentPassword: password, newPassword });
          completed = true;
          if (current()) {
            try {
              await load();
            } catch (error) {
              if (current()) setReloadFailed(true);
              throw error;
            }
          }
          return true;
        },
        t('密码已修改，其他会话已退出', 'Password changed; other sessions signed out')
      );
      if ((result || completed) && current()) {
        setPassword('');
        setNewPassword('');
        setConfirmation('');
        setCode('');
      }
    });
  };
  const enableTotp = () =>
    secure(async (currentPassword, current) => {
      const data = identityResult(
        await identityClient.twoFactor.enable({
          password: currentPassword,
          issuer: '析光 Prispect',
        })
      );
      if (current() && 'totpURI' in data && data.totpURI)
        setEnrollment({
          totpURI: data.totpURI,
          backupCodes: 'backupCodes' in data ? data.backupCodes : [],
        });
    });
  const verifyEnrollment = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async () => {
      const scope = accountScope.current,
        owner = user?.id,
        backupCodes = enrollment?.backupCodes || [];
      const current = () =>
        scope === accountScope.current &&
        owner === accountOwner.current &&
        avatarAlive.current &&
        location.pathname === '/account';
      const finish = () => {
        if (!current()) return;
        setCodes(backupCodes);
        setEnrollment(null);
        setEnrollCode('');
      };
      let completed = false;
      const result = await execute(
        async () => {
          identityResult(
            await identityClient.twoFactor.verifyTotp({ code: enrollCode, trustDevice: false })
          );
          completed = true;
          finish();
          if (current()) {
            try {
              await load();
            } catch (error) {
              if (current()) setReloadFailed(true);
              throw error;
            }
          }
          return true;
        },
        t(
          '两步验证已启用，其他会话已退出',
          'Two-step verification enabled; other sessions signed out'
        )
      );
      if (result || completed) finish();
    });
  };
  const tabs = [
    { id: 'profile' as const, label: t('个人信息', 'Profile'), icon: UserRound },
    { id: 'security' as const, label: t('登录与安全', 'Security'), icon: ShieldCheck },
    { id: 'data' as const, label: t('数据与隐私', 'Data & privacy'), icon: Database },
  ];
  if (!user)
    return (
      <div className="account-page">
        <a href="/login">{t('登录以打开账号设置', 'Log in to open account settings')}</a>
      </div>
    );
  return (
    <div className="account-page">
      <header className="account-page-header">
        <div>
          <h1>{t(...productTerms.accountSettings)}</h1>
          <p className="account-muted">
            {t(
              '管理个人信息、登录方式与私人工作区。',
              'Manage your profile, sign-in methods and private workspace.'
            )}
          </p>
        </div>
        <button className="account-secondary" onClick={logout} disabled={pending}>
          <LogOut size={16} />
          {t('退出登录', 'Log out')}
        </button>
      </header>
      <div
        className="account-tabs"
        role="tablist"
        aria-label={t('账号设置分类', 'Account settings sections')}
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            role="tab"
            id={`account-tab-${item.id}`}
            aria-controls={`account-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className="account-tab"
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (direction || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const target =
                  tabs[
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : (index + direction + tabs.length) % tabs.length
                  ]!;
                setTab(target.id);
                document.getElementById(`account-tab-${target.id}`)?.focus();
              }
            }}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {failure && (
        <p className="account-error" role="alert">
          {failure}
        </p>
      )}
      {reloadFailed && (
        <div className="account-notice" role="status">
          <p>
            {t(
              '操作已完成，账号资料暂未刷新。请重新载入确认最新状态。',
              'The action completed, but account details could not refresh. Reload to confirm the latest state.'
            )}
          </p>
          <button
            type="button"
            className="account-link-button"
            disabled={pending}
            onClick={() => void execute(() => load())}
          >
            {t('重新载入', 'Reload')}
          </button>
        </div>
      )}
      {loadFailed ? (
        <div className="account-form">
          <p className="account-error" role="alert">
            {t('账号资料暂未载入，请重试。', 'Account details could not load. Please retry.')}
          </p>
          <button
            type="button"
            className="account-secondary"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            {t('重新载入', 'Retry loading')}
          </button>
        </div>
      ) : !overview || overview.user.id !== user.id ? (
        <p className="account-muted" role="status">
          <LoaderCircle size={17} className="spinner" />{' '}
          {t('载入账号资料…', 'Loading account details…')}
        </p>
      ) : (
        <div
          role="tabpanel"
          id={`account-panel-${tab}`}
          aria-labelledby={`account-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'profile' && (
            <>
              <Section
                title={t('公开称呼', 'Your profile')}
                description={t(
                  '头像与称呼用于账号界面。不会自动公开你的私人材料。',
                  'Your avatar and name appear in your account interface. Private materials stay private.'
                )}
              >
                <div
                  {...avatarDropProps}
                  className={`account-avatar-row avatar-upload${avatarDragging ? ' is-dragging' : ''}`}
                  role="group"
                  aria-label={t('头像上传', 'Avatar upload')}
                  aria-describedby="avatar-upload-hint avatar-upload-status"
                  aria-busy={Boolean(avatarBusy)}
                >
                  {overview.user.image ? (
                    <img
                      className="account-avatar"
                      src={overview.user.image}
                      alt={t('你的头像', 'Your avatar')}
                    />
                  ) : (
                    <div className="account-avatar" aria-label={t('默认头像', 'Default avatar')}>
                      {overview.user.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="account-avatar-controls">
                    <div className="account-actions">
                      <button
                        type="button"
                        className="account-secondary"
                        onClick={() => fileRef.current?.click()}
                        disabled={pending || Boolean(avatarBusy)}
                        aria-describedby="avatar-upload-hint"
                      >
                        {avatarBusy && avatarBusy !== 'deleting' ? (
                          <LoaderCircle size={15} className="spinner" aria-hidden="true" />
                        ) : (
                          <Camera size={15} aria-hidden="true" />
                        )}
                        {avatarBusy === 'checking'
                          ? t('检查图片…', 'Checking image…')
                          : avatarBusy === 'uploading'
                            ? t('上传中…', 'Uploading…')
                            : t('更换头像', 'Change avatar')}
                      </button>
                      {overview.user.image && (
                        <button
                          type="button"
                          className="account-link-button"
                          disabled={pending || Boolean(avatarBusy)}
                          onClick={() => void updateAvatar()}
                        >
                          {avatarBusy === 'deleting'
                            ? t('移除中…', 'Removing…')
                            : t('移除', 'Remove')}
                        </button>
                      )}
                      {avatarRetry && avatarFeedback?.error && (
                        <button
                          type="button"
                          className="account-link-button"
                          disabled={pending || Boolean(avatarBusy)}
                          onClick={() => void updateAvatar(avatarRetry)}
                        >
                          {t('重试上传', 'Retry upload')}
                        </button>
                      )}
                    </div>
                    <p id="avatar-upload-hint">
                      {avatarDragging
                        ? t('松开以更换头像', 'Drop to change your avatar')
                        : t(
                            '拖入图片或点击更换。单张 PNG、JPEG、WebP，最多 2 MiB、1600 万像素。',
                            'Drop an image or choose a file. Single PNG, JPEG or WebP, up to 2 MiB and 16 million pixels.'
                          )}
                    </p>
                    <div
                      id="avatar-upload-status"
                      className="avatar-upload-status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {avatarBusy ? (
                        <p role="status">
                          {avatarBusy === 'checking'
                            ? t(
                                '正在检查图片格式与尺寸。',
                                'Checking the image format and dimensions.'
                              )
                            : avatarBusy === 'uploading'
                              ? t('正在上传头像，请稍候。', 'Uploading your avatar. Please wait.')
                              : t('正在移除头像，请稍候。', 'Removing your avatar. Please wait.')}
                        </p>
                      ) : avatarFeedback ? (
                        <p
                          className={
                            avatarFeedback.error ? 'avatar-upload-error' : 'avatar-upload-success'
                          }
                          role={avatarFeedback.error ? 'alert' : 'status'}
                        >
                          {t(...avatarFeedback.text)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <input
                    className="account-file-input"
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={pending || Boolean(avatarBusy)}
                    aria-label={t('选择头像文件', 'Choose avatar file')}
                    onChange={(event) => {
                      const files = event.target.files;
                      const selected = files?.length
                        ? validateFileSelection(files, avatarPolicy)
                        : null;
                      event.target.value = '';
                      if (typeof selected === 'string') avatarSelectionError(selected);
                      else if (selected) void updateAvatar(selected);
                    }}
                  />
                </div>
                <form className="account-form" onSubmit={saveProfile}>
                  <label>
                    {t('姓名 / 昵称', 'Name')}
                    <input
                      autoComplete="name"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span id="account-phone-label">
                      {t('手机号（展示用，选填）', 'Display phone number (optional)')}
                    </span>
                    <input
                      type="tel"
                      aria-labelledby="account-phone-label"
                      aria-describedby="account-phone-hint"
                      autoComplete="tel"
                      value={phone}
                      maxLength={30}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder={t('手机号或带国家区号的号码', 'Phone number with country code')}
                    />
                    <span className="account-muted" id="account-phone-hint">
                      {t(
                        '用于个人资料展示，无需验证码。',
                        'Shown in your profile. No verification code required.'
                      )}
                    </span>
                  </label>
                  <label>
                    <span id="account-bio-label">{t('简介', 'Bio')}</span>
                    <textarea
                      aria-labelledby="account-bio-label"
                      maxLength={500}
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      placeholder={t(
                        '可选，写一点关于你自己的信息。',
                        'Optional. A little about yourself.'
                      )}
                    />
                  </label>
                  <div className="account-field-row">
                    <label>
                      {t('组织 / 公司', 'Organization')}
                      <input
                        autoComplete="organization"
                        maxLength={120}
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                      />
                    </label>
                    <label>
                      {t('时区', 'Time zone')}
                      <Select
                        value={timezone}
                        onValueChange={(selectedValue) => setTimezone(selectedValue)}
                      >
                        {[
                          ...new Set([
                            timezone,
                            'Asia/Shanghai',
                            'Asia/Hong_Kong',
                            'Asia/Tokyo',
                            'Europe/London',
                            'America/New_York',
                            'America/Los_Angeles',
                            'UTC',
                          ]),
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="account-actions">
                    <button className="account-action" disabled={pending}>
                      {t('保存个人信息', 'Save profile')}
                    </button>
                  </div>
                </form>
              </Section>
              <Section
                title={t('邮箱', 'Email')}
                description={t('邮箱用于登录。', 'Your email is used to sign in.')}
              >
                <div className="account-binding-row">
                  <div>
                    <strong>{overview.user.email}</strong>
                    <p>
                      <span className="account-badge" data-active={overview.user.emailVerified}>
                        {overview.user.emailVerified
                          ? t('已验证', 'Verified')
                          : t('未验证', 'Unverified')}
                      </span>
                    </p>
                  </div>
                  <button
                    className="account-secondary"
                    disabled={pending || !overview.capabilities.email.configured}
                    onClick={() =>
                      secure(async () => {
                        await post('/account/email/verify', {});
                      })
                    }
                  >
                    <Mail size={16} />
                    {t('验证邮箱', 'Verify email')}
                  </button>
                </div>
                {!overview.capabilities.email.configured ? (
                  <div className="account-notice">
                    <Mail size={17} />
                    <p>
                      {t(
                        '邮箱验证暂不可用。当前无法发送验证邮件、换绑邮箱或通过邮件找回密码。',
                        'Email verification is temporarily unavailable. We cannot currently send verification emails, change your email or recover your password by email.'
                      )}
                    </p>
                  </div>
                ) : (
                  <form
                    className="account-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      secure(async () => {
                        await post('/account/email/change', { email: newEmail });
                      });
                    }}
                  >
                    <label>
                      {t('新的邮箱', 'New email')}
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                      />
                    </label>
                    <button className="account-secondary" disabled={pending}>
                      {t('发送换绑验证', 'Send change verification')}
                    </button>
                  </form>
                )}
              </Section>
            </>
          )}
          {tab === 'security' && (
            <>
              {listFailed && (
                <div className="account-notice" role="status">
                  <p>
                    {t(
                      '部分通行密钥或设备会话暂未载入。',
                      'Some passkeys or device sessions could not load.'
                    )}
                  </p>
                  <button
                    type="button"
                    className="account-link-button"
                    disabled={pending}
                    onClick={() => void execute(() => load())}
                  >
                    {t('重试', 'Retry')}
                  </button>
                </div>
              )}
              <Section
                title={t('密码', 'Password')}
                description={t(
                  '修改密码前重新验证身份。完成后会退出其他设备会话。',
                  'Reauthenticate before changing your password. Other device sessions will be signed out.'
                )}
              >
                <form className="account-form" onSubmit={changePassword}>
                  <label>
                    {t('当前密码', 'Current password')}
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {overview.user.twoFactorEnabled && (
                    <label>
                      {t('验证器验证码', 'Authenticator code')}
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    {t('新密码', 'New password')}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                    <PasswordMeter value={newPassword} context={[user.name, user.email]} />
                  </label>
                  <label>
                    {t('确认新密码', 'Confirm new password')}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                  <div className="account-actions">
                    <button className="account-action" disabled={pending}>
                      {t('修改密码', 'Change password')}
                    </button>
                  </div>
                </form>
              </Section>
              <Section
                title={t('两步验证', 'Two-step verification')}
                description={t(
                  '使用验证器生成动态验证码。每次密码登录都需要第二因素。',
                  'Use time-based authenticator codes. Every password login requires a second factor.'
                )}
              >
                <div className="account-binding-row">
                  <span className="account-badge" data-active={overview.user.twoFactorEnabled}>
                    {overview.user.twoFactorEnabled ? (
                      <>
                        <Check size={13} />
                        {t('已启用', 'Enabled')}
                      </>
                    ) : (
                      t('尚未启用', 'Not enabled')
                    )}
                  </span>
                  {overview.user.twoFactorEnabled ? (
                    <button
                      className="account-secondary"
                      disabled={pending}
                      onClick={() =>
                        secure(async (currentPassword) => {
                          identityResult(
                            await identityClient.twoFactor.disable({ password: currentPassword })
                          );
                        })
                      }
                    >
                      {t('关闭两步验证', 'Disable two-step verification')}
                    </button>
                  ) : (
                    <button
                      className="account-action"
                      disabled={pending || !!enrollment}
                      onClick={enableTotp}
                    >
                      <ShieldCheck size={16} />
                      {t('设置验证器', 'Set up authenticator')}
                    </button>
                  )}
                </div>
                {enrollment && (
                  <div className="account-enroll">
                    <div className="account-qr">
                      <QRCode
                        value={enrollment.totpURI}
                        size={150}
                        aria-label={t(
                          '验证器设置二维码，含私密密钥',
                          'Authenticator setup QR code containing a private secret'
                        )}
                      />
                      <p>
                        {t(
                          '在你自己的验证器中扫描二维码。不要公开二维码或分享密钥。输入有效验证码后才会启用。',
                          'Scan in your own authenticator. Keep this QR code and secret private. Verification is enabled only after a valid code.'
                        )}
                      </p>
                    </div>
                    <details>
                      <summary>
                        {t('无法扫描？查看手动设置密钥', 'Cannot scan? Show manual setup key')}
                      </summary>
                      <p style={{ overflowWrap: 'anywhere' }}>
                        <code>{new URL(enrollment.totpURI).searchParams.get('secret')}</code>
                      </p>
                    </details>
                    <form className="account-form" onSubmit={verifyEnrollment}>
                      <label>
                        {t('验证器中的6位验证码', '6-digit authenticator code')}
                        <input
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          value={enrollCode}
                          onChange={(event) => setEnrollCode(event.target.value)}
                        />
                      </label>
                      <button className="account-action" disabled={pending}>
                        {t('确认启用', 'Confirm and enable')}
                      </button>
                    </form>
                  </div>
                )}
                {overview.user.twoFactorEnabled && (
                  <button
                    className="account-link-button"
                    disabled={pending}
                    onClick={() =>
                      secure(async (currentPassword, current) => {
                        const data = identityResult(
                          await identityClient.twoFactor.generateBackupCodes({
                            password: currentPassword,
                          })
                        );
                        if (current()) setCodes(data.backupCodes);
                      })
                    }
                  >
                    {t('重新生成恢复码', 'Regenerate recovery codes')}
                  </button>
                )}
                {codes.length > 0 && (
                  <div className="account-enroll">
                    <strong>
                      {t('妥善保存一次性恢复码', 'Save your one-time recovery codes')}
                    </strong>
                    <p className="account-muted">
                      {t(
                        '每个码只能使用一次。重新生成后旧恢复码失效；这些码只在当前页面显示。',
                        'Each code works once. Regeneration invalidates old codes. These codes are shown only in this current page.'
                      )}
                    </p>
                    <div className="account-codes">
                      {codes.map((value) => (
                        <code key={value}>{value}</code>
                      ))}
                    </div>
                    <button
                      className="account-secondary"
                      onClick={() => {
                        setCodes([]);
                      }}
                    >
                      {t('已自行保存，隐藏恢复码', 'I saved them; hide codes')}
                    </button>
                  </div>
                )}
              </Section>
              <Section
                title={t('通行密钥', 'Passkeys')}
                description={t(
                  '用设备锁屏、生物识别或安全密钥登录。登记前需重新验证现有账号。',
                  'Log in with a device lock, biometrics or security key. Reauthenticate before registering.'
                )}
              >
                <div className="account-form">
                  <label>
                    {t('设备名称（可选）', 'Device name (optional)')}
                    <input
                      value={keyName}
                      maxLength={80}
                      onChange={(event) => setKeyName(event.target.value)}
                      placeholder={t('例如：我的笔记本', 'For example: My laptop')}
                    />
                  </label>
                  <div className="account-actions">
                    <button
                      className="account-action"
                      disabled={pending || !window.PublicKeyCredential}
                      onClick={() =>
                        secure(async () => {
                          identityResult(
                            await identityClient.passkey.addPasskey({
                              name: keyName.trim() || undefined,
                            })
                          );
                          setKeyName('');
                        })
                      }
                    >
                      <KeyRound size={16} />
                      {t('添加通行密钥', 'Add a passkey')}
                    </button>
                  </div>
                </div>
                {!window.PublicKeyCredential && (
                  <p className="account-muted">
                    {t(
                      '当前浏览器或连接不支持WebAuthn。',
                      'This browser or connection does not support WebAuthn.'
                    )}
                  </p>
                )}
                {keys.length ? (
                  <ul className="account-key-list">
                    {keys.map((key) => (
                      <li key={key.id}>
                        <KeyRound size={18} />
                        <div className="account-row-grow">
                          <strong>{key.name || t('通行密钥', 'Passkey')}</strong>
                          <small>
                            {key.createdAt ? date(key.createdAt, locale) : ''} ·{' '}
                            {key.backedUp
                              ? t('设备同步密钥', 'Synced credential')
                              : t('设备密钥', 'Device credential')}
                          </small>
                        </div>
                        <button
                          className="account-secondary"
                          disabled={pending}
                          aria-label={
                            t('删除通行密钥：', 'Delete passkey: ') + (key.name || key.id)
                          }
                          onClick={() =>
                            secure(async () => {
                              identityResult(
                                await identityClient.passkey.deletePasskey({ id: key.id })
                              );
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="account-empty">
                    {keysLoading
                      ? t('载入通行密钥…', 'Loading passkeys…')
                      : keysFailed
                        ? t('通行密钥列表暂未载入。', 'The passkey list could not load.')
                        : t('尚未登记通行密钥。', 'No passkeys registered.')}
                  </p>
                )}
                <p className="account-muted">
                  {t(
                    '通行密钥必须完成设备用户验证，可替代密码与验证码登录。',
                    'A passkey must complete device user verification and can replace password-and-code sign-in.'
                  )}
                </p>
              </Section>
              <Section
                title={t('设备会话', 'Device sessions')}
                description={t(
                  '查看已登录设备，可单独退出会话。',
                  'View logged-in devices and log out individual sessions.'
                )}
              >
                {sessionsLoading ? (
                  <p className="account-muted" role="status">
                    {t('载入设备会话…', 'Loading device sessions…')}
                  </p>
                ) : sessionsFailed ? (
                  <p className="account-empty">
                    {t('设备会话列表暂未载入。', 'The device session list could not load.')}
                  </p>
                ) : !sessions.length ? (
                  <p className="account-empty">
                    {t('没有可显示的设备会话。', 'No device sessions to display.')}
                  </p>
                ) : null}
                <ul className="account-session-list">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <Laptop size={18} />
                      <div className="account-row-grow">
                        <strong>
                          {session.current
                            ? t('当前会话', 'Current session')
                            : t('其他会话', 'Other session')}
                        </strong>
                        <small>
                          {deviceLabel(session.userAgent) || t('浏览器', 'Browser')}
                          <br />
                          {t('创建于', 'Created')} {date(session.createdAt, locale)} ·{' '}
                          {t('到期', 'Expires')} {date(session.expiresAt, locale)}
                        </small>
                        {session.userAgent && (
                          <details className="account-device-details">
                            <summary>{t('查看浏览器信息', 'Browser details')}</summary>
                            <p>
                              {t(
                                '由浏览器提供，不用于身份认证。',
                                'Provided by the browser; not an identity check.'
                              )}
                            </p>
                            <code>{session.userAgent}</code>
                          </details>
                        )}
                      </div>
                      <button
                        className="account-secondary"
                        disabled={pending}
                        onClick={() =>
                          confirm({
                            title: t('退出此会话？', 'Log out this session?'),
                            text: session.current
                              ? t('此操作会退出当前设备。', 'This logs out your current device.')
                              : t(
                                  '该设备下一次访问私人工作区时需要重新登录。',
                                  'The device will need to log in again before accessing the workspace.'
                                ),
                            action: async () => {
                              const scope = accountScope.current,
                                owner = user.id;
                              const current = () =>
                                scope === accountScope.current &&
                                owner === accountOwner.current &&
                                avatarAlive.current &&
                                location.pathname === '/account';
                              await post(`/account/sessions/${session.id}/revoke`, {});
                              if (session.current) {
                                if (owner === accountOwner.current) navigate('/');
                              } else if (current()) {
                                try {
                                  await load();
                                } catch {
                                  if (current()) setReloadFailed(true);
                                }
                              }
                            },
                          })
                        }
                      >
                        {t('退出此会话', 'Log out this session')}
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}
          {tab === 'data' && (
            <>
              <Section
                title={t('私人工作区', 'Private workspace')}
                description={t(
                  '数据按服务器会话识别的账号隔离。',
                  'Data is isolated by the account identified in your server session.'
                )}
              >
                <div className="account-notice">
                  <ShieldCheck size={18} />
                  <p>
                    {t(
                      '账号资料、身份验证密钥和核查事项中的私人输入不会发送到分析模型。公司研究与企业问答会自动使用 AI 分析取得的公开资料；详细说明见隐私政策。',
                      'Account details, authentication secrets and private review-item inputs are not sent to analysis models. Company research and company questions automatically use AI to analyze retrieved public information. See the privacy policy for details.'
                    )}
                  </p>
                </div>
                <p className="account-muted">
                  {t('注册于', 'Joined')} {date(overview.user.createdAt, locale)} ·{' '}
                  <a href="/docs/privacy">
                    {t('查看数据与来源边界', 'Read data and source boundaries')}
                  </a>
                </p>
              </Section>
              <Section
                title={t(...productTerms.clearMyWorkspace)}
                description={t(
                  '这是删除操作。账号、头像和登录因素会保留，工作区内容会清空。',
                  'This deletes workspace content. Your account, avatar and sign-in factors remain.'
                )}
              >
                <p className="account-muted">
                  {t(
                    '将删除本账号的核查事项及全部版本、研究记录、财报核查、跟进状态、上传材料和保留原件，不会影响其他账号。请先导出需要保留的报告和材料。',
                    'This removes your review items and all revisions, research records, financial reviews, follow-up states, uploaded materials and retained originals. Other accounts are unaffected. Export anything you need first.'
                  )}
                </p>
                <button
                  className="account-danger"
                  disabled={pending}
                  onClick={() =>
                    confirm({
                      title: t('清空你的全部工作区内容？', 'Clear all your workspace content?'),
                      text: t(
                        '上传原件与全部核查事项版本将被删除，此页面无法撤销。账号与安全设置保留。',
                        'Uploaded originals and all review-item revisions will be deleted. This page cannot undo the action. Account and security settings remain.'
                      ),
                      action: async () => {
                        await post('/reset', { confirm: 'RESET_DEMO' });
                        await refresh();
                      },
                    })
                  }
                >
                  <Trash2 size={16} />
                  {t(...productTerms.clearMyWorkspace)}
                </button>
              </Section>
            </>
          )}
        </div>
      )}
      {reauthAction && (
        <Dialog.Root
          open={true}
          onOpenChange={(open) => {
            if (!open && !pending) {
              setReauthAction(null);
              setReauthPassword('');
              setReauthCode('');
              setReauthFailure('');
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop className="account-modal-backdrop" />
            <Dialog.Popup className="account-modal" ref={dialogRef} finalFocus={returnFocus}>
              <Dialog.Title id="account-reauth-title">
                {t('确认是你本人', 'Confirm it is you')}
              </Dialog.Title>
              <Dialog.Description className="account-muted">
                {t(
                  '安全设置更改需要重新验证。验证码仅由你的验证器生成。',
                  'Reauthenticate before changing security settings. Codes come from your authenticator.'
                )}
              </Dialog.Description>
              <form className="account-form" onSubmit={reauth}>
                <label>
                  {t('当前密码', 'Current password')}
                  <input
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                    value={reauthPassword}
                    onChange={(event) => setReauthPassword(event.target.value)}
                  />
                </label>
                {overview?.user.twoFactorEnabled && (
                  <label>
                    {t('验证器验证码', 'Authenticator code')}
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={reauthCode}
                      onChange={(event) => setReauthCode(event.target.value)}
                    />
                  </label>
                )}
                {reauthFailure && (
                  <p className="account-error" role="alert">
                    {reauthFailure}
                  </p>
                )}
                <div className="account-actions">
                  <button
                    className="account-secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReauthAction(null);
                      setReauthPassword('');
                      setReauthCode('');
                      setReauthFailure('');
                      returnFocus.current?.focus();
                    }}
                  >
                    <X size={15} />
                    {t('取消', 'Cancel')}
                  </button>
                  <button className="account-action" disabled={pending}>
                    {pending ? (
                      <LoaderCircle className="spinner" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}{' '}
                    {t('验证并继续', 'Verify and continue')}
                  </button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
