# Google Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un usuario nuevo que entra con Google complete su registro (rol, teléfono, oficio/matrícula) en una pantalla de onboarding, en vez de quedar rebotado al login.

**Architecture:** El backend pasa a devolver 404 (no 400) cuando un `firebaseUid` no existe. El frontend trata ese 404 de `/api/users/me` como "usuario nuevo": mantiene la sesión de Firebase viva, no hace `signOut`, y lo redirige a una página standalone `/completar-perfil` que recolecta los datos faltantes y llama a `/api/users/register`. Tras el alta, se invalida la query de perfil y el usuario entra a su dashboard.

**Tech Stack:** React 19 + react-router-dom + @tanstack/react-query + Zustand (store) + Firebase Auth (frontend); Spring Boot + Gradle (backend).

## Global Constraints

- **Git:** NO ejecutar `git add/commit/push` ni ninguna acción de git. El usuario maneja los commits al cerrar cada tarea. Cada tarea termina en verificación, no en commit.
- **Tests:** El frontend NO tiene runner de tests (scripts: `dev`, `build`, `lint`, `preview`). No instalar vitest/jest. Verificación frontend = `npm run build` (typecheck `tsc -b` + build) y/o `npx tsc -b --noEmit`, más `npm run lint` y prueba manual en incógnito. Backend = `./gradlew build` (compila + corre el smoke test existente).
- **Localidad:** fija en `"Rosario"` (única ciudad soportada hoy).
- **Comandos frontend:** correr desde `apps/app/`. Comandos backend desde `backend/`.
- **Detección de usuario nuevo:** `GET /api/users/me` → 404 = usuario nuevo. 401/403 = no autorizado (signOut). Cualquier otro !ok = error real (toast).

---

### Task 1: Backend devuelve 404 para usuario no encontrado

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/exception/UserNotFoundException.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/UserService.java:123-128`
- Modify: `backend/src/main/java/com/aliados/backend/config/GlobalExceptionHandler.java`

**Interfaces:**
- Produces: `GET /api/users/me` responde **404** (no 400) cuando el `firebaseUid` autenticado no tiene registro en la base. El frontend (Tasks 2 y 4) depende de este 404.

- [ ] **Step 1: Crear la excepción dedicada**

Create `backend/src/main/java/com/aliados/backend/exception/UserNotFoundException.java`:

```java
package com.aliados.backend.exception;

public class UserNotFoundException extends RuntimeException {
    public UserNotFoundException(String message) {
        super(message);
    }
}
```

- [ ] **Step 2: Lanzar la excepción en getUserByFirebaseUid**

En `backend/src/main/java/com/aliados/backend/service/UserService.java`, agregar el import al inicio del archivo (junto a los demás imports):

```java
import com.aliados.backend.exception.UserNotFoundException;
```

Y reemplazar el cuerpo de `getUserByFirebaseUid` (líneas 123-128):

```java
    public UserResponseDTO getUserByFirebaseUid(String firebaseUid) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new UserNotFoundException("Usuario no encontrado"));

        return mapToDTO(user);
    }
```

(Solo se cambia `getUserByFirebaseUid`. Los otros `orElseThrow(() -> new RuntimeException(...))` en líneas 172/198/206 quedan igual → siguen siendo 400.)

- [ ] **Step 3: Mapear la excepción a 404 en GlobalExceptionHandler**

En `backend/src/main/java/com/aliados/backend/config/GlobalExceptionHandler.java`, agregar el import:

```java
import com.aliados.backend.exception.UserNotFoundException;
```

Y agregar este handler ANTES del handler de `RuntimeException` (Spring elige el más específico, pero lo ponemos primero por claridad):

```java
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleUserNotFound(UserNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "error", "Not Found",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }
```

- [ ] **Step 4: Verificar que compila**

Run (desde `backend/`): `./gradlew build`
Expected: `BUILD SUCCESSFUL`. Sin errores de compilación.

- [ ] **Step 5: Verificación manual (opcional, requiere backend corriendo)**

Con un token de un usuario Firebase que NO esté en la base:
`curl -i -H "Authorization: Bearer <token>" $API/api/users/me`
Expected: `HTTP/1.1 404` con body `{"error":"Not Found","message":"Usuario no encontrado",...}`

> Commit lo hace el usuario.

---

### Task 2: useProfile detecta el 404 como usuario nuevo (sin signOut)

**Files:**
- Modify: `apps/app/src/shared/hooks/useProfile.ts`

**Interfaces:**
- Consumes: el 404 de `/api/users/me` de Task 1.
- Produces: `useProfile(firebaseUser)` retorna el objeto de la query **más** una propiedad booleana `isNewUser` (true cuando el backend respondió 404). En 404 NO se hace `signOut` ni `logout`. AuthProvider (Task 3) consume `isNewUser`.

- [ ] **Step 1: Manejar 404 en el queryFn y exponer isNewUser**

En `apps/app/src/shared/hooks/useProfile.ts`, dentro del `queryFn`, agregar el manejo del 404 JUSTO DESPUÉS del bloque de 401/403 (después de la línea 40) y ANTES del `if (!response.ok)`:

```ts
      // 404 → usuario autenticado en Firebase pero sin registro en backend (usuario nuevo).
      // NO hacemos signOut: mantenemos la sesión para el flujo de onboarding.
      if (response.status === 404) {
        throw new Error('NotRegistered');
      }
```

- [ ] **Step 2: No reintentar en NotRegistered**

En el mismo archivo, en la opción `retry` del `useQuery`, agregar la guarda de `NotRegistered`:

```ts
    retry: (failureCount, error) => {
      if (error.message === 'Unauthorized') return false;
      if (error.message === 'NotRegistered') return false;
      return failureCount < 2;
    },
```

- [ ] **Step 3: Exponer isNewUser en el retorno**

Reemplazar el `return query;` final por:

```ts
  const isNewUser =
    query.error instanceof Error && query.error.message === 'NotRegistered';

  return { ...query, isNewUser };
```

- [ ] **Step 4: Verificar typecheck**

Run (desde `apps/app/`): `npx tsc -b --noEmit`
Expected: sin errores. (AuthProvider sigue usando `profileQuery.data`, que el spread preserva → no rompe nada en esta tarea.)

> Commit lo hace el usuario.

---

### Task 3: AuthProvider deja renderizar children para el usuario nuevo

**Files:**
- Modify: `apps/app/src/shared/components/AuthProvider.tsx`

**Interfaces:**
- Consumes: `isNewUser` de `useProfile` (Task 2).
- Produces: cuando hay `firebaseUser` + `emailVerified` + `isNewUser`, AuthProvider renderiza `children` (en vez del spinner infinito), permitiendo que la ruta `/completar-perfil` se muestre.

- [ ] **Step 1: Leer isNewUser y desbloquear el render**

Reemplazar el cuerpo del componente `AuthProvider` (de la línea 22 en adelante) por:

```tsx
  const { firebaseUser, isLoading: firebaseLoading } = useFirebaseAuth();
  const { data: profile, isNewUser } = useProfile(firebaseUser);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    if (!firebaseLoading && !firebaseUser && isAuthenticated) {
      logout();
    }
  }, [firebaseLoading, firebaseUser, isAuthenticated, logout]);

  if (firebaseLoading)        return <Spinner />;
  if (!firebaseUser)          return <>{children}</>;

  // Si el email no está verificado, no bloqueamos — dejamos pasar
  if (!firebaseUser.emailVerified) return <>{children}</>;

  // Usuario nuevo (Google sin registro en backend): dejamos pasar para que
  // la ruta de onboarding pueda renderizar en vez de spinear para siempre.
  if (isNewUser)              return <>{children}</>;

  if (!profile)               return <Spinner />;

  return <>{children}</>;
```

- [ ] **Step 2: Verificar typecheck**

Run (desde `apps/app/`): `npx tsc -b --noEmit`
Expected: sin errores.

> Commit lo hace el usuario.

---

### Task 4: Ruta ONBOARDING + redirección desde el login de Google

**Files:**
- Modify: `apps/app/src/shared/constants/routes.ts:6` (zona de rutas públicas)
- Modify: `apps/app/src/features/auth/pages/Login.tsx:70-83` (`handleGoogleLogin`)

**Interfaces:**
- Consumes: el 404 de `/api/users/me` (Task 1).
- Produces: `ROUTES.ONBOARDING = '/completar-perfil'`. `handleGoogleLogin` redirige a `ROUTES.ONBOARDING` cuando el usuario es nuevo. La página `OnboardingGoogle` (Task 5) se monta en esa ruta.

- [ ] **Step 1: Agregar la ruta a las constantes**

En `apps/app/src/shared/constants/routes.ts`, en el bloque de rutas públicas (después de `VERIFICATION_SUCCESS`, línea 8), agregar:

```ts
  ONBOARDING: '/completar-perfil',
```

- [ ] **Step 2: Detectar usuario nuevo en handleGoogleLogin y redirigir**

En `apps/app/src/features/auth/pages/Login.tsx`, reemplazar la función `handleGoogleLogin` (líneas 70-83) por:

```tsx
  const handleGoogleLogin = async () => {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      if (!cred.user.emailVerified) {
        await signOut(auth);
        toast.error('Verificá tu email antes de ingresar.');
        return;
      }

      // ¿Existe en el backend? 404 → usuario nuevo → onboarding.
      const token = await cred.user.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        navigate(ROUTES.ONBOARDING);
        return;
      }
      if (!res.ok) {
        toast.error('No se pudo iniciar sesión. Intentá de nuevo.');
        return;
      }

      // Usuario existente: useProfile (en AuthProvider) setea el store y redirige.
      toast.success('¡Bienvenido de vuelta!');
    } catch (err: any) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        toast.error('Ya tenés una cuenta con email y contraseña. Ingresá por ahí.');
        await signOut(auth);
        return;
      }
      if (err.code !== 'auth/popup-closed-by-user')
        toast.error(handleFirebaseError(err.code));
    }
  };
```

(`navigate`, `auth`, `signOut`, `ROUTES`, `toast`, `handleFirebaseError`, `GoogleAuthProvider`, `signInWithPopup` ya están importados/definidos en el archivo.)

- [ ] **Step 3: Verificar typecheck**

Run (desde `apps/app/`): `npx tsc -b --noEmit`
Expected: sin errores.

> Commit lo hace el usuario.

---

### Task 5: Página OnboardingGoogle + ruta en AppRouter

**Files:**
- Create: `apps/app/src/features/auth/pages/OnboardingGoogle.tsx`
- Modify: `apps/app/src/router/AppRouter.tsx` (import + ruta bajo `<AuthLayout>`)

**Interfaces:**
- Consumes: `ROUTES.ONBOARDING` (Task 4); sesión Firebase viva (`auth.currentUser`); `POST /api/users/register`.
- Produces: pantalla `/completar-perfil` que recolecta rol + teléfono [+ oficio/matrícula si PROVIDER], llama a `/api/users/register`, invalida la query `['auth-profile']` y redirige al dashboard según el rol.

- [ ] **Step 1: Crear la página OnboardingGoogle**

Create `apps/app/src/features/auth/pages/OnboardingGoogle.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import {
  User, Briefcase, Phone, ChevronDown, MapPin, ArrowRight,
} from "lucide-react";
import icono from "@/assets/icono.png";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import { useOficios } from "@/shared/hooks/useOficios";
import toast from "react-hot-toast";

type UserRole = "CLIENT" | "PROVIDER";

export function OnboardingGoogle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const firebaseUser = auth.currentUser;

  const [step, setStep] = useState<"role" | "form">("role");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedOficio, setSelectedOficio] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [matricula, setMatricula] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const { data: oficios = [] } = useOficios({ enabled: selectedRole === "PROVIDER" });

  // Si no hay sesión Firebase (entró directo a la URL), volver al login.
  useEffect(() => {
    if (!firebaseUser) navigate(ROUTES.LOGIN, { replace: true });
  }, [firebaseUser, navigate]);

  if (!firebaseUser) return null;

  const handleSubmit = async () => {
    const fieldErrors: Record<string, string> = {};
    if (!phone.trim()) fieldErrors.phone = "El teléfono es requerido";
    if (selectedRole === "PROVIDER" && !selectedOficio) fieldErrors.oficio = "Seleccioná tu oficio";
    if (selectedRole === "PROVIDER" && !matricula.trim()) fieldErrors.matricula = "El número de matrícula es requerido";
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }

    setIsPending(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          nombre: firebaseUser.displayName ?? firebaseUser.email,
          telefono: phone,
          role: selectedRole,
          oficioId: selectedOficio,
          matricula: selectedRole === "PROVIDER" ? matricula : null,
          localidad: "Rosario",
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Re-fetch del perfil: ahora el backend devuelve 200 → useProfile setea el store.
      await queryClient.refetchQueries({ queryKey: ["auth-profile"] });
      toast.success("¡Listo! Tu cuenta está completa.");
      navigate(selectedRole === "PROVIDER" ? ROUTES.PROVIDER.DASHBOARD : ROUTES.CLIENT.DASHBOARD, { replace: true });
    } catch {
      toast.error("No se pudo completar el registro. Intentá de nuevo.");
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = async () => {
    await signOut(auth);
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={icono} alt="Aliados" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Completá tu perfil</h1>
            <p className={`mt-1 text-sm ${tw.text.secondary}`}>
              {step === "role" ? "¿Cómo querés usar la plataforma?" : `Hola ${firebaseUser.displayName ?? ""}, faltan unos datos`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm">

          {step === "role" && (
            <div className="space-y-3">
              {([
                { role: "CLIENT" as UserRole, icon: User, iconBg: tw.iconBg.brand, iconColor: "text-brand-600 dark:text-dark-brand", title: "Soy Cliente", desc: "Necesito contratar profesionales para el hogar" },
                { role: "PROVIDER" as UserRole, icon: Briefcase, iconBg: tw.iconBg.green, iconColor: "text-green-600 dark:text-green-400", title: "Soy Profesional", desc: "Quiero ofrecer mis servicios y conseguir clientes" },
              ]).map(({ role, icon: Icon, iconBg, iconColor, title, desc }) => (
                <button
                  key={role}
                  onClick={() => { setSelectedRole(role); setStep("form"); }}
                  className={`group w-full flex items-center gap-4 rounded-xl border-2 p-5 text-left transition cursor-pointer border-slate-200 dark:border-dark-border hover:border-brand-400 dark:hover:border-dark-brand hover:bg-slate-50 dark:hover:bg-dark-elevated`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>{title}</p>
                    <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>{desc}</p>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 transition ${tw.text.faint} group-hover:text-brand-500 group-hover:translate-x-0.5`} />
                </button>
              ))}

              <button onClick={handleCancel} className={`w-full text-center text-xs font-medium pt-2 cursor-pointer transition ${tw.text.brand} hover:opacity-70`}>
                Cancelar y volver al login
              </button>
            </div>
          )}

          {step === "form" && selectedRole && (
            <div className="space-y-3">
              <div className={`mb-2 flex items-center gap-3 rounded-xl p-3 ${tw.iconBg.slate}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedRole === "CLIENT" ? tw.iconBg.brand : tw.iconBg.green}`}>
                  {selectedRole === "CLIENT"
                    ? <User className="h-4 w-4 text-brand-600 dark:text-dark-brand" />
                    : <Briefcase className="h-4 w-4 text-green-600 dark:text-green-400" />}
                </div>
                <p className={`flex-1 text-sm ${tw.text.secondary}`}>
                  Registrándote como{" "}
                  <span className={`font-semibold ${tw.text.primary}`}>{selectedRole === "CLIENT" ? "Cliente" : "Profesional"}</span>
                </p>
                <button onClick={() => { setStep("role"); setSelectedRole(null); setSelectedOficio(null); setErrors({}); }} className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}>
                  Cambiar
                </button>
              </div>

              <div>
                <label className={tw.label}>Teléfono</label>
                <div className="relative">
                  <Phone className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                  <input
                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 9 341 123-4567"
                    className={`${tw.input} pl-10 ${errors.phone ? "border-red-300 focus:ring-red-400" : ""}`}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              {selectedRole === "PROVIDER" && (
                <>
                  <div>
                    <label className={tw.label}>Oficio</label>
                    <div className="relative">
                      <ChevronDown className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                      <select
                        value={selectedOficio ?? ""}
                        onChange={(e) => setSelectedOficio(Number(e.target.value))}
                        className={`${tw.select} ${errors.oficio ? "border-red-300" : ""}`}
                      >
                        <option value="" disabled>Seleccioná tu oficio</option>
                        {oficios.map((o) => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                      </select>
                    </div>
                    {errors.oficio && <p className="mt-1 text-xs text-red-500">{errors.oficio}</p>}
                  </div>

                  <div>
                    <label className={tw.label}>Número de matrícula</label>
                    <div className="relative">
                      <Briefcase className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                      <input
                        type="text" value={matricula} onChange={(e) => setMatricula(e.target.value)}
                        placeholder="Ej: 12345"
                        className={`${tw.input} pl-10 ${errors.matricula ? "border-red-300 focus:ring-red-400" : ""}`}
                      />
                    </div>
                    {errors.matricula && <p className="mt-1 text-xs text-red-500">{errors.matricula}</p>}
                  </div>
                </>
              )}

              <div>
                <label className={tw.label}>Zona de servicio</label>
                <div className="relative">
                  <MapPin className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                  <input type="text" value="Rosario" readOnly className={`${tw.input} pl-10 cursor-not-allowed opacity-60 bg-slate-50 dark:bg-dark-elevated`} />
                </div>
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">Por el momento solo disponible en Rosario, Santa Fe.</p>
              </div>

              <button
                onClick={handleSubmit} disabled={isPending}
                className="mt-1 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creando cuenta...
                  </span>
                ) : "Completar registro"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Montar la ruta en AppRouter**

En `apps/app/src/router/AppRouter.tsx`, agregar el import junto a los otros de auth (cerca de la línea 8):

```tsx
import { OnboardingGoogle } from "@/features/auth/pages/OnboardingGoogle";
```

Y agregar la ruta dentro del bloque `<Route element={<AuthLayout />}>` (después de `verificacion-exitosa`, línea 65):

```tsx
            <Route path="completar-perfil" element={<OnboardingGoogle />} />
```

- [ ] **Step 3: Verificar typecheck + lint**

Run (desde `apps/app/`): `npx tsc -b --noEmit && npm run lint`
Expected: sin errores de tipos ni de lint.

- [ ] **Step 4: Build de producción**

Run (desde `apps/app/`): `npm run build`
Expected: `built in ...` sin errores.

> Commit lo hace el usuario.

---

## Verificación end-to-end (manual, en incógnito)

Tras desplegar backend (Railway) y frontend (Firebase Hosting):

1. **Google cuenta nueva (Cliente):** login con Google → redirige a `/completar-perfil` → elegir "Soy Cliente" → teléfono → "Completar registro" → entra al dashboard de cliente.
2. **Google cuenta nueva (Profesional):** igual pero "Soy Profesional" → pide oficio + matrícula → entra al dashboard de proveedor.
3. **Google cuenta existente:** login con Google → directo al dashboard, sin pasar por onboarding.
4. **Registro por email/password:** sin cambios → sigue yendo a CheckEmail.
5. **Cancelar onboarding:** botón "Cancelar y volver al login" → signOut → vuelve al login; reintentar con Google vuelve a onboarding.

## Notas de despliegue

- Task 1 toca backend → requiere redeploy a Railway.
- Tasks 2-5 tocan frontend → requieren `npm run build` + `firebase deploy --only hosting:app`.
- Los usuarios con service worker viejo se auto-actualizan en 1-2 cargas (PWA `autoUpdate`).
