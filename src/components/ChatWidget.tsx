/**
 * ChatWidget.tsx — BargainBaaS INA Core Engine
 * =============================================
 * Framework-agnostic, self-contained chat negotiation widget.
 *
 * Design constraints:
 *  - Zero Next.js / Zustand dependencies (stripped for SaaS multi-tenancy).
 *  - All state is local React/Preact hooks — no external store required.
 *  - Cart integration uses window.postMessage (the "walkie-talkie bridge")
 *    so the host storefront can respond without any direct coupling.
 *  - Enforces a strict 5-offer cap with UI freeze on terminal states.
 */

import { useState, useRef, useEffect } from 'preact/hooks'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatWidgetProps {
  tenantId: string
  productId: string
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Set on the final assistant message when a deal price has been agreed. */
  dealPrice?: number
}

/**
 * Session object returned by POST /api/saas/session/init.
 * These fields drive the entire pricing + routing pipeline.
 */
interface Session {
  session_id: string
  list_price: number
  currency: string
  expires_at: string
  /** Base URL for subsequent AI orchestrator calls (returned by handshake). */
  orchestrator_url: string
}

/**
 * Shape of a streamed frame from the AI orchestrator.
 */
interface AiFrame {
  response: string
  offer_count: number
  negotiation_status: string
  is_locked: boolean
  agreed_price?: number
  final_price?: number
  deal_accepted?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_OFFERS = 5

const TERMINAL_STATUSES: AiFrame['negotiation_status'][] = [
  'take_it_or_leave_it',
  'locked',
  'deal_locked',
  'deal_accepted',
]

const INITIAL_ASSISTANT_TEXT =
  "👋 Hi there! I'm your AI deal assistant. Ready to find you the best price on this product — make me an offer!"

// Central backend URL — reads from a Vite env variable at build time so the
// same source can target staging or production without code changes.
// Fallback guarantees the live deployment always works out of the box.
const BACKEND_BASE_URL =
  (import.meta.env.VITE_INA_BACKEND_URL as string | undefined) ||
  'https://ina-backend-fyp.onrender.com'

// Versioned orchestrator chat endpoint as per the active Swagger spec.
// This is the single source of truth — never derive this URL dynamically.
const ORCHESTRATOR_CHAT_URL = 'https://orchestrator-dmf8.onrender.com/ina/v1/chat'

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatWidget({ tenantId, productId }: ChatWidgetProps) {
  // ── UI state
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isVisible, setIsVisible] = useState(true)

  // ── Session state (populated by handshake)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)

  // ── Chat state
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'assistant', text: INITIAL_ASSISTANT_TEXT },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [offerCount, setOfferCount] = useState(0)
  const [negotiationStatus, setNegotiationStatus] =
    useState<AiFrame['negotiation_status']>('open')
  const [isLocked, setIsLocked] = useState(false)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [dealAccepted, setDealAccepted] = useState(false)
  const [dealDispatched, setDealDispatched] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ─── Derived booleans ──────────────────────────────────────────────────────

  /** True when no more negotiation turns are allowed. */
  const isFrozen =
    offerCount >= MAX_OFFERS || isLocked || TERMINAL_STATUSES.includes(negotiationStatus)

  const isDealAgreed = (negotiationStatus === 'deal_locked' || negotiationStatus === 'deal_accepted') && finalPrice !== null

  /** True the instant a deal is struck — drives the instant input freeze. */
  const isDealStruck =
    negotiationStatus === 'deal_accepted' || dealAccepted === true

  // ─── Effects ───────────────────────────────────────────────────────────────

  // Auto-scroll to the latest message.
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Check if the chat component screen is fully open and active
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // A 150ms delay guarantees the browser engine has completely painted the layout interface before grabbing the cursor
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Whenever the bot stops loading/thinking, immediately grab focus back to the input box
  useEffect(() => {
    if (!isLoading && isOpen && inputRef.current) {
      // Small timeout guarantees the DOM rendering thread has updated before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Listen for programmatic show/hide commands emitted by main.tsx queue drain.
  useEffect(() => {
    const root = document.getElementById('bargain-baas-widget-root')
    if (!root) return

    const onShow         = () => setIsOpen(true)
    const onHide         = () => { setIsOpen(false); setIsVisible(false) }
    const onShowLauncher = () => setIsVisible(true)

    root.addEventListener('ina:show',          onShow)
    root.addEventListener('ina:hide',          onHide)
    root.addEventListener('ina:show-launcher', onShowLauncher)

    return () => {
      root.removeEventListener('ina:show',          onShow)
      root.removeEventListener('ina:hide',          onHide)
      root.removeEventListener('ina:show-launcher', onShowLauncher)
    }
  }, [])

  // ── Session initialisation (runs once on first open) ──────────────────────
  useEffect(() => {
    if (!isOpen || session || isInitializing || sessionError) return
    initSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // ─── Session Handshake ─────────────────────────────────────────────────────

  async function initSession(): Promise<void> {
    setIsInitializing(true)
    setSessionError(null)

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/saas/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: tenantId,
          productId,
        }),
      })

      if (!res.ok) {
        throw new Error(`Session init failed: ${res.status} ${res.statusText}`)
      }

      const raw = await res.json()
      // Safely normalise both snake_case (Saim's backend) and camelCase shapes.
      const data: Session = {
        ...raw,
        session_id: raw.session_id || raw.sessionId,
      }
      setSession(data)

      // Inject a contextual welcome line once we know the list price.
      appendAssistantMessage(
        `This product is listed at ${formatPrice(data.list_price, data.currency)}. ` +
        `What price works for you? (You have up to ${MAX_OFFERS} offers.)`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSessionError(msg)
      appendAssistantMessage(
        `⚠️ Couldn't start a session right now. Please try again later.\n(${msg})`,
      )
    } finally {
      setIsInitializing(false)
    }
  }

  // ─── Send a user message ───────────────────────────────────────────────────

  async function handleSend(): Promise<void> {
    const text = inputValue.trim()
    if (!text || isFrozen || isLoading) return

    // Append user message immediately for snappy UX.
    const userMsg: Message = { id: Date.now(), role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    try {
      if (!session) {
        // Session hasn't resolved yet — queue isn't plausible but guard anyway.
        throw new Error('No active session. Please wait and try again.')
      }

      // Send to the Swagger-documented versioned endpoint.
      // Payload keys must match the v1 schema exactly: user_id + message.
      const res = await fetch(ORCHESTRATOR_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-INA-Session': session.session_id,
        },
        body: JSON.stringify({
          user_id: session.session_id,
          message: text,
        }),
      })

      if (!res.ok) {
        throw new Error(`AI response failed: ${res.status} ${res.statusText}`)
      }

      const frame: AiFrame = await res.json()

      // Parse all status boundaries from the frame.
      const newOfferCount = frame.offer_count ?? offerCount
      const newStatus = frame.negotiation_status ?? negotiationStatus
      const newLocked = frame.is_locked ?? isLocked

      setOfferCount(newOfferCount)
      setNegotiationStatus(newStatus)
      setIsLocked(newLocked)

      // Capture the deal_accepted flag from the network payload.
      if (frame.deal_accepted === true) {
        setDealAccepted(true)
      }

      const resolvedPrice = frame.agreed_price ?? frame.final_price ?? null
      if (resolvedPrice !== null) {
        setFinalPrice(resolvedPrice)
      }
      appendAssistantMessage(frame.response, resolvedPrice ?? undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      appendAssistantMessage(`⚠️ ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Cart Action — The Walkie-Talkie Bridge ────────────────────────────────
  //
  // Instead of calling an internal checkout store, we broadcast a structured
  // postMessage event. The host storefront listens for 'INA_PRICE_AGREED' and
  // handles the add-to-cart in its own native checkout flow.

  function handleVerifiedAddToCart(): void {
    if (!session || finalPrice === null) return

    const payload = {
      source: 'ina-widget',
      type: 'INA_PRICE_AGREED',
      sessionId: session.session_id,
      productId,
      price: finalPrice,
      currency: session.currency,
    }

    // Broadcast to the host page (same origin, or '*' if cross-origin iframe).
    window.postMessage(payload, window.location.origin)

    setDealDispatched(true)
    // Brief delay so the user sees the success state before the widget closes.
    setTimeout(() => setIsOpen(false), 1200)
  }


  // ─── Helpers ───────────────────────────────────────────────────────────────

  function appendAssistantMessage(text: string, dealPrice?: number): void {
    const msg: Message = { id: Date.now(), role: 'assistant', text, dealPrice }
    setMessages((prev) => [...prev, msg])
  }

  function formatPrice(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
    } catch {
      return `${currency} ${amount}`
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isVisible) return null

  return (
    // pointer-events: auto re-enables interaction inside our invisible container div.
    <div style={{ pointerEvents: 'auto' }}>

      {/* ── Chat Panel ─────────────────────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-24 right-5 z-[9999]
          w-[370px] max-w-[calc(100vw-2.5rem)]
          flex flex-col
          rounded-2xl overflow-hidden
          bg-white dark:bg-[#1a1b26]
          shadow-[0_20px_60px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)]
          transition-all duration-300 ease-out
          origin-bottom-right
          ${isOpen
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-90 pointer-events-none'}
        `}
        style={{ height: '540px' }}
        role="dialog"
        aria-label="BargainBaaS Chat"
        aria-modal="true"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 shrink-0">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">BargainBaaS</p>
              <p className="text-violet-200 text-xs font-medium truncate max-w-[180px]" title={productId}>
                {productId || 'No product context'}
              </p>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-3">
            {/* Offer counter pill */}
            {offerCount > 0 && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${offerCount >= MAX_OFFERS
                  ? 'bg-red-500/30 text-red-200'
                  : 'bg-white/10 text-violet-200'
                  }`}
              >
                {offerCount}/{MAX_OFFERS} offers
              </span>
            )}
            {/* Live pulse */}
            <span className="flex items-center gap-1.5 text-xs text-violet-200">
              <span className={`w-1.5 h-1.5 rounded-full ${isInitializing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
              {isInitializing ? 'Connecting…' : 'Live'}
            </span>

            {/* Close */}
            <button
              id="bargain-widget-close"
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 transition-colors flex items-center justify-center"
              aria-label="Close chat"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Messages ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-[#16171d]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
              )}
              <div
                className={`
                  max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-[#22232f] text-gray-800 dark:text-gray-200 shadow-sm rounded-bl-sm border border-gray-100 dark:border-[#2e303a]'}
                `}
              >
                {msg.text}

                {/* ── Deal Action Buttons ─────────────────────────────────── */}
                {msg.dealPrice !== undefined && (
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      id={`bargain-accept-deal-${msg.id}`}
                      disabled={dealDispatched}
                      onClick={handleVerifiedAddToCart}
                      className={`
                        w-full py-2 px-3 rounded-xl text-xs font-bold
                        transition-all duration-200 active:scale-95
                        ${dealDispatched
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-md shadow-emerald-500/25 cursor-pointer'}
                      `}
                    >
                      {dealDispatched ? '✓ Deal Sent to Cart!' : `🤝 Accept Deal — ${session ? formatPrice(msg.dealPrice, session.currency) : msg.dealPrice}`}
                    </button>
                    {!dealDispatched && (
                      <button
                        id={`bargain-decline-deal-${msg.id}`}
                        onClick={() => setIsOpen(false)}
                        className="w-full py-1.5 px-3 rounded-xl text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
                      >
                        No Thanks
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator while AI is responding */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="px-4 py-3 bg-white dark:bg-[#22232f] rounded-2xl rounded-bl-sm border border-gray-100 dark:border-[#2e303a] shadow-sm">
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Frozen State Banner ───────────────────────────────────────── */}
        {isFrozen && !isDealAgreed && (
          <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700/40 shrink-0">
            <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-400">
              {offerCount >= MAX_OFFERS
                ? `Maximum ${MAX_OFFERS} offers reached — negotiation closed.`
                : 'Negotiation has concluded.'}
            </p>
          </div>
        )}

        {/* ── Input Area ────────────────────────────────────────────────── */}
        <div className={`px-3 py-3 bg-white dark:bg-[#1a1b26] border-t border-gray-100 dark:border-[#2e303a] shrink-0 transition-opacity duration-300 ${isDealStruck ? 'opacity-50 pointer-events-none' : ''}`}>
          {isFrozen || isDealStruck ? (
            /* Show a disabled / locked state when frozen or deal is struck. */
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
              isDealStruck
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40'
                : 'bg-gray-100 dark:bg-[#22232f] opacity-50'
            }`}>
              <input
                disabled
                type="text"
                placeholder={
                  isDealStruck
                    ? '🤝 Deal locked! Added to cart.'
                    : isDealAgreed
                      ? 'Deal agreed! Use the button above.'
                      : 'Negotiation is closed.'
                }
                className={`flex-1 bg-transparent text-sm placeholder-current outline-none cursor-not-allowed ${
                  isDealStruck
                    ? 'text-emerald-600 dark:text-emerald-400 placeholder-emerald-500 dark:placeholder-emerald-500 font-medium'
                    : 'text-gray-500 dark:text-gray-500 placeholder-gray-400'
                }`}
              />
              {isDealStruck && (
                <span className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#22232f] rounded-xl px-3 py-2 border border-gray-200 dark:border-[#2e303a] focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 transition-all">
              <input
                ref={inputRef}
                id="bargain-widget-input"
                type="text"
                value={inputValue}
                onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
                onKeyDown={handleKeyDown}
                placeholder={isDealStruck ? '🤝 Deal locked! Added to cart.' : isInitializing ? 'Connecting to session…' : 'Enter your offer price…'}
                disabled={isDealStruck || isInitializing || isLoading}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none disabled:cursor-wait"
              />
              <button
                id="bargain-widget-send"
                onClick={handleSend}
                disabled={isDealStruck || !inputValue.trim() || isInitializing || isLoading}
                className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0 active:scale-95"
                aria-label="Send message"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          )}

          <a
            href="https://bargainbaas-frontend.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 mt-2 text-[10px] text-gray-400 dark:text-gray-600 hover:text-violet-400 dark:hover:text-violet-400 transition-colors duration-200 group"
          >
            Powered by{' '}
            <span className="font-semibold text-violet-400 group-hover:underline underline-offset-2">BargainBaaS</span>
          </a>
        </div>
      </div>

      {/* ── Launcher FAB ───────────────────────────────────────────────────── */}
      <button
        id="bargain-widget-launcher"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          fixed bottom-5 right-5 z-[9999]
          w-14 h-14 rounded-full
          bg-gradient-to-br from-violet-600 to-indigo-600
          shadow-[0_8px_32px_rgba(109,40,217,0.5)]
          hover:shadow-[0_8px_40px_rgba(109,40,217,0.7)]
          hover:scale-110
          active:scale-95
          transition-all duration-200 ease-out
          flex items-center justify-center
          text-white
        `}
        aria-label={isOpen ? 'Close chat' : 'Open BargainBaaS chat'}
      >
        {/* Toggle icons — crossfade between chat and X */}
        <span className={`absolute transition-all duration-200 ${isOpen ? 'opacity-100 rotate-0' : 'opacity-0 rotate-90'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <span className={`absolute transition-all duration-200 ${isOpen ? 'opacity-0 -rotate-90' : 'opacity-100 rotate-0'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </span>
      </button>
    </div>
  )
}
