# Resiliencia ante backend caído (spinner eterno en auth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app nunca deje al usuario trabado en un spinner eterno cuando el backend no responde, dándole salida (Reintentar / Cerrar sesión), y que el flag `blocked` de mantenimiento tenga precedencia sobre ese estado.

**Architecture:** (A) Extraer el fetch del perfil a una función pura con timeout y clasificación de error, testeable; `useProfile` la consume con 1 reintento; `AuthProvider` distingue cargando vs error recuperable y muestra una pantalla de fallo con salida. (B) Reordenar el árbol de providers para que `MaintenanceGate` quede por encima de `AuthProvider`.

**Tech Stack:** React 19 + Vite + TypeScript, @tanstack/react-query, Firebase Auth, Vitest (entorno node, solo lógica pura), Tailwind.

## Global Constraints

- **Sin acciones de git sin orden explícita del usuario.** Los pasos "Commit" se ejecutan solo con OK explícito; si no, se dejan los cambios **staged** y se sigue. (En la ejecución actual: sin commits, todo staged.)
- **Pre-launch:** prod es el único entorno (dev + 2 testers). No hay staging.
- **Sin dependencias nuevas.** Usar lo ya instalado (react-query, firebase).
- **Timeout del perfil: 5000 ms** por intento (mobile-first; por debajo se arriesgan falsos positivos por red lenta).
- **Reintentos del bootstrap: 1** (2 intentos en total). No reintentar `unauthorized` (401/403) ni `not-registered` (404).
- **Copy en español (voseo).** Texto demorado del spinner (≈3s): `Esto está tardando más de lo normal, por favor aguardá…`. Pantalla de fallo: título `No pudimos conectar con el servidor`, botones `Reintentar` y `Cerrar sesión`.
- **Tests:** Vitest corre en entorno **node sin jsdom** → solo se testea lógica pura (`fetchProfile`). Hooks/componentes React se verifican con typecheck + manual.
- **Orden final del árbol:** `ThemeProvider → MaintenanceGate → AuthProvider → WebSocketProvider → AppRouter`.

---

### Task 1: `fetchProfile` — fetch del perfil con timeout (lógica pura + tests)

Extrae la parte de red del bootstrap a una función pura, sin Firebase ni store, para poder testear timeout y clasificación de error.

**Files:**
- Create: `apps/app/src/shared/lib/fetchProfile.ts`
- Test: `apps/app/src/shared/lib/__tests__/fetchProfile.test.ts`

**Interfaces:**
- Produces:
  - `type ProfileErrorKind = 'unauthorized' | 'not-registered' | 'timeout' | 'server'`
  - `class ProfileError extends Error { kind: ProfileErrorKind }`
  - `fetchProfile(apiUrl: string, token: string, timeoutMs: number, fetchImpl?: typeof fetch): Promise<any>` — resuelve con el JSON crudo del backend, o lanza `ProfileError` clasificado.

- [ ] **Step 1: Escribir los tests (fallan)**

`apps/app/src/shared/lib/__tests__/fetchProfile.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchProfile, ProfileError } from '@/shared/lib/fetchProfile';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const API = 'http://test.local';

describe('fetchProfile', () => {
  it('200 → devuelve el body del backend', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { nombre: 'Ana', role: 'CLIENT' }));
    const data = await fetchProfile(API, 'tok', 5000, fetchMock as any);
    expect(data).toEqual({ nombre: 'Ana', role: 'CLIENT' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('401 → ProfileError kind=unauthorized', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('403 → ProfileError kind=unauthorized', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('404 → ProfileError kind=not-registered', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'not-registered',
    });
  });

  it('500 → ProfileError kind=server', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('backend colgado → aborta por timeout → ProfileError kind=timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    await expect(fetchProfile(API, 'tok', 20, fetchMock as any)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('error de red → ProfileError kind=server', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    await expect(fetchProfile(API, 'tok', 5000, fetchMock as any)).rejects.toMatchObject({
      kind: 'server',
    });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd apps/app && pnpm test fetchProfile`
Expected: FAIL (`Cannot find module '@/shared/lib/fetchProfile'`).

- [ ] **Step 3: Implementar `fetchProfile.ts`**

`apps/app/src/shared/lib/fetchProfile.ts`:
```ts
export type ProfileErrorKind =
  | 'unauthorized'
  | 'not-registered'
  | 'timeout'
  | 'server';

export class ProfileError extends Error {
  kind: ProfileErrorKind;
  constructor(kind: ProfileErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = 'ProfileError';
  }
}

// Trae el perfil del backend con timeout. Función pura/testeable: no toca Firebase
// ni el store, solo hace el fetch y clasifica el resultado.
export async function fetchProfile(
  apiUrl: string,
  token: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) throw new ProfileError('unauthorized');
    if (res.status === 404) throw new ProfileError('not-registered');
    if (!res.ok) throw new ProfileError('server', `Server error: ${res.status}`);

    return await res.json();
  } catch (err) {
    if (err instanceof ProfileError) throw err;
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
      throw new ProfileError('timeout');
    }
    throw new ProfileError('server', 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/app && pnpm test fetchProfile`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/lib/fetchProfile.ts apps/app/src/shared/lib/__tests__/fetchProfile.test.ts
git commit -m "feat(auth): fetchProfile puro con timeout y clasificación de error"
```

---

### Task 2: Conectar `useProfile` a `fetchProfile` (timeout + 1 reintento)

Reemplaza el fetch inline de `useProfile` por `fetchProfile`, baja los reintentos a 1 y clasifica con `ProfileError`.

**Files:**
- Modify: `apps/app/src/shared/hooks/useProfile.ts` (reemplazo completo)

**Interfaces:**
- Consumes (Task 1): `fetchProfile`, `ProfileError`.
- Produces: `useProfile(firebaseUser)` devuelve el objeto de React Query (`data`, `isError`, `error`, `refetch`, `isFetching`, …) + `isNewUser: boolean`. `data` es `User`. En error 401/403 hace `signOut`+`logout`. `error` (cuando existe) es una `ProfileError`.

- [ ] **Step 1: Reemplazar el contenido de `useProfile.ts`**

Contenido completo nuevo de `apps/app/src/shared/hooks/useProfile.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import type { User } from '@/shared/types/interfaces';
import { fetchProfile, ProfileError } from '@/shared/lib/fetchProfile';

const API_URL = import.meta.env.VITE_API_URL;
const PROFILE_TIMEOUT_MS = 5000;

/**
 * Capa 2: Carga el perfil del backend cuando hay firebaseUser con email verificado.
 * - enabled: solo corre con firebaseUser + email verificado
 * - 401/403 → signOut + logout; 404 → not-registered (onboarding); timeout/server → recuperable
 * - 1 reintento para errores recuperables (peor caso ~10s a la pantalla de fallo)
 */
export function useProfile(firebaseUser: FirebaseUser | null) {
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);

  const uid = firebaseUser?.uid ?? null;
  const emailVerified = firebaseUser?.emailVerified ?? false;

  const query = useQuery<User>({
    queryKey: ['auth-profile', uid],

    queryFn: async (): Promise<User> => {
      if (!firebaseUser) throw new Error('No firebase user');

      const token = await firebaseUser.getIdToken();

      let data: any;
      try {
        data = await fetchProfile(API_URL, token, PROFILE_TIMEOUT_MS);
      } catch (err) {
        // 401/403 → la sesión ya no vale: cerramos en Firebase y en el store.
        if (err instanceof ProfileError && err.kind === 'unauthorized') {
          await signOut(auth);
          logout();
        }
        throw err;
      }

      const user: User = {
        uid: firebaseUser.uid,
        name: data.nombre,
        email: data.email,
        role: data.role,
        status: data.status || 'OFFLINE',
        telefono: data.telefono ?? null,
        fotoPerfil: data.fotoPerfil ?? null,
        localidad: data.localidad ?? null,
        oficio: data.oficio ?? null,
        promedioCalificacion: data.promedioCalificacion ?? 0,
        cantidadCalificaciones: data.cantidadCalificaciones ?? 0,
        totalTrabajosCompletados: data.totalTrabajosCompletados ?? 0,
      };

      // Sincronizar store con la verdad del backend
      login(user);

      return user;
    },

    enabled: !!firebaseUser && emailVerified,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,

    // No reintentar unauthorized (401/403) ni not-registered (404).
    // Recuperables (timeout/server): 1 reintento → 2 intentos en total.
    retry: (failureCount, error) => {
      if (
        error instanceof ProfileError &&
        (error.kind === 'unauthorized' || error.kind === 'not-registered')
      ) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const isNewUser =
    query.error instanceof ProfileError && query.error.kind === 'not-registered';

  return { ...query, isNewUser };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Correr la suite (no rompe lógica pura existente)**

Run: `cd apps/app && pnpm test`
Expected: PASS (incluye los tests de Task 1; no hay tests de hook).

- [ ] **Step 4: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/hooks/useProfile.ts
git commit -m "feat(auth): useProfile con timeout (5s) y 1 reintento via fetchProfile"
```

---

### Task 3: `AuthErrorScreen` — pantalla de fallo con salida

Pantalla a pantalla completa cuando el perfil no carga por backend caído. Da Reintentar y Cerrar sesión. Se renderiza FUERA del Router (AuthProvider está sobre AppRouter), por eso el redirect es por `window.location`.

**Files:**
- Create: `apps/app/src/shared/components/AuthErrorScreen.tsx`

**Interfaces:**
- Consumes (existente): `auth` (`@/shared/lib/firebase`), `useStore`, `ROUTES` (`@/shared/constants/routes`, `ROUTES.LOGIN === '/login'`), asset `@/assets/icono.png`.
- Produces: `<AuthErrorScreen onRetry={() => void} retrying={boolean} />`.

- [ ] **Step 1: Crear `AuthErrorScreen.tsx`**

`apps/app/src/shared/components/AuthErrorScreen.tsx`:
```tsx
import { signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import { ROUTES } from '@/shared/constants/routes';
import icono from '@/assets/icono.png';

// Pantalla de fallo de conexión durante el bootstrap de auth: da salida cuando el
// backend no responde (la sesión queda persistida pero sin perfil). Se renderiza
// FUERA del Router, por eso "Cerrar sesión" redirige con window.location.
export function AuthErrorScreen({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  const logout = useStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignoramos: igual limpiamos el store y redirigimos
    }
    logout();
    window.location.assign(ROUTES.LOGIN);
  };

  return (
    <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-dark-bg">
      <img src={icono} alt="Aliados" className="h-14 w-auto" />
      <h1 className="text-2xl font-bold text-slate-900 dark:text-dark-text">
        No pudimos conectar con el servidor
      </h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-dark-text-secondary">
        Revisá tu conexión e intentá de nuevo. Si el problema sigue, cerrá sesión y
        volvé a entrar.
      </p>
      <div className="mt-2 flex flex-col items-center gap-2 min-[375px]:flex-row">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
        >
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
        <button
          onClick={handleLogout}
          className="cursor-pointer rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-dark-border dark:text-dark-text-secondary dark:hover:bg-dark-elevated"
        >
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/components/AuthErrorScreen.tsx
git commit -m "feat(auth): AuthErrorScreen (Reintentar / Cerrar sesión)"
```

---

### Task 4: `AuthProvider` — rama de error + spinner con texto demorado

Hace que el provider distinga cargando vs error recuperable, y que el spinner muestre un texto tranquilizador a los ~3s.

**Files:**
- Modify: `apps/app/src/shared/components/AuthProvider.tsx` (reemplazo completo)

**Interfaces:**
- Consumes (Task 1): `ProfileError`. (Task 2): `useProfile` (con `isError`, `error`, `refetch`, `isFetching`). (Task 3): `AuthErrorScreen`. (existente): `useFirebaseAuth`, `useStore`.
- Produces: comportamiento de `AuthProvider` sin cambio de firma (`{ children }`).

- [ ] **Step 1: Reemplazar el contenido de `AuthProvider.tsx`**

Contenido completo nuevo de `apps/app/src/shared/components/AuthProvider.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useFirebaseAuth } from '@/shared/hooks/useFirebaseAuth';
import { useProfile } from '@/shared/hooks/useProfile';
import { useStore } from '@/shared/store/useStore';
import { ProfileError } from '@/shared/lib/fetchProfile';
import { AuthErrorScreen } from '@/shared/components/AuthErrorScreen';

// Spinner con texto demorado: si la espera supera ~3s, tranquiliza al usuario.
const Spinner = () => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-dark-bg">
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-600 dark:border-dark-brand border-t-transparent" />
      {slow && (
        <p className="px-6 text-center text-sm text-slate-500 dark:text-dark-text-secondary">
          Esto está tardando más de lo normal, por favor aguardá…
        </p>
      )}
    </div>
  );
};

/**
 * AuthProvider — Orquestador de 2 capas (Firebase + perfil backend)
 *
 * 1. Firebase resolviendo → Spinner
 * 2. Firebase sin usuario / sin email verificado / usuario nuevo → children
 * 3. Perfil falló por backend caído (timeout/server) → AuthErrorScreen (con salida)
 * 4. Perfil cargando → Spinner
 * 5. Perfil listo → children
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isLoading: firebaseLoading } = useFirebaseAuth();
  const { data: profile, isNewUser, isError, error, refetch, isFetching } =
    useProfile(firebaseUser);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    if (!firebaseLoading && !firebaseUser && isAuthenticated) {
      logout();
    }
  }, [firebaseLoading, firebaseUser, isAuthenticated, logout]);

  // Error recuperable (backend caído/colgado): timeout o server.
  // NO unauthorized (ya desloguea) ni not-registered (va a onboarding).
  const isRecoverableError =
    isError &&
    error instanceof ProfileError &&
    (error.kind === 'timeout' || error.kind === 'server');

  if (firebaseLoading)             return <Spinner />;
  if (!firebaseUser)               return <>{children}</>;
  if (!firebaseUser.emailVerified) return <>{children}</>;
  if (isNewUser)                   return <>{children}</>;
  if (isRecoverableError)
    return <AuthErrorScreen onRetry={() => refetch()} retrying={isFetching} />;
  if (!profile)                    return <Spinner />;

  return <>{children}</>;
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 3: Verificación manual (error recuperable)**

1. Logueate con una sesión válida (perfil carga ok).
2. Cortá el backend (o en DevTools → Network, poné "Offline", o apuntá `VITE_API_URL` a un puerto muerto) y recargá.
3. Esperá: a los ~3s aparece *"Esto está tardando más de lo normal, por favor aguardá…"*; a los ~10s aparece la pantalla **No pudimos conectar con el servidor** con **Reintentar** / **Cerrar sesión**.
4. **Cerrar sesión** → te lleva a `/login`. **Reintentar** (con backend arriba) → entra normal.

- [ ] **Step 4: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/components/AuthProvider.tsx
git commit -m "feat(auth): AuthProvider maneja error de backend + spinner con texto demorado"
```

---

### Task 5: Reorden de providers — `MaintenanceGate` por encima de `AuthProvider`

Mueve `AuthProvider` dentro de `App`, debajo del `MaintenanceGate`, para que `blocked` corte antes que el spinner/fallo de auth.

**Files:**
- Modify: `apps/app/src/App.tsx` (reemplazo completo)
- Modify: `apps/app/src/main.tsx` (sacar `AuthProvider` de acá)

**Interfaces:**
- Consumes (Task 4): `AuthProvider`.
- Produces: árbol `ThemeProvider → MaintenanceGate → AuthProvider → WebSocketProvider → AppRouter`.

- [ ] **Step 1: Reemplazar `App.tsx`**

Contenido completo nuevo de `apps/app/src/App.tsx`:
```tsx
import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";
import { AuthProvider } from "@/shared/components/AuthProvider";

export default function App() {
  return (
    <ThemeProvider>
      <MaintenanceGate>
        <AuthProvider>
          <WebSocketProvider>
            <AppRouter />
          </WebSocketProvider>
        </AuthProvider>
      </MaintenanceGate>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Sacar `AuthProvider` de `main.tsx`**

En `apps/app/src/main.tsx`:
1. Borrar el import de `AuthProvider` (línea ~7: `import { AuthProvider } from './shared/components/AuthProvider'`).
2. Quitar las etiquetas `<AuthProvider>` y `</AuthProvider>` que envuelven a `<App />` + `<Toaster />`, dejando a `<App />`, `<Toaster .../>` y `<ReactQueryDevtools .../>` como hijos directos de `<QueryClientProvider>`.

El bloque del render queda así (mantener exactamente las props del `<Toaster>` y `<ReactQueryDevtools>` que ya existían):
```tsx
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          duration: 3500,
          style: {
            background: '#ffffff',
            color: '#0f172a',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            fontSize: '14px',
            fontWeight: '500',
            padding: '12px 16px',
            maxWidth: '360px',
          },
          success: {
            iconTheme: { primary: '#16a34a', secondary: '#ffffff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          },
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
```

> Nota: `QueryClientProvider` queda por encima de `App` (y por lo tanto de `AuthProvider`), así que `useProfile` sigue teniendo su `QueryClient`. `ThemeProvider` ahora envuelve al `AuthProvider`, así que el Spinner y la `AuthErrorScreen` heredan el dark mode.

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 4: Verificación manual (precedencia de mantenimiento)**

1. App logueada y funcionando.
2. Cortá el backend y, en Firebase Remote Config, poné `maintenance_level=blocked` y publicá.
3. En ≤60s (o recargando) debe verse la **pantalla de mantenimiento** (no la de error de auth ni el spinner): el Gate gana porque está por encima de `AuthProvider`.
4. Volvé `maintenance_level=off`: con el backend caído, vuelve a verse la `AuthErrorScreen` (no el spinner eterno).

- [ ] **Step 5: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/App.tsx apps/app/src/main.tsx
git commit -m "refactor(app): MaintenanceGate por encima de AuthProvider (blocked gana)"
```

---

## Acciones manuales del usuario (fuera del código)

Ninguna nueva. (Remote Config ya está configurado del trabajo de modo mantenimiento.)
