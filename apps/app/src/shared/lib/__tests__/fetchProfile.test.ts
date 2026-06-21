import { describe, it, expect, vi } from 'vitest';
import { fetchProfile, ProfileError } from '@/shared/lib/fetchProfile';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const API = 'http://test.local';

describe('fetchProfile', () => {
  it('200 → devuelve el body del backend', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { nombre: 'Ana', role: 'CLIENT' }));
    const data = await fetchProfile(API, 'tok', 5000, fetchMock as any);
    expect(data).toEqual({ nombre: 'Ana', role: 'CLIENT' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('401 → ProfileError kind=unauthorized', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, {}));
    const err = await fetchProfile(API, 'tok', 5000, fetchMock as any).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect(err.kind).toBe('unauthorized');
  });

  it('403 → ProfileError kind=unauthorized', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('404 → ProfileError kind=not-registered', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'not-registered',
    });
  });

  it('500 → ProfileError kind=server', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('backend colgado → aborta por timeout → ProfileError kind=timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    await expect(fetchProfile(API, 'tok', 20, fetchMock as any)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('error de red → ProfileError kind=server', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'server',
    });
  });
});
