import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Layers,
  LoaderCircle,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  LogOut,
  LockKeyhole,
} from 'lucide-react';
import type { AuthSession } from '../../shared/contracts';
import { api, post } from '../api';
import { date } from '../format';

import { useApp } from '../context';
import { PageHeading } from '../components';

export function AuthPage({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const { t, user, execute, navigate, busy } = useApp();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState('');
  const isRegister = mode === 'register';
  const destination =
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/login') &&
    !next.startsWith('/register')
      ? next
      : '/workspace';
  useEffect(() => {
    if (user) navigate(destination);
  }, [user, navigate, destination]);
  useEffect(() => {
    setValidation('');
    setPassword('');
    setConfirmation('');
  }, [mode]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation('');
    if (isRegister && password !== confirmation) {
      setValidation(t('两次输入的密码不一致。', 'The passwords do not match.'));
      return;
    }
    const result = await execute(() =>
      post<AuthSession>(
        `/auth/${mode}`,
        isRegister ? { email, password, name: name.trim() } : { email, password }
      )
    );
    if (result?.user) navigate(destination);
  };
  return (
    <section className="auth-layout">
      <div className="auth-story">
        <div className="eyebrow">YOUR EVIDENCE, YOUR WORKSPACE</div>
        <h1>
          {t('保存证据。', 'Save the evidence.')}
          <br />
          <span>{t('继续追问。', 'Keep asking.')}</span>
        </h1>
        <p>
          {t(
            '建立你的核查工作区。材料、历史底稿与后续问题，保存在你的账号里。',
            'Create your review workspace. Evidence, historical working papers, and follow-up questions are saved to your account.'
          )}
        </p>
        <div className="auth-story-points">
          <span>
            <ShieldCheck size={18} />
            {t('账号之间，工作区独立', 'Separate workspaces for each account')}
          </span>
          <span>
            <Layers size={18} />
            {t('真实材料快照与持久保存', 'Real evidence snapshots and persistence')}
          </span>
          <span>
            <SlidersHorizontal size={18} />
            {t('重算、比较、导出，完整闭环', 'Recompute, compare, and export')}
          </span>
        </div>
        <a className="text-link" href="#/">
          {t('返回首页，查看公开案例', 'View a public case on the homepage')}
          <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="auth-form-panel">
        <div className="eyebrow">{isRegister ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</div>
        <h2>
          {isRegister ? t('创建账号', 'Create your account') : t('登录照见', 'Log in to CashLens')}
        </h2>
        <p>
          {isRegister
            ? t(
                '创建后即可使用完整核查功能。',
                'Your account gives you the complete review workflow.'
              )
            : t(
                '打开保存的核查，继续上次工作。',
                'Open your saved reviews and continue your work.'
              )}
        </p>
        <form onSubmit={submit}>
          {isRegister && (
            <label className="form-field">
              <span>{t('姓名 / 昵称', 'Name')}</span>
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('你希望我们如何称呼你', 'How should we address you?')}
              />
            </label>
          )}
          <label className="form-field">
            <span>{t('邮箱', 'Email')}</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="form-field">
            <span>{t('密码', 'Password')}</span>
            <input
              type="password"
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {isRegister && (
              <small>
                {t(
                  '至少 10 个字符，建议使用独立密码。',
                  'At least 10 characters. Use a unique password.'
                )}
              </small>
            )}
          </label>
          {isRegister && (
            <label className="form-field">
              <span>{t('确认密码', 'Confirm password')}</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          {validation && (
            <p className="inline-error" role="alert">
              <CircleAlert size={16} />
              {validation}
            </p>
          )}
          <button
            className="button button-primary button-large auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? <LoaderCircle size={18} className="spinner" /> : <ArrowRight size={18} />}{' '}
            {isRegister
              ? t('创建账号并进入工作区', 'Create account and open workspace')
              : t('登录并继续', 'Log in and continue')}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister
            ? t('已经有账号？', 'Already have an account?')
            : t('第一次使用照见？', 'New to CashLens?')}{' '}
          <a
            href={`#/${isRegister ? 'login' : 'register'}?next=${encodeURIComponent(destination)}`}
          >
            {isRegister ? t('登录', 'Log in') : t('创建账号', 'Create an account')}
          </a>
        </p>
        <div className="auth-footnote">
          <LockKeyhole size={15} />
          <span>
            {t(
              '账号保留你的材料和历史核查；邮箱是登录标识，尚无邮件找回，请妥善保存独立密码。',
              'Your account keeps materials and review history. Email is your login identifier; email-based recovery is not yet available. Keep a unique password safe.'
            )}
            {isRegister && (
              <a className="privacy-link" href="#/method?section=privacy">
                {t('了解数据保存与模型使用', 'Learn about data storage and model use')}
                <ArrowUpRight size={12} />
              </a>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

export function AccountPage() {
  const { t, locale, user, execute, busy, navigate } = useApp();
  const [name, setName] = useState(user!.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState('');
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    await execute(
      () =>
        api<AuthSession>('/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim() }),
        }),
      t('账号资料已保存', 'Profile saved')
    );
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setValidation('');
    if (newPassword !== confirmation) {
      setValidation(t('两次输入的新密码不一致。', 'The new passwords do not match.'));
      return;
    }
    const result = await execute(
      () => post('/auth/password', { currentPassword, newPassword }),
      t('密码已更新', 'Password updated')
    );
    if (result) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    }
  };
  const logout = async () => {
    const result = await execute(() => post('/auth/logout', {}));
    if (result) navigate('/');
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title={t('账号与工作区', 'Account and workspace')}
        description={t(
          '资料修改、密码和会话都通过真实服务保存。',
          'Profile, password, and session changes are saved by the server.'
        )}
        action={
          <button className="button button-secondary" onClick={logout} disabled={busy}>
            <LogOut size={16} />
            {t('退出登录', 'Log out')}
          </button>
        }
      />
      <div className="account-layout">
        <aside className="account-summary">
          <div className="account-avatar">
            <UserRound size={34} />
          </div>
          <h2>{user!.name}</h2>
          <p>{user!.email}</p>
          <span>
            {t('注册时间', 'Registered')} {date(user!.createdAt, locale)}
          </span>
          <div className="info-strip">
            <ShieldCheck size={18} />
            <p>
              {t(
                '此账号的材料与核查，与其他账号分开保存。',
                'Evidence and reviews in this account are stored separately from other accounts.'
              )}
            </p>
          </div>
        </aside>
        <div className="account-forms">
          <form onSubmit={saveProfile} className="form-section">
            <div className="form-section-heading">
              <UserRound size={20} />
              <h2>{t('账号资料', 'Profile')}</h2>
            </div>
            <label className="form-field">
              <span>{t('姓名 / 昵称', 'Name')}</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="form-field">
              <span>{t('邮箱（账号标识）', 'Email (account identifier)')}</span>
              <input value={user!.email} disabled />
            </label>
            <button className="button button-primary" disabled={busy} type="submit">
              <Check size={16} />
              {t('保存资料', 'Save profile')}
            </button>
          </form>
          <form onSubmit={savePassword} className="form-section">
            <div className="form-section-heading">
              <LockKeyhole size={20} />
              <h2>{t('修改密码', 'Change password')}</h2>
            </div>
            <label className="form-field">
              <span>{t('当前密码', 'Current password')}</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="form-field">
                <span>{t('新密码', 'New password')}</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>{t('确认新密码', 'Confirm new password')}</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
            </div>
            <p className="field-note">
              {t(
                '至少 10 个字符。本版本无邮件找回服务。',
                'At least 10 characters. Email-based recovery is not available.'
              )}
            </p>
            {validation && (
              <p className="inline-error" role="alert">
                {validation}
              </p>
            )}
            <button className="button button-primary" disabled={busy} type="submit">
              <Check size={16} />
              {t('更新密码', 'Update password')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
