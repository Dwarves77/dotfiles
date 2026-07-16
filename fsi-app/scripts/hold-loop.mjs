/** hold-loop.mjs — Phase E, E3 increment 3: the hold-resolution loop (the drain).
 *  hold-resolution-under-standing-bound (RD-43): the loop drains hold_resolution_queue under a STANDING
 *  operator-priced bound; the machine never proposes the number. It is a funded-pass caller — takes the
 *  run-lock (RD-38, no concurrent driver), polls emergencyPaused (flag-flip stop, never a kill), gates every
 *  item on authoritativeCumulative >= bound (hard ceiling), one paid pass per entity per mechanism, holdings-
 *  gate (re-ground from stored pool first, no fetch), no-gain tripwire, dominance guard (RD-36, re-grounds
 *  never destroy). Ladder per held item: re-ground from the held pool -> re-validate -> EXIT on a
 *  floor-clearing re-ground; else recordAttempt('reground','failed') which auto-escalates on the 2nd same-
 *  mechanism failure (cycle safety). A re-ground that lands in a NEW hold records the finding, never cycles.
 *
 *  DRY default (lock OFF, no pipeline call, $0): lists the queue + would-run. --apply arms the run-scoped lock
 *  and SPENDS up to --bound. --bound=<usd> is REQUIRED for --apply (no standing default; the operator prices it).
 *  Usage: node scripts/hold-loop.mjs [--apply --bound=100] [--limit=N]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
import { hostname } from "node:os";
import { withArmedLock, authoritativeCumulative, totalBoundHalt, isRunaway } from "./lib/funded-pass-core.mjs";
import { acquireRunLock, heartbeatRunLock, releaseRunLock, emergencyPaused, HEARTBEAT_MIN_MS } from "./lib/funded-pass-lock.mjs";
import { listActive, recordAttempt, exit as hrqExit, escalate as hrqEscalate } from "./lib/hold-queue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const BOUND = (() => { const a = process.argv.find((x) => x.startsWith("--bound=")); return a ? Number(a.slice(8)) : null; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const CALLER = "hold-loop";
const ITEM_TIMEOUT_MS = 1_200_000;

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { buildResolver } = await jiti.import("../src/lib/sources/institution.ts");
const { authorityFloorFor } = await jiti.import("../src/lib/agent/source-blocks.mjs");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── CHECK-EXISTING PRE-GATE (retrieval-before-spend, mechanized): NO paid re-ground fires until the item
// proves it (a) is not a duplicate of a verified item, (b) is not resolvable at $0 (correct source already
// registered), AND (c) has the RESOLUTION DATA in its own pool (a floor-qualifying source). Otherwise the
// paid pass is BLOCKED and the hold is escalated or re-stamped at $0. This is the gate that was missing.
async function readAllSources() {
  const all = []; for (let from = 0; ; from += 1000) { const { data } = await sb.from("sources").select("id, url, base_tier, tier_override, status").order("id").range(from, from + 999); if (!data?.length) break; all.push(...data); if (data.length < 1000) break; } return all;
}
const RESOLVER = buildResolver(await readAllSources());
async function poolHasFloorSource(itemId, itemFloor) {
  if (itemFloor == null) return true; // floor-exempt types: the floor gate does not apply
  const { data: pool } = await sb.from("agent_run_searches").select("result_url").eq("intelligence_item_id", itemId);
  for (const p of pool || []) { const r = RESOLVER.resolveSpan(p.result_url || ""); if (r.tier != null && r.tier <= itemFloor) return true; }
  return false;
}
/** Verdict BEFORE any spend. { verdict: 'free_restamp'|'reground'|'escalate', reason } */
async function checkExisting(id, holdClass) {
  const { data: it } = await sb.from("intelligence_items").select("item_type, source_url, source_id, canonical_instrument_key").eq("id", id).single();
  // (a) duplicate of an already-verified item -> do not re-ground; escalate for dedup
  if (it?.canonical_instrument_key) {
    const { data: dup } = await sb.from("intelligence_items").select("id").eq("canonical_instrument_key", it.canonical_instrument_key).eq("provenance_status", "verified").eq("is_archived", false).neq("id", id).limit(1);
    if (dup?.length) return { verdict: "escalate", reason: `duplicate of verified item ${dup[0].id} (dedup, do not re-ground)` };
  }
  // (b) resolvable at $0: item source_id points to a non-active source but a correct ACTIVE source is already
  // registered -> a $0 re-point resolves it, NOT a paid re-ground (the EU 2023/959 pattern). Surface it; the
  // loop never spends on this class.
  if (it?.source_id) {
    const { data: cur } = await sb.from("sources").select("status").eq("id", it.source_id).single();
    if (cur && cur.status !== "active" && it.source_url) {
      const active = (await readAllSources()).find((s) => s.status === "active" && canon(s.url) === canon(it.source_url));
      if (active) return { verdict: "escalate", reason: `resolvable at $0: re-point to already-registered source ${active.id} (guarded re-point, no re-ground)` };
    }
  }
  // (c) resolution data present? a paid re-ground can only help a floor hold if a floor-qualifying source is in the pool
  const itemFloor = authorityFloorFor(it?.item_type);
  if (holdClass === "floor" && !(await poolHasFloorSource(id, itemFloor)))
    return { verdict: "escalate", reason: "no floor-qualifying source in the pool; seek rung (fetch) blocked by scrape-hold — needs a registered source, not a paid re-ground" };
  return { verdict: "reground", reason: "resolution data present in pool (or non-floor class)" };
}
function canon(u) { return String(u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/.,;:]+$/, ""); }
const nowIso = () => new Date().toISOString();
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`item timeout ${ms}ms (${label})`)), ms))]);

async function cumulativeSince(sinceIso) {
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated").gte("started_at", sinceIso);
  return authoritativeCumulative(data || []);
}
async function validItem(id) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(data) ? data[0] : data;
  return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] };
}
async function factCount(id) {
  const { count } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id).eq("claim_kind", "FACT");
  return count || 0;
}

// ── re-ground one held item (holdings-gate: stored-first; a genuine no-pool falls to a fetch which the scrape
// hold blocks, surfacing as a failed attempt -> escalation, never a silent skip) ──
async function reground(itemId) {
  let gen = await P.generateBriefFromStored(itemId);
  if (!gen.ok && /no usable stored pool/i.test(gen.detail || "")) return { ok: false, detail: `no stored pool (seek/fetch needed; scrape-hold): ${gen.detail}` };
  if (!gen.ok) return { ok: false, detail: `generate: ${gen.detail}` };
  const sec = await P.sectionBrief(itemId); if (!sec.ok) return { ok: false, detail: `section: ${sec.detail}` };
  const gr = await P.groundBrief(itemId, CALLER); if (!gr.ok) return { ok: false, detail: `ground: ${gr.detail}` };
  await P.growSources(itemId).catch(() => {});
  return { ok: true };
}

async function main() {
  const rows = (await listActive(sb, { limit: 500 })).filter((r) => r.entity_type === "item").slice(0, LIMIT);
  console.log(`\n=== HOLD-LOOP (${APPLY ? "APPLY — LOCK ARMED, SPEND" : "DRY — $0"}) === ${rows.length} active item-hold(s), bound=${BOUND != null ? `$${BOUND}` : "none"}`);
  if (!APPLY) {
    // $0: run the check-existing pre-gate over every held item and report the verdict split. This proves what
    // the loop WOULD spend on (only 'reground' verdicts) vs escalate free — with no spend.
    const tally = { reground: 0, escalate: 0 };
    for (const r of rows) {
      const ce = await checkExisting(r.entity_ref, r.hold_class);
      tally[ce.verdict === "reground" ? "reground" : "escalate"] += 1;
      console.log(`  [${r.hold_class}] ${String(r.entity_ref).slice(0, 8)} -> ${ce.verdict === "reground" ? "RE-GROUND (pool has resolution data)" : `ESCALATE $0 (${ce.reason.slice(0, 64)})`}`);
    }
    console.log(`\n(dry, $0) check-existing verdict: RE-GROUND(paid)=${tally.reground}  ESCALATE($0)=${tally.escalate} of ${rows.length}`);
    console.log(`the paid drain would spend ONLY on the ${tally.reground} items whose resolution data is already in-pool. --apply --bound=<usd> to run.`);
    return;
  }
  if (BOUND == null || !(BOUND > 0)) { console.error("REFUSED: --apply requires an operator --bound=<usd> (the standing resolution bound). No default."); process.exit(5); }

  const PID = process.pid;
  const lock = await acquireRunLock(sb, { pid: PID, label: CALLER, host: hostname(), worklistRef: `hold-loop:${rows.length}:$${BOUND}` });
  if (!lock.ok) { console.error(`REFUSED (run-lock): held by pid=${lock.holderPid} label="${lock.holderLabel}". Exiting ZERO spend.`); process.exit(6); }
  console.log(`run-lock ACQUIRED pid=${PID}. Between-item heartbeat + emergencyPaused poll active. bound=$${BOUND}.`);
  const runStart = nowIso();
  let exited = 0, escalated = 0, held = 0, noGain = 0, runHalt = null, lastHb = Date.now();
  const NO_GAIN_HALT = 5;
  try {
    await withArmedLock(process.env, async () => {
      for (const row of rows) {
        if (await emergencyPaused(sb)) { runHalt = "operator emergency pause — halting gracefully"; break; }
        if (Date.now() - lastHb >= HEARTBEAT_MIN_MS) { const ok = await heartbeatRunLock(sb, { pid: PID }); lastHb = Date.now(); if (!ok) { runHalt = "run-lock lost (takeover) — halting"; break; } }
        const spent = await cumulativeSince(runStart);
        const bh = totalBoundHalt(spent, BOUND); if (bh) { runHalt = bh; break; }
        const id = row.entity_ref;
        // CHECK-EXISTING pre-gate (retrieval-before-spend, mechanized): the loop NEVER spends until the item
        // proves it is NOT a duplicate, NOT resolvable at $0, and HAS the resolution data in its pool.
        // Otherwise the paid pass is BLOCKED and the hold escalated at $0. This is the gate that was missing.
        const ce = await checkExisting(id, row.hold_class);
        if (ce.verdict !== "reground") {
          await hrqEscalate(sb, row.id, ce.reason);
          escalated += 1;
          console.log(`\n[${row.hold_class}] ${String(id).slice(0, 8)} ESCALATE ($0, no spend): ${ce.reason}`);
          continue;
        }
        process.stdout.write(`\n[${row.hold_class}] ${String(id).slice(0, 8)} [$${spent.toFixed(2)}/${BOUND}] reground ... `);
        const before = await factCount(id);
        let r;
        try { r = await withTimeout(reground(id), ITEM_TIMEOUT_MS, id); }
        catch (e) { r = { ok: false, detail: `wall: ${String(e?.message || e).slice(0, 120)}` }; }
        const after = await factCount(id);
        const v = await validItem(id);
        const spentAfter = await cumulativeSince(runStart);
        const gain = v.valid || after > before;
        if (v.valid) { await hrqExit(sb, row.id, "floor-clearing re-ground"); exited += 1; console.log(`EXIT (verified) facts ${before}->${after} spent=$${spentAfter.toFixed(2)}`); }
        else {
          const outcome = await recordAttempt(sb, row.id, "reground", "failed");
          if (outcome === "escalated") { escalated += 1; console.log(`ESCALATED (2nd reground failure) — reasons: ${v.reasons.slice(0, 3).join(",")}`); }
          else { held += 1; console.log(`HELD reasons: ${v.reasons.slice(0, 3).join(",")} (${r.ok ? "re-ground ok but still sub-criteria" : r.detail.slice(0, 60)})`); }
        }
        if (isRunaway(spentAfter - spent)) console.log(`  (runaway single-item cost)`);
        if (!gain) noGain += 1; else noGain = 0;
        if (noGain >= NO_GAIN_HALT) { runHalt = `no-gain tripwire: ${noGain} consecutive holds without gain`; break; }
      }
    });
  } finally {
    const rel = await releaseRunLock(sb, { pid: PID });
    console.log(`\nrun-lock ${rel ? "RELEASED" : "release skipped"}. acquire off=${process.env.GROUNDING_ACQUIRE_ENABLED !== "1"}`);
  }
  const total = await cumulativeSince(runStart);
  console.log(`\n=== DRAIN SUMMARY: exited(verified)=${exited} escalated=${escalated} held=${held} | spend=$${total.toFixed(4)}/${BOUND}${runHalt ? ` | HALTED: ${runHalt}` : ""} ===`);
  process.exit(runHalt ? 3 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
