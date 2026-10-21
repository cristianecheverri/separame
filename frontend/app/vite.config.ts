import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Mock mode (in-memory API, fake session) exists only for local dev and visual QA.
  // `__MOCK__` is a literal at build time so the whole src/mocks tree is dropped from
  // production bundles.
  const mock = command === 'serve' && env.VITE_MOCK === '1';

  return {
    base: '/app/',
    define: { __MOCK__: JSON.stringify(mock) },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script',
        // Custom worker (src/sw.ts): precache + web push notices for the pro.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/app/',
          name: 'Sepárame',
          short_name: 'Sepárame',
          description: 'Tu agenda de citas en línea: servicios, horario y reservas.',
          lang: 'es-CO',
          theme_color: '#0B6E4F',
          background_color: '#F3F6F4',
          display: 'standalone',
          start_url: '/app/',
          scope: '/app/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': here('./src'), '@shared': here('../../shared') },
      // shared/ lives outside this package: make it use this package's copy of zod.
      dedupe: ['zod'],
    },
    server: {
      port: 5174,
      fs: { allow: [here('../..')] },
    },
    build: {
      target: 'es2022',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // Amplify Auth (+ its AWS SDK bits) in its own long-cached vendor chunk.
              { name: 'amplify', test: /node_modules[\\/](aws-amplify|@aws-amplify|@aws-crypto|@aws-sdk|@smithy|js-cookie|tslib)[\\/]/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|@tanstack)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
