import type { AccountUser, AuthSession } from './contracts';

export interface AccountProfile extends AccountUser {
  image: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  twoFactorEnabled: boolean;
  bio: string;
  company: string;
  timezone: string;
}
export interface AccountCapabilities {
  email: { configured: boolean; reason: 'not-configured' | null };
  sms: { configured: boolean; reason: 'not-configured' | null };
  totp: true;
  passkey: true;
}
export interface AccountOverview {
  user: AccountProfile;
  capabilities: AccountCapabilities;
  freshAuthUntil: string | null;
  authSchema: 2;
}
export interface AccountProfileInput {
  name: string;
  phoneNumber?: string | null;
  bio?: string;
  company?: string;
  timezone?: string;
}
export interface AccountReAuthInput {
  password: string;
  code?: string;
}
export interface LoginResult extends AuthSession {
  twoFactorRequired?: true;
  methods?: ('totp' | 'backup-code')[];
}
export interface AccountSessionSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  userAgent: string | null;
}
export interface AccountPasskeySummary {
  id: string;
  name: string | null;
  createdAt: string | null;
  deviceType: string;
  backedUp: boolean;
}
