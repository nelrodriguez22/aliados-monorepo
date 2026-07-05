# Recuperación de contraseña (branded) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el flujo "olvidé mi contraseña" desde el login, con email branded via Resend, y unificar `ClientSettings` al mismo mecanismo.

**Architecture:** El backend genera el link de reset con Firebase Admin (`generatePasswordResetLink`), arma una URL propia (`/restablecer-contrasena?...`) y manda un email branded por Resend (mismo patrón que la verificación de email). El frontend expone una pantalla para pedir el reset y otra que consume el `oobCode` con el SDK de Firebase (`verifyPasswordResetCode` + `confirmPasswordReset`).

**Tech Stack:** Spring Boot / Java (backend), Firebase Admin SDK, Resend; React + Vite + Firebase Web SDK + react-router (frontend).

## Global Constraints

- Anti-enumeración: el endpoint público responde SIEMPRE genérico e idéntico exista o no el email; `forgotPassword` nunca lanza ni revela existencia.
- Cooldown anti-spam de 60s por email (en memoria), reutilizando la constante `RESEND_COOLDOWN` existente.
- Validación de contraseña consistente con el registro: requerida, mínimo 6 caracteres, y confirmación que debe coincidir.
- Rutas de frontend centralizadas en `apps/app/src/shared/constants/routes.ts`.
- Emails branded via Resend usando el `EmailService.send(...)` existente (no usar el email default de Firebase).

---

## File Structure

**Backend**
- `backend/src/main/java/com/aliados/backend/service/EmailService.java` — `+ sendPasswordResetEmail(...)` y `+ buildPasswordResetEmailHtml(...)`.
- `backend/src/main/java/com/aliados/backend/service/UserService.java` — `+ forgotPassword(String)` y `+ lastPasswordResetByEmail` map.
- `backend/src/main/java/com/aliados/backend/controller/UserController.java` — `+ POST /forgot-password`.
- `backend/src/main/java/com/aliados/backend/config/SecurityConfig.java` — `permitAll` para `/api/users/forgot-password`.
- `backend/src/test/java/com/aliados/backend/service/UserServiceTest.java` — tests de `forgotPassword`.

**Frontend**
- `apps/app/src/shared/constants/routes.ts` — `+ RECOVER_PASSWORD`, `+ RESET_PASSWORD`.
- `apps/app/src/features/auth/pages/RecoverPassword.tsx` — nueva.
- `apps/app/src/features/auth/pages/ResetPassword.tsx` — nueva.
- `apps/app/src/features/auth/pages/Login.tsx` — `onClick` del botón.
- `apps/app/src/router/AppRouter.tsx` — 2 rutas nuevas.
- `apps/app/src/features/client/pages/ClientSettings.tsx` — unificar al endpoint.

---

## Task 1: Backend — `EmailService.sendPasswordResetEmail`

Gemelo de `sendVerificationEmail`: arma el HTML branded y delega en el `send(...)` existente. No lleva test unitario (no tiene lógica condicional; delega en una llamada HTTP a Resend, igual que `sendVerificationEmail`, que tampoco tiene test).

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/EmailService.java`

**Interfaces:**
- Produces: `boolean sendPasswordResetEmail(String toEmail, String nombre, String resetLink)` — devuelve `true` si Resend aceptó (2xx).

- [ ] **Step 1: Agregar el método público** (debajo de `sendVerificationEmail`, ~línea 46)

```java
    /**
     * Envía el email de recuperación de contraseña. Devuelve true si Resend lo aceptó (2xx).
     */
    public boolean sendPasswordResetEmail(String toEmail, String nombre, String resetLink) {
        String subject = "Restablecé tu contraseña en Aliados";
        String htmlContent = buildPasswordResetEmailHtml(nombre, resetLink);
        return send(toEmail, subject, htmlContent).statusCode() / 100 == 2;
    }
```

- [ ] **Step 2: Agregar el builder de HTML** (junto a `buildVerificationEmailHtml`, al final de la clase antes de la última `}`)

```java
    private String buildPasswordResetEmailHtml(String nombre, String resetLink) {
        String saludo = (nombre != null && !nombre.isBlank()) ? nombre : "Hola";
        return """
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                                <tr>
                                    <td style="background-color: #054060; padding: 32px 40px; text-align: center;">
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Aliados</h1>
                                        <p style="margin: 8px 0 0; color: #8bb8d4; font-size: 14px;">Tu plataforma de servicios de confianza</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                                            ¡Hola, %s! 👋
                                        </h2>
                                        <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                                            Recibimos un pedido para restablecer la contraseña de tu cuenta en <strong>Aliados</strong>. Hacé click en el botón para elegir una nueva.
                                        </p>
                                        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center" style="padding: 8px 0 32px;">
                                                    <a href="%s"
                                                       style="display: inline-block; background-color: #054060; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                                                        Restablecer contraseña
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        <p style="margin: 0 0 16px; color: #718096; font-size: 14px; line-height: 1.5;">
                                            Si el botón no funciona, copiá y pegá este enlace en tu navegador:
                                        </p>
                                        <p style="margin: 0 0 24px; padding: 12px 16px; background-color: #f7fafc; border-radius: 6px; border: 1px solid #e2e8f0; word-break: break-all; color: #054060; font-size: 13px;">
                                            %s
                                        </p>
                                        <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                                            Este enlace expira en 1 hora. Si no pediste restablecer tu contraseña, podés ignorar este email: tu contraseña actual sigue siendo válida.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background-color: #f7fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                                        <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                                            © 2026 Aliados · Rosario, Santa Fe, Argentina
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """.formatted(saludo, resetLink, resetLink);
    }
```

- [ ] **Step 3: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/EmailService.java
git commit -m "feat(email): template branded de recuperación de contraseña"
```

---

## Task 2: Backend — `UserService.forgotPassword` (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/UserService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/UserServiceTest.java`

**Interfaces:**
- Consumes: `EmailService.sendPasswordResetEmail(String, String, String)` (Task 1); `extractParam(String, String)` (private existente); `RESEND_COOLDOWN` (private static existente).
- Produces: `void forgotPassword(String rawEmail)` — anti-enumeración, nunca lanza.

- [ ] **Step 1: Escribir los tests** (agregar en `UserServiceTest`, que ya tiene `@Mock UserRepository userRepository` y `@InjectMocks UserService service`)

Primero, agregar el mock de `EmailService` y `@Value` de `frontendUrl` requerido. En `UserServiceTest`, agregar el campo mock y un `@BeforeEach` que setee `frontendUrl` por reflexión (o usar `ReflectionTestUtils`).

```java
    @Mock EmailService emailService;

    @BeforeEach
    void initFrontendUrl() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "frontendUrl", "https://app.test");
    }

    @Test
    void forgotPassword_emailNull_noEnviaNada() {
        service.forgotPassword(null);
        service.forgotPassword("   ");
        org.mockito.Mockito.verifyNoInteractions(emailService);
    }

    @Test
    void forgotPassword_emailInexistenteEnFirebase_silencioso() {
        try (org.mockito.MockedStatic<com.google.firebase.auth.FirebaseAuth> fb =
                     org.mockito.Mockito.mockStatic(com.google.firebase.auth.FirebaseAuth.class)) {
            com.google.firebase.auth.FirebaseAuth fa = org.mockito.Mockito.mock(com.google.firebase.auth.FirebaseAuth.class);
            fb.when(com.google.firebase.auth.FirebaseAuth::getInstance).thenReturn(fa);
            org.mockito.Mockito.when(fa.generatePasswordResetLink("nadie@test.local"))
                    .thenThrow(new RuntimeException("no such user"));

            service.forgotPassword("nadie@test.local");

            org.mockito.Mockito.verifyNoInteractions(emailService);
        }
    }

    @Test
    void forgotPassword_emailValido_generaLinkYManda() {
        try (org.mockito.MockedStatic<com.google.firebase.auth.FirebaseAuth> fb =
                     org.mockito.Mockito.mockStatic(com.google.firebase.auth.FirebaseAuth.class)) {
            com.google.firebase.auth.FirebaseAuth fa = org.mockito.Mockito.mock(com.google.firebase.auth.FirebaseAuth.class);
            fb.when(com.google.firebase.auth.FirebaseAuth::getInstance).thenReturn(fa);
            org.mockito.Mockito.when(fa.generatePasswordResetLink("ana@test.local"))
                    .thenReturn("https://x/__/auth/action?mode=resetPassword&oobCode=ABC&apiKey=KEY");

            User ana = new User();
            ana.setEmail("ana@test.local");
            ana.setNombre("Ana");
            org.mockito.Mockito.when(userRepository.findByEmail("ana@test.local"))
                    .thenReturn(java.util.Optional.of(ana));

            service.forgotPassword("ana@test.local");

            org.mockito.ArgumentCaptor<String> link = org.mockito.ArgumentCaptor.forClass(String.class);
            org.mockito.Mockito.verify(emailService).sendPasswordResetEmail(
                    org.mockito.ArgumentMatchers.eq("ana@test.local"),
                    org.mockito.ArgumentMatchers.eq("Ana"),
                    link.capture());
            org.assertj.core.api.Assertions.assertThat(link.getValue())
                    .isEqualTo("https://app.test/restablecer-contrasena?mode=resetPassword&oobCode=ABC&apiKey=KEY");
        }
    }
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd backend && ./gradlew test --no-daemon --tests "com.aliados.backend.service.UserServiceTest"`
Expected: FAIL — `forgotPassword` no existe / `emailService` no inyectado.

- [ ] **Step 3: Implementar `forgotPassword`** (en `UserService`, junto a `resendVerification`, ~línea 190)

Agregar el mapa de cooldown junto a `lastResendByEmail` (~línea 73):

```java
    private final Map<String, Instant> lastPasswordResetByEmail = new ConcurrentHashMap<>();
```

Agregar el método:

```java
    /**
     * Envía el email branded de recuperación de contraseña. Endpoint público, así que
     * NUNCA lanza ni revela si el email existe (anti-enumeración): cualquier resultado
     * termina silencioso. El caller responde siempre genérico.
     */
    public void forgotPassword(String rawEmail) {
        if (rawEmail == null || rawEmail.isBlank()) return;
        String email = rawEmail.trim().toLowerCase();

        // Backstop anti-spam: si se pidió hace menos de RESEND_COOLDOWN, ignorar.
        Instant last = lastPasswordResetByEmail.get(email);
        if (last != null && Duration.between(last, Instant.now()).compareTo(RESEND_COOLDOWN) < 0) {
            logger.debug("⏳ Reset de contraseña ignorado por cooldown");
            return;
        }

        String resetLink;
        try {
            resetLink = FirebaseAuth.getInstance().generatePasswordResetLink(email);
        } catch (Exception e) {
            // Email inexistente en Firebase (u otro error): no filtrar nada, salir.
            logger.debug("Reset de contraseña solicitado para email no resoluble en Firebase");
            return;
        }

        String oobCode = extractParam(resetLink, "oobCode");
        String apiKey = extractParam(resetLink, "apiKey");
        String customLink = frontendUrl + "/restablecer-contrasena?mode=resetPassword&oobCode=" + oobCode + "&apiKey=" + apiKey;

        // Nombre para el saludo del email (fallback si no está en la DB).
        String nombre = userRepository.findByEmail(email).map(User::getNombre).orElse(null);

        lastPasswordResetByEmail.put(email, Instant.now());
        emailService.sendPasswordResetEmail(email, nombre, customLink);
        logger.debug("📧 Reset de contraseña disparado");
    }
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd backend && ./gradlew test --no-daemon --tests "com.aliados.backend.service.UserServiceTest"`
Expected: PASS (todos, incluidos los previos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/UserService.java backend/src/test/java/com/aliados/backend/service/UserServiceTest.java
git commit -m "feat(auth): UserService.forgotPassword branded + anti-enumeración + cooldown"
```

---

## Task 3: Backend — Endpoint público `POST /forgot-password`

Incluye el `permitAll` en `SecurityConfig` (la ruta no sirve sin él). Sin test unitario: es un controller que delega en `forgotPassword` (ya testeado) y responde genérico; se valida por compilación y prueba manual.

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/controller/UserController.java`
- Modify: `backend/src/main/java/com/aliados/backend/config/SecurityConfig.java`

**Interfaces:**
- Consumes: `UserService.forgotPassword(String)` (Task 2).

- [ ] **Step 1: Agregar el endpoint** (en `UserController`, junto a `resendVerification`, ~línea 66)

```java
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        // Respuesta genérica e idéntica siempre (anti-enumeración): no revela si el
        // email existe. El envío real (con su cooldown) ocurre en el service.
        userService.forgotPassword(body.get("email"));
        return ResponseEntity.ok(Map.of(
                "message", "Si el email está registrado, te enviamos un enlace para restablecer tu contraseña."));
    }
```

- [ ] **Step 2: Permitir la ruta sin auth** (en `SecurityConfig`, dentro del bloque `.requestMatchers(...permitAll)`, junto a `"/api/users/resend-verification"`)

```java
                                "/api/users/resend-verification",
                                "/api/users/forgot-password"
```

- [ ] **Step 3: Compilar y correr toda la suite unitaria**

Run: `cd backend && ./gradlew test --no-daemon`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/controller/UserController.java backend/src/main/java/com/aliados/backend/config/SecurityConfig.java
git commit -m "feat(auth): endpoint público POST /api/users/forgot-password"
```

---

## Task 4: Frontend — rutas + disparo desde el login

**Files:**
- Modify: `apps/app/src/shared/constants/routes.ts`
- Modify: `apps/app/src/features/auth/pages/Login.tsx`

**Interfaces:**
- Produces: `ROUTES.RECOVER_PASSWORD = '/recuperar-contrasena'`, `ROUTES.RESET_PASSWORD = '/restablecer-contrasena'`.

- [ ] **Step 1: Agregar las rutas** (en `routes.ts`, junto a las otras públicas, después de `VERIFICATION_SUCCESS`)

```typescript
  VERIFICATION_SUCCESS: '/verificacion-exitosa',
  RECOVER_PASSWORD: '/recuperar-contrasena',
  RESET_PASSWORD: '/restablecer-contrasena',
```

- [ ] **Step 2: Conectar el botón del login** (en `Login.tsx`). El botón `"¿Olvidaste tu contraseña?"` (~línea 165) es hoy un `type="button"` sin handler. Verificar que el componente ya tenga `const navigate = useNavigate()` (Login usa navegación); importar `ROUTES` si no está. Reemplazar el `<button>` por:

```tsx
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.RECOVER_PASSWORD)}
                  className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                >
                  ¿Olvidaste tu contraseña?
                </button>
```

Si `ROUTES` no está importado en `Login.tsx`, agregar al tope: `import { ROUTES } from "@/shared/constants/routes";`

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter aliados-app build`
Expected: build OK, sin errores de tsc.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/shared/constants/routes.ts apps/app/src/features/auth/pages/Login.tsx
git commit -m "feat(auth): rutas de recuperación + botón del login enlazado"
```

---

## Task 5: Frontend — página `RecoverPassword`

Pide el email y llama al endpoint. Muestra confirmación genérica. Sigue el patrón visual de `CheckEmail`. Sin test unitario (el codebase no testea páginas; se valida por build y prueba manual).

**Files:**
- Create: `apps/app/src/features/auth/pages/RecoverPassword.tsx`
- Modify: `apps/app/src/router/AppRouter.tsx`

**Interfaces:**
- Consumes: `POST /api/users/forgot-password` (Task 3); `ROUTES.RECOVER_PASSWORD` (Task 4).

- [ ] **Step 1: Crear la página**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MailCheck } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import { apiClient, ApiError } from "@/shared/lib/apiClient";
import toast from "react-hot-toast";
import logo from "@/assets/logocontexto.png";

export function RecoverPassword() {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (new FormData(e.currentTarget).get("email") as string)?.trim();
    if (!email) return;
    setSending(true);
    try {
      // El endpoint es anti-enumeración: responde genérico exista o no el email.
      await apiClient.post("/api/users/forgot-password", { email }, false);
      setSent(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No pudimos procesar el pedido. Intentá de nuevo.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          {sent ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <MailCheck className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Revisá tu correo</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Si el email está registrado, te enviamos un enlace para restablecer tu contraseña.
                Revisá también la carpeta de spam.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Volver a iniciar sesión
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <KeyRound className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>¿Olvidaste tu contraseña?</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Ingresá tu email y te enviamos un enlace para elegir una nueva.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 text-left">
                <label htmlFor="email" className={tw.label}>Email</label>
                <input
                  id="email" name="email" type="email" required
                  placeholder="tu@email.com"
                  className={tw.input}
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-4 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Enviando..." : "Enviar enlace"}
                </button>
              </form>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className={`mt-4 text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
              >
                Volver a iniciar sesión
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Registrar la ruta** (en `AppRouter.tsx`, junto a las páginas de auth dentro de `<Route element={<AuthLayout />}>`, ~línea 79). Importar el componente al tope y agregar:

```tsx
            <Route path="recuperar-contrasena" element={<RecoverPassword />} />
```

Import al tope de `AppRouter.tsx`: `import { RecoverPassword } from "@/features/auth/pages/RecoverPassword";`

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter aliados-app build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/auth/pages/RecoverPassword.tsx apps/app/src/router/AppRouter.tsx
git commit -m "feat(auth): página /recuperar-contrasena"
```

---

## Task 6: Frontend — página `ResetPassword`

Consume el `oobCode`, valida con `verifyPasswordResetCode`, pide nueva contraseña y la aplica con `confirmPasswordReset`. Sigue el patrón de estados de `VerificationSuccess`. Sin test unitario (página; se valida por build y prueba manual).

**Files:**
- Create: `apps/app/src/features/auth/pages/ResetPassword.tsx`
- Modify: `apps/app/src/router/AppRouter.tsx`

**Interfaces:**
- Consumes: `verifyPasswordResetCode`, `confirmPasswordReset` de `firebase/auth`; `auth` de `@/shared/lib/firebase`; `ROUTES` (Task 4).

- [ ] **Step 1: Crear la página**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { KeyRound, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import toast from "react-hot-toast";
import logo from "@/assets/logocontexto.png";

type State = "loading" | "form" | "success" | "invalid";

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oobCode = searchParams.get("oobCode");
  const mode = searchParams.get("mode");

  useEffect(() => {
    if (!oobCode || mode !== "resetPassword") {
      setState("invalid");
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((mail) => { setEmail(mail); setState("form"); })
      .catch(() => setState("invalid"));
  }, [oobCode, mode]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirmPassword") as string;

    if (!password || password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (!oobCode) { setState("invalid"); return; }

    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setState("success");
    } catch {
      setError("El enlace expiró o ya fue usado. Pedí uno nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          {state === "loading" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-elevated">
                <Loader2 className={`h-8 w-8 animate-spin ${tw.text.faint}`} />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Validando enlace...</h1>
            </>
          )}

          {state === "form" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <KeyRound className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Nueva contraseña</h1>
              {email && (
                <p className={`mt-2 text-sm ${tw.text.secondary}`}>
                  Para <span className={`font-semibold ${tw.text.primary}`}>{email}</span>
                </p>
              )}
              <form onSubmit={handleSubmit} className="mt-6 text-left">
                <label htmlFor="password" className={tw.label}>Contraseña nueva</label>
                <div className="relative">
                  <input
                    id="password" name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••" required
                    className={tw.input + " pr-10"}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${tw.text.faint}`}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <label htmlFor="confirmPassword" className={tw.label + " mt-4"}>Repetí la contraseña</label>
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••" required
                  className={tw.input}
                />
                {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button
                  type="submit" disabled={saving}
                  className="mt-4 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Cambiar contraseña"}
                </button>
              </form>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>¡Contraseña actualizada!</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Ya podés iniciar sesión con tu nueva contraseña.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Iniciar sesión
              </button>
            </>
          )}

          {state === "invalid" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Enlace inválido o expirado</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Este enlace no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".
              </p>
              <button
                onClick={() => navigate(ROUTES.RECOVER_PASSWORD)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Pedir un enlace nuevo
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Registrar la ruta** (en `AppRouter.tsx`, junto a la anterior). Import al tope: `import { ResetPassword } from "@/features/auth/pages/ResetPassword";` y la ruta:

```tsx
            <Route path="restablecer-contrasena" element={<ResetPassword />} />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter aliados-app build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/auth/pages/ResetPassword.tsx apps/app/src/router/AppRouter.tsx
git commit -m "feat(auth): página /restablecer-contrasena"
```

---

## Task 7: Frontend — unificar `ClientSettings` al endpoint

Reemplazar el `sendPasswordResetEmail` del SDK por el endpoint branded, con el email del usuario.

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientSettings.tsx`

**Interfaces:**
- Consumes: `POST /api/users/forgot-password` (Task 3).

- [ ] **Step 1: Cambiar `handlePasswordReset`** (~línea 112). Reemplazar el cuerpo del `try`:

```tsx
  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await apiClient.post("/api/users/forgot-password", { email: user.email }, false);
      toast.success('Te enviamos un email para restablecer tu contraseña');
    } catch {
      toast.error('Error al enviar email');
    } finally {
      setSendingReset(false);
    }
  };
```

- [ ] **Step 2: Limpiar el import muerto.** Quitar `import { sendPasswordResetEmail } from "firebase/auth";` (línea 10). Verificar que `apiClient` esté importado; si no, agregar `import { apiClient } from "@/shared/lib/apiClient";`. Verificar que no queden otros usos de `sendPasswordResetEmail` ni de `auth` que queden huérfanos: `grep -n "sendPasswordResetEmail\|auth" src/features/client/pages/ClientSettings.tsx`.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter aliados-app build`
Expected: build OK, sin imports sin usar.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/client/pages/ClientSettings.tsx
git commit -m "refactor(auth): ClientSettings usa el endpoint branded de reset"
```

---

## Verificación final (manual, post-deploy)

- Login → "¿Olvidaste tu contraseña?" → `/recuperar-contrasena` → email → llega el email branded.
- Link del email → `/restablecer-contrasena` → muestra el email → nueva contraseña → login con la nueva.
- Enlace inválido/expirado → estado "Enlace inválido" con salida a pedir otro.
- Settings → "restablecer contraseña" → llega el mismo email branded.
- Anti-enumeración: pedir reset de un email inexistente → misma respuesta genérica, no llega email.
