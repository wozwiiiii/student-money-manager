/**
 * 云同步 API 客户端（阶段 8）。
 * 开发与部署均走同源相对路径 /api（vite dev 代理到本地 FastAPI；生产为同域反代 [TBD-19]），
 * 由浏览器网络层自动携带同源策略——数据仅上传至本应用服务端（08 §4.1）。
 */
import type { SyncRecordView } from './sync';

const BASE = '/api';

export class SyncApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!resp.ok) {
    let detail = '请求失败，请稍后重试';
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      // 保持默认文案
    }
    throw new SyncApiError(detail, resp.status);
  }
  return (await resp.json()) as T;
}

export interface AuthResult {
  token: string;
  identifier: string;
}

export const syncApi = {
  register: (identifier: string, password: string): Promise<AuthResult> =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  login: (identifier: string, password: string): Promise<AuthResult> =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  logout: (token: string): Promise<{ ok: boolean }> =>
    request('/auth/logout', { method: 'POST' }, token),
  /** 注销（08 §9.4）：删除账号与云端数据副本 */
  deleteAccount: (token: string): Promise<{ ok: boolean }> =>
    request('/auth/me', { method: 'DELETE' }, token),
  pull: (token: string): Promise<{ records: SyncRecordView[] }> => request('/sync/pull', {}, token),
  push: (token: string, records: SyncRecordView[]): Promise<{ applied: number; skipped: number }> =>
    request('/sync/push', { method: 'POST', body: JSON.stringify({ records }) }, token),
};
