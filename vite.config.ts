import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import path from 'path'

/**
 * Vite Build Configuration — BargainBaaS INA Widget
 * ==================================================
 * Output: dist/widget.js (IIFE, fully self-contained, Preact-powered)
 *
 * Key decisions:
 *  - Preact alias: swaps react/react-dom for preact/compat at build time.
 *    This is transparent to the TSX source but saves ~100 KB in the final bundle.
 *  - IIFE format: required for a drop-in <script> tag with no module loader.
 *  - cssInjectedByJsPlugin: inlines all Tailwind CSS into widget.js itself,
 *    so merchants embed exactly one file — no separate stylesheet.
 *  - No externals: everything ships inside widget.js; the host page supplies nothing.
 */
export default defineConfig({
  plugins: [
    react(),
    cssInjectedByJsPlugin(),
  ],

  resolve: {
    alias: {
      // Remap React to Preact's compatibility layer at compile time.
      // All `import ... from 'react'` and `import ... from 'react-dom'` calls
      // in the source tree automatically resolve to Preact equivalents.
      'react':     'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      // Absolute imports from src/
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    lib: {
      entry:    'src/main.tsx',
      name:     'BargainWidget',           // window.BargainWidget in IIFE scope
      fileName: () => 'widget.js',
      formats:  ['iife'],
    },
    rollupOptions: {
      // No externals — the bundle must be fully self-contained.
      output: {
        // Inline dynamic imports so the output is always a single file.
        inlineDynamicImports: true,
      },
    },
    // Minify for production CDN delivery (Vite 8 uses oxc by default).
    // Source maps aid debugging on merchant storefronts without exposing source.
    sourcemap:    false,
    // Emit a clean dist/ on every build.
    emptyOutDir:  true,
  },

  define: {
    'process.env.NODE_ENV': '"production"',
  },
})