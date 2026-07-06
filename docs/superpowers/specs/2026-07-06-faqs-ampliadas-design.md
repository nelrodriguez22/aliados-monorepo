# FAQs ampliadas: contenido por audiencia + modal centrado

**Fecha:** 2026-07-06
**Estado:** aprobado (diseño validado en conversación)

## Problema

Las FAQs actuales son 8 preguntas hardcodeadas en `FloatingActions.tsx`, mostradas en un
panel chico (480px) anclado abajo a la derecha. Se suman 11 preguntas nuevas de marketing
divididas en dos audiencias (clientes y profesionales), y el panel actual queda chico para
~17 preguntas.

## Decisiones tomadas

1. **UI:** el botón de FAQ queda donde está (barrita flotante en desktop, menú del Header
   en mobile), pero abre un **modal centrado** con overlay en vez del panel anclado.
2. **Organización:** dos tabs — "Clientes" y "Profesionales". El modal abre por defecto en
   la tab del rol del usuario (`user.role === 'PROVIDER'` → Profesionales; `CLIENT` y
   `ADMIN` → Clientes). El usuario puede cambiar de tab libremente.
3. **Duplicados resueltos:**
   - *Métodos de pago:* se descarta la respuesta existente (Visa/Mastercard/Amex y cuentas
     bancarias) y queda la nueva (crédito, débito o billeteras virtuales, pago 100% seguro
     a través de la app).
   - *Verificación de profesionales:* se fusionan la nueva ("¿Cómo verifican a los
     profesionales?" — proceso de validación de identidad, antecedentes y matrículas) y la
     existente ("¿Cómo sé que el proveedor es confiable?" — calificaciones y reseñas) en
     una sola pregunta con ambas partes.
4. **Copy aspiracional:** varias respuestas nuevas describen features aún no implementadas
   (compensación por cancelación tardía, liquidación automática de ganancias, mediación de
   soporte). Decisión consciente: se publican tal cual por ser pre-launch.

## Contenido final (17 preguntas)

### Tab "Clientes" (11)

| # | Pregunta | Origen |
|---|----------|--------|
| 1 | ¿Qué es Aliados y cómo funciona? | nueva |
| 2 | ¿Cómo solicito un servicio? | existente |
| 3 | ¿Cómo hago seguimiento de mi servicio? | existente |
| 4 | ¿Cómo verifican a los profesionales que prestan el servicio? | fusión nueva + existente |
| 5 | ¿Cómo sé cuánto voy a pagar? | nueva |
| 6 | ¿El presupuesto incluye el valor de los materiales? | nueva |
| 7 | ¿Cuáles son los métodos de pago disponibles? | nueva (reemplaza existente) |
| 8 | ¿Puedo cancelar una solicitud? | existente |
| 9 | ¿Cómo califico al proveedor? | existente |
| 10 | ¿Qué hago si surge un inconveniente con el trabajo realizado? | nueva |
| 11 | ¿Cómo contacto a soporte? | existente |

### Tab "Profesionales" (6)

| # | Pregunta | Origen |
|---|----------|--------|
| 1 | ¿Qué beneficios tengo al ofrecer mis servicios en Aliados? | nueva |
| 2 | ¿Cuáles son los requisitos para darme de alta en la plataforma? | nueva |
| 3 | ¿Cómo recibo las solicitudes de trabajo? | nueva |
| 4 | ¿Cómo activo o desactivo mi disponibilidad? | existente (se quita el sufijo "(proveedores)") |
| 5 | ¿Cómo es el sistema de comisiones y cuándo cobro? | nueva |
| 6 | ¿Qué sucede si un cliente cancela el servicio cuando ya estoy en camino? | nueva |

Los textos de las respuestas nuevas son los provistos por el negocio (copy de marketing),
sin edición salvo la fusión del punto 4 de Clientes: al texto nuevo de verificación se le
agrega el cierre de la respuesta existente ("Además, al recibir una propuesta podés ver el
perfil del proveedor con su calificación promedio y reseñas de trabajos anteriores").

## Arquitectura

### Nuevo: `apps/app/src/shared/constants/faqs.ts`

```ts
export type FaqAudiencia = 'cliente' | 'proveedor';

export interface Faq {
  q: string;
  a: string;
  audiencia: FaqAudiencia;
}

export const FAQS: Faq[] = [ /* 17 entradas */ ];
```

Saca el contenido de `FloatingActions.tsx` (hoy 424 líneas con 4 componentes). Editar
FAQs a futuro no toca componentes.

### Modificado: `apps/app/src/shared/components/FloatingActions.tsx`

- `FaqWindow` se renombra a `FaqModal` y pasa de panel anclado a modal centrado:
  - Overlay `fixed inset-0` con fondo oscuro semitransparente; clic en el overlay cierra.
  - Panel: mobile fullscreen (igual que hoy); desktop `max-w-xl`, alto ~70vh, centrado.
  - Header del panel igual al actual (ícono + título + botón cerrar).
  - Debajo del header, las dos tabs; debajo, la lista acordeón con scroll.
- `FaqItem` (acordeón) se reutiliza sin cambios.
- Tab inicial derivada de `useStore` → `user.role`.
- Se conserva la animación de entrada existente (`chat-window-enter`) aplicada al panel.

### Modificado: `apps/app/src/features/components/Header.tsx`

Solo el rename `FaqWindow` → `FaqModal` en el import y el render. El ítem del menú mobile
no cambia.

## Testing

La app no tiene infra de tests de componentes (vitest corre en `environment: "node"` y
solo incluye `*.test.ts`; no hay testing-library ni jsdom). Decisión: no agregar infra —
se testea la lógica pura extraída a `faqs.ts`, siguiendo el patrón de los tests existentes:

1. `defaultAudiencia('PROVIDER')` → `'proveedor'`; `'CLIENT'`, `'ADMIN'` y `undefined`
   (usuario no cargado) → `'cliente'`.
2. Sanidad del contenido: 17 FAQs en total, 11 de audiencia `'cliente'` y 6 de
   `'proveedor'`, sin preguntas duplicadas, sin campos vacíos.

El comportamiento visual del modal (tabs, acordeón, overlay) se verifica manualmente.

## Fuera de alcance

- Página dedicada `/ayuda` (descartada: overkill para pre-launch).
- Buscador de FAQs.
- FAQs servidas desde el backend o Remote Config.
- Cambios en el chatbot o bug report de la misma barra.
