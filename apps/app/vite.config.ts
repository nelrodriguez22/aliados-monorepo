import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
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
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/api\.aliados-app\.convivirtech\.com\.ar\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
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
