import { getToken } from '@/shared/lib/getToken';

const API_URL = import.meta.env.VITE_API_URL;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [300, 800];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isIdempotent = (method?: string) =>
  !method || method.toUpperCase() === 'GET';

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (auth) {
    const token = await getToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const method = (options.method || 'GET').toString();
  let attempt = 0;

  // Reintenta solo GET (idempotente) ante 5xx transitorio o error de red.
  while (true) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    } catch (err) {
      if (isIdempotent(method) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
        attempt++;
        continue;
      }
      throw err;
    }

    if (
      !response.ok &&
      RETRY_STATUSES.has(response.status) &&
      isIdempotent(method) &&
      attempt < MAX_RETRIES
    ) {
      await sleep(RETRY_BACKOFF_MS[attempt]);
      attempt++;
      continue;
    }

    if (!response.ok) {
      let message: string;
      try {
        const errorData = await response.json();
        message = errorData.message || errorData.error || response.statusText;
      } catch {
        message = await response.text().catch(() => response.statusText);
      }
      throw new ApiError(message, response.status);
    }

    // Handle empty responses (204, etc.)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {} as T;
    }
    return response.json();
  }
}

export const apiClient = {
  get: <T = any>(endpoint: string, auth = true) =>
    request<T>(endpoint, { method: 'GET' }, auth),

  post: <T = any>(endpoint: string, body?: any, auth = true) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }, auth),

  patch: <T = any>(endpoint: string, body?: any, auth = true) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }, auth),

  put: <T = any>(endpoint: string, body?: any, auth = true) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }, auth),

  delete: <T = any>(endpoint: string, auth = true) =>
    request<T>(endpoint, { method: 'DELETE' }, auth),
};

export { ApiError };
