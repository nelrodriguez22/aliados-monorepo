# FAQs Ampliadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar las FAQs de 8 a 17 preguntas organizadas por audiencia (clientes/profesionales) en un modal centrado con tabs que abre en la tab del rol del usuario.

**Architecture:** El contenido sale de `FloatingActions.tsx` a una constante tipada en `shared/constants/faqs.ts` junto con el helper puro `defaultAudiencia(role)`. `FaqWindow` se convierte en `FaqModal`: overlay oscuro + panel centrado en desktop, fullscreen en mobile, con dos tabs. Los puntos de apertura (barrita flotante desktop, menú del Header mobile) no cambian.

**Tech Stack:** React 19 + TypeScript, Tailwind (clases utilitarias con variantes `dark:` y `sm:`), zustand (`useStore`), lucide-react, vitest (environment node, solo `*.test.ts`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-faqs-ampliadas-design.md` — los textos de las FAQs se copian de ahí/de este plan **verbatim**, sin editar el copy.
- Tests solo de lógica pura (`*.test.ts`); NO instalar testing-library/jsdom ni tocar `vitest.config.ts`.
- Los tests se corren desde `apps/app/` con `pnpm test` (o `npx vitest run` filtrado).
- Estilo visual: reutilizar las clases existentes del archivo (header brand-600, dark-mode con `dark:`, `chat-window-enter` para la animación).
- Commits con mensajes en español, prefijo convencional (`feat:`, `test:`, `refactor:`).
- No commitear nada bajo `backend/bin/` ni metadata de Eclipse (ya ignorados).

---

### Task 1: Contenido de FAQs + helper de audiencia (con tests)

**Files:**
- Create: `apps/app/src/shared/constants/faqs.ts`
- Test: `apps/app/src/shared/constants/__tests__/faqs.test.ts`

**Interfaces:**
- Consumes: `User['role']` de `apps/app/src/shared/types/interfaces.ts` (`'CLIENT' | 'PROVIDER' | 'ADMIN'`).
- Produces (Task 2 depende de esto):
  - `export type FaqAudiencia = 'cliente' | 'proveedor'`
  - `export interface Faq { q: string; a: string; audiencia: FaqAudiencia }`
  - `export const FAQS: Faq[]` (17 entradas)
  - `export function defaultAudiencia(role: User['role'] | undefined): FaqAudiencia`

- [ ] **Step 1: Write the failing test**

Crear `apps/app/src/shared/constants/__tests__/faqs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FAQS, defaultAudiencia } from '../faqs';

describe('defaultAudiencia', () => {
  it('PROVIDER abre en proveedor', () => {
    expect(defaultAudiencia('PROVIDER')).toBe('proveedor');
  });

  it('CLIENT, ADMIN y usuario no cargado abren en cliente', () => {
    expect(defaultAudiencia('CLIENT')).toBe('cliente');
    expect(defaultAudiencia('ADMIN')).toBe('cliente');
    expect(defaultAudiencia(undefined)).toBe('cliente');
  });
});

describe('FAQS', () => {
  it('tiene 11 de cliente y 6 de proveedor (17 en total)', () => {
    expect(FAQS).toHaveLength(17);
    expect(FAQS.filter((f) => f.audiencia === 'cliente')).toHaveLength(11);
    expect(FAQS.filter((f) => f.audiencia === 'proveedor')).toHaveLength(6);
  });

  it('no tiene preguntas duplicadas', () => {
    const qs = FAQS.map((f) => f.q);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('no tiene campos vacíos', () => {
    for (const f of FAQS) {
      expect(f.q.trim()).not.toBe('');
      expect(f.a.trim()).not.toBe('');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && npx vitest run src/shared/constants/__tests__/faqs.test.ts`
Expected: FAIL — `Cannot find module '../faqs'` (o equivalente de resolución).

- [ ] **Step 3: Write the implementation**

Crear `apps/app/src/shared/constants/faqs.ts` con este contenido completo:

```ts
import type { User } from '@/shared/types/interfaces';

export type FaqAudiencia = 'cliente' | 'proveedor';

export interface Faq {
  q: string;
  a: string;
  audiencia: FaqAudiencia;
}

/** Tab inicial del modal de FAQs según el rol del usuario logueado. */
export function defaultAudiencia(role: User['role'] | undefined): FaqAudiencia {
  return role === 'PROVIDER' ? 'proveedor' : 'cliente';
}

export const FAQS: Faq[] = [
  // ── Clientes ──────────────────────────────────────────────────────────────
  {
    audiencia: 'cliente',
    q: '¿Qué es Aliados y cómo funciona?',
    a: 'Aliados es la plataforma que te conecta en minutos con profesionales de confianza para resolver las necesidades de mantenimiento y reparación en tu espacio. Solo tenés que indicar qué servicio necesitás (plomería, gas, electricidad, etc.), y la aplicación te conectará con el experto mejor calificado y más cercano a tu ubicación.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo solicito un servicio?',
    a: "Desde tu panel, hacé clic en una de las tarjetas de 'Servicios populares' (Electricista, Plomero, Cerrajero, Gasista, Mudanzas) o usá el buscador y hacé clic en 'Buscar'. Luego completá la dirección (podés usar el GPS), describí el problema y adjuntá fotos opcionales. Confirmá con el botón 'Solicitar servicio'.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo hago seguimiento de mi servicio?',
    a: "Tus solicitudes activas aparecen en 'Trabajos activos' del panel principal. Hacé clic en cualquiera para ver el estado en tiempo real. Las mudanzas activas se muestran en la sección 'Mudanzas activas'. Recibirás notificaciones push cuando haya novedades.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo verifican a los profesionales que prestan el servicio?',
    a: 'Tu seguridad es nuestra prioridad. Todos los proveedores en nuestra red pasan por un riguroso proceso de validación que incluye verificación de identidad, revisión de antecedentes y validación de sus credenciales y matrículas habilitantes. Además, al recibir una propuesta podés ver el perfil del proveedor con su calificación promedio y reseñas de trabajos anteriores.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo sé cuánto voy a pagar?',
    a: 'La transparencia es total. Antes de confirmar la solicitud, vas a recibir una tarifa clara para la visita técnica, luego el valor final del trabajo se acuerda directamente a través de la plataforma con un presupuesto detallado una vez que el profesional evalúa la tarea a realizar.',
  },
  {
    audiencia: 'cliente',
    q: '¿El presupuesto incluye el valor de los materiales?',
    a: 'No, el presupuesto es solo de la mano de obra, la lista de materiales necesarios es meramente enunciativa.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cuáles son los métodos de pago disponibles?',
    a: 'Podés abonar de forma 100% segura a través de la aplicación utilizando tarjetas de crédito, débito o billeteras virtuales. Al centralizar el pago en la plataforma, garantizamos la seguridad de tu dinero.',
  },
  {
    audiencia: 'cliente',
    q: '¿Puedo cancelar una solicitud?',
    a: "Sí, podés cancelar mientras el estado sea 'Buscando proveedor'. Entrá al seguimiento del trabajo y usá la opción de cancelar; te pedirá ingresar el motivo. Una vez que el proveedor está en camino o trabajando ya no es posible cancelar.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo califico al proveedor?',
    a: "Al completarse el servicio accedés automáticamente a la pantalla de calificación con estrellas (1 a 5) y comentario opcional. También podés calificar más tarde desde 'Historial de trabajos' en tu panel, haciendo clic en los trabajos con badge 'Sin calificar'.",
  },
  {
    audiencia: 'cliente',
    q: '¿Qué hago si surge un inconveniente con el trabajo realizado?',
    a: 'Contamos con un equipo de soporte dedicado. Si el servicio no cumple con los estándares acordados, podés reportarlo directamente desde la app. Revisaremos el caso inmediatamente para mediar con el profesional y brindarte una solución.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo contacto a soporte?',
    a: 'Podés reportar un problema con el botón de bug de esta barra, o consultarnos por el asistente de chat. Para casos urgentes escribinos a soporte@aliados.com.',
  },
  // ── Profesionales ─────────────────────────────────────────────────────────
  {
    audiencia: 'proveedor',
    q: '¿Qué beneficios tengo al ofrecer mis servicios en Aliados?',
    a: 'Aliados funciona como tu principal canal de adquisición de clientes. Te conectamos de forma automática con personas y empresas que buscan activamente tus servicios en tu zona. Sos tu propio jefe: manejás tus horarios, optimizás tus rutas y potenciás tus ingresos sin gastar en publicidad.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cuáles son los requisitos para darme de alta en la plataforma?',
    a: 'Para garantizar la excelencia de la red, solicitamos: documento de identidad (DNI), constancia de inscripción impositiva Monotributo/Responsable Inscripto, certificado de antecedentes penales, la matrícula vigente obligatoria para aquellos oficios regulados (como gasistas o electricistas) y la póliza de un seguro de trabajo.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo recibo las solicitudes de trabajo?',
    a: 'Una vez que tu perfil esté validado y activo, la aplicación te enviará notificaciones en tiempo real cuando un cliente cercano requiera un servicio de tu especialidad. Vas a poder revisar los detalles del pedido antes de decidir si lo aceptás.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo activo o desactivo mi disponibilidad?',
    a: "En el encabezado de la app encontrarás el toggle que alterna entre 'Disponible' y 'Desconectado'. Al activarlo empezás a recibir solicitudes de trabajo. No podés desconectarte mientras tenés un trabajo en curso; el sistema te mostrará el estado 'Ocupado' automáticamente.",
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo es el sistema de comisiones y cuándo cobro?',
    a: 'Descargar la app y registrarse es completamente gratuito. Solo retenemos una comisión transparente y preestablecida por cada trabajo concretado con éxito a través de la plataforma. Tus ganancias se liquidan periódicamente y se transfieren de forma automática a la cuenta bancaria o billetera virtual que elijas.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Qué sucede si un cliente cancela el servicio cuando ya estoy en camino?',
    a: 'Valoramos tu tiempo y tu esfuerzo. Contamos con una política de cancelación estricta. Si el cliente cancela el servicio de forma tardía o una vez que llegaste al domicilio, recibirás una compensación económica predefinida por el traslado.',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && npx vitest run src/shared/constants/__tests__/faqs.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run la suite completa**

Run: `cd apps/app && pnpm test`
Expected: todos los tests PASS (los 5 archivos existentes + el nuevo). El typecheck completo corre en Task 2 Step 4 con `pnpm build` (que ejecuta `tsc -b`).

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/shared/constants/faqs.ts apps/app/src/shared/constants/__tests__/faqs.test.ts
git commit -m "feat(faqs): contenido de FAQs por audiencia + helper defaultAudiencia con tests"
```

---

### Task 2: FaqModal centrado con tabs + rename en Header

**Files:**
- Modify: `apps/app/src/shared/components/FloatingActions.tsx` (líneas ~98-185: array `FAQS` y `FaqWindow`; y el render en `FloatingActions`, línea ~384)
- Modify: `apps/app/src/features/components/Header.tsx` (línea 11 import, línea 181 render)

**Interfaces:**
- Consumes (de Task 1): `FAQS: Faq[]`, `defaultAudiencia(role)`, `FaqAudiencia` desde `@/shared/constants/faqs`.
- Consumes: `useStore((s) => s.user)` de `@/shared/store/useStore` (el `user` tiene `role: 'CLIENT' | 'PROVIDER' | 'ADMIN'`).
- Produces: `export function FaqModal({ onClose }: { onClose: () => void })` en `FloatingActions.tsx` (reemplaza al export `FaqWindow`; `FaqItem` queda igual).

- [ ] **Step 1: Reemplazar FAQS + FaqWindow por FaqModal**

En `apps/app/src/shared/components/FloatingActions.tsx`:

a) Borrar el array `const FAQS = [...]` completo (líneas 100-133) y agregar al bloque de imports:

```ts
import { FAQS, defaultAudiencia, type FaqAudiencia } from "@/shared/constants/faqs";
import { useStore } from "@/shared/store/useStore";
```

b) `FaqItem` queda exactamente igual.

c) Reemplazar el componente `FaqWindow` completo por:

```tsx
const TABS: { value: FaqAudiencia; label: string }[] = [
  { value: "cliente",   label: "Clientes" },
  { value: "proveedor", label: "Profesionales" },
];

export function FaqModal({ onClose }: { onClose: () => void }) {
  const user = useStore((state) => state.user);
  const [tab, setTab] = useState<FaqAudiencia>(() => defaultAudiencia(user?.role));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:bg-black/40 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="chat-window-enter flex h-full w-full flex-col overflow-hidden bg-white dark:bg-dark-surface sm:h-[70vh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl dark:sm:border-dark-border"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 dark:border-dark-border dark:bg-dark-brand">
          <div className="flex items-center gap-2">
            <CircleHelp size={18} className="text-white" />
            <span className="text-sm font-semibold text-white">Preguntas frecuentes</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="cursor-pointer rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-slate-100 dark:border-dark-border">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex-1 cursor-pointer py-2.5 text-sm font-medium transition-colors ${
                tab === value
                  ? "border-b-2 border-brand-600 text-brand-600 dark:border-dark-brand dark:text-dark-brand"
                  : "text-slate-500 hover:text-slate-700 dark:text-dark-text-secondary dark:hover:text-dark-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {FAQS.filter((faq) => faq.audiencia === tab).map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

Notas de diseño que el implementador debe respetar:
- En mobile (`< sm`) el panel ocupa toda la pantalla (`h-full w-full`, sin overlay visible), igual que el comportamiento actual.
- En desktop el overlay `bg-black/40` cierra al hacer clic; el `stopPropagation` evita que un clic dentro del panel cierre.
- `key={faq.q}` en `FaqItem` hace que al cambiar de tab los acordeones se remonten colapsados — comportamiento deseado.

d) En el componente `FloatingActions` (final del archivo), cambiar el render:

```tsx
{faqOpen  && <FaqModal        onClose={() => setFaqOpen(false)}  />}
```

(solo cambia `FaqWindow` → `FaqModal`; las líneas de bug y chat quedan igual).

- [ ] **Step 2: Rename en Header.tsx**

En `apps/app/src/features/components/Header.tsx`:

Línea 11:
```tsx
import { ChatWindow, FaqModal, BugReportWindow } from "@/shared/components/FloatingActions";
```

Línea 181:
```tsx
{faqOpen  && <FaqModal        onClose={() => setFaqOpen(false)}  />}
```

- [ ] **Step 3: Verificar que no queda ninguna referencia a FaqWindow**

Run: `grep -rn "FaqWindow" apps/app/src`
Expected: sin resultados.

- [ ] **Step 4: Typecheck + build + tests**

Run: `cd apps/app && pnpm test && pnpm build`
Expected: tests PASS y build sin errores de TypeScript.

- [ ] **Step 5: Verificación visual manual**

Run: `cd apps/app && pnpm dev` y en el navegador:
- Login como cliente → abrir FAQ desde la barrita (desktop): modal centrado, tab "Clientes" activa, 11 preguntas, acordeón funciona, clic afuera cierra.
- Cambiar a tab "Profesionales": 6 preguntas.
- Viewport mobile (devtools): abrir desde el menú del Header → fullscreen.
- Login como proveedor (tester) → abre en tab "Profesionales".

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/shared/components/FloatingActions.tsx apps/app/src/features/components/Header.tsx
git commit -m "feat(faqs): modal centrado con tabs por audiencia (reemplaza panel anclado)"
```

---

## Self-review del plan

- **Cobertura de spec:** contenido 17 FAQs verbatim (Task 1), extracción a constants (Task 1), FaqModal centrado + tabs + default por rol (Task 2), rename en Header (Task 2), tests de lógica pura (Task 1), verificación visual manual (Task 2 Step 5). Fuera de alcance respetado.
- **Sin placeholders:** todo el código está completo, incluidos los 17 textos.
- **Consistencia de tipos:** `FaqAudiencia`/`Faq`/`FAQS`/`defaultAudiencia` idénticos entre Task 1 (produce) y Task 2 (consume); `user?.role` matchea `User['role'] | undefined`.
