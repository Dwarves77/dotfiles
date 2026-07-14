// SPEND CHOKEPOINT (operator ruling 2026-07-04). The generation-side analog of dedup-before-ground: the
// ONE client every model call in the pipeline routes through. Necessity was never mechanized and generation
// spend had no chokepoint — every new runner started ungated (3rd instance: wave quote, GLEC duplicate,
// proof-batch routing + void full-set quote). The operator asking "did you check the free lever first?" was
// the detection mechanism; that is the defect this closes.
//
// EVERY call requires a SpendTicket (spend-guard.mjs). Ticketless = THROW. A per-item ticket whose failure
// set is fully deterministically-resolvable, OR whose standing disposition is DELETE, = REJECTED. Sanctioned
// always-cheap classifiers (Rule 016) carry a standing ticket class. Budget (per-ticket cap + standing
// ceiling) is enforced INSIDE the guard. Telemetry is single-homed here (the 4f agent_runs write relocates
// in). The pure guard is spend-guard.mjs (node-testable, red-then-green); THIS module wraps it with the
// Anthropic API call, the model→cost mapping, and the DB telemetry write.
//
// F15 (fitness) enforces that no Anthropic API call / client instantiation exists outside THIS module and
// its sanctioned transport (anthropic-stream.mjs), with an A2-pattern shrinking allowlist for not-yet-
// migrated legacy call sites; any NEW ungated call site is F15-RED.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { streamMessagesText } from "@/lib/agent/anthropic-stream.mjs";
import { anthropicError } from "@/lib/agent/anthropic-error.mjs";
import { costUsdForModel, inputUsdPerMtokForModel, SPEND_CEILING_USD } from "@/lib/agent/generation-config";
import { cacheSavingsUsd } from "@/lib/agent/prompt-cache.mjs";
import { assertTicket, assertBudget, assertPricedSpend, account, markCallLogged, takeItemLedger, resetItemLedger, spentUsd, assertLedgerDrained, unloggedCallCount } from "@/lib/llm/spend-guard.mjs";

export type SpendTicket = NonNullable<Parameters<typeof assertTicket>[0]>;
export { STANDING_TICKET_CLASSES } from "@/lib/llm/spend-guard.mjs";
export { resetItemLedger, takeItemLedger, spentUsd, assertLedgerDrained, unloggedCallCount };

// ── MONTHLY-TOTAL FIGURE (INFORMATIONAL ONLY, spend-control refactor 2026-07-13) ────────────────────────
// RETIRED AS A LIMIT. Per the operator's final spend rulings there are NO standing dollar figures used as
// limits: the former hard monthly ceiling no longer gates or halts any paid call. This constant remains ONLY
// so a monthly-total figure can be shown for information; it MUST NOT be used to gate/halt spend. The SOLE
// dollar authorization is the operator-priced line (assertPricedSpend); the master arming gate
// GROUNDING_ACQUIRE_ENABLED stays OFF and is the separate go/no-go.
export const MONTHLY_TOTAL_DISPLAY_USD = 130.00; // informational display only — NEVER a limit.

/** Compose the operator-priced-line authorization for a spend, when the ticket carries one. The priced line
 *  (operator cost + inventory-miss citation) is the sole dollar authorization; it halts the item at the
 *  operator's per-line price. Tickets without a priced line (legacy generation callers) are unaffected here —
 *  the paid-acquire path is separately gated OFF by GROUNDING_ACQUIRE_ENABLED. */
function guardPricedLine(ticket: SpendTicket): void {
  const line = (ticket as { pricedLine?: { operatorCostUsd: number; inventoryMiss: string; toleranceUsd?: number } }).pricedLine;
  if (line) assertPricedSpend(line);
}

// CONTEXT TICKET. The runner sets ONE ticket per item (setSpendTicket) before invoking the pipeline; the
// pipeline's internal call sites (callSonnet / generateBriefText / callSonnetSearch) spend under it without
// threading it through every signature. The default is a permissive LEGACY ticket so existing callers (the
// /api/agent/run route path) keep working unchanged — behavior-preserving — while still being budget-checked
// against the standing ceiling. A runner that wants the necessity gate sets a rich ticket (failureClasses /
// necessity / disposition / budgetCapUsd / authorizationRef).
const LEGACY_TICKET: SpendTicket = { purpose: "canonical-pipeline (legacy, pre-ticket-migration)" };
let currentTicket: SpendTicket = LEGACY_TICKET;
export function setSpendTicket(ticket: SpendTicket): void { currentTicket = ticket; }
export function resetSpendTicket(): void { currentTicket = LEGACY_TICKET; }
export function currentSpendTicket(): SpendTicket { return currentTicket; }

/** LOW-LEVEL streamed call THROUGH the chokepoint, taking the streamMessagesText opts DIRECTLY (the pipeline
 *  builds its own body). Guards the CONTEXT ticket + budget, streams, accounts. Behavior-identical to a bare
 *  streamMessagesText call except for the guard + accounting. */
export async function spendStreamRaw(
  streamOpts: Parameters<typeof streamMessagesText>[0],
): Promise<{ text: string; stopReason: string | null; usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number } }> {
  assertTicket(currentTicket);
  assertBudget(currentTicket, SPEND_CEILING_USD); // unlogged-telemetry invariant + optional per-ticket cap
  guardPricedLine(currentTicket);                 // operator-priced-line authorization (when the ticket carries one)
  const r = await streamMessagesText(streamOpts);
  const model = String(((streamOpts?.body ?? {}) as { model?: string }).model ?? "claude-sonnet-4-6");
  // PROMPT-CACHE (Phase-3a): cache tokens are billed at 1.25× (write) / 0.1× (read) of the input rate;
  // input_tokens excludes the cached prefix when caching is active. Real cost, not the full-rate fiction.
  const cacheWrite = r.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = r.usage.cache_read_input_tokens ?? 0;
  const cost = costUsdForModel(model, r.usage.input_tokens, r.usage.output_tokens, cacheWrite, cacheRead);
  account(cost, r.usage.input_tokens, r.usage.output_tokens);
  await recordSpendCall(model, r.usage.input_tokens, r.usage.output_tokens, cost, currentTicket, cacheWrite, cacheRead);
  return r;
}

/** Streamed Messages call THROUGH the chokepoint. Ticket-gated, budget-enforced, telemetered. */
export async function spendStream(
  opts: { system: string; user: string; model?: string; maxTokens?: number },
  ticket: SpendTicket = currentTicket,
): Promise<{ text: string; stopReason: string | null; usage: { input_tokens: number; output_tokens: number }; cost: number }> {
  assertTicket(ticket);
  assertBudget(ticket, SPEND_CEILING_USD); // unlogged-telemetry invariant + optional per-ticket cap
  guardPricedLine(ticket);                 // operator-priced-line authorization (when the ticket carries one)
  const model = opts.model ?? "claude-sonnet-4-6";
  const { text, stopReason, usage } = await streamMessagesText({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    body: { model, max_tokens: opts.maxTokens ?? 32000, system: opts.system, messages: [{ role: "user", content: opts.user }] },
  });
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cost = costUsdForModel(model, usage.input_tokens, usage.output_tokens, cacheWrite, cacheRead);
  account(cost, usage.input_tokens, usage.output_tokens);
  await recordSpendCall(model, usage.input_tokens, usage.output_tokens, cost, ticket, cacheWrite, cacheRead);
  return { text, stopReason, usage, cost };
}

const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL = "web_search_20250305";
/** Web-search Messages call THROUGH the chokepoint (Anthropic runs the searches). Ticket-gated + budgeted. */
export async function spendSearch(
  opts: { system: string; user: string; maxUses?: number; model?: string; maxTokens?: number },
  ticket: SpendTicket = currentTicket,
): Promise<string> {
  assertTicket(ticket);
  assertBudget(ticket, SPEND_CEILING_USD); // unlogged-telemetry invariant + optional per-ticket cap
  guardPricedLine(ticket);                 // operator-priced-line authorization (when the ticket carries one)
  const model = opts.model ?? "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "anthropic-beta": WEB_SEARCH_BETA },
    body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 4000, tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: opts.maxUses ?? 6 }], system: opts.system, messages: [{ role: "user", content: opts.user }] }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) throw anthropicError(resp.status, d);
  const usage = (d as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const sCost = costUsdForModel(model, usage?.input_tokens || 0, usage?.output_tokens || 0);
  account(sCost, usage?.input_tokens || 0, usage?.output_tokens || 0);
  await recordSpendCall(model, usage?.input_tokens || 0, usage?.output_tokens || 0, sCost, ticket);
  return ((d.content as Array<{ type: string; text?: string }>) || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** AUTOMATIC PER-CALL TELEMETRY (dispatch item 1, 2026-07-06). Writes ONE agent_runs row for THIS spend call
 *  and marks it logged in the guard. Called INSIDE every spend function right after account() — telemetry is
 *  client-internal, never caller-remembered. On a write failure it does NOT markCallLogged(), so the guard's
 *  unloggedCalls stays > 0 and the NEXT assertBudget throws (unlogged spend is mechanically impossible). */
async function recordSpendCall(model: string, inputTokens: number, outputTokens: number, cost: number, ticket: SpendTicket, cacheWriteTokens = 0, cacheReadTokens = 0): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    // PROMPT-CACHE savings telemetry (Phase-3a): what these cache reads saved vs full input rate —
    // the number the block-close savings report sums. Rides errors[].telemetry (no DDL).
    const cacheSavedUsd = Number(cacheSavingsUsd(cacheReadTokens, inputUsdPerMtokForModel(model)).toFixed(6));
    // I1 (attribution): write BOTH intelligence_item_id and source_id from the ticket. A paid row that is both
    // item- AND source-anonymous is the $65.36 July hole — surface it loudly (the ticket should carry at least
    // one). Enforcement of "no such row" is the I1 data-invariant audit; here we make the columns writable +
    // warn so a mis-ticketed paid caller is not silent.
    if (cost > 0 && ticket.itemId == null && ticket.sourceId == null) {
      console.warn(`[spend] I1 ATTRIBUTION GAP: paid $${cost.toFixed(4)} call on ticket "${ticket.purpose}" carries neither itemId nor sourceId — the agent_runs row will be attribution-blind. Set one on the SpendTicket.`);
    }
    // PRECONDITION-POSTURE ALARM (no-execution-from-stale-state, amendment 1): a paid FETCH call whose ticket
    // did not record the live-state precondition it passed is doctrine-blind spend — the new spend-watch alarm
    // class (same severity as an attribution gap). Fetch = the generate purpose; the ground/section purposes
    // re-verify their own preconditions (acquire lock, stored pool) elsewhere and are not fetch-seam callers.
    if (cost > 0 && /canonical:(generate|refresh-primary)/.test(String(ticket.purpose)) && ticket.precondition == null) {
      console.warn(`[spend] PRECONDITION GAP: paid $${cost.toFixed(4)} FETCH call on ticket "${ticket.purpose}" recorded NO precondition posture — authorized-but-possibly-wasteful spend is doctrine-blind. Set ticket.precondition (holdings-absence check).`);
    }
    const { error } = await svc().from("agent_runs").insert({
      intelligence_item_id: ticket.itemId ?? null, source_id: ticket.sourceId ?? null, source_url: null, fetch_method: "spend-call",
      started_at: nowIso, ended_at: nowIso, status: "success",
      cost_usd_estimated: Number(cost.toFixed(6)),
      errors: [{ telemetry: { model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, cacheSavedUsd, purpose: ticket.purpose, authorizationRef: ticket.authorizationRef ?? null, precondition: ticket.precondition ?? null } }],
    });
    if (error) { console.warn(`[spend] per-call ledger write FAILED (${error.message}) — call stays UNLOGGED; next spend will be refused.`); return; }
    markCallLogged();
  } catch (e) { console.warn(`[spend] per-call ledger write threw (${(e as Error).message}) — call stays UNLOGGED.`); }
}

/** TELEMETRY SINGLE-HOME (4f relocated): write ONE stored-path agent_runs row per item from the item ledger.
 *  fetch_method='stored-pool'; cost_usd_estimated = real spend the MTD tile reads. Called by the stored-path
 *  runner after each item. Best-effort. NO-DDL: token detail rides errors[].telemetry until the DDL window
 *  lands proper columns (known wrong-home, queued). */
export async function logSpendRun(
  _itemId: string,
  _status: "success" | "error",
  _sourceUrl?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  // RETIRED (dispatch item 1, 2026-07-06): telemetry is now written PER CALL inside recordSpendCall (client-
  // internal, mechanically un-skippable). Writing an aggregate row here too would DOUBLE-COUNT. This is kept as
  // a no-op that only drains the per-item ledger, so existing callers (funded-pass, proof-sample) keep working.
  const l = takeItemLedger();
  resetItemLedger();
  return { ok: true, detail: `per-call telemetry is automatic; item ledger drained ($${l.costUsd.toFixed(4)}, ${l.calls} calls)` };
}
