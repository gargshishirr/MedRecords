/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

// `base: './'` keeps asset URLs relative so the build works under the
// GitHub Pages sub-path (https://gargshishirr.github.io/MedRecords/).
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
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
