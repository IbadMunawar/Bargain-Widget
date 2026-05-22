import { useState, useRef, useEffect } from 'react'

export interface WidgetConfig {
  tenantId: string
  productId: string
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  isDealLocked?: boolean
}

const INITIAL_MESSAGE: Message = {
  id: 0,
  role: 'assistant',
  text: "👋 Hi there! I'm your AI deal assistant. Ask me anything about this product!",
}

export function ChatWidget({ config }: { config: WidgetConfig }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [addedToCart, setAddedToCart] = useState<Set<number>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text) return

    const userMsg: Message = { id: Date.now(), role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')

    // Simulated assistant reply
    setTimeout(() => {
      const isDeal = text.toLowerCase() === 'accept'
      const reply: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        text: isDeal
          ? 'Great! Deal locked at Rs 250,000. 🎉'
          : "I'm processing your request. This is a demo response — the real AI is on its way! 🚀",
        isDealLocked: isDeal,
      }
      setMessages((prev) => [...prev, reply])
    }, 900)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <>
      {/* ── Chat Panel ── */}
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
        style={{ height: '520px' }}
        role="dialog"
        aria-label="BargainBaaS Chat"
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
              <p className="text-violet-200 text-xs font-medium truncate max-w-[180px]" title={config.productId}>
                {config.productId}
              </p>
            </div>
          </div>

          {/* Live indicator + close */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-violet-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
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

        {/* Messages */}
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
                {msg.isDealLocked && (
                  <button
                    id={`bargain-add-to-cart-${msg.id}`}
                    disabled={addedToCart.has(msg.id)}
                    onClick={() => {
                      window.parent.postMessage(
                        {
                          type: 'BARGAIN_DEAL_LOCKED',
                          payload: {
                            productId: config.productId,
                            negotiatedPrice: 250000,
                          },
                        },
                        '*'
                      )
                      setAddedToCart((prev) => new Set(prev).add(msg.id))
                    }}
                    className={`
                      mt-2.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold
                      transition-all duration-200
                      ${addedToCart.has(msg.id)
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-not-allowed opacity-80'
                        : 'bg-violet-600 hover:bg-violet-700 active:scale-95 text-white cursor-pointer shadow-sm'
                      }
                    `}
                  >
                    {addedToCart.has(msg.id) ? '✓ Added to Cart!' : '🛒 Add to Cart'}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-3 py-3 bg-white dark:bg-[#1a1b26] border-t border-gray-100 dark:border-[#2e303a] shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#22232f] rounded-xl px-3 py-2 border border-gray-200 dark:border-[#2e303a] focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 transition-all">
            <input
              ref={inputRef}
              id="bargain-widget-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message…"
              className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
            />
            <button
              id="bargain-widget-send"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0"
              aria-label="Send message"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-2">
            Powered by <span className="font-semibold text-violet-400">BargainBaaS</span>
          </p>
        </div>
      </div>

      {/* ── Launcher Button ── */}
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
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {/* Toggle icon */}
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
    </>
  )
}
