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
      <div className="auth-form-panel">
        <h1>{isRegister ? t('创建账号', 'Create account') : t('登录', 'Log in')}</h1>
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
                placeholder={t('姓名或昵称', 'Name or nickname')}
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
            {isRegister && <small>{t('至少 10 个字符。', 'At least 10 characters.')}</small>}
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
            {isRegister ? t('创建账号', 'Create account') : t('登录', 'Log in')}
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
              '邮箱用于登录；目前不支持邮件找回。',
              'Email is used to log in. Email recovery is not available.'
            )}
            {isRegister && (
              <a className="privacy-link" href="#/method?section=privacy">
                {t('数据与隐私', 'Data and privacy')}
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
        title={t('账号', 'Account')}
        action={
          <button className="button button-secondary" onClick={logout} disabled={busy}>
            <LogOut size={16} />
            {t('退出登录', 'Log out')}
          </button>
        }
      />
      <div className="account-layout">
        <aside className="account-summary">
          <h2>{user!.name}</h2>
          <p>{user!.email}</p>
          <span>
            {t('注册时间', 'Registered')} {date(user!.createdAt, locale)}
          </span>
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
              <span>{t('邮箱（不可修改）', 'Email (cannot be changed)')}</span>
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
            <p className="field-note">{t('至少 10 个字符。', 'At least 10 characters.')}</p>
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
