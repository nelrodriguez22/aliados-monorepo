# `@repo/typescript-config`

Bases de `tsconfig` compartidas del monorepo. Paquete interno (no publicado). Para el panorama general ver el [README raíz](../../README.md).

## Configs disponibles

| Archivo | Para qué |
|---------|----------|
| `base.json` | Base común de TypeScript para cualquier paquete |
| `react-library.json` | Base + opciones para librerías/apps React |
| `nextjs.json` | Variante para apps Next.js |

## Uso

En el `tsconfig.json` del workspace que lo consume:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    // overrides propios del paquete
  }
}
```
