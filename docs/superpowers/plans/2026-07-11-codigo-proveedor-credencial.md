# Código identificatorio del proveedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada proveedor un código identificatorio legible (`ELE-0047`) visible en una credencial con QR y en las cards del cliente, para validar a la persona que llega al domicilio.

**Architecture:** El código se calcula en el backend (única fuente de verdad) con un helper puro y se expone ya formateado como string en tres DTOs existentes (`TrabajoResponseDTO`, `MudanzaResponseDTO`, `UserResponseDTO`). El frontend solo lo muestra: una credencial a pantalla completa con QR para el proveedor y un chip discreto en las cards del cliente.

**Tech Stack:** Backend Spring Boot + JUnit (Gradle). Frontend React 19 + Vite + Tailwind 4 + vitest/testing-library. QR vía `qrcode.react` (SVG).

## Global Constraints

- **Formato del código:** `PREFIJO-NNNN` = primeras 3 letras del oficio (mayúsculas, **sin acentos**) + `User.id` con ceros a la izquierda a 4 dígitos (`String.format("%04d", id)`). Si el id > 9999, no se trunca (`ELE-12345`).
- **Cálculo:** solo en el backend. El frontend nunca reconstruye el formato; consume el string.
- **Nullabilidad:** el campo es `null` cuando no hay proveedor asignado o el proveedor no tiene oficio. El frontend no renderiza nada cuando es `null` (salvo la credencial, que muestra fallback).
- **Dependencias frontend:** pinneadas a versión **exacta** (sin `^`), como el resto de `apps/app/package.json`.
- **Commits:** firmados (GPG ya configurado). Terminar cada mensaje con las líneas `Co-Authored-By` y `Claude-Session` del repo.
- **Rama:** `feat/codigo-proveedor-credencial` (ya creada desde `main`; el spec ya está commiteado ahí). No tocar ramas con PR.
- **Comandos de test:** backend `cd backend && ./gradlew test --tests "<FQN>"`; frontend `cd apps/app && pnpm test <ruta>` (o `pnpm exec vitest run <ruta>`).

---

## File Structure

**Backend (crear):**
- `backend/src/main/java/com/aliados/backend/util/CodigoProveedor.java` — helper puro de formato.
- `backend/src/test/java/com/aliados/backend/util/CodigoProveedorTest.java` — tests del helper.

**Backend (modificar):**
- `dto/TrabajoResponseDTO.java` — nuevo campo `codigoProveedor`.
- `dto/MudanzaResponseDTO.java` — nuevo campo `codigoProveedor`.
- `dto/UserResponseDTO.java` — nuevo campo `codigo`.
- `service/TrabajoService.java` — setear el campo en `mapToDTO` y `mapToDTOOptimized`.
- `service/MudanzaService.java` — setear el campo en `mapToDTO`.
- `service/UserService.java` — setear `codigo` en `mapToDTO` para providers.

**Frontend (crear):**
- `apps/app/src/features/provider/components/CredencialProveedor.tsx` — modal credencial con QR.
- `apps/app/src/shared/components/CodigoProveedorChip.tsx` — chip para la card del cliente.

**Nota sobre tests de frontend:** el repo no tiene infraestructura de tests de componentes React (`vitest.config.ts` usa `environment: "node"`, `include: ["src/**/*.test.ts"]`, y no están `@testing-library/react`/`jest-dom`). Los componentes previos (`ServicioIdBadge`, `FaqModal`) se validan **visualmente**. Se sigue ese patrón: los componentes nuevos (Tasks 6 y 8) se verifican a ojo en la Task 10; no se agregan tests de render. Los tests de backend (Task 1) sí se escriben (JUnit ya existe).

**Frontend (modificar):**
- `apps/app/package.json` — dependencia `qrcode.react`.
- `apps/app/src/shared/types/interfaces.ts` — `codigo?: string | null` en `User`.
- `apps/app/src/shared/hooks/useProfile.ts` — mapear `data.codigo`.
- `apps/app/src/features/client/pages/JobTracking.tsx` — chip en `ProveedorCard`.
- `apps/app/src/features/client/pages/JobCompleted.tsx` — chip en la card del proveedor.
- `apps/app/src/features/client/pages/ClientProposal.tsx` — chip en la card del proveedor.
- `apps/app/src/features/client/pages/MudanzaDetail.tsx` — chip en la card del proveedor.
- `apps/app/src/features/client/pages/ClientProfile.tsx` — botón "Mi credencial" (solo provider) + montar el modal.

---

## Task 1: Helper de formato en el backend

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/util/CodigoProveedor.java`
- Test: `backend/src/test/java/com/aliados/backend/util/CodigoProveedorTest.java`

**Interfaces:**
- Produces: `public static String CodigoProveedor.format(String oficioNombre, Long id)` → string tipo `"ELE-0047"`, o `null` si `oficioNombre`/`id` son `null` o el oficio no tiene letras.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/test/java/com/aliados/backend/util/CodigoProveedorTest.java`:

```java
package com.aliados.backend.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CodigoProveedorTest {

    @Test
    void formateaElectricistaConPadding() {
        assertEquals("ELE-0047", CodigoProveedor.format("Electricista", 47L));
    }

    @Test
    void quitaAcentosDelPrefijo() {
        assertEquals("TEC-0047", CodigoProveedor.format("Técnico de electrodomésticos", 47L));
    }

    @Test
    void mudanzasUsaMud() {
        assertEquals("MUD-0003", CodigoProveedor.format("Mudanzas", 3L));
    }

    @Test
    void noTruncaIdsGrandes() {
        assertEquals("ELE-12345", CodigoProveedor.format("Electricista", 12345L));
    }

    @Test
    void oficioNuloDevuelveNull() {
        assertNull(CodigoProveedor.format(null, 47L));
    }

    @Test
    void idNuloDevuelveNull() {
        assertNull(CodigoProveedor.format("Electricista", null));
    }

    @Test
    void oficioSinLetrasDevuelveNull() {
        assertNull(CodigoProveedor.format("123 -- 456", 47L));
    }
}
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.util.CodigoProveedorTest"`
Expected: FAIL — no compila, `CodigoProveedor` no existe.

- [ ] **Step 3: Implementar el helper**

Create `backend/src/main/java/com/aliados/backend/util/CodigoProveedor.java`:

```java
package com.aliados.backend.util;

import java.text.Normalizer;

/**
 * Código identificatorio legible del proveedor: PREFIJO-NNNN.
 * PREFIJO = primeras 3 letras del oficio (mayúsculas, sin acentos).
 * NNNN = User.id con ceros a la izquierda a 4 dígitos (no trunca si supera 9999).
 * Única fuente de verdad del formato: el frontend solo muestra el string.
 */
public final class CodigoProveedor {

    private CodigoProveedor() {}

    public static String format(String oficioNombre, Long id) {
        if (oficioNombre == null || id == null) {
            return null;
        }
        String sinAcentos = Normalizer.normalize(oficioNombre, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String soloLetras = sinAcentos.replaceAll("[^A-Za-z]", "");
        if (soloLetras.isEmpty()) {
            return null;
        }
        String prefijo = soloLetras
                .substring(0, Math.min(3, soloLetras.length()))
                .toUpperCase();
        return prefijo + "-" + String.format("%04d", id);
    }
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.util.CodigoProveedorTest"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/util/CodigoProveedor.java \
        backend/src/test/java/com/aliados/backend/util/CodigoProveedorTest.java
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): helper de formato del código identificatorio (ELE-0047)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 2: Exponer `codigoProveedor` en trabajos

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/dto/TrabajoResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (`mapToDTO` ~línea 361, `mapToDTOOptimized` ~línea 500)

**Interfaces:**
- Consumes: `CodigoProveedor.format(String, Long)` (Task 1).
- Produces: campo JSON `codigoProveedor` (string nullable) en la respuesta de `/api/trabajos/**`.

- [ ] **Step 1: Agregar el campo al DTO**

En `TrabajoResponseDTO.java`, después de `private BigDecimal tarifaVisita;` (última propiedad), agregar:

```java
    private String codigoProveedor;
```

- [ ] **Step 2: Setear el campo en `mapToDTO`**

En `TrabajoService.mapToDTO`, dentro del bloque `if (trabajo.getProveedor() != null) { ... }` (después de `dto.setProveedorPromedioCalificacion(...)`), agregar:

```java
            dto.setCodigoProveedor(
                com.aliados.backend.util.CodigoProveedor.format(
                    trabajo.getOficio() != null ? trabajo.getOficio().getNombre() : null,
                    trabajo.getProveedor().getId()));
```

- [ ] **Step 3: Setear el campo en `mapToDTOOptimized`**

En `TrabajoService.mapToDTOOptimized`, ubicar el bloque análogo donde se setea `proveedorId`/`proveedorNombre` (dentro del `if (trabajo.getProveedor() != null)`), y agregar la misma línea:

```java
            dto.setCodigoProveedor(
                com.aliados.backend.util.CodigoProveedor.format(
                    trabajo.getOficio() != null ? trabajo.getOficio().getNombre() : null,
                    trabajo.getProveedor().getId()));
```

Nota: en ambos mappers `trabajo.getOficio()` ya está inicializado/unproxied (se usa unas líneas más abajo con `OficioResponseDTO.from(...)`), así que no agrega queries.

- [ ] **Step 4: Compilar y correr los tests de trabajo**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.Trabajo*"`
Expected: PASS (compila; los tests existentes de trabajo siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/TrabajoResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): expone codigoProveedor en TrabajoResponseDTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 3: Exponer `codigoProveedor` en mudanzas

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/dto/MudanzaResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java` (`mapToDTO`)

**Interfaces:**
- Consumes: `CodigoProveedor.format(String, Long)` (Task 1).
- Produces: campo JSON `codigoProveedor` (string nullable) en la respuesta de `/api/mudanzas/**`. Para mudanzas el prefijo sale del oficio del proveedor (Mudanzas → `MUD`).

- [ ] **Step 1: Agregar el campo al DTO**

En `MudanzaResponseDTO.java`, después de `private String motivoCancelacion;` (última propiedad), agregar:

```java
    private String codigoProveedor;
```

- [ ] **Step 2: Setear el campo en `mapToDTO`**

En `MudanzaService.mapToDTO`, dentro del bloque `if (m.getProveedor() != null) { ... }` (después de `dto.setProveedorNombre(...)`), agregar:

```java
            dto.setCodigoProveedor(
                com.aliados.backend.util.CodigoProveedor.format(
                    m.getProveedor().getOficio() != null
                        ? m.getProveedor().getOficio().getNombre() : null,
                    m.getProveedor().getId()));
```

Nota: `mapToDTO` corre dentro de métodos `@Transactional`, así que el `Oficio` LAZY del proveedor se inicializa al accederlo (mismo patrón que `esProveedorDeMudanzas`, que ya lee `proveedor.getOficio().getNombre()`).

- [ ] **Step 3: Compilar y correr los tests de mudanza**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.Mudanza*"`
Expected: PASS (compila; tests existentes verdes). Si no hay tests de mudanza, el objetivo es que compile: `cd backend && ./gradlew compileJava compileTestJava`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/MudanzaResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/MudanzaService.java
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): expone codigoProveedor en MudanzaResponseDTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 4: Exponer `codigo` en `/me` (perfil del proveedor)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/dto/UserResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/UserService.java` (`mapToDTO` ~línea 330)

**Interfaces:**
- Consumes: `CodigoProveedor.format(String, Long)` (Task 1).
- Produces: campo JSON `codigo` (string nullable) en la respuesta de `/me`, presente solo para providers con oficio.

- [ ] **Step 1: Agregar el campo al DTO**

En `UserResponseDTO.java`, después de `private OficioResponseDTO oficio;`, agregar:

```java
    private String codigo;
```

- [ ] **Step 2: Setear el campo en `mapToDTO` (solo provider)**

En `UserService.mapToDTO`, dentro del bloque `if (user.getRole() == UserRole.PROVIDER) { ... }` (después de `dto.setTotalTrabajosCompletados(...)`), agregar:

```java
            dto.setCodigo(
                com.aliados.backend.util.CodigoProveedor.format(
                    user.getOficio() != null ? user.getOficio().getNombre() : null,
                    user.getId()));
```

Nota: `user.getOficio()` ya se unproxió unas líneas antes (`dto.setOficio(OficioResponseDTO.from((Oficio) Hibernate.unproxy(user.getOficio())))`), así que acceder a `getNombre()` no agrega queries.

- [ ] **Step 3: Compilar y correr los tests de usuario**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.U*"`
Expected: PASS (compila; tests existentes verdes).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/UserResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/UserService.java
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): expone codigo del proveedor en /me

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 5: Frontend — dependencia QR + campo `codigo` en el store

**Files:**
- Modify: `apps/app/package.json`
- Modify: `apps/app/src/shared/types/interfaces.ts`
- Modify: `apps/app/src/shared/hooks/useProfile.ts`

**Interfaces:**
- Produces: `qrcode.react` disponible (export `QRCodeSVG`); `User.codigo?: string | null` poblado en el store desde `/me`.

- [ ] **Step 1: Instalar `qrcode.react` (pin exacto)**

Run: `cd apps/app && pnpm add qrcode.react`
Luego editar `apps/app/package.json` y quitar el `^` de la línea de `qrcode.react` para dejarla en versión exacta (ej. `"qrcode.react": "4.2.0"`), consistente con las otras deps pinneadas.
Verificar: `cd apps/app && pnpm exec tsc --noEmit` (debe compilar).

- [ ] **Step 2: Agregar `codigo` al tipo `User`**

En `apps/app/src/shared/types/interfaces.ts`, dentro de `interface User`, después de `totalTrabajosCompletados?: number;`, agregar:

```ts
  codigo?: string | null;
```

- [ ] **Step 3: Mapear `codigo` en `useProfile`**

En `apps/app/src/shared/hooks/useProfile.ts`, dentro del objeto `const user: User = { ... }`, después de `totalTrabajosCompletados: data.totalTrabajosCompletados ?? 0,`, agregar:

```ts
        codigo: data.codigo ?? null,
```

- [ ] **Step 4: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/app/pnpm-lock.yaml \
        apps/app/src/shared/types/interfaces.ts \
        apps/app/src/shared/hooks/useProfile.ts
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): dep qrcode.react + codigo del proveedor en el store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

Nota sobre lockfile: incluir `pnpm-lock.yaml` sólo si `pnpm add` lo modificó (lo normal). Si el repo usa un lockfile en la raíz del workspace, agregá esa ruta en su lugar.

---

## Task 6: Chip del código en la card del cliente

**Files:**
- Create: `apps/app/src/shared/components/CodigoProveedorChip.tsx`

**Interfaces:**
- Produces: `<CodigoProveedorChip codigo={...} className?={...} />` — renderiza `null` si `codigo` es falsy; si no, un chip con ícono `ShieldCheck` + el código en monoespaciado.

**Tests:** sin test de render (ver "Nota sobre tests de frontend" arriba); se verifica visualmente en Task 10.

- [ ] **Step 1: Implementar el chip**

Create `apps/app/src/shared/components/CodigoProveedorChip.tsx`:

```tsx
import { ShieldCheck } from 'lucide-react';

interface Props {
  codigo: string | null | undefined;
  className?: string;
}

// Código identificatorio del proveedor, para que el cliente valide a la persona
// que llega al domicilio. Discreto, no compite con el nombre del proveedor.
export function CodigoProveedorChip({ codigo, className = '' }: Props) {
  if (!codigo) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 dark:bg-dark-surface ${className}`}
    >
      <ShieldCheck className="h-3 w-3 text-brand-600 dark:text-dark-brand" />
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{codigo}</span>
    </span>
  );
}
```

- [ ] **Step 2: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/shared/components/CodigoProveedorChip.tsx
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): chip CodigoProveedorChip para las cards del cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 7: Insertar el chip en las 4 vistas del cliente

**Files:**
- Modify: `apps/app/src/features/client/pages/JobTracking.tsx` (`ProveedorCard`, ~línea 160-164)
- Modify: `apps/app/src/features/client/pages/JobCompleted.tsx`
- Modify: `apps/app/src/features/client/pages/ClientProposal.tsx`
- Modify: `apps/app/src/features/client/pages/MudanzaDetail.tsx`

**Interfaces:**
- Consumes: `<CodigoProveedorChip codigo={...} />` (Task 6); campo `codigoProveedor` del DTO (Tasks 2-3). `trabajo`/`mudanza` están tipados como `any` en estas páginas, así que acceder a `.codigoProveedor` no requiere cambios de tipo.

- [ ] **Step 1: JobTracking — import + chip bajo el oficio**

En `apps/app/src/features/client/pages/JobTracking.tsx`, agregar el import (junto a los otros imports de `@/shared/components`):

```tsx
import { CodigoProveedorChip } from "@/shared/components/CodigoProveedorChip";
```

Dentro de `ProveedorCard`, justo después de la línea:

```tsx
            <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
```

agregar:

```tsx
            <CodigoProveedorChip codigo={trabajo.codigoProveedor} className="mt-1" />
```

- [ ] **Step 2: JobCompleted — import + chip**

En `apps/app/src/features/client/pages/JobCompleted.tsx`, agregar el mismo import. Ubicar la card donde se muestran el nombre y el oficio del proveedor (buscá `proveedorNombre` u `oficio.nombre`) e insertar debajo del oficio:

```tsx
            <CodigoProveedorChip codigo={trabajo.codigoProveedor} className="mt-1" />
```

(Ajustá el nombre de la variable del trabajo al que use el archivo — típicamente `trabajo`.)

- [ ] **Step 3: ClientProposal — import + chip**

En `apps/app/src/features/client/pages/ClientProposal.tsx`, agregar el import. Ubicar la sección con el nombre/oficio del proveedor e insertar debajo del oficio:

```tsx
            <CodigoProveedorChip codigo={trabajo.codigoProveedor} className="mt-1" />
```

- [ ] **Step 4: MudanzaDetail — import + chip**

En `apps/app/src/features/client/pages/MudanzaDetail.tsx`, agregar el import. Ubicar la card del proveedor (buscá `proveedorNombre`) e insertar debajo del nombre/oficio:

```tsx
            <CodigoProveedorChip codigo={mudanza.codigoProveedor} className="mt-1" />
```

(Ajustá el nombre de la variable de la mudanza al que use el archivo.)

- [ ] **Step 5: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/client/pages/JobTracking.tsx \
        apps/app/src/features/client/pages/JobCompleted.tsx \
        apps/app/src/features/client/pages/ClientProposal.tsx \
        apps/app/src/features/client/pages/MudanzaDetail.tsx
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): muestra el chip del código en las vistas del cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 8: Credencial del proveedor con QR

**Files:**
- Create: `apps/app/src/features/provider/components/CredencialProveedor.tsx`

**Interfaces:**
- Consumes: `qrcode.react` (`QRCodeSVG`, Task 5).
- Produces: `<CredencialProveedor open={boolean} onClose={() => void} nombre={string} oficio={string | null | undefined} fotoPerfil={string | null | undefined} codigo={string | null | undefined} />` — modal a pantalla completa; muestra el QR + código, o un fallback "Código no disponible" si `codigo` es falsy; devuelve `null` si `open` es `false`.

**Tests:** sin test de render (ver "Nota sobre tests de frontend" arriba); se verifica visualmente en Task 10.

- [ ] **Step 1: Implementar la credencial**

Create `apps/app/src/features/provider/components/CredencialProveedor.tsx`:

```tsx
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  nombre: string;
  oficio: string | null | undefined;
  fotoPerfil: string | null | undefined;
  codigo: string | null | undefined;
}

// Credencial a pantalla completa para que el proveedor la muestre en la puerta.
// Alto contraste; el QR codifica el código para escaneo/comparación del cliente.
export function CredencialProveedor({ open, onClose, nombre, oficio, fotoPerfil, codigo }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi credencial"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 dark:bg-dark-bg"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar credencial"
        className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-dark-surface"
      >
        <X className="h-6 w-6" />
      </button>

      {fotoPerfil ? (
        <img
          src={fotoPerfil}
          alt={nombre}
          className="h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-600 dark:bg-dark-surface dark:text-dark-brand">
          {nombre.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="text-center">
        <p className="text-xl font-bold text-slate-900 dark:text-white">{nombre}</p>
        {oficio && <p className="text-sm text-slate-500 dark:text-slate-400">{oficio}</p>}
      </div>

      {codigo ? (
        <>
          <p className="font-mono text-4xl font-extrabold tracking-widest text-slate-900 dark:text-white">
            {codigo}
          </p>
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={codigo} size={180} />
          </div>
          <p className="max-w-xs text-center text-sm text-slate-500 dark:text-slate-400">
            Mostrá este código al cliente para validar tu identidad al llegar.
          </p>
        </>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">Código no disponible</p>
      )}
    </div>,
    document.body,
  );
}
```

Nota: el fondo del QR se deja blanco fijo (`bg-white p-3`) para que sea legible/escaneable también en tema oscuro.

- [ ] **Step 2: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/features/provider/components/CredencialProveedor.tsx
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): credencial del proveedor a pantalla completa con QR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 9: Botón "Mi credencial" en el perfil del proveedor

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientProfile.tsx`

**Interfaces:**
- Consumes: `<CredencialProveedor .../>` (Task 8); `user` del store (con `name`, `oficio`, `fotoPerfil`, `codigo`).

- [ ] **Step 1: Agregar import y estado del modal**

En `apps/app/src/features/client/pages/ClientProfile.tsx`, agregar el import:

```tsx
import { CredencialProveedor } from "@/features/provider/components/CredencialProveedor";
```

Dentro del componente `ClientProfile`, junto a los otros `useState`, agregar:

```tsx
  const [showCredencial, setShowCredencial] = useState(false);
```

(`useState` ya está importado en el archivo.)

- [ ] **Step 2: Agregar el botón (solo provider) dentro del bloque `isProvider`**

En el bloque `{isProvider && ( ... )}` (~línea 230, donde se muestra el oficio), agregar antes del cierre del bloque un botón:

```tsx
                  <Button
                    variant="outline"
                    onClick={() => setShowCredencial(true)}
                    className="w-full text-xs min-[375px]:text-sm"
                  >
                    Mi credencial
                  </Button>
```

(`Button` ya está importado en el archivo.)

- [ ] **Step 3: Montar el modal al final del JSX**

Antes del cierre del elemento raíz que devuelve `return ( ... )`, agregar:

```tsx
      <CredencialProveedor
        open={showCredencial}
        onClose={() => setShowCredencial(false)}
        nombre={user?.name ?? ''}
        oficio={user?.oficio?.nombre}
        fotoPerfil={user?.fotoPerfil}
        codigo={user?.codigo}
      />
```

- [ ] **Step 4: Verificar compilación y correr toda la suite frontend**

Run: `cd apps/app && pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos; suite verde (incluye los tests nuevos de Tasks 6 y 8).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/client/pages/ClientProfile.tsx
git commit -m "$(cat <<'EOF'
feat(codigo-proveedor): botón "Mi credencial" en el perfil del proveedor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 10: Verificación end-to-end y PR

**Files:** ninguno (verificación + entrega).

- [ ] **Step 1: Suite completa backend**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Suite completa frontend + typecheck + lint**

Run: `cd apps/app && pnpm exec tsc --noEmit && pnpm test && pnpm lint`
Expected: todo verde.

- [ ] **Step 3: Verificación visual (skill `verify` / `run`)**

Levantar la app, entrar como proveedor → Perfil → "Mi credencial": ver foto, nombre, oficio, código `XXX-NNNN` grande y QR. Entrar como cliente con un trabajo con proveedor asignado → ver el chip del código en la card del proveedor (seguimiento, completado, propuesta y mudanza). Confirmar que el código del cliente y el de la credencial coinciden para el mismo proveedor.

- [ ] **Step 4: Push y PR a main**

```bash
git push -u origin feat/codigo-proveedor-credencial
gh pr create --base main --title "feat: código identificatorio del proveedor + credencial con QR" --body "$(cat <<'EOF'
## Qué

Código identificatorio legible por proveedor (`ELE-0047` = 3 letras del oficio + id con padding) para que el cliente valide a la persona que llega al domicilio.

- Backend: helper `CodigoProveedor` (única fuente de verdad) + campo expuesto en `TrabajoResponseDTO`, `MudanzaResponseDTO` y `/me`.
- Proveedor: credencial a pantalla completa con foto, nombre, oficio, código grande y **QR**, accesible desde "Mi credencial" en el perfil.
- Cliente: chip con el código en la card del proveedor (seguimiento, completado, propuesta, mudanza).

Spec: `docs/superpowers/specs/2026-07-11-codigo-proveedor-design.md`
Plan: `docs/superpowers/plans/2026-07-11-codigo-proveedor-credencial.md`

## Fuera de alcance

Multi-oficio, confirmación activa "verificado", escáner de QR in-app.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(No mergear: lo hace el usuario.)

---

## Self-Review

**Spec coverage:**
- Helper de formato (spec §1) → Task 1. ✓
- Campo en 3 DTOs (spec §2) → Tasks 2, 3, 4. ✓
- Credencial con QR + botón en perfil (spec §3) → Tasks 5, 8, 9. ✓
- Chip en las 4 vistas del cliente (spec §4) → Tasks 6, 7. ✓
- Manejo de errores (spec §5): null sin proveedor (Tasks 2-3 usan el bloque `if proveedor != null`); oficio nulo → helper devuelve null y credencial muestra fallback (Task 1 + Task 8); chip no renderiza sin código (Task 6). ✓
- Testing (spec §6): helper JUnit (Task 1). Los tests de componentes con testing-library del spec se sustituyen por verificación visual (Task 10 step 3), siguiendo el patrón del repo (sin infra de tests de render; `ServicioIdBadge`/`FaqModal` se validan a ojo). Decisión confirmada con el usuario en el pre-flight. ✓

**Placeholder scan:** sin TBD/TODO. Los únicos "ajustá el nombre de la variable" (Task 7 steps 2-4) son porque JobCompleted/ClientProposal/MudanzaDetail no se leyeron en detalle; el campo (`codigoProveedor`) y el componente son fijos, solo la variable local del trabajo/mudanza puede diferir. Aceptable.

**Type consistency:** `CodigoProveedor.format(String, Long)` usado idéntico en Tasks 1-4. Campo backend `codigoProveedor` (trabajo/mudanza) y `codigo` (/me) consistentes con el mapeo frontend (`data.codigo` → `User.codigo`; `trabajo.codigoProveedor`/`mudanza.codigoProveedor`). Props de `CredencialProveedor` (Task 8) coinciden con el uso en Task 9. `CodigoProveedorChip` (Task 6) coincide con Task 7. ✓
