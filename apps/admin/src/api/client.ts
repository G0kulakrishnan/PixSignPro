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

let _token: string | null = localStorage.getItem('pxa_token');

export function setToken(access: string) {
  _token = access;
  localStorage.setItem('pxa_token', access);
}

export function clearToken() {
  _token = null;
  localStorage.removeItem('pxa_token');
  localStorage.removeItem('pxa_user');
}

export function getToken() {
  return _token;
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

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin/login';
    throw new ApiError(401, 'session_expired', 'Please log in again');
  }

  return handleRes<T>(res);
}
