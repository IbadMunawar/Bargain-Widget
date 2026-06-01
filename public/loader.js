/**
 * BargainBaaS — loader.js  (Stage-1 micro-agent)
 * ================================================
 * Responsibilities:
 * 1. Parse public config from the host <script> tag's data-* attributes.
 * 2. Establish the window.INA command-queue so merchant code can call
 * window.INA(...) before the core bundle arrives.
 * 3. Intercept SPA navigation (pushState / replaceState / popstate) and
 * signal the widget to reinitialise or hide itself automatically.
 * 4. Asynchronously inject the core widget bundle (widget.js).
 *
 * ZERO secrets — this file is fully public.
 *
 * USAGE:
 * <script
 * src="https://YOUR-CDN/loader.js"
 * data-ina-tenant="pk_live_abc123"
 * data-ina-product="iphone-15-pro"
 * data-ina-product-route="/product/:id"
 * async
 * ></script>
 *
 * data-ina-product-route   optional — defaults to "/product/:id"
 * Set to "/shop/:id" for WooCommerce, etc.
 */

(function () {
  'use strict';

  // ─── 1. CAPTURE SCRIPT ATTRIBUTES ──────────────────────────────────────────
  // document.currentScript is only live while this script is executing —
  // capture it immediately before any async boundary nullifies it.
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    console.warn('[BargainBaaS] loader.js must be loaded via a <script src="..."> tag.');
    return;
  }

  var TENANT_ID = scriptEl.getAttribute('data-ina-tenant');
  var INIT_PRODUCT = scriptEl.getAttribute('data-ina-product') || null;
  var ROUTE_TEMPLATE = scriptEl.getAttribute('data-ina-product-route') || '/product/:id';

  // CDN base is derived from this script's own URL — widget.js lives next to it.
  // This makes the snippet CDN-agnostic: no hardcoded domain anywhere.
  var CDN_BASE = scriptEl.src.replace(/\/loader\.js(\?.*)?$/, '');

  if (!TENANT_ID) {
    console.warn('[BargainBaaS] data-ina-tenant is required. Widget will not load.');
    return;
  }

  // ─── 2. COMMAND-QUEUE API (window.INA) ─────────────────────────────────────
  // If window.INA already exists (e.g. snippet included twice), leave it.
  window.INA = window.INA || function () {
    (window.INA.q = window.INA.q || []).push(arguments);
  };
  window.INA.tenantId = TENANT_ID;
  window.INA.defaultProductId = INIT_PRODUCT;

  // ─── 3. ROUTE → PRODUCT-ID EXTRACTOR ───────────────────────────────────────
  // Converts  "/product/:id"  into RegExp  /\/product\/([^/?#]+)/
  // Also supports  "/shop/products/:id"  etc.
  function buildRouteRegex(template) {
    // Escape all regex meta-chars except the :id placeholder
    var escaped = template.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp(escaped.replace(':id', '([^/?#]+)'));
  }

  var ROUTE_RE = buildRouteRegex(ROUTE_TEMPLATE);

  function extractProductId(pathname) {
    var m = pathname.match(ROUTE_RE);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ─── 4. ROUTE CHANGE HANDLER ───────────────────────────────────────────────
  // Tracks the last known productId so same-page refreshes do not re-init.
  var _activeProductId = INIT_PRODUCT;

  function handleRouteChange(pathname) {
    var productId = extractProductId(pathname);

    if (productId) {
      if (productId !== _activeProductId) {
        // ── Navigated to a DIFFERENT product ──────────────────────────────
        // Full state wipe + reinit with new product context.
        _activeProductId = productId;
        window.INA('product-change', { productId: productId });
      } else {
        // ── Returned to the SAME product page ─────────────────────────────
        // Just make the launcher visible again — preserve in-flight session.
        window.INA('show-launcher');
      }
    } else {
      // ── Non-product route (/cart, /, /checkout …) ─────────────────────
      // Collapse and visually hide the entire widget.
      _activeProductId = null;
      window.INA('hide');
    }
  }

  // ─── 5. INTERCEPT SPA NAVIGATION ───────────────────────────────────────────
  // Next.js (and any History API router) calls pushState / replaceState
  // during client-side navigation — these calls are normally silent to scripts.
  // We monkey-patch them here, then run our route scanner.

  function wrapHistoryMethod(methodName) {
    var original = history[methodName];
    history[methodName] = function (state, title, url) {
      var ret = original.apply(this, arguments);
      if (url) {
        try {
          // url may be absolute or relative — normalise via URL constructor.
          var pathname = new URL(String(url), window.location.origin).pathname;
          handleRouteChange(pathname);
        } catch (_) { /* malformed URL — ignore */ }
      }
      return ret;
    };
  }

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');

  // Handle browser Back / Forward buttons.
  window.addEventListener('popstate', function () {
    handleRouteChange(window.location.pathname);
  });

  // ─── 6. INJECT CORE BUNDLE ─────────────────────────────────────────────────
  var bundle = document.createElement('script');
  bundle.async = true;
  bundle.src = CDN_BASE + '/widget.js';
  (document.head || document.body).appendChild(bundle);

}());
