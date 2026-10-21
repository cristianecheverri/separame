import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const sharedDir = resolve(root, '../../shared');

/** Stable names referenced by every generated profile page (see shared/infra.ts SITE_PATHS). */
const BOOKING_ENTRY = 'booking';
const BOOKING_JS = 'b/booking.js';
const BOOKING_CSS = 'b/booking.css';
const HEAD_MARKER = '<!--SEPARAME_HEAD-->';
const DATA_MARKER = '<!--SEPARAME_DATA-->';
/** JS-free pages served at /<name> (reserved slugs in shared/slug.ts). */
const STATIC_PAGES = ['privacy', 'terms'];

/**
 * Dev server routing that mirrors CloudFront: `/<slug>` and `/c/<token>` are
 * served from the booking template; everything with an extension, Vite
 * internals and the real pages pass through untouched.
 */
function devRoutes(): Plugin {
  return {
    name: 'separame-dev-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        const passthrough =
          path === '/' || path.startsWith('/@') || path.startsWith('/src/') || path.startsWith('/node_modules/') ||
          path.startsWith('/dev/') || path === '/dev' || path.startsWith('/_templates/') || /\.[a-z0-9]+$/i.test(path);
        const staticPage = STATIC_PAGES.find((page) => path === `/${page}` || path === `/${page}/`);
        if (staticPage) {
          req.url = `/${staticPage}/index.html${url.search}`;
        } else if (!passthrough && (path.startsWith('/c/') || path.startsWith('/w/') || /^\/[^/]+\/?$/.test(path))) {
          req.url = `/_templates/booking.html${url.search}`;
        }
        next();
      });
    },
  };
}

/**
 * The manage (/c/<token>) and waitlist-leave (/w/<token>) pages run the same
 * bundle as the profile pages, so they are derived from the built template
 * instead of being extra entries (which would split booking.js into hashed
 * shared chunks).
 */
function manageShell(): Plugin {
  return {
    name: 'separame-manage-shell',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(root, 'dist');
      const template = readFileSync(resolve(outDir, '_templates/booking.html'), 'utf8');
      if (!template.includes(HEAD_MARKER) || !template.includes(DATA_MARKER)) {
        throw new Error('booking template lost its SEPARAME markers');
      }
      const shells = { c: 'Tu cita · Sepárame', w: 'Lista de espera · Sepárame' };
      for (const [dir, title] of Object.entries(shells)) {
        const html = template
          .replace(HEAD_MARKER, `<title>${title}</title>\n<meta name="robots" content="noindex">`)
          .replace(DATA_MARKER, '');
        mkdirSync(resolve(outDir, dir), { recursive: true });
        writeFileSync(resolve(outDir, `${dir}/index.html`), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [preact(), tailwindcss(), devRoutes(), manageShell()],
  resolve: {
    alias: { '@shared': sharedDir },
  },
  appType: 'mpa',
  server: {
    fs: { allow: [root, sharedDir, resolve(root, '..')] },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'b/assets',
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        landing: resolve(root, 'index.html'),
        notFound: resolve(root, '404.html'),
        privacy: resolve(root, 'privacy/index.html'),
        terms: resolve(root, 'terms/index.html'),
        [BOOKING_ENTRY]: resolve(root, '_templates/booking.html'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === BOOKING_ENTRY ? BOOKING_JS : 'b/assets/[name]-[hash].js'),
        chunkFileNames: 'b/assets/[name]-[hash].js',
        assetFileNames: (asset) =>
          asset.names.includes(`${BOOKING_ENTRY}.css`) ? BOOKING_CSS : 'b/assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
