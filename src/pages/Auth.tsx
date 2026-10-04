import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import type { LoginResult } from '../../shared/account-contracts';
import { post } from '../api';
import { useApp } from '../context';
import { documentTitles } from '../content/document-navigation';
import { identityClient, identityResult } from '../auth-client';
import { loginDestination, ROUTE_CHANGE_EVENT } from '../routing';
import '../account.css';
export { AccountPage } from './Account';

export function PasswordMeter({ value, context = [] }: { value: string; context?: string[] }) {
  const { t } = useApp();
  const [score, setScore] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const contextKey = JSON.stringify(context);
  useEffect(() => {
    let active = true;
    setScore(null);
    setUnavailable(false);
    if (value)
      void import('../../shared/password-strength')
        .then(({ passwordStrength }) => {
          if (active) setScore(passwordStrength(value, JSON.parse(contextKey) as string[]));
        })
        .catch(() => {
          if (active) setUnavailable(true);
        });
    return () => {
      active = false;
    };
  }, [value, contextKey]);
  const level = score === null ? 0 : score <= 1 ? 1 : score === 2 ? 2 : 3;
  const labels = [t('较弱', 'Weak'), t('中等', 'Medium'), t('较强', 'Strong')];
  return (
    <div className="account-password-meter" aria-live="polite">
      <div className="account-meter-bars" data-level={level} aria-hidden="true">
        {[1, 2, 3].map((segment) => (
          <i key={segment} data-active={segment <= level} />
        ))}
      </div>
      {value && (
        <span>
          {score === null
            ? unavailable
              ? t('强度检查未载入，请重试。', 'The strength check did not load. Retry.')
              : t('正在载入本地密码强度检查…', 'Loading the local strength check…')
            : labels[level - 1]}
        </span>
      )}
    </div>
  );
}
export function AuthPage({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const { t, user, registrationEnabled, execute, navigate, busy, refresh } = useApp();
  const [email, setEmail] = useState(''),
    [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false),
    [challenge, setChallenge] = useState(false),
    [backup, setBackup] = useState(false),
    [code, setCode] = useState(''),
    [validation, setValidation] = useState(''),
    [forgot, setForgot] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const submitLock = useRef(false);
  const submitScope = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const pending = busy || submitting;
  const submitOnce = async (action: (current: () => boolean) => Promise<void>) => {
    if (busy || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    const scope = submitScope.current,
      route = location.pathname + location.search + location.hash;
    const current = () =>
      scope === submitScope.current &&
      route === location.pathname + location.search + location.hash;
    try {
      await action(current);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const register = mode === 'register' && registrationEnabled;
  const destination = loginDestination(next, location.origin);
  useEffect(() => {
    const invalidate = () => {
      submitScope.current++;
    };
    window.addEventListener('popstate', invalidate);
    window.addEventListener('hashchange', invalidate);
    window.addEventListener(ROUTE_CHANGE_EVENT, invalidate);
    return () => {
      invalidate();
      window.removeEventListener('popstate', invalidate);
      window.removeEventListener('hashchange', invalidate);
      window.removeEventListener(ROUTE_CHANGE_EVENT, invalidate);
    };
  }, []);
  useEffect(() => {
    if (user && !user.isGuest) navigate(destination);
  }, [user, navigate, destination]);
  useEffect(() => {
    submitScope.current++;
    setPassword('');
    setConfirmation('');
    setVisible(false);
    setCapsLock(false);
    setChallenge(false);
    setBackup(false);
    setCode('');
    setValidation('');
    setForgot(false);
  }, [mode, register]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async (current) => {
      setValidation('');
      if (register && !name.trim()) {
        setValidation(t('请填写姓名或昵称。', 'Enter your name.'));
        return;
      }
      if (register && password !== confirmation) {
        setValidation(t('两次输入的密码不一致。', 'The passwords do not match.'));
        return;
      }
      let passwordIsWeak = false;
      if (register) {
        try {
          passwordIsWeak = !(await import('../../shared/password-strength')).validNewPassword(
            password,
            [email, name]
          );
        } catch {
          if (current())
            setValidation(
              t('密码强度检查未载入，请重试。', 'The password strength check did not load. Retry.')
            );
          return;
        }
      }
      if (!current()) return;
      if (passwordIsWeak) {
        setValidation(
          t(
            '请使用至少8字符且不易猜测的密码。',
            'Choose a hard-to-guess password with at least 8 characters.'
          )
        );
        return;
      }
      const result = await execute(() =>
        post<LoginResult>(
          `/auth/${register ? 'register' : 'login'}`,
          register ? { email, password, name: name.trim() } : { email, password }
        )
      );
      if (!current()) return;
      if (result?.twoFactorRequired) {
        setPassword('');
        setChallenge(true);
        setCode('');
      } else if (result?.user) navigate(destination);
    });
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    await submitOnce(async (current) => {
      const result = await execute(async () => {
        const response = backup
          ? await identityClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
          : await identityClient.twoFactor.verifyTotp({ code, trustDevice: false });
        identityResult(response);
        await refresh();
        return true;
      });
      if (result && current()) navigate(destination);
    });
  };
  const passkeyLogin = async () => {
    await submitOnce(async (current) => {
      const result = await execute(async () => {
        identityResult(await identityClient.signIn.passkey());
        await refresh();
        return true;
      });
      if (result && current()) navigate(destination);
    });
  };
  return (
    <section className="account-auth-shell">
      <div className="account-auth-card">
        <a className="account-back-link" href="/">
          <ArrowLeft size={16} />
          {t('回到首页', 'Back home')}
        </a>
        <div className="account-auth-symbol" aria-hidden="true">
          {challenge ? <ShieldCheck /> : <KeyRound />}
        </div>
        <h1>
          {challenge
            ? t('完成两步验证', 'Two-step verification')
            : forgot
              ? t('找回密码', 'Reset your password')
              : register
                ? t('创建你的账号', 'Create your account')
                : t('欢迎回来', 'Welcome back')}
        </h1>
        <p className="account-muted">
          {challenge
            ? t(
                '输入验证器中的6位验证码，或使用一次性恢复码。',
                'Enter a 6-digit authenticator code or a one-time recovery code.'
              )
            : t(
                '你的材料与核查事项保存在独立的私人工作区。',
                'Your materials and review items stay in your private workspace.'
              )}
        </p>
        {challenge ? (
          <form onSubmit={verify} className="account-form">
            <label>
              {backup ? t('恢复码', 'Recovery code') : t('验证码', 'Authenticator code')}
              <input
                name="code"
                autoFocus
                autoComplete={backup ? 'off' : 'one-time-code'}
                inputMode={backup ? 'text' : 'numeric'}
                pattern={backup ? undefined : '[0-9]{6}'}
                maxLength={backup ? 30 : 6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
              />
            </label>
            <button className="account-action" disabled={pending}>
              {pending ? <LoaderCircle className="spinner" size={17} /> : <ArrowRight size={17} />}{' '}
              {t('验证并登录', 'Verify and log in')}
            </button>
            <button
              className="account-link-button"
              type="button"
              disabled={pending}
              onClick={() => {
                setBackup(!backup);
                setCode('');
              }}
            >
              {backup
                ? t('使用验证器验证码', 'Use authenticator code')
                : t('改用一次性恢复码', 'Use a recovery code')}
            </button>
            <button
              className="account-link-button"
              type="button"
              disabled={pending}
              onClick={() => {
                setChallenge(false);
                setCode('');
              }}
            >
              {t('返回登录', 'Back to login')}
            </button>
          </form>
        ) : forgot ? (
          <div className="account-form">
            <div className="account-notice">
              <ShieldCheck size={18} />
              <p>
                {t(
                  '密码找回暂不可用。当前无法发送密码重置邮件。请保留已登录的设备；两步验证恢复码不能重置密码。',
                  'Password recovery is temporarily unavailable. We cannot currently send a password reset email. Keep any signed-in device. Two-step recovery codes cannot reset your password.'
                )}
              </p>
            </div>
            <button className="account-secondary" onClick={() => setForgot(false)}>
              {t('返回登录', 'Back to login')}
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="account-form">
              {register && (
                <label>
                  {t('姓名 / 昵称', 'Name')}
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={80}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('希望如何称呼你', 'Your preferred name')}
                  />
                </label>
              )}
              <label>
                {t('邮箱', 'Email')}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                {t('密码', 'Password')}
                <span className="account-password-input">
                  <input
                    type={visible ? 'text' : 'password'}
                    name="password"
                    autoComplete={register ? 'new-password' : 'current-password'}
                    minLength={register ? 8 : 1}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                    onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLock(false)}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-pressed={visible}
                    aria-label={
                      visible ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')
                    }
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                {capsLock && (
                  <small className="caps-lock-note" role="status">
                    {t('大写锁定已开启', 'Caps Lock is on')}
                  </small>
                )}
                {register && <PasswordMeter value={password} context={[email, name]} />}
              </label>
              {register && (
                <label>
                  {t('确认密码', 'Confirm password')}
                  <input
                    type="password"
                    name="confirmation"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              )}
              {validation && (
                <p className="account-error" role="alert">
                  {validation}
                </p>
              )}
              <button className="account-action" type="submit" disabled={pending}>
                {pending ? (
                  <LoaderCircle size={18} className="spinner" />
                ) : (
                  <ArrowRight size={18} />
                )}{' '}
                {register ? t('创建账号', 'Create account') : t('登录', 'Log in')}
              </button>
            </form>
            {!register && (
              <>
                <div className="account-divider">
                  <span>{t('或者', 'or')}</span>
                </div>
                <button
                  className="account-secondary account-full"
                  onClick={passkeyLogin}
                  disabled={pending || !window.PublicKeyCredential}
                >
                  <KeyRound size={17} />
                  {t('使用通行密钥', 'Use a passkey')}
                </button>
                <button
                  className="account-link-button account-full"
                  disabled={pending}
                  onClick={() => setForgot(true)}
                >
                  {t('忘记密码？', 'Forgot password?')}
                </button>
              </>
            )}
            {(register || registrationEnabled) && (
              <p className="account-auth-switch">
                {register
                  ? t('已有账号？', 'Already have an account?')
                  : t('第一次使用析光？', 'New to Prispect?')}{' '}
                <a
                  href={`/${register ? 'login' : 'register'}?next=${encodeURIComponent(destination)}`}
                >
                  {register ? t('登录', 'Log in') : t('创建账号', 'Create account')}
                </a>
              </p>
            )}
            <p className="account-auth-fineprint">
              <span>{t('继续即表示接受', 'By continuing, you accept the')} </span>
              <a
                href="/docs/terms"
                target="_blank"
                rel="noreferrer"
                aria-label={`${t(...documentTitles['/docs/terms'])}${t('（新标签页）', ' (new tab)')}`}
              >
                {t(...documentTitles['/docs/terms'])}
              </a>
              <span>{t('，并已阅读', ' and have read the')} </span>
              <a
                href="/docs/privacy"
                target="_blank"
                rel="noreferrer"
                aria-label={`${t(...documentTitles['/docs/privacy'])}${t('（新标签页）', ' (new tab)')}`}
              >
                {t(...documentTitles['/docs/privacy'])}
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
