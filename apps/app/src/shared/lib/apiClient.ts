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

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

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
