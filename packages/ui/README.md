# `@repo/ui`

Librería de componentes React compartida del monorepo. Paquete interno (no publicado). Para el panorama general ver el [README raíz](../../README.md).

> **Nota:** hoy contiene los componentes scaffold de Turborepo (`button`, `card`, `code`). La UI real de la app vive en [`apps/app/src/shared/components`](../../apps/app/src/shared/components) (incluida la carpeta `ui/` con `Button`, `Card`, `Badge`, etc.). Este paquete está disponible para extraer componentes verdaderamente compartidos entre apps cuando haga falta.

## Componentes

`src/button.tsx`, `src/card.tsx`, `src/code.tsx`.

## Uso

Cada componente se importa por su archivo (export `./*` → `./src/*.tsx`):

```tsx
import { Button } from "@repo/ui/button";
```

## Scripts

```bash
pnpm lint                 # ESLint (0 warnings)
pnpm check-types          # tsc --noEmit
pnpm generate:component   # generador (turbo gen) de un componente nuevo
```
