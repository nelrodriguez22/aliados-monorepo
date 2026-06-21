# `@repo/eslint-config`

Configuraciones de ESLint compartidas del monorepo. Paquete interno (no publicado). Para el panorama general ver el [README raíz](../../README.md).

## Configs disponibles

| Export | Para qué |
|--------|----------|
| `@repo/eslint-config/base` | Base común (TypeScript + Prettier) para cualquier paquete |
| `@repo/eslint-config/react-internal` | Base + reglas de React / React Hooks (para apps/paquetes React) |
| `@repo/eslint-config/next-js` | Variante para apps Next.js |

## Uso

En el `eslint.config.js` (flat config) del workspace que lo consume:

```js
import { config } from "@repo/eslint-config/react-internal";

export default config;
```

(El export exacto depende de la config; ver el archivo correspondiente — `base.js`, `react-internal.js`, `next.js`.)
