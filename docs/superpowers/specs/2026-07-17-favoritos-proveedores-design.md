# Favoritos de proveedores — Diseño

**Fecha:** 2026-07-17
**Estado:** Aprobado (brainstorming)

## Resumen

El cliente puede marcar como favoritos a los proveedores con los que tuvo una buena
experiencia y luego (a) priorizarlos automáticamente al pedir un servicio de ese oficio,
o (b) pedirles un servicio directamente desde una sección de favoritos. En ambos casos
los favoritos se ofrecen primero y, si no aceptan, el pedido cae al dispatch normal por
score. El proveedor recibe una notificación especial cuando un cliente que lo tiene de
favorito le pide (directo o priorizado).

## Contexto del modelo actual

- El cliente **no elige proveedor**: pide un servicio (oficio + descripción + dirección)
  y el backend lo ofrece por olas a grupos de proveedores ordenados por score
  (`ProviderScoreService`), hasta que uno acepta.
- El dispatch vive en `TrabajoService.ofrecerSiguienteGrupo()`: arma un grupo de N
  (`trabajo_oferta_grupo_tamano`, default 10) por score, crea `TrabajoOferta` OFRECIDA.
- `TrabajoEscalationScheduler` corre cada 60s: si nadie del grupo aceptó dentro del
  intervalo (`trabajo_oferta_grupo_intervalo_min`, default 5 min), escala al grupo
  siguiente. El fallback ya existe y no se toca.
- Cada proveedor tiene **un solo oficio** (`User.oficio`, ManyToOne). Un favorito es,
  por lo tanto, simplemente un par `(cliente, proveedor)`; el oficio queda implícito.
- Las **mudanzas** usan un flujo distinto (tier + proveedor de fletes fijo, sin dispatch
  por score) → **fuera de alcance**.

## Alcance

**Incluye:** favoritos para trabajos por oficio; priorización en dispatch (toggle);
pedido directo a un favorito; entry points para marcar/desmarcar; notificación especial
al favorito.

**Excluye:** mudanzas; perfil público de proveedor navegable; favoritos del lado del
proveedor.

## Modelo de datos

Entidad nueva `FavoritoProveedor`:

- `id` (PK)
- `cliente_id` (FK `users`)
- `proveedor_id` (FK `users`)
- `created_at`
- `UNIQUE(cliente_id, proveedor_id)` — favoritear es idempotente

Migración Flyway con la tabla + índice único.

## Backend — API

Todos bajo el usuario autenticado (cliente):

- `POST /api/favoritos` `{ proveedorId }` → agrega. Valida que exista al menos un
  **trabajo completado** entre cliente y proveedor; si no, `400`. Idempotente (si ya
  existe, `200`/no-op).
- `DELETE /api/favoritos/{proveedorId}` → quita. Idempotente.
- `GET /api/favoritos` → lista de favoritos con datos del proveedor para las cards:
  `proveedorId`, `nombre`, `oficio` (id + nombre), `promedioCalificacion`,
  `cantidadCalificaciones`, `disponibilidad` (ONLINE/BUSY/OFFLINE), `codigoProveedor`.
  El front deriva de esta lista qué favoritos hay por oficio (para el toggle).

## Backend — Integración con el dispatch (grupo 0)

Los favoritos son un **"grupo 0"**: el primer grupo ofrecido es sólo el/los favorito(s),
antes que cualquier grupo por score. El `CrearTrabajoDTO` suma dos campos opcionales:

- `priorizarFavoritos: boolean` (opción 1, toggle): grupo 0 = **todos** los favoritos del
  cliente cuyo oficio == el oficio del pedido.
- `proveedorDirectoId: Long?` (opción 2, pedido directo): grupo 0 = **ese** favorito.
  El backend valida que sea favorito del cliente y que su oficio coincida con el pedido;
  si no, `400`.

Resolución (en el backend, no se confía en ids sueltos del front):

1. Al crear el trabajo, el backend calcula el **set de prioridad**:
   - si `proveedorDirectoId` presente y válido → `{ ese proveedor }`
   - si no, si `priorizarFavoritos` → `{ favoritos del cliente del oficio }`
   - si no → vacío
2. Si el set no está vacío, el primer `ofrecerSiguienteGrupo` ofrece a ese set
   (crea `TrabajoOferta` OFRECIDA para ellos) en vez del grupo por score.
3. Los grupos siguientes (2+) los arma el scheduler normal por score, excluyendo a los
   ya ofertados (mecánica `yaOfertados` existente). Mismo intervalo de 5 min, mismo
   fallback. **La escalación no se modifica.**

Si el set queda vacío (toggle ON pero sin favoritos disponibles del oficio), el dispatch
arranca normal — sin efectos.

## Backend — Notificación al favorito

Cuando a un proveedor se le ofrece un trabajo **como parte del grupo 0** (priorizado o
directo), la `Notificacion`/push lleva una variante especial, ej.:
*"Un cliente que te tiene de favorito te está pidiendo un servicio"*. Se distingue del
ofrecimiento normal para incentivar la aceptación. Implementación: un flag `favorito: true`
en el payload de la notificación de oferta (misma `TipoNotificacion`, copy distinto), salvo
que el sistema de notificaciones requiera un tipo propio — el plan lo confirma al inspeccionar
`NotificacionService`. Las ofertas de grupos 2+ (fallback) usan la notificación normal.

## Frontend — Página de Favoritos

Ruta nueva `/cliente/favoritos`, con acceso desde el menú de usuario y un link/acceso
desde el dashboard del cliente. Contenido:

- Card por favorito: iniciales + nombre + oficio + rating (promedio + cantidad) + estado
  de disponibilidad (Disponible / Ocupado / Desconectado).
- Botón **"Pedir servicio"** → navega a `ServiceRequest` con el oficio del favorito
  pre-seleccionado y `proveedorDirectoId` cargado (pedido directo). El form sólo pide
  descripción + dirección.
- Acción para **quitar** de favoritos.
- Empty state cuando no hay favoritos, explicando que se agregan desde un trabajo.

## Frontend — Toggle de priorización en ServiceRequest

Al elegir un oficio en `ServiceRequest`, si el cliente tiene ≥1 favorito de ese oficio,
aparece un check:
*"Tenés N favorito(s) de [oficio]. Priorizarlos en este pedido"* — default **ON**.
Manda `priorizarFavoritos: true` al crear el trabajo. Si llega vía "Pedir servicio" desde
Favoritos (con `proveedorDirectoId`), el pedido es directo y el toggle no aplica.

## Frontend — Entry points para marcar/desmarcar

Todos reusan la misma acción toggle (POST/DELETE `/api/favoritos`), con estado optimista:

1. Corazón en `JobCompleted`, junto a la calificación.
2. Corazón en las cards del historial del dashboard del cliente.
3. Quitar desde la página de Favoritos.
4. Prompt tras calificar 4-5 estrellas en `JobCompleted`: *"¿Agregar a [nombre] a
   favoritos?"* — sólo si aún no lo es.

## Edge cases

- **Proveedor no disponible/desactivado:** en la lista de favoritos se muestra
  deshabilitado ("no disponible"); igual se le puede ofrecer (el modelo encola ofertas) y
  el fallback de 5 min cubre la no-respuesta.
- **Sin favoritos del oficio:** el toggle no aparece; `priorizarFavoritos` sin favoritos
  → dispatch normal.
- **Validaciones:** no se puede favoritear a alguien sin trabajo completado;
  `proveedorDirectoId` debe ser favorito del cliente y del oficio pedido.
- **Favorito ya ofertado / que ya está en cola:** la mecánica `yaOfertados` evita ofertas
  duplicadas al escalar.

## Testing

**Backend (TDD):**
- Favoritear/desfavoritear idempotente.
- Validación de trabajo-completado al favoritear.
- Resolución del grupo 0: toggle (favoritos del oficio) vs directo (proveedor puntual),
  incluida la validación de `proveedorDirectoId`.
- Escalación: si el grupo 0 no acepta en el intervalo, cae al dispatch normal por score.
- Notificación especial sólo para el grupo 0.

**Frontend:**
- Toggle condicional (aparece sólo con favoritos del oficio; default ON).
- Entry points marcan/desmarcan con estado optimista.
- "Pedir servicio" pre-carga oficio + `proveedorDirectoId`.
- Página de favoritos: lista, empty state, quitar.

## Sugerencia de entrega (PRs, uno a la vez a main)

1. Backend: entidad + migración + CRUD `/api/favoritos` (con TDD).
2. Backend: grupo 0 en el dispatch + notificación especial (con TDD).
3. Frontend: página `/cliente/favoritos` + entry points (corazones + prompt).
4. Frontend: toggle en `ServiceRequest` + pedido directo end-to-end.
