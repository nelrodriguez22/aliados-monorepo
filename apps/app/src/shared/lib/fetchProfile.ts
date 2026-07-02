export type ProfileErrorKind = 'unauthorized' | 'not-registered' | 'timeout' | 'server';

export class ProfileError extends Error {
  kind: ProfileErrorKind;
  constructor(kind: ProfileErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = 'ProfileError';
  }
}

// Trae el perfil del backend con timeout. Función pura/testeable: no toca Firebase
// ni el store, solo hace el fetch y clasifica el resultado.
export async function fetchProfile(
  apiUrl: string,
  token: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) throw new ProfileError('unauthorized');
    // 404 defensivo/legacy: el backend ahora responde 200 { registered:false } para
    // usuarios autenticados aún no registrados (evita el 404 en la consola del navegador).
    if (res.status === 404) throw new ProfileError('not-registered');
    if (!res.ok) throw new ProfileError('server', `Server error: ${res.status}`);

    const data = await res.json();
    if (data && data.registered === false) throw new ProfileError('not-registered');
    return data;
  } catch (err) {
    if (err instanceof ProfileError) throw err;
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
      throw new ProfileError('timeout');
    }
    throw new ProfileError('server', 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
