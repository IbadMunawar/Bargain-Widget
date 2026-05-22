/// <reference types="vite/client" />

import { WidgetConfig } from './components/ChatWidget'

declare global {
  interface Window {
    /**
     * Initializes and mounts the BargainBaaS chat widget.
     * Call this after loading widget.js:
     *
     * @example
     * window.initBargainWidget({ tenantId: 'abc', productId: 'sku-123' })
     */
    initBargainWidget: (config: WidgetConfig) => void
  }
}
