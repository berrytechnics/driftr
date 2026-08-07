import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
// Default mode: web (GitHub Pages / Cloudflare). Electron mode: relative base, no PWA.
export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron'

  return {
    base: isElectron ? './' : '/',
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    build: {
      // postfx (~1MB) is lazy via ScenePostFX; warn only on unexpected giants
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            // Before @react-three — package path contains both names.
            if (id.includes('postprocessing')) return 'postfx'
            if (id.includes('three') || id.includes('@react-three')) {
              return 'three'
            }
            if (id.includes('leva')) return 'leva'
            if (id.includes('react-dom') || id.includes('/react/')) {
              return 'react'
            }
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        // Keep the virtual:pwa-register module resolvable; disable SW generation for Electron.
        disable: isElectron,
        registerType: 'autoUpdate',
        includeAssets: [
          'driftr.ico',
          'driftr.png',
          'apple-touch-icon.png',
          'pwa-192.png',
          'pwa-512.png',
          'pwa-maskable-512.png',
        ],
        manifest: {
          name: 'Driftr',
          short_name: 'Driftr',
          description:
            'Fly the Sol system — dock, fight asteroids, and chase buffs.',
          theme_color: '#060c0e',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['games', 'entertainment'],
          icons: [
            {
              src: 'pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'driftr.png',
              sizes: '1254x1254',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          // App shell + hashed assets; heavy models/textures use runtime cache
          globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
          // Keep precache lean — heavy glb/mp3 use runtime CacheFirst below
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                request.destination === 'font' ||
                /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(
                  request.url,
                ),
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:glb|gltf|mp3|png|jpe?g|webp)(?:\?.*)?$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'game-assets',
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
          ],
        },
        devOptions: {
          // Keep SW off in `vite` — use `vite build && vite preview` to test PWA
          enabled: false,
        },
      }),
    ],
  }
})
