# Integration Changelog — BargainBaaS Widget

This file records all architectural and integration-layer modifications to the widget codebase,
ordered chronologically by timestamp.

---

## 2026-05-27 — Orchestrator Naming-Convention Hot-Fix

**Affected file:** `src/components/ChatWidget.tsx`  
**Author:** Automated hot-fix (Antigravity)  
**Scope:** Backend ↔ Frontend contract alignment + "Accept Deal" button visibility fix

### Background

The live AI orchestrator (`orchestrator-dmf8.onrender.com`) was dispatching price data under the
field name `final_price` and a deal-completion status of `"deal_accepted"`, while the widget's
type contract and parsing logic only handled `agreed_price` / `"deal_locked"`. This caused:

1. The negotiated price to never be stored in `finalPrice` state.
2. `isDealAgreed` to evaluate to `false`, preventing the "Accept Deal" button from rendering.

### Changes Applied

#### 1. `interface AiFrame` — Schema Widened

| Property | Before | After |
|---|---|---|
| `negotiation_status` | `'open' \| 'take_it_or_leave_it' \| 'locked' \| 'deal_locked'` | `string` (open-ended to absorb all future orchestrator states) |
| `agreed_price` | `number \| undefined` | unchanged — kept as backward-compat fallback |
| `final_price` | *(absent)* | `number \| undefined` — **ADDED** (actual field sent by orchestrator) |
| `deal_accepted` | *(absent)* | `boolean \| undefined` — **ADDED** (explicit status-mapping flag) |

#### 2. `handleSend()` — Unified Price Resolver

Replaced the strict `undefined`/`null` double-check on `agreed_price` with a nullish-coalescing
chain that gracefully handles both field names:

```ts
// Before
if (frame.agreed_price !== undefined && frame.agreed_price !== null) {
  setFinalPrice(frame.agreed_price)
}
appendAssistantMessage(frame.response, frame.agreed_price)

// After
const resolvedPrice = frame.agreed_price ?? frame.final_price ?? null
if (resolvedPrice !== null) {
  setFinalPrice(resolvedPrice)
}
appendAssistantMessage(frame.response, resolvedPrice ?? undefined)
```

`resolvedPrice` is now passed to `appendAssistantMessage`, so `msg.dealPrice` is always populated
whenever a price exists — directly fixing the button-visibility gate (`msg.dealPrice !== undefined`).

#### 3. `isDealAgreed` — State Evaluator Widened

```ts
// Before
const isDealAgreed = negotiationStatus === 'deal_locked' && finalPrice !== null

// After
const isDealAgreed =
  (negotiationStatus === 'deal_locked' || negotiationStatus === 'deal_accepted')
  && finalPrice !== null
```

#### 4. `TERMINAL_STATUSES` — Freeze List Extended

`'deal_accepted'` added to the terminal-status list so the input field and send button freeze
correctly when the orchestrator pushes that status, consistent with the widened `isDealAgreed`
evaluator.

### Backward Compatibility

- `agreed_price` field handling is preserved via the leading position in the `??` chain.
- `negotiation_status: 'deal_locked'` still triggers `isDealAgreed` — no regression for existing
  orchestrator deployments that have not yet migrated to the new field names.

### Risk Assessment

| Area | Risk | Mitigation |
|---|---|---|
| Price resolution | Low — `??` chain is non-destructive | Both field names resolve to the same `setFinalPrice` call |
| Type safety | Low — `string` broadens the union, never narrows it | TERMINAL_STATUSES retains all original values |
| UX regression | None | Existing `deal_locked` path unchanged |
