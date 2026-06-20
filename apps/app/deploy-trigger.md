# Deploy trigger (frontend)

Archivo dummy para forzar el workflow de GitHub Actions (el filtro `paths` solo
dispara con cambios en `apps/app/**`). Seguro de borrar.

- 2026-06-19: redeploy para activar `VITE_SENTRY_DSN` en el build de prod (Sentry).
- 2026-06-19: redeploy para aplicar fix de CSP (permitir `*.ingest.us.sentry.io` +
  `worker-src blob:` para que Sentry pueda enviar eventos y correr el Session Replay).
