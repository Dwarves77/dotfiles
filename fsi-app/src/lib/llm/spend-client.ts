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
import { costUsdForModel, SPEND_CEILING_USD } from "@/lib/agent/generation-config";
import { assertTicket, assertBudget, account, takeItemLedger, resetItemLedger, spentUsd } from "@/lib/llm/spend-guard.mjs";

export type SpendTicket = Parameters<typeof assertTicket>[0];
export { STANDING_TICKET_CLASSES } from "@/lib/llm/spend-guard.mjs";
export { resetItemLedger, takeItemLedger, spentUsd };

/** Streamed Messages call THROUGH the chokepoint. Ticket-gated, budget-enforced, telemetered. */
export async function spendStream(
  ticket: NonNullable<SpendTicket>,
  opts: { system: string; user: string; model?: string; maxTokens?: number },
): Promise<{ text: string; stopReason: string | null; usage: { input_tokens: number; output_tokens: number }; cost: number }> {
  assertTicket(ticket);
  assertBudget(ticket, SPEND_CEILING_USD);
  const model = opts.model ?? "claude-sonnet-4-6";
  const { text, stopReason, usage } = await streamMessagesText({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    body: { model, max_tokens: opts.maxTokens ?? 32000, system: opts.system, messages: [{ role: "user", content: opts.user }] },
  });
  const cost = costUsdForModel(model, usage.input_tokens, usage.output_tokens);
  account(cost, usage.input_tokens, usage.output_tokens);
  return { text, stopReason, usage, cost };
}

const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL = "web_search_20250305";
/** Web-search Messages call THROUGH the chokepoint (Anthropic runs the searches). Ticket-gated + budgeted. */
export async function spendSearch(
  ticket: NonNullable<SpendTicket>,
  opts: { system: string; user: string; maxUses?: number; model?: string; maxTokens?: number },
): Promise<string> {
  assertTicket(ticket);
  assertBudget(ticket, SPEND_CEILING_USD);
  const model = opts.model ?? "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "anthropic-beta": WEB_SEARCH_BETA },
    body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 4000, tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: opts.maxUses ?? 6 }], system: opts.system, messages: [{ role: "user", content: opts.user }] }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) throw anthropicError(resp.status, d);
  const usage = (d as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  account(costUsdForModel(model, usage?.input_tokens || 0, usage?.output_tokens || 0), usage?.input_tokens || 0, usage?.output_tokens || 0);
  return ((d.content as Array<{ type: string; text?: string }>) || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** TELEMETRY SINGLE-HOME (4f relocated): write ONE stored-path agent_runs row per item from the item ledger.
 *  fetch_method='stored-pool'; cost_usd_estimated = real spend the MTD tile reads. Called by the stored-path
 *  runner after each item. Best-effort. NO-DDL: token detail rides errors[].telemetry until the DDL window
 *  lands proper columns (known wrong-home, queued). */
export async function logSpendRun(
  itemId: string,
  status: "success" | "error",
  sourceUrl?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  const l = takeItemLedger();
  if (l.calls === 0) return { ok: true, detail: "no spend to log" };
  try {
    const nowIso = new Date().toISOString();
    const { error } = await svc().from("agent_runs").insert({
      intelligence_item_id: itemId, source_url: sourceUrl ?? null, fetch_method: "stored-pool",
      started_at: nowIso, ended_at: nowIso, status,
      cost_usd_estimated: Number(l.costUsd.toFixed(6)),
      errors: [{ telemetry: { inputTokens: l.inputTokens, outputTokens: l.outputTokens, sonnet_calls: l.calls } }],
    });
    if (error) return { ok: false, detail: `agent_runs insert failed: ${error.message}` };
    return { ok: true, detail: `logged $${l.costUsd.toFixed(4)} (${l.inputTokens}in/${l.outputTokens}out, ${l.calls} calls)` };
  } catch (e) { return { ok: false, detail: `agent_runs insert threw: ${(e as Error).message}` }; }
}
