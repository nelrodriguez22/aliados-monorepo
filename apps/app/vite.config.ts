import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Aliados',
        short_name: 'Aliados',
        description: 'Conectamos clientes con profesionales de confianza',
        theme_color: '#1e547a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/favicon_fmygev.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/AliadosApp_192_fo5fxs.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/AliadosApp512_ay89cv.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/aliados-web-backend-prd\.up\.railway\.app\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/messaging', 'firebase/storage'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-maps': ['@react-google-maps/api'],
        }
      }
    }
  },
  publicDir: 'public',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    global: 'globalThis',
  },
});
