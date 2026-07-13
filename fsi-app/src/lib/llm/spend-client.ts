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
import { assertTicket, assertBudget, account, markCallLogged, takeItemLedger, resetItemLedger, spentUsd, assertLedgerDrained, unloggedCallCount, assertMonthlyCeiling, MonthlyCeilingError } from "@/lib/llm/spend-guard.mjs";

export type SpendTicket = NonNullable<Parameters<typeof assertTicket>[0]>;
export { STANDING_TICKET_CLASSES } from "@/lib/llm/spend-guard.mjs";
export { resetItemLedger, takeItemLedger, spentUsd, assertLedgerDrained, unloggedCallCount };
export { MonthlyCeilingError } from "@/lib/llm/spend-guard.mjs";

// ── FIRST HARD MONTHLY SPEND CEILING (operator-set 2026-07-11) ──────────────────────────────────────────
// A code-level cap on TOTAL ledgered Anthropic spend per CALENDAR MONTH (UTC), across every ticket + every
// caller. Enforced before EVERY paid call (including sanctioned classifiers — a classifier call is still
// paid). This is P1-adjacent belt-and-suspenders over the per-process SPEND_CEILING + the daily preflight
// cap: those are per-process / per-day and reset; this bounds the MONTH. Deliberately NOT env-driven —
// overridable ONLY by editing this constant, so no deploy-env tweak (or a leaked env) can silently lift it.
export const MONTHLY_SPEND_CEILING_USD = 75.00;

/** Sum this calendar month's ledgered spend from agent_runs.cost_usd_estimated (the SAME ledger the daily
 *  preflight cap + the MTD tile read), then enforce the monthly ceiling. FAIL-CLOSED: if the ledger cannot
 *  be read we cannot prove we are under the cap, so we THROW rather than let a paid call proceed blind. */
async function guardMonthlyCeiling(): Promise<void> {
  const now = new Date();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await svc().from("agent_runs").select("cost_usd_estimated").gte("started_at", monthStartIso);
  if (error) {
    throw new MonthlyCeilingError(Number.POSITIVE_INFINITY, MONTHLY_SPEND_CEILING_USD);
  }
  const monthSpent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd_estimated || 0), 0);
  assertMonthlyCeiling(monthSpent, MONTHLY_SPEND_CEILING_USD);
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
  assertBudget(currentTicket, SPEND_CEILING_USD);
  await guardMonthlyCeiling(); // hard monthly ceiling (before the paid call)
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
  assertBudget(ticket, SPEND_CEILING_USD);
  await guardMonthlyCeiling(); // hard monthly ceiling (before the paid call)
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
  assertBudget(ticket, SPEND_CEILING_USD);
  await guardMonthlyCeiling(); // hard monthly ceiling (before the paid call)
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
    const { error } = await svc().from("agent_runs").insert({
      intelligence_item_id: ticket.itemId ?? null, source_id: ticket.sourceId ?? null, source_url: null, fetch_method: "spend-call",
      started_at: nowIso, ended_at: nowIso, status: "success",
      cost_usd_estimated: Number(cost.toFixed(6)),
      errors: [{ telemetry: { model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, cacheSavedUsd, purpose: ticket.purpose, authorizationRef: ticket.authorizationRef ?? null } }],
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
