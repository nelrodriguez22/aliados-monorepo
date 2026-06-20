import { describe, it, expect } from 'vitest';
import {
  resolveLevel,
  readBypassFlag,
  getMaintenanceView,
  formatBannerText,
  BYPASS_KEY,
} from '@/shared/lib/maintenance';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    _map: m,
  };
}

describe('resolveLevel', () => {
  it('acepta los 3 niveles válidos', () => {
    expect(resolveLevel('off')).toBe('off');
    expect(resolveLevel('warning')).toBe('warning');
    expect(resolveLevel('blocked')).toBe('blocked');
  });
  it("cae a 'off' ante valor desconocido, vacío o undefined", () => {
    expect(resolveLevel('xxx')).toBe('off');
    expect(resolveLevel('')).toBe('off');
    expect(resolveLevel(undefined)).toBe('off');
  });
  it('es case-insensitive y tolera espacios', () => {
    expect(resolveLevel(' BLOCKED ')).toBe('blocked');
  });
});

describe('readBypassFlag', () => {
  it('activa y persiste el bypass cuando la URL tiene nomaint=1', () => {
    const s = fakeStorage();
    expect(readBypassFlag('?nomaint=1', s)).toBe(true);
    expect(s.getItem(BYPASS_KEY)).toBe('1');
  });
  it('respeta el flag ya persistido aunque la URL no lo traiga', () => {
    const s = fakeStorage({ [BYPASS_KEY]: '1' });
    expect(readBypassFlag('', s)).toBe(true);
  });
  it('es false sin URL ni flag previo', () => {
    expect(readBypassFlag('', fakeStorage())).toBe(false);
  });
});

describe('getMaintenanceView', () => {
  it('off → app', () => expect(getMaintenanceView('off', false)).toBe('app'));
  it('warning → banner', () =>
    expect(getMaintenanceView('warning', false)).toBe('banner'));
  it('blocked sin bypass → block', () =>
    expect(getMaintenanceView('blocked', false)).toBe('block'));
  it('blocked con bypass → app', () =>
    expect(getMaintenanceView('blocked', true)).toBe('app'));
});

describe('formatBannerText', () => {
  it('hora y duración en líneas separadas + disculpa al final', () => {
    expect(formatBannerText('22:00 hs', '30 minutos')).toBe(
      'Vamos a tener una actualización programada para las 22:00 hs. El tiempo estimado del mantenimiento es de 30 minutos. Perdón por las molestias.',
    );
  });
  it('solo hora', () => {
    expect(formatBannerText('22:00 hs', '')).toBe(
      'Vamos a tener una actualización programada para las 22:00 hs. Perdón por las molestias.',
    );
  });
  it('solo duración', () => {
    expect(formatBannerText('', '30 minutos')).toBe(
      'El tiempo estimado del mantenimiento es de 30 minutos. Perdón por las molestias.',
    );
  });
  it('sin datos → fallback genérico + disculpa', () => {
    expect(formatBannerText('', '  ')).toBe(
      'Vamos a actualizar la app pronto, puede haber interrupciones. Perdón por las molestias.',
    );
  });
});
