// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyAnalyticsConsent, GA_DISABLE_KEY } from '../gtag';

describe('applyAnalyticsConsent', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>)[GA_DISABLE_KEY];
    // Limpiar cookies _ga entre tests.
    document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = '_ga_C69HGKX2XV=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('revocado: activa la flag ga-disable → GA deja de trackear en caliente', () => {
    applyAnalyticsConsent(false);
    expect((window as unknown as Record<string, unknown>)[GA_DISABLE_KEY]).toBe(true);
  });

  it('consentido: baja la flag ga-disable', () => {
    (window as unknown as Record<string, unknown>)[GA_DISABLE_KEY] = true;
    applyAnalyticsConsent(true);
    expect((window as unknown as Record<string, unknown>)[GA_DISABLE_KEY]).toBe(false);
  });

  it('revocado: borra las cookies _ga existentes', () => {
    document.cookie = '_ga=GA1.1.123.456; path=/';
    document.cookie = '_ga_C69HGKX2XV=GS1.1.abc; path=/';

    applyAnalyticsConsent(false);

    expect(document.cookie).not.toContain('_ga=GA1');
    expect(document.cookie).not.toContain('_ga_C69HGKX2XV=GS1');
  });
});
