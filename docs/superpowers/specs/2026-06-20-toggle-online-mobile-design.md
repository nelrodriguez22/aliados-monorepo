# Toggle de online responsive (visible en mobile) — Diseño

**Fecha:** 2026-06-20
**Estado:** Aprobado (pendiente implementación)

## Problema

`ProviderStatusToggle` (el único control de estado online/offline/busy del proveedor)
es **desktop-only**: ambos returns usan `hidden md:flex`. En una app mobile-first, un
proveedor en celular **no tiene cómo ponerse en línea** desde la UI. El empty state del
dashboard ("Activá el toggle para recibir trabajos") asume un toggle que en mobile no
existe.

Esto además bloquea el onboarding del proveedor (Task 4, en pausa): el ancla
`provider-toggle` apuntaría a un elemento `display:none` en mobile.

## Objetivo

Que el toggle de estado sea visible y usable en **mobile y desktop**, con paridad de
ubicación (sigue en el header, disponible en todas las pantallas del proveedor).

## Decisiones (brainstorming)

- **Ubicación:** header (paridad con desktop; disponible en todas las pantallas), no en
  el dashboard ni en el menú.
- **Mobile:** mostrar **solo el pill** (sin el label "Disponible/Desconectado"). El label
  vuelve en `md+`.

## No-objetivos (YAGNI)

- No se cambia la lógica del toggle (sigue siendo `PATCH /api/users/me/status` con
  estado optimista) ni el store.
- No se mueve el toggle a otra ubicación.
- No se agrega el atributo `data-onboarding` acá (eso queda para retomar la Task 4 del
  onboarding, una vez que este toggle esté visible en mobile).

## Diseño

Cambio acotado a `apps/app/src/features/components/header/ProviderStatusToggle.tsx`.

1. **Return ONLINE/OFFLINE:**
   - Root: cambiar `hidden md:flex items-center gap-2.5` por `flex items-center gap-2`
     (visible en todos los tamaños; gap un poco menor para mobile, `md:gap-2.5` si se
     quiere mantener el de desktop).
   - Label "Disponible/Desconectado": envolver el `<span>` con visibilidad
     `hidden md:inline` (oculto en mobile, visible en `md+`).
   - Pill (botón): sin cambios; siempre visible.

2. **Return BUSY ("Ocupado"):**
   - Root: cambiar `hidden md:flex ...` por `flex ...` (visible en mobile y desktop).
   - Se mantiene el pill ámbar con puntito + "Ocupado". Si en pantallas chicas aprieta,
     se puede ocultar el texto "Ocupado" en mobile (`hidden md:inline`) dejando el
     puntito; decisión a confirmar en la verificación manual.

3. **Header (espacio en mobile):** el pill (≈52px) se suma al cluster derecho del header
   del proveedor (⋮ menú, notificaciones, user menu). Si en pantallas ~320px se apreta,
   ajustar el `gap` del contenedor del header o el espaciado — a evaluar en la
   verificación manual, sin rediseñar el header.

## Manejo de errores

Sin cambios: la lógica de toggle (optimista + rollback en error + toast) queda igual.

## Testing

- **Sin unit tests nuevos:** no hay lógica pura nueva (el PATCH y el estado optimista no
  cambian).
- **Typecheck + build.**
- **Manual:**
  1. Mobile (~375px): el pill se ve en el header del proveedor; togglear ONLINE↔OFFLINE
     funciona (toast + cambio visual); el label NO aparece.
  2. Desktop (`md+`): label + pill como hoy.
  3. Estado BUSY: se ve "Ocupado" en mobile y desktop; intentar togglear muestra el toast
     "No podés desconectarte mientras tenés un trabajo en curso".
  4. Pantalla chica (~320px): el header no se rompe / no hay overflow feo.

## Archivos afectados

- Modificar: `apps/app/src/features/components/header/ProviderStatusToggle.tsx`
- (Opcional, solo si hace falta por espacio) `apps/app/src/features/components/Header.tsx`
  para ajustar el `gap` del cluster derecho en mobile.

## Seguimiento

Una vez visible en mobile, **retomar la Task 4 del onboarding** (plan
`docs/superpowers/plans/2026-06-20-onboarding-tour.md`): anclar `data-onboarding="provider-toggle"`
al root de `ProviderStatusToggle` (ya válido en mobile) + las otras 2 anclas + montaje.
