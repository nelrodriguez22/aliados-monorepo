# Toggle de online responsive (visible en mobile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer visible y usable en mobile el toggle de estado del proveedor (hoy desktop-only), mostrando solo el pill en mobile y label+pill en `md+`.

**Architecture:** Cambio acotado a `ProviderStatusToggle.tsx`: quitar `hidden md:flex` de los dos returns (ONLINE/OFFLINE y BUSY) y ocultar el label de texto en mobile. La lógica del toggle (PATCH optimista + rollback) no se toca.

**Tech Stack:** React 19 + TypeScript + Tailwind.

## Global Constraints

- **Sin acciones de git sin orden explícita del usuario.** El paso "Commit" se ejecuta solo con OK explícito; si no, se deja **staged**. (Ejecución actual: sin commits, todo staged.)
- **Sin cambios de lógica:** no tocar el `PATCH /api/users/me/status`, el estado optimista, el store ni los toasts.
- **Mobile = pill solo** (sin el label "Disponible/Desconectado"); label visible en `md+`.
- **Sin dependencias nuevas. Sin unit tests nuevos** (no hay lógica pura nueva). Verificación: typecheck + build + manual.

---

### Task 1: `ProviderStatusToggle` responsive (pill en mobile)

**Files:**
- Modify: `apps/app/src/features/components/header/ProviderStatusToggle.tsx`

**Interfaces:** ninguna nueva (mismo componente, misma API: `<ProviderStatusToggle />`).

- [ ] **Step 1: Mostrar el estado BUSY en mobile**

En `ProviderStatusToggle.tsx`, en el return del estado BUSY, cambiar el root para que sea visible en todos los tamaños.

Reemplazar:
```tsx
      <div className="hidden md:flex items-center gap-2 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-3 py-1.5">
```
por:
```tsx
      <div className="flex items-center gap-2 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-3 py-1.5">
```

- [ ] **Step 2: Mostrar el toggle ONLINE/OFFLINE en mobile (pill solo)**

En el return del estado ONLINE/OFFLINE, cambiar el root para que sea visible siempre, con gap menor en mobile.

Reemplazar:
```tsx
    <div className="hidden md:flex items-center gap-2.5">
```
por:
```tsx
    <div className="flex items-center gap-2 md:gap-2.5">
```

- [ ] **Step 3: Ocultar el label de texto en mobile**

En el mismo return, el `<span>` del label ("Disponible/Desconectado") debe ocultarse en mobile y mostrarse en `md+`.

Reemplazar:
```tsx
      <span className={`text-xs font-medium transition-colors duration-200
        ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-dark-text-secondary'}`}>
        {isOnline ? 'Disponible' : 'Desconectado'}
      </span>
```
por:
```tsx
      <span className={`hidden md:inline text-xs font-medium transition-colors duration-200
        ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-dark-text-secondary'}`}>
        {isOnline ? 'Disponible' : 'Desconectado'}
      </span>
```

- [ ] **Step 4: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 5: Verificación manual**

1. Entrar como proveedor en **mobile** (~375px, DevTools responsive): en el header se ve el **pill** (sin label). Togglear ONLINE↔OFFLINE → cambia el color del pill + toast ("Estás en línea" / "Estás desconectado").
2. **Desktop** (`md+`): se ve **label + pill** como antes.
3. **BUSY** (proveedor con trabajo en curso): se ve "Ocupado" en mobile y desktop; al intentar togglear, toast "No podés desconectarte mientras tenés un trabajo en curso".
4. **Pantalla ~320px:** el header no hace overflow feo. Si aprieta, ocultar el texto "Ocupado" en mobile (agregar `hidden md:inline` al `<span>` de "Ocupado" del estado BUSY) y/o reducir el `gap` del cluster derecho del header en `apps/app/src/features/components/Header.tsx`. Solo si hace falta.

- [ ] **Step 6: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/features/components/header/ProviderStatusToggle.tsx
git commit -m "feat(provider): toggle de estado visible en mobile (pill)"
```

---

## Seguimiento

Con el toggle ya visible en mobile, **retomar la Task 4 del onboarding**
(`docs/superpowers/plans/2026-06-20-onboarding-tour.md`): anclar
`data-onboarding="provider-toggle"` al root de `ProviderStatusToggle` + las otras 2
anclas (`provider-available`, `provider-history`) + montar `<OnboardingTour>` en el
dashboard del proveedor.
