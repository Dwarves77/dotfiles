/** FREE-PASS RUNNER ($0, guarded) — economy-of-information doctrine + re-attribution CONSTRAINT (2026-07-13).
 *
 *  For every non-verified live item with FACT claims: each FACT claim FAILING the authority floor (tier null or
 *  > floor) is offered a FREE re-attribution to a floor-qualifying PRIMARY-INSTRUMENT capture the item ALREADY
 *  HOLDS — its own raw_fetches snapshot or another registered floor source's snapshot — gated by
 *  freeReattributeDecision (verbatim ∧ officialness path-a ∧ error-body-clean). SC-13: an unregistered CODIFIED
 *  gov/legal snapshot host is registered at its codified tier so its snapshot becomes a floor capture (never a
 *  guessed tier). When ALL of an item's failing FACT claims are re-homed, the item is touched so the
 *  set_provenance_status trigger re-derives status → read-back the flip. Items that cannot be fully re-homed for
 *  free exit to a FACTS-ONLY manifest (document + size + unmatched spans) — NO machine price (operator sets cost).
 *
 *  NO fetch, NO model — pure stored reads + guarded metadata writes. DRY-RUN default; --apply writes + read-back.
 *  Usage: node scripts/_reground/free-pass-run.mjs [--apply] [--limit=N] [--only=key,key]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { readClient, readAll, guardedUpdate, registerSource } from "../lib/db.mjs";
import { freeReattributeDecision } from "../lib/free-pass.mjs";
import { getSnapshot } from "../../src/lib/sources/snapshot-store.mjs";
import { authorityFloorFor } from "../../src/lib/agent/source-blocks.mjs";
import { codifiedTierForHost } from "../../src/lib/sources/host-authority.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const sb = readClient();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const cite = { skill: "source-credibility-model", reason: "free-pass SC-13 codified-host registration: register the item's own gov/legal primary-instrument snapshot host at its DETERMINISTIC codified tier (legal→1 / gov→2), so its held snapshot becomes a floor capture for $0 re-attribution (no guessed tier)" };

let items = await readAll("intelligence_items", "id,legacy_id,title,item_type,source_id,source_url",
  { match: (q) => q.eq("is_archived", false).neq("provenance_status", "verified") });
if (ONLY) items = items.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((k) => it.id.startsWith(k)));
items = items.slice(0, LIMIT === Infinity ? items.length : LIMIT);

console.log(`\n===== FREE-PASS RUNNER (${APPLY ? "APPLY — guarded writes + read-back" : "DRY-RUN — predict only, $0"}) =====`);
console.log(`non-verified live items: ${items.length}  | NO fetch, NO model\n`);

// Resolve a capture (source_id -> { host, hostTier, body, needsRegister }) from stored data only.
const sourceCache = new Map();
async function loadSource(sourceId) {
  if (!sourceId) return null;
  if (sourceCache.has(sourceId)) return sourceCache.get(sourceId);
  const { data } = await sb.from("sources").select("id,url,base_tier,tier_override").eq("id", sourceId).maybeSingle();
  const rec = data ? { id: data.id, url: data.url, host: hostOf(data.url), base_tier: data.base_tier, tier_override: data.tier_override } : null;
  sourceCache.set(sourceId, rec);
  return rec;
}
async function captureFor(sourceId) {
  const src = await loadSource(sourceId);
  if (!src) return null;
  const codified = codifiedTierForHost(src.host || "");
  const registeredTier = src.tier_override ?? src.base_tier ?? null;
  const hostTier = registeredTier ?? codified ?? null;
  const needsRegister = registeredTier == null && codified != null; // SC-13: codified host not yet floor-registered
  let body = "";
  try { const snap = await getSnapshot(sb, { sourceId }); if (snap.found) body = snap.content; } catch { /* no snapshot */ }
  return { sourceId, host: src.host, hostTier, body, needsRegister, codified };
}

const manifest = [];
let flipped = 0, wouldFlip = 0, residual = 0, noFacts = 0, nonTier = 0;

for (const it of items) {
  const key = it.legacy_id || it.id.slice(0, 8);
  const floor = authorityFloorFor(it.item_type);
  if (floor == null) { console.log(`  ${key.padEnd(14)} EXEMPT type ${it.item_type} — skip`); continue; }

  const { data: claims } = await sb.from("section_claim_provenance")
    .select("id,source_span,source_id,source_tier_at_grounding,claim_kind")
    .eq("intelligence_item_id", it.id);
  const facts = (claims ?? []).filter((c) => String(c.claim_kind ?? "").toLowerCase() === "fact");
  if (facts.length === 0) { noFacts++; manifest.push({ key, id: it.id, outcome: "NO-FACTS", source_url: it.source_url }); console.log(`  ${key.padEnd(14)} NO-FACTS — re-synth/re-gen (manifest)`); continue; }

  const failing = facts.filter((c) => c.source_tier_at_grounding == null || c.source_tier_at_grounding > floor);
  if (failing.length === 0) { nonTier++; manifest.push({ key, id: it.id, outcome: "NON-TIER-FAILURE", note: "floor OK; quarantine is label/slot/span-not-in-source", source_url: it.source_url }); console.log(`  ${key.padEnd(14)} non-tier failure (label/slot) — manifest`); continue; }

  // Assemble the item's held captures: its own source + every source its claims already reference.
  const capSourceIds = [...new Set([it.source_id, ...facts.map((c) => c.source_id)].filter(Boolean))];
  const captures = (await Promise.all(capSourceIds.map(captureFor))).filter(Boolean).filter((c) => c.body);

  // Decide each failing claim.
  const homes = [];
  const unmatched = [];
  for (const c of failing) {
    const d = freeReattributeDecision(c.source_span, c.source_tier_at_grounding, captures, floor);
    if (d.accept) homes.push({ claimId: c.id, target: d.target, tier: d.tier });
    else unmatched.push((c.source_span || "").slice(0, 120));
  }

  if (homes.length === failing.length && homes.length > 0) {
    // FREE-FLIPPABLE: all failing FACT spans re-home to a floor-qualifying primary the item holds.
    if (!APPLY) { wouldFlip++; console.log(`  ${key.padEnd(14)} WOULD-FLIP — ${homes.length}/${failing.length} failing spans re-home to held primary`); manifest.push({ key, id: it.id, outcome: "WOULD-FLIP", rehomed: homes.length }); continue; }
    // register codified hosts first (SC-13), then re-attribute, then touch → read-back.
    for (const h of homes) {
      if (h.target.needsRegister) {
        const r = await registerSource({ url: `https://${h.target.host}/`, name: h.target.host, base_tier: h.target.codified }, { cite });
        h.target.sourceId = r.source_id;
      }
      await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", h.claimId),
        { source_id: h.target.sourceId, source_tier_at_grounding: h.tier },
        { cite: { skill: "source-credibility-model", reason: `free-pass floor-first re-attribution: span verbatim-present in held primary-instrument snapshot (officialness path a, error-body clean); re-home ${key} claim to tier ${h.tier}` } });
    }
    // touch the item so set_provenance_status re-derives; read back.
    await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { updated_at: new Date().toISOString() },
      { cite: { skill: "remediation-discipline", reason: `free-pass: re-derive provenance after $0 floor-first re-attribution of ${homes.length} span(s) for ${key}` } });
    const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
    const prov = fin?.provenance_status;
    if (prov === "verified") { flipped++; console.log(`  ${key.padEnd(14)} VERIFIED (free, $0) [read-back]`); manifest.push({ key, id: it.id, outcome: "VERIFIED-FREE", rehomed: homes.length }); }
    else { residual++; console.log(`  ${key.padEnd(14)} re-homed ${homes.length} but still ${prov} (other criteria) — manifest`); manifest.push({ key, id: it.id, outcome: "REHOMED-STILL-QUARANTINED", provenance: prov, rehomed: homes.length }); }
  } else {
    // RESIDUAL: some failing spans have no floor-qualifying primary in what we hold → acquisition delta.
    residual++;
    const { data: pf } = await sb.from("agent_runs").select("fetch_html_bytes").eq("intelligence_item_id", it.id).not("fetch_html_bytes", "is", null).order("started_at", { ascending: false }).limit(1);
    manifest.push({ key, id: it.id, outcome: "RESIDUAL-ACQUIRE", source_url: it.source_url, deltaEstBytes: pf?.[0]?.fetch_html_bytes ?? null, failingSpans: failing.length, homedFree: homes.length, unmatchedSpans: unmatched.slice(0, 5) });
    console.log(`  ${key.padEnd(14)} RESIDUAL — ${homes.length}/${failing.length} spans home free; ${unmatched.length} need a floor primary (manifest)`);
  }
}

console.log(`\n===== SUMMARY (${APPLY ? "applied" : "predicted"}) =====`);
if (APPLY) console.log(`  VERIFIED-FREE: ${flipped}`); else console.log(`  WOULD-FLIP: ${wouldFlip}`);
console.log(`  residual (acquire/rehomed-still-q): ${residual}`);
console.log(`  non-tier failure (label/slot): ${nonTier}`);
console.log(`  NO-FACTS (re-synth): ${noFacts}`);

const outDir = resolve(ROOT, "scripts/tmp"); mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `free-pass-${APPLY ? "applied" : "dryrun"}.json`);
writeFileSync(outPath, JSON.stringify({ apply: APPLY, flipped, wouldFlip, residual, nonTier, noFacts, manifest }, null, 2));
console.log(`\nmanifest → ${outPath}`);
console.log(APPLY ? `(guarded writes + per-item read-back)` : `(DRY-RUN — no writes, no fetch, no model)`);
process.exit(0);
