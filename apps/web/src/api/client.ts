export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let _token: string | null = localStorage.getItem('px_token');
let _refresh: string | null = localStorage.getItem('px_refresh');

export function setTokens(access: string, refresh: string) {
  _token = access;
  _refresh = refresh;
  localStorage.setItem('px_token', access);
  localStorage.setItem('px_refresh', refresh);
}

export function clearTokens() {
  _token = null;
  _refresh = null;
  localStorage.removeItem('px_token');
  localStorage.removeItem('px_refresh');
  localStorage.removeItem('px_user');
}

export function getToken() {
  return _token;
}

async function tryRefresh(): Promise<string | null> {
  if (!_refresh) return null;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refresh }),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    _token = data.accessToken;
    localStorage.setItem('px_token', data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function handleRes<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? 'unknown', body.error?.message ?? 'Something went wrong');
  }
  return body.data as T;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  let res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (!newToken) {
      clearTokens();
      window.location.href = '/login';
      throw new ApiError(401, 'session_expired', 'Please log in again');
    }
    headers.Authorization = `Bearer ${newToken}`;
    res = await fetch(`/api${path}`, { ...init, headers });
  }

  return handleRes<T>(res);
}
