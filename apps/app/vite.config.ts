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
              /^https:\/\/aliados-web-backend-prd\.up\.railway\.app\/.*/i,
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
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-firebase",
              test: /[\\/]node_modules[\\/]firebase[\\/]/,
              priority: 15,
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
