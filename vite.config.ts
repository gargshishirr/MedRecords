/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';

/**
 * Content-Security-Policy for production builds. GitHub Pages can't send
 * headers, so it goes in a <meta> tag. Dev mode is left alone because Vite's
 * hot reload needs inline scripts. React's `style={...}` props are set through
 * the CSSOM, which CSP allows, so styles don't need 'unsafe-inline'.
 * `frame-ancestors` can't be set from a meta tag; public/theme-init.js
 * guards against framing instead.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'medrecords-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Fail the build rather than ship a page the policy would break.
        if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
          throw new Error('index.html has an inline <script>, which the Content-Security-Policy blocks.');
        }
        const charset = /<meta charset="UTF-8" \/>/i;
        if (!charset.test(html)) throw new Error('Could not find <meta charset> to place the CSP after.');
        return html.replace(
          charset,
          (tag) => `${tag}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
        );
      },
    },
  };
}

/** Files from public/ that the app needs offline. */
const PUBLIC_FILES = ['favicon.svg', 'theme-init.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

/**
 * Writes sw.js, the service worker that lets MedRecords open offline and be
 * installed. Pages load network-first (so updates arrive straight away) and
 * fall back to the cached copy offline; hashed assets are cache-first. It
 * never stores health data: that stays in localStorage and IndexedDB.
 */
function serviceWorker(): Plugin {
  return {
    name: 'medrecords-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(
        // Only the Latin font files: other scripts' subsets are fetched (and cached) if ever needed.
        (f) => !f.endsWith('.map') && (!/\.woff2?$/.test(f) || /-latin-wght-normal/.test(f)),
      );
      const files = ['./', ...PUBLIC_FILES, ...built.filter((f) => f !== 'index.html')];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, files) });
    },
  };
}

function serviceWorkerSource(version: string, files: string[]): string {
  return `// Generated at build time by vite.config.ts.
const CACHE = 'medrecords-${version}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('medrecords-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put('./', copy)));
          }
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached || Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
`;
}

// `base: './'` keeps asset URLs relative so the build works under the
// GitHub Pages sub-path (https://gargshishirr.github.io/MedRecords/).
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
  },
});
