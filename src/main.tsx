/**
 * main.tsx — BargainBaaS INA Widget Entry Point
 * ===============================================
 * This module is the Stage-2 core bundle executed by loader.js.
 *
 * Responsibilities:
 *  1. Read public tenant/product context from window.INA (set by loader.js).
 *  2. Create an isolated, styled host container on document.body.
 *  3. Mount the Preact application root into that container.
 *  4. Drain and replay any buffered window.INA.q commands that the merchant
 *     fired before this bundle finished loading.
 *
 * No framework router or store dependencies live here — this file is the
 * framework-agnostic boundary between the host storefront and the widget UI.
 */

import { render } from 'preact'
import { ChatWidget } from './components/ChatWidget'
import './index.css'

// ─── Type augmentation for the window.INA global ────────────────────────────

declare global {
  interface Window {
    INA: InaCommandFn & {
      q?: IArguments[]
      tenantId?: string
      defaultProductId?: string | null
    }
  }
}

type InaCommandFn = (...args: unknown[]) => void

// ─── 1. Read configuration set by loader.js ─────────────────────────────────

const tenantId: string = (window.INA && window.INA.tenantId) || ''
const defaultProductId: string = (window.INA && window.INA.defaultProductId) || ''

if (!tenantId) {
  console.warn('[BargainBaaS] Widget bundle loaded without a valid tenantId. Aborting mount.')
  // Intentionally do not throw — never crash the host storefront.
}

// ─── 2. Create an isolated host container ────────────────────────────────────
//
// We use a completely fresh div so the widget's styles never collide with
// the host page's CSS cascade. The element is identifiable but harmless.

let container = document.getElementById('bargain-baas-widget-root')
if (!container) {
  container = document.createElement('div')
  container.id = 'bargain-baas-widget-root'

  // Reset inherited styles to guarantee a clean CSS baseline on any host page.
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '0',
    right:  '0',
    width:  '0',
    height: '0',
    overflow: 'visible',
    zIndex: '2147483647',          // Maximum z-index — always on top
    fontFamily: 'inherit',
    border: 'none',
    background: 'transparent',
    pointerEvents: 'none',         // Container itself is invisible; children opt-in
  })

  document.body.appendChild(container)
}

// ─── 3. Mount the Preact widget tree ─────────────────────────────────────────

if (tenantId) {
  render(
    <ChatWidget
      tenantId={tenantId}
      productId={defaultProductId}
    />,
    container,
  )
}

// ─── 4. Drain the pre-load command queue ─────────────────────────────────────
//
// Merchant code may have called window.INA('init', { productId: 'X' }) before
// this bundle arrived. Now that the widget is mounted and operational, replace
// the stub with a live dispatcher and replay every buffered call.

function liveDispatcher(...args: unknown[]): void {
  const command = args[0] as string
  const payload = args[1] as Record<string, unknown> | undefined

  switch (command) {
    case 'init':
      // The widget already bootstrapped from window.INA context; a late 'init'
      // call with an overriding productId is the only meaningful action here.
      if (payload?.productId) {
        console.info('[BargainBaaS] Late init received — productId:', payload.productId)
        // Re-render with the overriding productId.
        if (container && tenantId) {
          render(
            <ChatWidget
              tenantId={tenantId}
              productId={String(payload.productId)}
            />,
            container,
          )
        }
      }
      break

    case 'show':
      container?.dispatchEvent(new CustomEvent('ina:show'))
      break

    case 'hide':
      container?.dispatchEvent(new CustomEvent('ina:hide'))
      break

    default:
      console.warn('[BargainBaaS] Unknown INA command:', command)
  }
}

// Replay buffered queue then install the live dispatcher.
const queue: IArguments[] = (window.INA && window.INA.q) || []
queue.forEach((bufferedArgs) => liveDispatcher(...Array.from(bufferedArgs)))

// Replace the stub — all future window.INA(...) calls go directly to the live dispatcher.
window.INA = liveDispatcher as typeof window.INA
window.INA.tenantId        = tenantId
window.INA.defaultProductId = defaultProductId
