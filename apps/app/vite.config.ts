import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Aliados",
        short_name: "Aliados",
        description: "Conectamos clientes con profesionales de confianza",
        theme_color: "#1e547a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        orientation: "portrait",
        icons: [
          {
            src: "https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/favicon_fmygev.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/AliadosApp_192_fo5fxs.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/AliadosApp512_ay89cv.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        // skipWaiting OFF a propósito: con registerType 'prompt' el SW nuevo espera
        // a que el usuario confirme "Recargar" (updateServiceWorker(true)) en vez de
        // activarse y recargar a ciegas a mitad de sesión.
        clientsClaim: true,
        // /api NO se cachea (network-only): las respuestas son autenticadas y
        // por-usuario, y el Cache Storage es por-origen (no por-usuario) → cachearlas
        // podía filtrar datos del usuario A al B en el mismo dispositivo. Para una app
        // de tiempo real el fallback offline de API aporta poco y arriesga estado viejo.
        // El app-shell (HTML/JS/CSS/img) sí se precachea → la app abre offline.
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/__\//],
      },
    }),
    // Sube los source maps a Sentry (stack traces legibles). Solo se activa cuando
    // hay SENTRY_AUTH_TOKEN (CI/build de prod); en build local sin token no hace nada.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              // Sube los .map a Sentry y los BORRA de dist/ antes del deploy, para
              // que el código fuente no quede público en Firebase Hosting.
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
          }),
        ]
      : []),
  ],
  build: {
    outDir: "dist",
    sourcemap: "hidden",
    // rollupOptions → rolldownOptions
    // manualChunks objeto ya no se soporta, se usa codeSplitting
    rolldownOptions: {
      output: {
        // Elimina console.* y debugger de TODO el bundle de prod (incluidas dependencias
        // como Firebase/SockJS). Oxc minifier — solo aplica en build; en dev se mantienen.
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true,
          },
        },
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
              priority: 20,
            },
            {
              // Excluye messaging: se carga vía import() dinámico en su propio
              // chunk async (ver getMessagingInstance en shared/lib/firebase).
              name: "vendor-firebase",
              test: /[\\/]node_modules[\\/]firebase[\\/](?!messaging)/,
              priority: 15,
            },
            {
              // WebSocket (sockjs + stomp): pesado, fuera del chunk de entrada.
              name: "vendor-ws",
              test: /[\\/]node_modules[\\/](sockjs-client|@stomp[\\/]stompjs)[\\/]/,
              priority: 12,
            },
            {
              name: "vendor-crypto",
              test: /[\\/]node_modules[\\/]crypto-js[\\/]/,
              priority: 12,
            },
            {
              name: "vendor-query",
              test: /[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  publicDir: "public",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    global: "globalThis",
  },
});
