/** STAGE C — Phase 2 flagship RE-GROUND (per docs/PHASE2-FLAGSHIP-REGROUND-RUNBOOK.md).
 *  Re-anchors the 30 flipped flagship regs (quarantined: secondary-sourced) to their PRIMARY source so
 *  their FACT spans stamp T1/T2 (canonical resolver) and the reg-only floor passes.
 *
 *  Per item (IDEMPOTENT + CHECKPOINT-RESUMABLE — state lives in the DB, never in session memory):
 *    0. SKIP if already verified, or already dispositioned (an open integrity_flag created_by
 *       'phase2_priority_review' / 'phase2_analysis_relabel' = honest exit already recorded).
 *    1. Fetch the PRIMARY (curated override, else item.source_url) via Browserless; register it
 *       (canonical tier — mostly already registered by Phase 0'); upsert into agent_run_searches as a pool
 *       row so the FACT span corpus includes the primary.
 *    2. RE-GROUND (groundBrief): the existing prose's FACTs re-anchor to the primary where they appear
 *       verbatim; stamps = primary's canonical institutional tier via the SINGLE resolver. (B3 tiered.)
 *    3. If still not verified -> RE-SYNTHESISE from the augmented stored pool (generateBriefFromStored,
 *       which now quotes the primary) -> section -> ground.
 *    4. If still not verified -> HONEST EXIT (never a forced span): record an integrity_flag
 *       'phase2_priority_review' with the residual validate() failures. The LANGUAGE RULE lands here for
 *       non-EN items whose only registered source is secondary — they exit to priority review, not a
 *       cross-language span.
 *  GOVERNING: analysis-construction-spec + source-credibility-model + remediation-discipline.
 *  DRY-RUN default; --apply; --only=id1,id2; --limit=N. */
import "./lib/net-agent.mjs"; // bounded-pool undici dispatcher (must load before any fetch) — network resilience
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force"); // re-process even already-dispositioned items (confirmation runs)
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored, sectionBrief, groundBrief, fetchPrimaryDeep } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { buildResolver } = await jiti.import("../src/lib/sources/institution.ts");

// the 30 flip items, class-tagged, with a curated PRIMARY override where source_url is a portal/secondary.
// null override => use item.source_url. For items whose ONLY primary is non-EN, the honest outcome is
// priority review (language rule) — they are tagged class "non-EN".
const FLIP = {
  // EU / EUR-Lex
  "eu_ets_directive_2023_959": { cls: "EU", primary: null },
  "eu_clean_trucking_2024_1610": { cls: "EU", primary: null },
  "7a0ead55": { cls: "EU", primary: null },
  "5cc10a6d": { cls: "EU", primary: null },
  "e2e03e1b": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0952" },
  "eu-emissions-trading-system-ets-extension-to-maritime-transport": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02003L0087-20240301" },
  "eu-corporate-sustainability-reporting-directive-csrd-transport-provisions": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2464" },
  "eu-corporate-sustainability-reporting-directive-csrd-transport-sector-implementa": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2464" },
  "3ae89ce6": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242" },
  "d5ee6ab8": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0851" },
  "o6": { cls: "EU", primary: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R0757" },
  // IMO
  "93c344a1": { cls: "IMO", primary: null },
  // US state / city
  "d56ca4e1": { cls: "US", primary: null }, "89656109": { cls: "US", primary: null },
  "0ea6a710": { cls: "US", primary: null }, "cd5c84e3": { cls: "US", primary: null },
  "de2df788": { cls: "US", primary: null }, "bec305e1": { cls: "US", primary: null },
  // UK statutory instruments
  "a4": { cls: "UK", primary: null }, "782878c0": { cls: "UK", primary: null }, "d935e112": { cls: "UK", primary: "https://www.legislation.gov.uk/uksi/2015/962/contents/made" },
  // non-EN (language rule — honest exit expected where no EN primary)
  "27dfbe4c": { cls: "non-EN", primary: null }, "6a857887": { cls: "non-EN", primary: null },
  "ad4cc6c6": { cls: "non-EN", primary: null }, "japan-green-transformation-gx-freight-transport-standards": { cls: "non-EN", primary: null },
  "japan-s-updated-top-runner-program-for-heavy-duty-vehicles": { cls: "non-EN", primary: null },
  "india-s-national-logistics-policy-carbon-intensity-standards": { cls: "non-EN", primary: null },
  "03b5f234": { cls: "non-EN", primary: null }, "82f09535": { cls: "non-EN", primary: null },
  "g19": { cls: "non-EN", primary: null },
};

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,source_url,provenance_status", { match: (q) => q.eq("is_archived", false) });
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
let targets = Object.entries(FLIP).map(([k, m]) => ({ it: byKey.get(k), ...m, key: k })).filter((t) => t.it);
if (ONLY) targets = targets.filter((t) => ONLY.includes(t.key) || ONLY.includes(t.it.legacy_id) || ONLY.includes(t.it.id.slice(0, 8)));
targets = targets.slice(0, LIMIT);

// batch resilience (remediation-discipline Ex.1): the API calls (Browserless + Anthropic) intermittently
// throw `TypeError: fetch failed` from this environment (transient sandbox outbound-network instability).
// WRITE-SAFETY (operator correction 2026-06-13): `fetch failed` can throw AFTER the server applied a write
// (dropped response), so retrying a NON-idempotent write double-applies. This wrapper is therefore scoped
// ONLY to operations that are idempotent-on-retry: browserlessFetch (read), and the pipeline steps that are
// DELETE-FIRST (groundBrief / sectionBrief clear the item's claims/sections before re-inserting) or a plain
// UPDATE (generateBriefFromStored overwrites full_brief) — so a retry re-derives the same state, never a
// duplicate. The ONE non-idempotent write here (the priority-review integrity_flags INSERT) is deliberately
// NOT wrapped (it throws to the per-item catch; the alreadyDispositioned() guard prevents re-insert on a
// resumed run). State-mutating writes that are NOT idempotent must use pg-direct/guarded paths, not this.
const isTransient = (e) => /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|EAI_AGAIN|UND_ERR|503|429/i.test(e?.message || "") || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(e?.cause?.code || e?.cause?.message || "");
// heavier budget to outlast the sandbox's transient failure WINDOWS (some last >60s): exponential
// backoff capped at 30s, up to 7 attempts (~2+4+8+16+30+30 ≈ 90s total). Idempotent steps only (see header).
// timeout-race: the sandbox network fails TWO ways — transient `fetch failed` (errors, retryable) AND
// silent HANGS (connected, no response, no error). A bare retry can't catch a hang. Race each call against
// a hard timeout so a hung call becomes a (retryable) error -> the pass FAILS FAST per item instead of
// hanging the whole run; the idempotent/resumable runner then picks the item up on a later pass.
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label} (${ms}ms) — fetch failed (hang)`)), ms))]);
async function withRetry(fn, label, max = 5, perCallMs = 120000) {
  for (let i = 1; ; i++) {
    try { return await withTimeout(fn(), perCallMs, label); }
    catch (e) { if (i >= max || !isTransient(e)) throw e; const wait = Math.min(20000, 1000 * 2 ** i); console.error(`  …retry ${label} ${i}/${max} after ${wait}ms (${(e?.cause?.code || e?.message || "").slice(0,40)})`); await new Promise((r) => setTimeout(r, wait)); }
  }
}
const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;
async function factTiers(id) {
  const cl = await readAll("section_claim_provenance", "claim_kind,source_tier_at_grounding", { match: (q) => q.eq("intelligence_item_id", id).eq("claim_kind", "FACT") });
  const h = {}; for (const c of cl) h[c.source_tier_at_grounding ?? "null"] = (h[c.source_tier_at_grounding ?? "null"] || 0) + 1; return h;
}
async function alreadyDispositioned(id) {
  const { data } = await sb.from("integrity_flags").select("id").eq("subject_ref", id).eq("status", "open").in("created_by", ["phase2_priority_review", "phase2_analysis_relabel"]).limit(1);
  return data?.length > 0;
}

console.log(`\n===== PHASE 2 RE-GROUND (${APPLY ? "APPLY" : "DRY-RUN"}) — ${targets.length} item(s) =====`);
if (!APPLY) { for (const t of targets) console.log(`  [${t.cls.padEnd(6)}] ${(t.it.legacy_id || t.it.id.slice(0, 8)).padEnd(20)} primary=${(t.primary || t.it.source_url || "").slice(0, 56)}`); console.log("\nDRY-RUN — pass --apply."); process.exit(0); }

let fallbackFired = 0;
const summary = { verified: 0, counsel: 0, errors: 0 };
for (const t of targets) {
  const id = t.it.id, key = t.it.legacy_id || t.it.id.slice(0, 8);
  // 0. idempotent skip
  if (t.it.provenance_status === "verified") { console.log(`  [${t.cls.padEnd(6)}] ${key.padEnd(20)} VERIFIED(skip)`); continue; }
  if (!FORCE && await alreadyDispositioned(id)) { console.log(`  [${t.cls.padEnd(6)}] ${key.padEnd(20)} priority-review(skip, already dispositioned)`); continue; }
  const declaredPrimary = t.primary || t.it.source_url;
  try {
    // 1. fetch primary WITH the roadblock→official-alternative fallback (bounded — 20s/fetch, ≤3 alts;
    //    never the 120s×5 hang that burned 10 min on commerce.gov.in). DISCOVERY ONLY: the resolver +
    //    per-type floor still qualify whatever it returns, so a sub-floor alternative can't ground a reg.
    let pf = { ok: false, text: "", url: declaredPrimary, fellBack: false, primaryReason: "fallback_error", langRatio: 0, alternatives: [] };
    try { pf = await fetchPrimaryDeep({ title: t.it.title, primaryUrl: declaredPrimary, itemType: t.it.item_type }); } catch { /* fallback itself failed -> honest exit below */ }
    if (pf.fellBack) fallbackFired++;
    const text = pf.ok ? pf.text : "";
    const usedUrl = pf.url;
    if (text.length > 200) {
      const { data: ex } = await sb.from("agent_run_searches").select("id").eq("intelligence_item_id", id).eq("result_url", usedUrl).limit(1);
      if (ex?.length) await sb.from("agent_run_searches").update({ result_content_excerpt: text, search_query: "phase2:primary" }).eq("id", ex[0].id);
      else await sb.from("agent_run_searches").insert({ intelligence_item_id: id, search_query: "phase2:primary", result_url: usedUrl, result_title: "phase2 primary source", result_index: 0, result_content_excerpt: text, searched_at: new Date().toISOString() });
    }
    // 2. re-ground (tiered, retried on transient network errors)
    await withRetry(() => groundBrief(id), "ground");
    let status = await prov(id);
    // 3. re-synthesise from the augmented pool if re-ground didn't verify
    if (status !== "verified") { const g = await withRetry(() => generateBriefFromStored(id), "regen-stored"); if (g.ok) { await withRetry(() => sectionBrief(id), "section"); await withRetry(() => groundBrief(id), "ground2"); status = await prov(id); } }
    const tiers = await factTiers(id);
    const alts = pf.alternatives.filter((a) => a.role === "alternative").length;
    if (status === "verified") { summary.verified++; console.log(`  [${t.cls.padEnd(6)}] ${key.padEnd(20)} VERIFIED   tiers=${JSON.stringify(tiers)}  via=${pf.fellBack ? "FALLBACK→" + usedUrl.slice(0, 36) : "declared"}`); continue; }
    // 4. HONEST EXIT — counsel hold (NO forced span, NO relabel of slot-bound facts). SPLIT the result:
    //    counsel_NO_SOURCE_FOUND    = roadblocked + nothing fetchable (a real, maybe-permanent gap)
    //    counsel_NO_SOURCE_QUALIFIED = source(s) fetched but all resolved sub-floor (secondary-carried fact)
    const tierNums = Object.keys(tiers).filter((k) => k !== "null").map(Number);
    const best_resolved_tier = tierNums.length ? Math.min(...tierNums) : null;
    const result = pf.ok ? "counsel_NO_SOURCE_QUALIFIED" : "counsel_NO_SOURCE_FOUND";
    summary.counsel++;
    const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: id });
    const failures = (Array.isArray(vr) ? vr[0] : vr)?.failures ?? [];
    // AUDIT (durable, queryable, lane-auditable): the counsel-hold provenance IS an integrity claim — proof
    // the search ran + exhausted, not that it never looked. alternatives_tried + best_resolved_tier + the
    // measured lang_ratio (so an ASCII-ratio misfire is visible) are all recorded.
    await sb.from("integrity_flags").insert({ category: "data_quality", subject_type: "item", subject_ref: id,
      description: `Phase 2 re-ground honest exit (${result}): declared primary ${pf.fellBack ? `roadblocked (${pf.primaryReason}) → ${alts} official alternative(s) tried` : "fetched"}; best_resolved_tier=${best_resolved_tier ?? "none"}; lang_ratio=${pf.langRatio}. Slot-bound / below-floor facts → counsel, never relabel or cross-language span (language rule).`,
      recommended_actions: [{ action: "priority_review", result, best_resolved_tier, primary_roadblock: pf.fellBack ? pf.primaryReason : null, fallback_fired: pf.fellBack, alternatives_tried: pf.alternatives, residual_failures: failures, rationale: "roadblock → bounded official-alternative search exhausted; qualification (resolver+floor) unchanged; counsel-hold not relabel" }],
      status: "open", created_by: "phase2_priority_review" });
    console.log(`  [${t.cls.padEnd(6)}] ${key.padEnd(20)} COUNSEL (${result})  tiers=${JSON.stringify(tiers)} best=T${best_resolved_tier ?? "-"} alts=${alts} via=${pf.fellBack ? "FALLBACK" : "declared"}`);
  } catch (e) {
    // FATAL (out-of-credits / auth / bad-request) HALTS the batch with the actionable cause — never grind
    // 30 items each erroring, never mislabel a billing/auth halt as a per-item content outcome.
    if (e?.fatal || /^ANTHROPIC_(OUT_OF_CREDITS|FATAL)/.test(e?.message || "")) {
      console.log(`\n⛔ HALTED (fatal, non-retryable): ${e.message}`);
      console.log(`   ${summary.verified} verified before halt; remaining items untouched and resumable after the cause is fixed (e.g. top up Anthropic credits).`);
      break;
    }
    summary.errors++; console.log(`  [${t.cls.padEnd(6)}] ${key.padEnd(20)} ERROR: ${e.message.slice(0, 90)}`);
  }
}
console.log(`\nDONE. verified=${summary.verified} counsel=${summary.counsel} errors=${summary.errors}`);
// ADD 1 — batch-level fallback awareness (REPORTED, not a hard stop): a jurisdiction of roadblocked
// primaries firing the fallback on every item surfaces a systemic roadblock (whole-jurisdiction outage
// OR detector misfire) as a finding instead of silent 75s×N slowness.
const pct = targets.length ? Math.round(fallbackFired / targets.length * 100) : 0;
console.log(`FALLBACK FIRED on ${fallbackFired}/${targets.length} items (${pct}%)${pct >= 50 ? "  ⚠ SYSTEMIC ROADBLOCK — whole-jurisdiction outage or detector misfire; investigate before trusting the counsel split." : ""}`);
process.exit(0);
