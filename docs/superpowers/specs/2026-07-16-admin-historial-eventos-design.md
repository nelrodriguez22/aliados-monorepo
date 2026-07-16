# Historial de eventos en el panel admin (pestaña Servicios)

**Fecha:** 2026-07-16
**Estado:** aprobado (diseño validado en conversación)
**Depende de:** PR #45 (endpoints `GET /api/admin/{trabajos|mudanzas}/{id}/eventos`, ya en main)

## Problema

El audit log de ciclo de vida (PR #45) solo se puede consultar por SQL o curl. El
admin que investiga un caso ya está mirando el servicio en la pestaña Servicios del
panel — el timeline tiene que estar ahí, no en una herramienta aparte.

## Solución

Componente `EventosTimeline` que se monta dentro de la fila expandida de
`ServiciosPanel` (el expandido ya es "el detalle del servicio" y ya conoce
`tipo` + `id`). Carga automática al expandir: react-query dispara al montar y
cachea por servicio. Sin backend nuevo.

## Componentes

| Pieza | Contenido |
|---|---|
| `apps/app/src/features/aliados/EventosTimeline.tsx` | Componente nuevo: fetch + render del timeline |
| `apps/app/src/features/aliados/estadoChips.ts` | `ESTADO_CHIP` extraído de `ServiciosPanel` (+ entradas nuevas `PENDIENTE_PAGO`, `PAGADO`); ambos lo importan |
| `apps/app/src/features/aliados/ServiciosPanel.tsx` | Import del mapa extraído + `<EventosTimeline>` al final del `<dl>` expandido bajo subtítulo "Historial" |
| `apps/app/src/features/aliados/__tests__/EventosTimeline.test.tsx` | Tests del componente (testing-library + happy-dom) |

## Contrato de datos (ya existente, PR #45)

```
GET /api/admin/trabajos/{id}/eventos   → EventoResponseDTO[]
GET /api/admin/mudanzas/{id}/eventos   → EventoResponseDTO[]
```

```ts
interface EventoAdmin {
  id: number;
  tipo: 'CAMBIO_ESTADO' | 'CAMBIO_ESTADO_PAGO';
  valorAnterior: string | null;   // null = nacimiento del eje (∅)
  valorNuevo: string;
  actorTipo: 'CLIENTE' | 'PROVEEDOR' | 'SISTEMA' | 'ADMIN';
  actorNombre: string | null;     // null cuando SISTEMA
  detalle: string | null;
  createdAt: string;
}
```

Orden: el backend devuelve `id ASC` (cronológico). Se renderiza tal cual —
el más nuevo abajo, orden natural de lectura de un caso.

## EventosTimeline

- **Props:** `{ tipo: TipoServicio; id: number }`.
- **Fetch:** `useQuery` con key `['admin-eventos', tipo, id]`; URL según tipo
  (`TRABAJO` → `/api/admin/trabajos/…`, `MUDANZA` → `/api/admin/mudanzas/…`).
  Al estar montado solo dentro de la fila expandida, el lazy-load sale gratis;
  el cache de react-query evita re-pedir al re-expandir.
- **Render por evento** (lista vertical):
  - Fecha/hora con `formatDateTime` (mismo helper del panel).
  - Actor: ícono lucide por tipo — `User` (cliente), `Wrench` (proveedor),
    `Cog` (sistema/admin) — + texto `"{actorNombre} ({actorTipo en minúscula})"`
    (p. ej. "Ana (cliente)", "Raúl (admin)") o "Sistema" cuando `actorNombre`
    es null.
  - Transición: chips `valorAnterior → valorNuevo` con `ESTADO_CHIP`; si
    `valorAnterior` es null se muestra solo el chip nuevo.
  - Eventos `CAMBIO_ESTADO_PAGO`: mini-badge "PAGO" para distinguir el eje.
  - `detalle` en gris/itálica debajo, solo cuando existe.
- **Estados:**
  - Cargando: "Cargando historial…" (patrón de texto del panel).
  - Error: `ErrorState compact` con retry (componente existente).
  - Vacío: "Sin historial — servicio anterior al registro de eventos"
    (los servicios pre-V12 no tienen filas; no es un error).

## estadoChips.ts

`ESTADO_CHIP` se mueve de `ServiciosPanel.tsx` a este módulo sin cambios de
valores, agregando `PENDIENTE_PAGO` y `PAGADO` (mismo esquema visual que
`PENDIENTE_PAGO_EXTRA`/`COMPLETADO` respectivamente). Mejora puntual para
compartirlo; no es un refactor del panel.

## Testing

Vitest + @testing-library/react + happy-dom (infra existente; entorno DOM por
archivo con docblock `@vitest-environment happy-dom`). Mock de `apiClient`.

| Test | Verifica |
|---|---|
| URL por tipo | TRABAJO pega a `/api/admin/trabajos/{id}/eventos`; MUDANZA a `/mudanzas/` |
| Render de eventos | fecha, actor con nombre, chips anterior→nuevo |
| Actor SISTEMA | muestra "Sistema", sin nombre |
| Nacimiento (∅) | valorAnterior null → un solo chip |
| Badge PAGO | eventos CAMBIO_ESTADO_PAGO lo muestran |
| Vacío | mensaje "Sin historial…" |
| Error | ErrorState con retry |

Verificación tipo CI: `tsc -b` (no `--noEmit`: no ve los tests) y suite con
`.env` apartado (los tests con .env local levantan Firebase de verdad).

## Fuera de alcance

- Cambios de backend (los endpoints ya existen).
- Timeline visible a cliente/proveedor en la app.
- Filtros/búsqueda dentro del timeline (~5-15 eventos por servicio; no hacen falta).
