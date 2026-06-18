# Diseño: Onboarding de Google para usuarios nuevos

Fecha: 2026-06-17
Estado: Aprobado (sin commit, por regla de no tocar git sin permiso explícito)

## Problema

El botón "Continuar con Google" es *login-only*: asume que el usuario ya existe en el
backend. El registro real (rol CLIENT/PROVIDER, teléfono, y para proveedores oficio +
matrícula) vive **solo** en el formulario email/password (`Register.tsx`).

Un usuario nuevo que entra con Google:
1. Firebase lo autentica (su email queda `emailVerified: true`).
2. `useProfile` dispara `GET /api/users/me`.
3. El backend no encuentra ese `firebaseUid` → `UserService.getUserByFirebaseUid`
   (línea 125) lanza `RuntimeException("Usuario no encontrado")` →
   `GlobalExceptionHandler` lo mapea a **HTTP 400**.
4. `useProfile` no contempla el 400 (solo 401/403) → la query falla, reintenta y nunca
   setea el store → el usuario queda fuera (rebota al login / spinner).

**Causa raíz:** no existe un flujo de registro/onboarding para cuentas de Google.

## Decisiones tomadas

- **Comportamiento elegido:** onboarding tras Google. Si Google detecta un usuario nuevo,
  se lo redirige a una pantalla "Completá tu perfil" y recién ahí se llama a
  `/api/users/register`. Permite registrar clientes y proveedores con Google.
- **Detección:** backend devuelve **404** para "usuario no encontrado" (en vez de 400
  genérico); el frontend trata el 404 de `/api/users/me` como "usuario nuevo → onboarding".
- **Form:** página nueva standalone (`OnboardingGoogle.tsx`), no se refactoriza el
  `Register.tsx` existente (bajo riesgo de romper el registro por email que ya funciona).

## Flujo (data flow)

```
Click "Google" → signInWithPopup (Firebase OK, emailVerified=true)
   → GET /api/users/me
        ├─ 200 → usuario existe → useProfile setea store → redirect a su dashboard (login normal, ya funciona)
        └─ 404 → usuario NUEVO → navigate a /completar-perfil (NO signOut, sesión Firebase viva)
              → form: rol + teléfono [+ oficio/matrícula si PROVIDER], nombre prellenado de Google
              → POST /api/users/register (con token Firebase)
              → invalidar query ['auth-profile'] → useProfile re-corre → 200 → redirect a dashboard
```

## Cambios por archivo

### Backend (requiere redeploy Railway)
1. `UserService.getUserByFirebaseUid` (línea 125): lanzar una excepción *NotFound*
   dedicada en vez de `RuntimeException` genérica.
2. `GlobalExceptionHandler`: agregar handler que mapee esa excepción a **404**. Se usa una
   excepción dedicada para no convertir *todos* los `RuntimeException` (hoy 400) en 404.

### Frontend
3. `useProfile.ts`: en **404** NO hacer `signOut`; exponer flag `isNewUser`.
   (401/403 siguen igual → signOut + logout.)
4. `AuthProvider.tsx`: cuando hay `firebaseUser` + `emailVerified` pero el perfil da 404
   (usuario nuevo), **renderizar children** en vez de spinner infinito (hoy la línea 39 lo
   dejaría colgado para siempre).
5. `Login.tsx` `handleGoogleLogin`: tras el popup, si es usuario nuevo (404) →
   `navigate(ROUTES.ONBOARDING)`. Si existe → comportamiento actual.
6. **`OnboardingGoogle.tsx` (nuevo)**: reusa el selector de rol + campos (sin email /
   password), nombre tomado de `auth.currentUser.displayName`, `localidad = "Rosario"`,
   `POST /api/users/register`, luego invalida `['auth-profile']` y redirige al dashboard.
7. `routes.ts`: agregar `ONBOARDING: '/completar-perfil'`.
8. `AppRouter.tsx`: montar la ruta nueva bajo `<AuthLayout>`.

## Manejo de errores / edge cases

- **Email ya registrado con password y ahora entra con Google:** Firebase puede tirar
  `auth/account-exists-with-different-credential`. Se captura con un toast claro
  ("Ya tenés cuenta con email/contraseña, ingresá por ahí"). Sin auto-linking (fuera de scope).
- **Cierra el onboarding a la mitad:** queda con sesión Firebase pero sin perfil backend.
  Al volver a entrar, el mismo flujo lo manda de nuevo a `/completar-perfil`. Idempotente.
- **`POST /register` falla:** toast de error, se queda en el form (no pierde lo cargado).

## Testing

Manual en incógnito (entorno limpio sin service worker viejo):
- Google con cuenta **nueva** → onboarding → dashboard.
- Google con cuenta **existente** → directo a dashboard (sin pasar por onboarding).
- Registro por email/password → sin cambios (sigue yendo a CheckEmail).

## Fuera de scope

- Auto-linking de cuentas (Google + email/password con mismo email).
- Migración del cooldown de reenvío a Redis.
- Refactor del paso-2 de `Register.tsx` a componente compartido.
