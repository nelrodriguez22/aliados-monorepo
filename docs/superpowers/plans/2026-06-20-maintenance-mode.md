# Modo Mantenimiento + Deploys sin Downtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los deploys normales del backend sean invisibles para el usuario, y poder activar un modo mantenimiento (aviso + bloqueo) en runtime sin redeploy y sin depender del backend.

**Architecture:** Dos subsistemas independientes. (1) Modo mantenimiento manejado 100% en el frontend vía Firebase Remote Config (flag siempre disponible, toggleable desde consola). (2) Zero-downtime en deploys vía healthcheck de Railway + graceful shutdown de Spring Boot + retry de GETs en el `apiClient`.

**Tech Stack:** React 19 + Vite (rolldown) + TypeScript, Firebase Remote Config (paquete `firebase` 12.9.0, sin deps nuevas), Vitest (nuevo, solo para lógica pura), Spring Boot 3.4.2 en Railway (Docker).

## Global Constraints

- **Sin acciones de git sin orden explícita del usuario.** Los pasos "Commit" de este plan se ejecutan **solo con el OK explícito del usuario** en el momento. Si no hay OK, se dejan los cambios staged y se sigue.
- **Pre-launch:** prod es el único entorno (dev + 2 testers). No hay staging.
- **Sin dependencias nuevas para Remote Config:** usar el paquete `firebase` (12.9.0) ya instalado (`firebase/remote-config`).
- **Fail-open:** si Remote Config falla o los parámetros no existen, la app funciona normal (`maintenance_level = off` por defecto).
- **Niveles válidos de `maintenance_level`:** `off` | `warning` | `blocked`. Cualquier otro valor → `off`.
- **Retry del `apiClient`:** solo métodos idempotentes (GET). Nunca reintentar POST/PATCH/PUT/DELETE.
- **Copy en español** (es la lengua del producto). Default title: `Estamos actualizando`. Default message: `Volvemos en unos minutos. ¡Gracias por la paciencia!`.

---

### Task 1: Setup de Vitest (entorno node, sin jsdom)

Solo testeamos lógica pura (retry y helpers de mantenimiento), así que no hace falta jsdom ni testing-library.

**Files:**
- Modify: `apps/app/package.json` (devDependency `vitest` + script `test`)
- Create: `apps/app/vitest.config.ts`
- Create: `apps/app/src/shared/lib/__tests__/smoke.test.ts` (test de humo, se borra en el commit siguiente)

**Interfaces:**
- Produces: comando `pnpm test` corriendo Vitest con alias `@` → `src/` y `import.meta.env.VITE_API_URL` definido.

- [ ] **Step 1: Instalar Vitest**

Run:
```bash
cd apps/app && pnpm add -D vitest@^3
```
Expected: `vitest` aparece en `devDependencies`.

- [ ] **Step 2: Crear `vitest.config.ts`**

Archivo separado del `vite.config.ts` para no arrastrar los plugins de PWA/Sentry ni el `rolldownOptions` de build.

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    env: { VITE_API_URL: "http://test.local" },
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Agregar script `test` en `package.json`**

En la sección `"scripts"`, agregar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escribir test de humo**

`apps/app/src/shared/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("corre y lee import.meta.env", () => {
    expect(import.meta.env.VITE_API_URL).toBe("http://test.local");
  });
});
```

- [ ] **Step 5: Correr el test de humo**

Run: `cd apps/app && pnpm test`
Expected: PASS (1 test).

- [ ] **Step 6: Borrar el test de humo y commit**

```bash
rm apps/app/src/shared/lib/__tests__/smoke.test.ts
```
Commit (solo con OK del usuario):
```bash
git add apps/app/package.json apps/app/vitest.config.ts pnpm-lock.yaml
git commit -m "chore: setup vitest para tests de lógica pura"
```

---

### Task 2: Retry de GETs transitorios en `apiClient`

El `apiClient` tiene una única función `request()` — punto central para reintentar `502/503/504` y errores de red en métodos idempotentes.

**Files:**
- Modify: `apps/app/src/shared/lib/apiClient.ts`
- Test: `apps/app/src/shared/lib/__tests__/apiClient.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `apiClient.get/post/patch/put/delete` con la misma firma pública de hoy; comportamiento nuevo: GET reintenta hasta 2 veces ante `502/503/504`/error de red.

- [ ] **Step 1: Escribir los tests (fallan)**

`apps/app/src/shared/lib/__tests__/apiClient.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Evita importar firebase (getToken) en el test.
vi.mock("@/shared/lib/getToken", () => ({ getToken: vi.fn(async () => "tok") }));

import { apiClient } from "@/shared/lib/apiClient";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiClient retry", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("reintenta un GET ante 502 y devuelve el 200 siguiente", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: "bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiClient.get("/cosa", false);

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta un GET ante error de red y luego resuelve", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiClient.get("/x", false);

    expect(res).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NO reintenta un POST ante 502 (evita doble escritura)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, { error: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.post("/x", { a: 1 }, false)).rejects.toMatchObject({
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no reintenta indefinidamente: GET que siempre da 503 falla tras 3 intentos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { error: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/x", false)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 reintentos
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd apps/app && pnpm test apiClient`
Expected: FAIL (hoy no hay retry — el primer 502 se lanza enseguida).

- [ ] **Step 3: Implementar el retry en `apiClient.ts`**

Reemplazar la función `request` (líneas ~14-55) por esta versión. El resto del archivo (la clase `ApiError`, el objeto `apiClient`, los `export`) queda igual.

```ts
const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [300, 800];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isIdempotent = (method?: string) =>
  !method || method.toUpperCase() === "GET";

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (auth) {
    const token = await getToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const method = (options.method || "GET").toString();
  let attempt = 0;

  // Reintenta solo GET (idempotente) ante 5xx transitorio o error de red.
  while (true) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    } catch (err) {
      if (isIdempotent(method) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
        attempt++;
        continue;
      }
      throw err;
    }

    if (
      !response.ok &&
      RETRY_STATUSES.has(response.status) &&
      isIdempotent(method) &&
      attempt < MAX_RETRIES
    ) {
      await sleep(RETRY_BACKOFF_MS[attempt]);
      attempt++;
      continue;
    }

    if (!response.ok) {
      let message: string;
      try {
        const errorData = await response.json();
        message = errorData.message || errorData.error || response.statusText;
      } catch {
        message = await response.text().catch(() => response.statusText);
      }
      throw new ApiError(message, response.status);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return {} as T;
    }
    return response.json();
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/app && pnpm test apiClient`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit (solo con OK del usuario)**

```bash
git add apps/app/src/shared/lib/apiClient.ts apps/app/src/shared/lib/__tests__/apiClient.test.ts
git commit -m "feat(api): retry de GETs ante 5xx/red transitorios"
```

---

### Task 3: Helpers puros de mantenimiento

Lógica pura y testeable, sin React ni Firebase: normalizar el nivel, resolver el bypass y decidir qué vista mostrar.

**Files:**
- Create: `apps/app/src/shared/lib/maintenance.ts`
- Test: `apps/app/src/shared/lib/__tests__/maintenance.test.ts`

**Interfaces:**
- Produces:
  - `type MaintenanceLevel = "off" | "warning" | "blocked"`
  - `interface MaintenanceState { level: MaintenanceLevel; title: string; message: string; eta: string }`
  - `resolveLevel(raw: string | undefined): MaintenanceLevel`
  - `readBypassFlag(search: string, storage: Pick<Storage, "getItem" | "setItem">): boolean`
  - `getMaintenanceView(level: MaintenanceLevel, bypass: boolean): "app" | "banner" | "block"`
  - `BYPASS_KEY = "aliados-maintenance-bypass"`

- [ ] **Step 1: Escribir los tests (fallan)**

`apps/app/src/shared/lib/__tests__/maintenance.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  resolveLevel,
  readBypassFlag,
  getMaintenanceView,
  BYPASS_KEY,
} from "@/shared/lib/maintenance";

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    _map: m,
  };
}

describe("resolveLevel", () => {
  it("acepta los 3 niveles válidos", () => {
    expect(resolveLevel("off")).toBe("off");
    expect(resolveLevel("warning")).toBe("warning");
    expect(resolveLevel("blocked")).toBe("blocked");
  });
  it("cae a 'off' ante valor desconocido, vacío o undefined", () => {
    expect(resolveLevel("xxx")).toBe("off");
    expect(resolveLevel("")).toBe("off");
    expect(resolveLevel(undefined)).toBe("off");
  });
  it("es case-insensitive y tolera espacios", () => {
    expect(resolveLevel(" BLOCKED ")).toBe("blocked");
  });
});

describe("readBypassFlag", () => {
  it("activa y persiste el bypass cuando la URL tiene nomaint=1", () => {
    const s = fakeStorage();
    expect(readBypassFlag("?nomaint=1", s)).toBe(true);
    expect(s.getItem(BYPASS_KEY)).toBe("1");
  });
  it("respeta el flag ya persistido aunque la URL no lo traiga", () => {
    const s = fakeStorage({ [BYPASS_KEY]: "1" });
    expect(readBypassFlag("", s)).toBe(true);
  });
  it("es false sin URL ni flag previo", () => {
    expect(readBypassFlag("", fakeStorage())).toBe(false);
  });
});

describe("getMaintenanceView", () => {
  it("off → app", () => expect(getMaintenanceView("off", false)).toBe("app"));
  it("warning → banner", () =>
    expect(getMaintenanceView("warning", false)).toBe("banner"));
  it("blocked sin bypass → block", () =>
    expect(getMaintenanceView("blocked", false)).toBe("block"));
  it("blocked con bypass → app", () =>
    expect(getMaintenanceView("blocked", true)).toBe("app"));
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd apps/app && pnpm test maintenance`
Expected: FAIL ("Cannot find module '@/shared/lib/maintenance'").

- [ ] **Step 3: Implementar `maintenance.ts`**

`apps/app/src/shared/lib/maintenance.ts`:
```ts
export type MaintenanceLevel = "off" | "warning" | "blocked";

export interface MaintenanceState {
  level: MaintenanceLevel;
  title: string;
  message: string;
  eta: string;
}

export const BYPASS_KEY = "aliados-maintenance-bypass";

const VALID: readonly MaintenanceLevel[] = ["off", "warning", "blocked"];

export function resolveLevel(raw: string | undefined): MaintenanceLevel {
  const v = (raw ?? "").trim().toLowerCase();
  return (VALID as readonly string[]).includes(v)
    ? (v as MaintenanceLevel)
    : "off";
}

// Si la URL trae ?nomaint=1 lo persiste; devuelve si el bypass está activo.
export function readBypassFlag(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem">,
): boolean {
  if (new URLSearchParams(search).get("nomaint") === "1") {
    storage.setItem(BYPASS_KEY, "1");
  }
  return storage.getItem(BYPASS_KEY) === "1";
}

export function getMaintenanceView(
  level: MaintenanceLevel,
  bypass: boolean,
): "app" | "banner" | "block" {
  if (level === "blocked") return bypass ? "app" : "block";
  if (level === "warning") return "banner";
  return "app";
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/app && pnpm test maintenance`
Expected: PASS (todos).

- [ ] **Step 5: Commit (solo con OK del usuario)**

```bash
git add apps/app/src/shared/lib/maintenance.ts apps/app/src/shared/lib/__tests__/maintenance.test.ts
git commit -m "feat(maintenance): helpers puros de nivel/bypass/vista"
```

---

### Task 4: Remote Config + hook `useMaintenance`

Capa de datos: inicializa Remote Config (fail-open) y expone el estado al frontend con polling. Verificación manual (depende de Firebase en runtime).

**Files:**
- Create: `apps/app/src/shared/lib/remoteConfig.ts`
- Create: `apps/app/src/shared/hooks/useMaintenance.ts`

**Interfaces:**
- Consumes (Task 3): `MaintenanceLevel`, `MaintenanceState`, `resolveLevel`, `readBypassFlag`, `getMaintenanceView`.
- Consumes (existente): `app` (default export de `@/shared/lib/firebase`).
- Produces:
  - `fetchMaintenance(): Promise<MaintenanceState>`
  - `useMaintenance(): { state: MaintenanceState; bypass: boolean; refetch: () => void }`

- [ ] **Step 1: Crear `remoteConfig.ts`**

```ts
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import app from "@/shared/lib/firebase";
import {
  resolveLevel,
  type MaintenanceState,
} from "@/shared/lib/maintenance";

const DEFAULTS = {
  maintenance_level: "off",
  maintenance_title: "Estamos actualizando",
  maintenance_message: "Volvemos en unos minutos. ¡Gracias por la paciencia!",
  maintenance_eta: "",
};

let rc: ReturnType<typeof getRemoteConfig> | null = null;

function getRc() {
  if (!rc) {
    rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.PROD ? 60_000 : 0;
    rc.defaultConfig = DEFAULTS;
  }
  return rc;
}

// Fail-open: ante cualquier error de Remote Config devolvemos los defaults (off).
export async function fetchMaintenance(): Promise<MaintenanceState> {
  try {
    const instance = getRc();
    await fetchAndActivate(instance);
    return {
      level: resolveLevel(getValue(instance, "maintenance_level").asString()),
      title: getValue(instance, "maintenance_title").asString(),
      message: getValue(instance, "maintenance_message").asString(),
      eta: getValue(instance, "maintenance_eta").asString(),
    };
  } catch {
    return {
      level: "off",
      title: DEFAULTS.maintenance_title,
      message: DEFAULTS.maintenance_message,
      eta: "",
    };
  }
}
```

- [ ] **Step 2: Crear `useMaintenance.ts`**

Poll de 60s normal; cuando está `blocked`, acelera a 20s para recuperar rápido al apagarlo.

```ts
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchMaintenance } from "@/shared/lib/remoteConfig";
import {
  readBypassFlag,
  type MaintenanceState,
} from "@/shared/lib/maintenance";

const OFF: MaintenanceState = {
  level: "off",
  title: "",
  message: "",
  eta: "",
};

export function useMaintenance() {
  const [state, setState] = useState<MaintenanceState>(OFF);
  const bypass = useRef(
    readBypassFlag(window.location.search, window.localStorage),
  ).current;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const refetch = useCallback(() => {
    fetchMaintenance().then(setState).catch(() => setState(OFF));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchMaintenance()
        .then((s) => {
          if (!alive) return;
          setState(s);
          const delay = s.level === "blocked" ? 20_000 : 60_000;
          timer.current = setTimeout(tick, delay);
        })
        .catch(() => {
          if (!alive) return;
          setState(OFF);
          timer.current = setTimeout(tick, 60_000);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { state, bypass, refetch };
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit (solo con OK del usuario)**

```bash
git add apps/app/src/shared/lib/remoteConfig.ts apps/app/src/shared/hooks/useMaintenance.ts
git commit -m "feat(maintenance): remote config + hook useMaintenance"
```

---

### Task 5: `MaintenanceGate` + montaje en App

Componente que decide qué mostrar (app / banner / bloqueo) según el estado. Verificación manual en el browser.

**Files:**
- Create: `apps/app/src/shared/components/MaintenanceGate.tsx`
- Modify: `apps/app/src/App.tsx`

**Interfaces:**
- Consumes (Task 3): `getMaintenanceView`. (Task 4): `useMaintenance`.
- Produces: `<MaintenanceGate>{children}</MaintenanceGate>`.

- [ ] **Step 1: Crear `MaintenanceGate.tsx`**

```tsx
import type { ReactNode } from "react";
import { useMaintenance } from "@/shared/hooks/useMaintenance";
import { getMaintenanceView } from "@/shared/lib/maintenance";
import icono from "@/assets/icono.png";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { state, bypass, refetch } = useMaintenance();
  const view = getMaintenanceView(state.level, bypass);

  if (view === "block") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-dark-bg">
        <img src={icono} alt="Aliados" className="h-14 w-auto" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-dark-text">
          {state.title || "Estamos actualizando"}
        </h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-dark-text-secondary">
          {state.message || "Volvemos en unos minutos. ¡Gracias por la paciencia!"}
        </p>
        {state.eta && (
          <p className="text-xs font-medium text-brand-600 dark:text-dark-brand">
            Estimado: {state.eta}
          </p>
        )}
        <button
          onClick={refetch}
          className="mt-2 cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
        >
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <>
      {view === "banner" && (
        <div className="w-full bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
          {state.message || "Vamos a actualizar la app pronto, puede haber interrupciones."}
          {state.eta && <span className="ml-1 font-semibold">({state.eta})</span>}
        </div>
      )}
      {children}
    </>
  );
}
```

- [ ] **Step 2: Montar en `App.tsx`**

Envolver el router (cubre también las páginas de auth). Nuevo contenido completo de `apps/app/src/App.tsx`:

```tsx
import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";

export default function App() {
  return (
    <ThemeProvider>
      <MaintenanceGate>
        <WebSocketProvider>
          <AppRouter />
        </WebSocketProvider>
      </MaintenanceGate>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Verificar typecheck + build**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Verificación manual**

1. `cd apps/app && pnpm dev`.
2. En Firebase Console → Remote Config, crear `maintenance_level` y ponerlo en `warning` → recargar → ver el banner ámbar arriba.
3. Ponerlo en `blocked` → en ≤60s (o recargar) → ver la pantalla de bloqueo con "Reintentar".
4. Abrir con `?nomaint=1` estando en `blocked` → la app carga igual (bypass).
5. Volver a `off` → la app vuelve normal.

- [ ] **Step 5: Commit (solo con OK del usuario)**

```bash
git add apps/app/src/shared/components/MaintenanceGate.tsx apps/app/src/App.tsx
git commit -m "feat(maintenance): MaintenanceGate (banner + bloqueo) montado en App"
```

---

### Task 6: Graceful shutdown del backend

Que las requests en vuelo terminen antes de que muera el contenedor viejo en un deploy.

**Files:**
- Modify: `backend/src/main/resources/application.properties`

**Interfaces:** ninguna (config).

- [ ] **Step 1: Agregar las propiedades**

Al final de `backend/src/main/resources/application.properties`:
```properties
# Graceful shutdown: termina requests en vuelo antes de cerrar (deploys sin cortar)
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

- [ ] **Step 2: Verificar que el backend compila**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit (solo con OK del usuario)**

```bash
git add backend/src/main/resources/application.properties
git commit -m "feat(backend): graceful shutdown para deploys sin cortar requests"
```

---

### Task 7: Healthcheck de Railway (causa raíz de los 502)

Que Railway mantenga el contenedor viejo sirviendo hasta que el nuevo responda 200 en `/api/health`.

**Files:**
- Create: `backend/railway.json`

**Interfaces:** ninguna (config de plataforma). El endpoint `/api/health` ya existe (`HealthController`) y está permitido en `SecurityConfig`.

- [ ] **Step 1: Crear `backend/railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "deploy": {
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300
  }
}
```

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('backend/railway.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Verificación manual (post-deploy)**

1. Confirmar en el dashboard de Railway que el servicio del backend tiene "Root Directory" = `backend` (para que lea este `railway.json`); si no, ajustar la ruta del archivo.
2. Hacer un deploy del backend y mirar el Network del front en prod durante el switch → debe haber **0 respuestas 502**.

- [ ] **Step 4: Commit (solo con OK del usuario)**

```bash
git add backend/railway.json
git commit -m "feat(backend): healthcheck de Railway para deploys zero-downtime"
```

---

## Acciones manuales del usuario (fuera del código)

1. **Firebase Console → Remote Config:** crear los 4 parámetros (`maintenance_level=off`, `maintenance_title`, `maintenance_message`, `maintenance_eta`) y publicar.
2. **Railway dashboard:** confirmar healthcheck y "Root Directory" del servicio backend.

## Nota: WebSocket

El cliente STOMP ya reconecta solo (`useWebSocket.ts:72` → `reconnectDelay: 5000`). El punto 2d del spec ya está cubierto; no requiere tarea.
