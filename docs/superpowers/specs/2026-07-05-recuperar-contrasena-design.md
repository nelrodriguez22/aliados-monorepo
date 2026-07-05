# Recuperación de contraseña (branded) — Diseño

**Fecha:** 2026-07-05
**Estado:** aprobado, pendiente de plan de implementación

## Problema

El login (`apps/app/src/features/auth/pages/Login.tsx`) tiene un botón **"¿Olvidaste tu
contraseña?"** que es un `type="button"` **sin `onClick`** — no hace nada. No existe flujo de
recuperación de contraseña para usuarios que no pueden entrar.

Situación actual relacionada:
- **`ClientSettings`** (usuario logueado) ya resetea con `sendPasswordResetEmail(auth, email)` del
  SDK de Firebase → usa el **email default de Firebase** (no branded).
- La **verificación de email**, en cambio, usa un patrón **branded via Resend**: el backend genera
  el link con Firebase Admin, extrae el `oobCode`, arma una URL propia y manda el email por Resend
  (`UserService.sendVerificationEmail` + `EmailService.sendVerificationEmail`).

Hay dos estilos conviviendo. Este trabajo agrega el flujo de recuperación desde el login y **unifica**
todo hacia el patrón branded.

## Decisiones tomadas

1. **Mecanismo:** branded via Resend (coherente con la verificación de email). No usar el email
   default de Firebase.
2. **UX del disparo:** pantalla dedicada `/recuperar-contrasena` (coherente con
   login/registro/verifica-tu-correo), no inline en el login.
3. **Alcance:** unificar también `ClientSettings` para que use el nuevo endpoint branded.

## Arquitectura

El backend genera el link de reset con Firebase Admin, arma una URL propia hacia una página de la
app y manda un email branded por Resend. La página de la app toma el `oobCode` y completa el cambio
con el SDK de Firebase (`verifyPasswordResetCode` + `confirmPasswordReset`). Es el mismo patrón que
la verificación de email, reutilizando sus piezas.

### Componentes — Backend

- **`EmailService.sendPasswordResetEmail(toEmail, nombre, resetLink)`** — método nuevo, gemelo de
  `sendVerificationEmail`, con template branded propio (asunto + cuerpo para restablecer contraseña).
- **`UserService.forgotPassword(rawEmail)`** — nuevo. Pensado para un endpoint público:
  - Normaliza el email (trim + lowercase), como `resendVerification`.
  - **Cooldown anti-spam** de 60s por email (mapa en memoria nuevo `lastPasswordResetByEmail`,
    análogo a `lastResendByEmail`). Reutiliza la constante de cooldown existente.
  - Genera `FirebaseAuth.getInstance().generatePasswordResetLink(email)`, extrae `oobCode` y `apiKey`
    con el helper `extractParam` existente, arma
    `frontendUrl + "/restablecer-contrasena?mode=resetPassword&oobCode=<oobCode>&apiKey=<apiKey>"`
    y lo manda con `emailService.sendPasswordResetEmail(...)`.
  - **Nunca lanza ni revela** si el email existe: si Firebase tira `FirebaseAuthException` (email
    inexistente u otro error), lo loguea a nivel bajo y sale silencioso (anti-enumeración).
- **`UserController`** — `POST /api/users/forgot-password`, público, body `{ "email": "..." }`.
  Responde **siempre** `200` genérico: *"Si el email está registrado, te enviamos un enlace para
  restablecer tu contraseña."* (idéntico patrón que `resend-verification`).
- **`SecurityConfig`** — agregar `/api/users/forgot-password` a la lista `permitAll`.

### Componentes — Frontend

- **Página `RecoverPassword` → ruta `/recuperar-contrasena`** (nueva). Form con un input de email →
  `POST /api/users/forgot-password` vía `apiClient` → estado de confirmación genérica ("Si el email
  está registrado, revisá tu correo"). Reusa el patrón visual/estructural de `CheckEmail`
  (logo, `tw`, `toast`, `useNavigate`, `ROUTES`).
- **Página `ResetPassword` → ruta `/restablecer-contrasena`** (nueva):
  - Lee `oobCode` (y opcionalmente `mode`) de la query string.
  - `verifyPasswordResetCode(auth, oobCode)` para validar el código y obtener el email destino
    (que se muestra). Si el código es inválido/expirado → mensaje claro + link a
    `/recuperar-contrasena` para pedir otro.
  - Form: nueva contraseña + confirmación. Validación **consistente con `Register`**: requerida,
    **mínimo 6 caracteres**, ambas deben coincidir.
  - `confirmPasswordReset(auth, oobCode, newPassword)` → éxito → toast + redirige a `/login`.
- **`Login.tsx`** — al botón existente `"¿Olvidaste tu contraseña?"` se le agrega
  `onClick → navigate('/recuperar-contrasena')` (hoy no tiene handler).
- **`AppRouter`** — 2 rutas nuevas dentro del `AuthLayout` (público, sin auth):
  `/recuperar-contrasena` y `/restablecer-contrasena`.
- **`ClientSettings.handlePasswordReset`** — reemplazar `sendPasswordResetEmail(auth, user.email)`
  por `POST /api/users/forgot-password` con `user.email` (unificación al mecanismo branded). El
  SDK `sendPasswordResetEmail` deja de usarse acá.

## Flujo de datos

**Olvido (no logueado):**
`/login` → click → `/recuperar-contrasena` → `POST /api/users/forgot-password { email }` → backend
genera link + manda email branded → usuario abre el email → link →
`/restablecer-contrasena?oobCode=…` → nueva contraseña → `confirmPasswordReset` → `/login`.

**Settings (logueado):**
botón en Configuración → `POST /api/users/forgot-password { user.email }` → mismo email branded.

## Manejo de errores y seguridad

- **Anti-enumeración:** el endpoint responde genérico e idéntico exista o no el email; `forgotPassword`
  no lanza cuando el email no está en Firebase.
- **Cooldown 60s por email:** backstop anti-spam en memoria (suficiente para una instancia), igual
  que `resendVerification`.
- **`oobCode` inválido/expirado:** manejado en `ResetPassword` con mensaje y salida a pedir uno nuevo.
- **Contraseña:** validación mínima consistente con el registro (≥6, coincidencia); los errores de
  Firebase (`auth/weak-password`, etc.) se muestran traducidos.
- **Rutas públicas:** las 2 páginas nuevas van en el layout público; el endpoint va en `permitAll`.

## Testing

- **Backend (TDD):** `UserService.forgotPassword`
  - No lanza cuando el email no existe (Firebase mockeado lanzando) → anti-enumeración.
  - Respeta el cooldown (segunda llamada dentro de 60s no reenvía).
  - Con email válido, arma el link y llama a `EmailService.sendPasswordResetEmail`.
- **Frontend:** validación de la página `ResetPassword` (coincidencia + longitud) donde el patrón de
  tests existente lo permita; las páginas son UI y siguen el estilo actual.

## Archivos afectados

**Backend**
- `backend/.../service/EmailService.java` (nuevo método)
- `backend/.../service/UserService.java` (nuevo método + mapa de cooldown)
- `backend/.../controller/UserController.java` (nuevo endpoint)
- `backend/.../config/SecurityConfig.java` (permitAll)
- `backend/.../service/UserServiceTest.java` (tests)

**Frontend**
- `apps/app/src/features/auth/pages/RecoverPassword.tsx` (nueva)
- `apps/app/src/features/auth/pages/ResetPassword.tsx` (nueva)
- `apps/app/src/features/auth/pages/Login.tsx` (onClick del botón)
- `apps/app/src/router/AppRouter.tsx` (2 rutas)
- `apps/app/src/features/client/pages/ClientSettings.tsx` (unificar al endpoint)
- `apps/app/src/shared/constants/routes.ts` (agregar `RECOVER_PASSWORD: '/recuperar-contrasena'` y
  `RESET_PASSWORD: '/restablecer-contrasena'`, junto a las otras rutas de auth ya centralizadas ahí)

## Fuera de alcance

- Rate limiting distribuido (el cooldown en memoria alcanza para una instancia; ya es el patrón del
  proyecto).
- Cambiar el template del email de verificación existente.
- Políticas de contraseña más fuertes que las del registro actual (≥6).
