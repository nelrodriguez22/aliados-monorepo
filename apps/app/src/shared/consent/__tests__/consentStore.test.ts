// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONSENT_KEY,
  readConsent,
  writeConsent,
  clearConsent,
  hasDecision,
  shouldLoadAnalytics,
} from '../consentStore';

describe('consentStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin decisión guardada: no hay decisión y GA no debe cargar', () => {
    expect(hasDecision()).toBe(false);
    expect(shouldLoadAnalytics()).toBe(false);
    expect(readConsent()).toBeNull();
  });

  it('aceptar analíticas: se persiste y GA debe cargar', () => {
    writeConsent({ analytics: true });

    expect(hasDecision()).toBe(true);
    expect(shouldLoadAnalytics()).toBe(true);
    expect(readConsent()?.analytics).toBe(true);
  });

  it('rechazar analíticas: hay decisión pero GA no debe cargar', () => {
    writeConsent({ analytics: false });

    expect(hasDecision()).toBe(true);
    expect(shouldLoadAnalytics()).toBe(false);
  });

  it('writeConsent sella un timestamp numérico', () => {
    writeConsent({ analytics: true });

    expect(typeof readConsent()?.ts).toBe('number');
  });

  it('JSON corrupto en la clave: se trata como sin decisión (no lanza)', () => {
    localStorage.setItem(CONSENT_KEY, '{no es json');

    expect(() => hasDecision()).not.toThrow();
    expect(hasDecision()).toBe(false);
    expect(shouldLoadAnalytics()).toBe(false);
    expect(readConsent()).toBeNull();
  });

  it('objeto sin el campo analytics: se trata como sin decisión', () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ts: 123 }));

    expect(hasDecision()).toBe(false);
    expect(shouldLoadAnalytics()).toBe(false);
  });

  it('clearConsent borra la decisión', () => {
    writeConsent({ analytics: true });
    clearConsent();

    expect(hasDecision()).toBe(false);
    expect(readConsent()).toBeNull();
  });
});
