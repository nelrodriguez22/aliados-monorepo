# Aliados — Landing

Sitio público (landing) de Aliados. Para el panorama general del proyecto ver el [README raíz](../../README.md).

## Stack

- **Astro** + **Tailwind CSS**

## Comandos

```bash
pnpm dev       # dev server
pnpm build     # build de producción → dist/
pnpm preview   # previsualizar el build
```

(O desde la raíz del monorepo: `pnpm dev --filter landing`.)

## Deploy

Firebase Hosting (target `landing`), automático vía GitHub Actions en push a `main`. Ver [`firebase.json`](../../firebase.json) y `.github/workflows/deploy.yml`.
