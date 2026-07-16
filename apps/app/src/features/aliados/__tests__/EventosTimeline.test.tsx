// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventosTimeline } from '../EventosTimeline';
import { apiClient } from '@/shared/lib/apiClient';

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

const getMock = vi.mocked(apiClient.get);

// Wrapper con retry apagado: sin esto, el caso de error reintenta y el test
// se cuelga esperando un estado que nunca llega dentro del timeout.
function renderTimeline(tipo: 'TRABAJO' | 'MUDANZA', id: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventosTimeline tipo={tipo} id={id} />
    </QueryClientProvider>,
  );
}

const evento = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tipo: 'CAMBIO_ESTADO',
  valorAnterior: 'PENDIENTE',
  valorNuevo: 'PROPUESTO',
  actorTipo: 'PROVEEDOR',
  actorNombre: 'Carlos',
  detalle: null,
  createdAt: '2026-07-16T10:09:45',
  ...over,
});

describe('EventosTimeline', () => {
  beforeEach(() => getMock.mockReset());
  afterEach(() => cleanup());

  it('pega al endpoint de trabajos para tipo TRABAJO', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('TRABAJO', 123);
    await screen.findByText(/Carlos/);
    expect(getMock).toHaveBeenCalledWith('/api/admin/trabajos/123/eventos');
  });

  it('pega al endpoint de mudanzas para tipo MUDANZA', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('MUDANZA', 45);
    await screen.findByText(/Carlos/);
    expect(getMock).toHaveBeenCalledWith('/api/admin/mudanzas/45/eventos');
  });

  it('muestra actor con nombre y la transición anterior → nuevo', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('Carlos (proveedor)')).not.toBeNull();
    expect(screen.getByText('PENDIENTE')).not.toBeNull();
    expect(screen.getByText('PROPUESTO')).not.toBeNull();
  });

  it('actor SISTEMA se muestra como "Sistema"', async () => {
    getMock.mockResolvedValue([
      evento({ actorTipo: 'SISTEMA', actorNombre: null, valorAnterior: 'EN_COLA', valorNuevo: 'EN_CURSO' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('Sistema')).not.toBeNull();
  });

  it('nacimiento (valorAnterior null) muestra un solo chip', async () => {
    getMock.mockResolvedValue([evento({ valorAnterior: null, valorNuevo: 'PENDIENTE' })]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('PENDIENTE')).not.toBeNull();
    // Sin flecha: no hay transición, solo el estado inicial.
    expect(screen.queryByText('→')).toBeNull();
  });

  it('eventos de pago llevan el badge PAGO', async () => {
    getMock.mockResolvedValue([
      evento({ tipo: 'CAMBIO_ESTADO_PAGO', valorAnterior: 'PENDIENTE_PAGO', valorNuevo: 'PAGADO' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('PAGO')).not.toBeNull();
  });

  it('muestra el detalle cuando existe', async () => {
    getMock.mockResolvedValue([
      evento({ valorNuevo: 'CANCELADO', actorTipo: 'CLIENTE', actorNombre: 'Ana', detalle: 'me arrepentí' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('me arrepentí')).not.toBeNull();
  });

  it('timeline vacío muestra el mensaje de sin historial', async () => {
    getMock.mockResolvedValue([]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText(/Sin historial/)).not.toBeNull();
  });

  it('error de fetch muestra ErrorState', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText(/No se pudo cargar el historial/)).not.toBeNull();
  });
});
