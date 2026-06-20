import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Evita importar firebase (getToken) en el test.
vi.mock('@/shared/lib/getToken', () => ({ getToken: vi.fn(async () => 'tok') }));

import { apiClient } from '@/shared/lib/apiClient';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiClient retry', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('reintenta un GET ante 502 y devuelve el 200 siguiente', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: 'bad gateway' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.get('/cosa', false);

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reintenta un GET ante error de red y luego resuelve', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.get('/x', false);

    expect(res).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta un POST ante 502 (evita doble escritura)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/x', { a: 1 }, false)).rejects.toMatchObject({
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no reintenta indefinidamente: GET que siempre da 503 falla tras 3 intentos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { error: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/x', false)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 reintentos
  });
});
