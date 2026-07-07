import { describe, it, expect } from 'vitest';
import { FAQS, defaultAudiencia } from '../faqs';

describe('defaultAudiencia', () => {
  it('PROVIDER abre en proveedor', () => {
    expect(defaultAudiencia('PROVIDER')).toBe('proveedor');
  });

  it('CLIENT, ADMIN y usuario no cargado abren en cliente', () => {
    expect(defaultAudiencia('CLIENT')).toBe('cliente');
    expect(defaultAudiencia('ADMIN')).toBe('cliente');
    expect(defaultAudiencia(undefined)).toBe('cliente');
  });
});

describe('FAQS', () => {
  it('tiene 11 de cliente y 6 de proveedor (17 en total)', () => {
    expect(FAQS).toHaveLength(17);
    expect(FAQS.filter((f) => f.audiencia === 'cliente')).toHaveLength(11);
    expect(FAQS.filter((f) => f.audiencia === 'proveedor')).toHaveLength(6);
  });

  it('no tiene preguntas duplicadas', () => {
    const qs = FAQS.map((f) => f.q);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('no tiene campos vacíos', () => {
    for (const f of FAQS) {
      expect(f.q.trim()).not.toBe('');
      expect(f.a.trim()).not.toBe('');
    }
  });
});
