# Código identificatorio del proveedor: credencial + validación en la puerta

**Fecha:** 2026-07-11
**Estado:** aprobado (diseño validado en conversación)

## Problema

Cuando un proveedor llega al domicilio, el cliente no tiene forma de confirmar que la
persona en la puerta es efectivamente el proveedor que le asignó la app. El
`#T-123` / `#M-45` existente identifica la **operación**, no a la **persona** que la
ejecuta. Falta un identificador de la persona que el cliente pueda comparar en el momento.

## Decisiones tomadas

1. **Formato:** `PREFIJO-NNNN`, donde el prefijo son las **primeras 3 letras del oficio**
   del proveedor (mayúsculas, sin acentos) y `NNNN` es el `User.id` del proveedor con
   ceros a la izquierda a 4 dígitos. Ej: electricista con id 47 → **`ELE-0047`**.
   Si el id supera 9999, simplemente crece (`ELE-12345`).
2. **Oficio:** se usa el **único** oficio actual del proveedor (`User.oficio`). El modelo
   hoy no soporta multi-oficio; cuando exista, se adapta (fuera de alcance).
3. **Número:** se reusa el `User.id` autoincremental existente. Sin columna nueva, sin
   migración, sin generación ni colisiones. Trade-off aceptado: es secuencial y revela
   volumen, irrelevante en pre-launch (misma decisión que el ID de servicios).
4. **Dónde se calcula:** en el **backend**, como única fuente de verdad. Se expone como
   string ya formateado en los DTOs. El frontend solo lo muestra. Esto resuelve el caso
   mudanza leyendo el oficio real del proveedor y evita duplicar la normalización de
   acentos en dos lenguajes.
5. **Validación en la puerta:** el proveedor abre una **credencial** (pantalla/modal
   dedicado, alto contraste) con su foto, nombre, oficio, el código grande y un **QR** que
   codifica el código. El cliente ve el mismo código en la card del proveedor asignado en
   sus vistas y compara (visualmente o escaneando el QR con cualquier lector). No hay
   escáner dentro de la app ni confirmación activa "verificado" (fuera de alcance).

## Diseño

### 1. Helper de formato (backend) — única fuente de verdad

Clase nueva `com.aliados.backend.util.CodigoProveedor` con método estático:

```java
public static String format(String oficioNombre, Long id)
// ("Electricista", 47)                    -> "ELE-0047"
// ("Técnico de electrodomésticos", 47)    -> "TEC-0047"   (sin acento)
// ("Mudanzas", 3)                         -> "MUD-0003"
// ("Electricista", 12345)                 -> "ELE-12345"  (sin truncar)
// (null, 47) | ("Electricista", null)     -> null
```

Normalización del prefijo: `Normalizer.normalize(NFD)` + quitar diacríticos, quitar
no-letras, `toUpperCase`, tomar las primeras 3 letras. Padding: `String.format("%04d", id)`.
Null-safe en ambos parámetros.

### 2. Backend — exponer el código en 3 DTOs

- **`TrabajoResponseDTO.codigoProveedor`** (nullable): se setea en `mapToDTO` y
  `mapToDTOOptimized` (`TrabajoService`) cuando `trabajo.getProveedor() != null`, usando
  `trabajo.getOficio().getNombre()` (ya cargado/unproxied en esos mappers) +
  `proveedor.getId()`.
- **`MudanzaResponseDTO.codigoProveedor`** (nullable): en el mapeo de `MudanzaService`,
  desde el oficio real del proveedor (Mudanzas → `MUD`) + su id. Asegurar que el oficio
  del proveedor esté inicializado en la transacción del mapeo.
- **`UserResponseDTO.codigo`** (nullable): en el endpoint `/me`, solo para rol `PROVIDER`
  con oficio asignado. Es lo que alimenta la credencial propia.

No hay endpoint nuevo ni cambios de seguridad: se agregan campos a DTOs ya existentes.

### 3. Credencial del proveedor (frontend) — pantalla/modal dedicado

- Componente nuevo `apps/app/src/features/provider/components/CredencialProveedor.tsx`
  (modal a pantalla completa vía portal, como los otros overlays; alto contraste):
  - **Foto** del proveedor, **nombre**, **oficio**, **código gigante** (`ELE-0047`,
    monoespaciado) y un **QR** que codifica el string del código.
  - Botón de cerrar. Pensada para mostrar físicamente en la puerta.
- **QR:** se agrega la dependencia `qrcode.react` (pinneada a versión exacta), que
  renderiza el QR como **SVG** (nítido, imprimible, respeta claro/oscuro). Contenido del
  QR: el string del código (`ELE-0047`).
- **Entrada:** botón **"Mi credencial"** en la página de perfil del proveedor
  (`ClientProfile`, que se muestra para providers). Sin ruta nueva; abre el modal.
- **Datos:** se agrega `codigo?: string | null` al tipo `User` del front
  (`shared/types/interfaces.ts`) y se mapea en `useProfile.ts` desde `data.codigo`. La
  credencial lee `user.codigo`, `user.fotoPerfil`, `user.name`, `user.oficio.nombre`.

### 4. Vista del cliente — chip en la card del proveedor

- Componente chico nuevo `apps/app/src/shared/components/CodigoProveedorChip.tsx`:
  muestra el código con estilo de credencial discreta (ícono de escudo/verificación de
  `lucide-react` + texto monoespaciado), visualmente distinto del `ServicioIdBadge`.
- Se agrega en la card del proveedor de: **`JobTracking`**, **`JobCompleted`**,
  **`ClientProposal`** y **`MudanzaDetail`**. Solo se renderiza cuando
  `codigoProveedor != null` (proveedor ya asignado).
- Tipos front: se agrega `codigoProveedor?: string | null` a los tipos de trabajo y
  mudanza que usan esas vistas.

## Manejo de errores

- Sin proveedor asignado → el DTO no puebla el campo (`null`); no se renderiza el chip.
- Oficio nulo (dato inconsistente) → `codigo = null`; la credencial muestra un fallback
  ("Código no disponible") en vez de romper; el chip no se renderiza.
- Acentos y nombres cortos: la normalización toma lo que haya. Todos los oficios
  sembrados tienen ≥3 letras (Electricista, Plomero, Cerrajero, Gasista, Pintor, Aire
  acondicionado, Fumigador, Técnico de electrodomésticos, Mudanzas).

## Testing

- **Backend (JUnit):** `CodigoProveedor.format` — acentos (`Técnico`→`TEC`), padding
  (`7`→`0007`, `12345`→`12345` sin truncar), nulls en cada parámetro. Verificar que
  `mapToDTO`/`mapToDTOOptimized` y el mapeo de mudanza setean/omiten `codigoProveedor`
  según haya proveedor.
- **Frontend (vitest + testing-library):** render de `CredencialProveedor` con y sin
  código (fallback), presencia del QR; render de `CodigoProveedorChip`; que las cards de
  cliente muestren el chip solo con proveedor asignado.

## Fuera de alcance

- **Multi-oficio** (los "hasta 3" oficios con uno principal): se usa el oficio único de
  hoy. Requeriría migración + entidad + registro + UI; es una feature aparte.
- **Confirmación activa** "proveedor verificado" con estado/endpoint nuevo: por ahora la
  validación es comparación visual/QR, sin persistir.
- **Escáner de QR dentro de la app del cliente:** el QR se lee con cualquier lector
  externo. Un escáner in-app queda para más adelante.
- **Mostrar el código en las vistas propias del proveedor** (ServiceDetail/ActiveJob): el
  proveedor accede a su código vía la credencial.
- **Código aleatorio no secuencial:** descartado, mismo criterio que el ID de servicios.
