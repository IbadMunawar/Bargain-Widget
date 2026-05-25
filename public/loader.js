/**
 * BargainBaaS INA — Loader Script (loader.js)
 * ============================================
 * Stage-1 lightweight initialization script.
 *
 * PURPOSE
 * -------
 * This script is the public-facing SDK entry point embedded on merchant
 * storefronts (Shopify, WooCommerce, custom HTML). Its only jobs are:
 *
 *   1. Parse public configuration from the host <script> tag's data attributes.
 *   2. Establish the global `window.INA` command-queue interface so merchant
 *      code can call `window.INA(...)` before the core bundle has arrived.
 *   3. Asynchronously stream the core widget bundle from the CDN.
 *
 * SECURITY NOTE
 * -------------
 * This file intentionally contains ZERO secret tokens or server credentials.
 * Only the public tenant key (data-ina-tenant) and an optional product-context
 * hint (data-ina-product) are handled here.
 *
 * USAGE — drop one <script> tag on the merchant's storefront:
 * -----------------------------------------------------------
 *   <script
 *     src="https://YOUR-CDN-URL/widget/v1/loader.js"
 *     data-ina-tenant="pk_live_YOUR_PUBLIC_KEY"
 *     data-ina-product="OPTIONAL_PRODUCT_ID"
 *     async
 *   ></script>
 *
 * DYNAMIC USAGE — after the tag is already on the page:
 * -----------------------------------------------------
 * The core bundle processes everything pushed into the queue.
 * Merchants / your own frontend code can call:
 *
 *   window.INA('init', { productId: 'prod_abc123' });
 *   window.INA('show');
 *   window.INA('hide');
 *
 * All calls made before the core bundle loads are buffered in
 * `window.INA.q` and replayed automatically once the bundle is ready.
 */

(function () {
  'use strict';

  // ─── 1. LOCATE THE EMBEDDING SCRIPT TAG ────────────────────────────────────
  //
  // `document.currentScript` is the live reference to *this* <script> element
  // while the browser is parsing/executing it. We capture it immediately before
  // any async boundary can nullify it.
  //
  var scriptEl = document.currentScript;

  // ─── 2. PARSE PUBLIC DATA ATTRIBUTES ────────────────────────────────────────

  var tenantId  = scriptEl && scriptEl.getAttribute('data-ina-tenant');
  var productId = scriptEl && scriptEl.getAttribute('data-ina-product');

  // Guard: the public tenant key is mandatory — without it the core bundle
  // cannot resolve the correct configuration from the BargainBaaS API.
  if (!tenantId) {
    console.warn(
      '[BargainBaaS] Configuration Error: data-ina-tenant is required.'
    );
    // Halt cleanly — do NOT load the core bundle without a tenant context.
    return;
  }

  // ─── 3. COMMAND-QUEUE API (window.INA) ──────────────────────────────────────
  //
  // Establish the global stub *before* the core bundle arrives so merchant
  // code (and your own SPA pages) can fire commands immediately:
  //
  //   window.INA('init', { productId: 'X' });
  //
  // If `window.INA` already exists (e.g. the loader was included twice or the
  // core bundle loaded first), we leave it untouched — idempotent by design.
  //
  window.INA = window.INA || function () {
    // Lazily create the backing queue array and push the arguments object.
    (window.INA.q = window.INA.q || []).push(arguments);
  };

  // Attach the parsed public configuration directly onto the global stub so
  // the core bundle can read them synchronously on arrival, with no extra
  // round-trip or re-parsing of the DOM.
  window.INA.tenantId        = tenantId;
  window.INA.defaultProductId = productId || null;

  // ─── 4. LAZY CORE BUNDLE INJECTION ──────────────────────────────────────────
  //
  // Dynamically append the core widget bundle to <head>. Using `async = true`
  // ensures the download never blocks the host page's render pipeline.
  // The bundle itself is responsible for draining `window.INA.q` on load.
  //
  var coreScript  = document.createElement('script');
  coreScript.async = true;
  coreScript.src   = 'https://YOUR-CDN-URL/widget/v1/widget.js';

  // Append to <head>; fall back to <body> if <head> is somehow unavailable
  // (extremely rare, but defensive coding for hostile host environments).
  (document.head || document.body).appendChild(coreScript);

}());
