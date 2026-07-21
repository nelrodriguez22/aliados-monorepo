# Consentimiento de cookies — Diseño

**Fecha:** 2026-07-21
**Estado:** Aprobado, en implementación
**Rama:** `feat/consentimiento-cookies`

## Problema

La Política de Privacidad §9 declara que las cookies analíticas *"El Usuario puede
desactivarlas en la configuración de la aplicación"*. Ese control **no existe**:
`initGtag()` carga Google Analytics (`G-C69HGKX2XV`) incondicionalmente al arrancar
`main.tsx`, sin consentimiento previo ni opt-out. Promesa escrita incumplida.

## Objetivo

Banner de consentimiento con opt-in real: GA no carga hasta acción afirmativa del
usuario. Dos niveles (aceptar todo / configurar), dos categorías (Esenciales +
Analíticas), y alinear el texto legal §9 con lo implementado.

## Modelo de consentimiento

- **Opt-in**: sin decisión guardada → GA NO carga y el banner reaparece en cada carga.
- GA arranca solo si el consentimiento de analíticas está en `true` (de una sesión
  previa o al aceptar en el momento).
- Categorías:
  - **Esenciales** — siempre ON, no togglable (sesión/auth). No implican tracking de terceros.
  - **Analíticas** — Google Analytics 4. Opt-in, apagable.

## Flujo UI (2 niveles)

**Nivel 1 — Banner** (fijo abajo, no bloquea navegación, persiste hasta elegir):
texto breve + link a la Política + botones:
- `Configuración` (secundario) → abre nivel 2
- `Aceptar todo` (primario) → analíticas ON, carga GA, cierra

**Nivel 2 — Configuración**: toggles
- Esenciales: ON + candado, deshabilitado
- Analíticas: switch (default OFF en el panel)
- Botones: `Rechazar todo` (analíticas OFF) y `Guardar` (respeta el switch)

Sin "X" de cierre sin decisión. Reapertura: link **"Cookies"** en el Footer.

## Persistencia

`localStorage`, clave versionada `aliados_cookie_consent_v1`:
```json
{ "analytics": true, "ts": 1690000000000 }
```
Versionada para poder re-preguntar si cambian las categorías. Se usa localStorage
(no cookie propia) para no mandar el estado en cada request; coherente con
`sentry.send-default-pii=false`.

## Componentes

- `shared/consent/consentStore.ts` — helpers puros: `readConsent()`, `writeConsent()`,
  `clearConsent()`, `hasDecision()`, `shouldLoadAnalytics()`. Sin React → testeable directo.
  Parsing defensivo: JSON corrupto / clave ausente ⇒ "sin decisión".
- `shared/consent/useCookieConsent.ts` — hook: expone `consent`, `needsChoice`,
  `acceptAll()`, `save(prefs)`, `rejectAll()`, `reopen()`. Única fuente de verdad para React.
- `shared/consent/CookieConsentBanner.tsx` — UI (banner + panel), tokens `tw.*`,
  tema claro/oscuro. Montado una vez en `App.tsx`.
- `gtag.ts` — API sin cambios; deja de llamarse en `main.tsx`.

## Gating de GA

- Se elimina `initGtag()` de `main.tsx`.
- Efecto en `App.tsx`: `if (consent.analytics) initGtag()`. `initGtag` ya es idempotente.
- Pasar de ON→OFF no puede "descargar" GA en caliente: al rechazar tras haber aceptado
  se limpia el consentimiento y se recarga la página (caso borde, simple y correcto).

## Texto legal

Ajustar §9 en `apps/landing/src/pages/privacidad.astro` y
`apps/app/src/features/legal/Privacidad.tsx`: declarar 2 categorías (Esenciales +
Analíticas) y describir que el control es el banner / su reapertura desde el Footer,
en vez de la "configuración de la aplicación" inexistente.

## Tests (TDD)

`consentStore` (puro):
- sin clave → `hasDecision=false`, `shouldLoadAnalytics=false`
- `writeConsent({analytics:true})` → `shouldLoadAnalytics=true`
- `writeConsent({analytics:false})` → `shouldLoadAnalytics=false`, pero `hasDecision=true`
- JSON corrupto en la clave → tratado como sin decisión (no throw)

`CookieConsentBanner`:
- sin decisión → banner visible
- `Aceptar todo` → persiste `analytics:true` y oculta el banner
- `Configuración` → muestra los toggles
- Esenciales no togglable
- `Rechazar todo` → persiste `analytics:false` y oculta

## Fuera de alcance (YAGNI)

Gestor de cookies de terceros; consent por país; registro server-side del
consentimiento; categoría de personalización.
