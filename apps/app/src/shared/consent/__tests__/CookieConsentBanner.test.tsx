// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CookieConsentBanner } from '../CookieConsentBanner';
import { openCookieSettings } from '../cookieSettingsBus';
import { readConsent } from '../consentStore';

// Gating de GA: no cargamos gtag de verdad, pero verificamos que el consentimiento se
// aplica (true = cargar/activar, false = cortar) según la elección del usuario.
const applyAnalyticsConsent = vi.fn();
vi.mock('../../analytics/gtag', () => ({
  applyAnalyticsConsent: (enabled: boolean) => applyAnalyticsConsent(enabled),
}));

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    applyAnalyticsConsent.mockClear();
    cleanup();
  });

  it('sin decisión previa: muestra el banner', () => {
    render(<CookieConsentBanner />);
    expect(screen.getByRole('dialog', { name: /cookies/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /aceptar todo/i })).toBeTruthy();
  });

  it('con decisión previa: no muestra el banner', () => {
    localStorage.setItem('aliados_cookie_consent_v1', JSON.stringify({ analytics: false, ts: 1 }));
    render(<CookieConsentBanner />);
    expect(screen.queryByRole('dialog', { name: /cookies/i })).toBeNull();
  });

  it('"Aceptar todo": persiste analytics=true, activa GA y oculta el banner', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /aceptar todo/i }));

    expect(readConsent()?.analytics).toBe(true);
    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog', { name: /cookies/i })).toBeNull();
  });

  it('"Configuración": muestra los toggles, con Esenciales bloqueada', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /configuración/i }));

    const esenciales = screen.getByRole('switch', { name: /esenciales/i });
    const analiticas = screen.getByRole('switch', { name: /anal[íi]ticas/i });
    expect(esenciales.getAttribute('aria-disabled')).toBe('true');
    expect(analiticas.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('"Rechazar todo": persiste analytics=false, corta GA y oculta', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /configuración/i }));
    fireEvent.click(screen.getByRole('button', { name: /rechazar todo/i }));

    expect(readConsent()?.analytics).toBe(false);
    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(false);
    expect(applyAnalyticsConsent).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog', { name: /cookies/i })).toBeNull();
  });

  it('"Guardar" con analíticas activadas: persiste true y activa GA', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /configuración/i }));
    fireEvent.click(screen.getByRole('switch', { name: /anal[íi]ticas/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(readConsent()?.analytics).toBe(true);
    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(true);
  });

  it('revocar tras haber aceptado: aplica el corte inmediato (false) en la misma sesión', () => {
    localStorage.setItem('aliados_cookie_consent_v1', JSON.stringify({ analytics: true, ts: 1 }));
    render(<CookieConsentBanner />);
    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(true);

    act(() => openCookieSettings());
    fireEvent.click(screen.getByRole('button', { name: /rechazar todo/i }));

    expect(readConsent()?.analytics).toBe(false);
    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(false);
  });

  it('al montar con analytics ya aceptado: activa GA sin mostrar banner', () => {
    localStorage.setItem('aliados_cookie_consent_v1', JSON.stringify({ analytics: true, ts: 1 }));
    render(<CookieConsentBanner />);

    expect(applyAnalyticsConsent).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog', { name: /cookies/i })).toBeNull();
  });

  it('openCookieSettings reabre el panel aunque ya haya decisión', () => {
    localStorage.setItem('aliados_cookie_consent_v1', JSON.stringify({ analytics: false, ts: 1 }));
    render(<CookieConsentBanner />);
    expect(screen.queryByRole('dialog', { name: /cookies/i })).toBeNull();

    act(() => openCookieSettings());
    expect(screen.getByRole('switch', { name: /anal[íi]ticas/i })).toBeTruthy();
  });
});
