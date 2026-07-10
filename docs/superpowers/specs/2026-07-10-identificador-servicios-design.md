# Identificador de servicios: número visible + sección «Servicios» en admin

**Fecha:** 2026-07-10
**Estado:** aprobado (diseño validado en conversación)

## Problema

Los servicios (trabajos y mudanzas) no tienen un número identificador visible para
usuarios ni para el admin. Cuando un cliente o proveedor quiere reportar un problema con
un servicio concreto, no hay forma de referenciarlo sin ambigüedad ("el trabajo de plomería
del martes"). Además, el dashboard de admin no tiene ninguna forma de buscar un servicio
puntual: solo muestra stats agregadas y la alerta de trabajos varados.

## Decisiones tomadas

1. **Identificador:** se usa el `id` autoincremental que ya existe en `Trabajo` y
   `Mudanza`, formateado con prefijo por tipo: **`#T-123`** (trabajo) y **`#M-45`**
   (mudanza). Sin columna nueva, sin migración, sin lógica de generación. Trade-off
   aceptado: es secuencial y revela volumen, irrelevante en pre-launch.
2. **Visibilidad:** lo ven cliente, proveedor y admin. Aparece en todas las páginas de
   detalle de ambos roles.
3. **Admin:** tercer tab «Servicios» en `AliadosDashboard` (entre Stats y Config) con
   búsqueda por número, filtros por tipo y estado, y listado paginado. Sigue el patrón
   on-demand de `UsuariosPanel` (busca al apretar el botón, no en cada tecla).
4. **Endpoint:** nuevo `GET /api/admin/servicios` en un `ServicioAdminController`,
   siguiendo el patrón de `UsuarioAdminController`.

## Diseño

### 1. Helper de formato/parseo (frontend compartido)

Archivo nuevo: `apps/app/src/shared/lib/servicioId.ts`

```ts
type TipoServicio = 'TRABAJO' | 'MUDANZA';

formatServicioId(tipo: TipoServicio, id: number): string
// ('TRABAJO', 123) → "#T-123" ; ('MUDANZA', 45) → "#M-45"

parseServicioId(input: string): { tipo: TipoServicio | null; id: number } | null
// "#T-123" | "t-123" | "T123" → { tipo: 'TRABAJO', id: 123 }
// "#M-45"  | "m-45"           → { tipo: 'MUDANZA', id: 45 }
// "123" | "#123"              → { tipo: null, id: 123 }  (busca en ambos tipos)
// "abc" | "" | "T-"           → null (no parseable)
```

Tolerante a mayúsculas/minúsculas, con o sin `#`, con o sin guión. Un número pelado sin
prefijo devuelve `tipo: null` y el backend busca en ambos tipos.

### 2. Badge en las páginas de detalle

Componente nuevo: `apps/app/src/shared/components/ServicioIdBadge.tsx`

- Recibe `tipo` e `id`, renderiza el número formateado con estilo discreto: texto muted,
  fuente monoespaciada, tamaño chico. No compite con el título de la página.
- Se agrega en el encabezado de:
  - **Cliente:** `JobTracking`, `JobCompleted`, `ClientProposal`, `MudanzaDetail`
  - **Proveedor:** `ServiceDetail`, `ActiveJob`, `ProviderCompletedJob`,
    `ProviderMudanzaDetail`
- Los DTOs actuales ya exponen `id`, no hace falta tocar el backend para esto.

### 3. Backend: endpoint admin de búsqueda

Archivos nuevos: `ServicioAdminController`, `ServicioAdminService`,
`ServicioAdminItemDTO` (+ queries en `TrabajoRepository` / `MudanzaRepository` si hacen
falta).

**`GET /api/admin/servicios`** — mismos requisitos de seguridad que el resto de
`/api/admin/**` (rol ADMIN).

Parámetros (todos opcionales):

| Param | Valores | Semántica |
|-------|---------|-----------|
| `q` | `T-123`, `M-45`, `123`, con/sin `#` | Lookup por id. Con prefijo busca solo ese tipo; número pelado busca en ambos. No parseable → lista vacía (200, no 400). |
| `tipo` | `TRABAJO` \| `MUDANZA` | Filtra por tipo. Ausente = ambos. |
| `estado` | valor del enum del tipo correspondiente | Filtra por estado. Solo tiene sentido combinado con `tipo` (los enums difieren); sin `tipo`, se aplica a los tipos donde el valor exista. |
| `page` / `size` | default `0` / `10` | Paginado sobre la lista unificada. |

Respuesta: `{ items: ServicioAdminItemDTO[], total: number }` con campos comunes:

```
tipo, id, oficio ("Mudanza" para mudanzas), estado,
clienteNombre, proveedorNombre (nullable), direccion,
createdAt, precioEstimado (nullable), motivoCancelacion (nullable)
```

Implementación: dos queries (una por tabla) con `JOIN FETCH` de cliente/proveedor/oficio
para evitar N+1, merge en memoria ordenado por `createdAt` desc, y paginado sobre el
merge. Decisión consciente: no se usa UNION SQL — las tablas tienen columnas distintas y
el volumen pre-launch es mínimo; la simplicidad gana. Si el volumen crece, se revisa.

### 4. Frontend admin: tab «Servicios»

- `AliadosDashboard.tsx`: el estado de tab pasa de `'stats' | 'config'` a
  `'stats' | 'servicios' | 'config'`, con el tab nuevo en el medio.
- Componente nuevo: `apps/app/src/features/aliados/ServiciosPanel.tsx`, siguiendo el
  patrón de `UsuariosPanel` (estado `applied` separado del input, `useQuery` on-demand,
  botón Buscar):
  - Input de número (placeholder `#T-123, #M-45 o 123`), select de tipo
    (Todos/Trabajos/Mudanzas), select de estado (opciones según el tipo elegido;
    deshabilitado en «Todos» salvo estados comunes como EN_CURSO/COMPLETADO/CANCELADO),
    botón Buscar.
  - Filas: `#T-123 · Oficio · chip de estado · Cliente → Proveedor · fecha`. Chips de
    color reutilizando los estilos de estado ya usados en el dashboard.
  - Fila expandible con el resto: dirección, precio estimado, timestamps
    (creado/aceptado/completado), motivo de cancelación si aplica.
  - Paginado de a 10 con el mismo patrón de paginación que «Proveedores en tiempo real».

## Manejo de errores

- Búsqueda sin resultados → «Sin resultados para "#T-999"».
- `q` no parseable → backend responde 200 con lista vacía; el front muestra el vacío.
- Error de red → `ErrorState` compacto con retry, como en los otros paneles.

## Testing

- **Helper (vitest):** casos de `formatServicioId` y `parseServicioId` (mayúsculas, sin
  `#`, sin guión, número pelado, entradas inválidas).
- **Backend (JUnit):** `ServicioAdminService` — lookup por id con y sin prefijo, filtros
  tipo/estado, merge ordenado, paginado, `q` inválido → vacío. Test de autorización del
  controller (no-admin → 403).
- **Frontend (vitest + testing-library):** render de `ServiciosPanel` — búsqueda
  on-demand, estado vacío, expansión de fila; siguiendo los tests existentes en
  `features/aliados/__tests__`.

## Fuera de alcance

- Código legible no secuencial (tipo `SRV-A3F9K2`): descartado por ahora, requeriría
  migración + generación con colisiones. Si se lanza y el volumen expuesto molesta, se
  revisa.
- Deep-link del admin al detalle completo del servicio (más allá de la fila expandible).
- Búsqueda por texto libre (cliente, dirección) en el panel de servicios: solo número +
  filtros en esta iteración.
