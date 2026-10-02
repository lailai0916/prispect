import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { RequestError } from './api';

export const identityClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/identity',
  plugins: [twoFactorClient(), passkeyClient()],
});
export function identityResult<T>(result: {
  data: T | null;
  error: { message?: string; code?: string } | null;
}): T {
  if (result.error)
    throw new RequestError(
      result.error.message || '认证请求未完成',
      result.error.code || 'AUTH_FAILED'
    );
  if (!result.data) throw new RequestError('认证请求未返回结果', 'AUTH_FAILED');
  return result.data;
}
