# Follow-ups de auth (anotados 2026-06-18, para después)

Hallazgos de una revisión de `Login.tsx` / `Register.tsx` / `CheckEmail.tsx`.
NO son bugs del onboarding de Google (que quedó sano) — son cosas aparte, pre-existentes.

## 1. Botón "¿Olvidaste tu contraseña?" muerto
- Archivo: `apps/app/src/features/auth/pages/Login.tsx` (~líneas 127-133)
- El botón no tiene `onClick` → no hace nada. Falta implementar recuperación de
  contraseña (`sendPasswordResetEmail` de Firebase + pantalla/flujo).
- Prioridad sugerida: media-alta (gap visible para usuarios reales). Fix acotado, solo frontend.

## 2. Trampa de cuenta huérfana en el registro (no atómico Firebase↔backend)
- Archivo: `apps/app/src/features/auth/pages/Register.tsx` (~líneas 114-142)
- Orden: `createUserWithEmailAndPassword` (crea user en Firebase) → `POST /api/users/register`.
  Si el POST al backend falla, el user queda creado en Firebase SIN registro en backend.
  Resultado: no puede re-registrarse (`auth/email-already-in-use`), no puede loguearse
  (email sin verificar) → trabado sin salida.
- Mismo hueco aplica a login email/password sin perfil backend (`Login.tsx:49-68` no tiene
  el redirect a onboarding que sí tiene Google).
- Raíz: creación en Firebase y en backend no son atómicas.
- Solución de fondo: que `POST /api/users/register` sea idempotente para el mismo
  `firebaseUid` (o limpiar el user de Firebase si el backend falla). Toca backend.
- Prioridad sugerida: media (caso de falla parcial, no el camino feliz).

## RESUELTO — `redirect_uri_mismatch` en login con Google (2026-06-18)
- Síntoma: popup de Google → "Acceso bloqueado... Error 400: redirect_uri_mismatch".
- Causa: se migró el `authDomain` de Firebase al dominio custom
  (`aliados-app.convivirtech.com.ar`) pero el OAuth Client de Google no tenía
  registrado el redirect URI del dominio nuevo. Firebase manda
  `https://aliados-app.convivirtech.com.ar/__/auth/handler` y Google solo acepta
  URIs whitelisteados.
- Fix (Google Cloud Console → APIs y servicios → Credenciales → OAuth Client web):
  - URIs de redireccionamiento autorizados: `https://aliados-app.convivirtech.com.ar/__/auth/handler`
  - Orígenes JS autorizados: `https://aliados-app.convivirtech.com.ar`
  - (También verificar en Firebase Console → Authentication → Settings → Authorized domains
    que esté `aliados-app.convivirtech.com.ar`.)
- Nota: la propagación de Google tarda de 5 min a varias horas; reintentar en incógnito nuevo.
- Lección: al cambiar `authDomain` hay que actualizar SIEMPRE el redirect URI en Google Cloud
  (las dos cosas tienen que coincidir).

## 3. Consistencia: fetch crudo vs apiClient
- `Login.tsx` y `Register.tsx` usan `fetch` crudo con `VITE_API_URL`; `CheckEmail.tsx` usa
  `apiClient` (centraliza headers/errores). Unificar a `apiClient`. Cosmético, baja prioridad.
