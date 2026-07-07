/** READ-ONLY probe (Phase 2 (b)-NARROW build): for the 30 flip items, inspect every below-floor FACT
 *  claim and test whether the (b)-NARROW mechanical relabel is feasible — i.e. whether the claim's
 *  sentence is locatable verbatim in its section's content_md so a fixed marker can be prepended.
 *  No writes, no network. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const FLIP_KEYS = ["eu_ets_directive_2023_959","eu_clean_trucking_2024_1610","7a0ead55","5cc10a6d","e2e03e1b",
  "eu-emissions-trading-system-ets-extension-to-maritime-transport","eu-corporate-sustainability-reporting-directive-csrd-transport-provisions",
  "eu-corporate-sustainability-reporting-directive-csrd-transport-sector-implementa","3ae89ce6","d5ee6ab8","o6","93c344a1",
  "d56ca4e1","89656109","0ea6a710","cd5c84e3","de2df788","bec305e1","a4","782878c0","d935e112","27dfbe4c","6a857887",
  "ad4cc6c6","japan-green-transformation-gx-freight-transport-standards","japan-s-updated-top-runner-program-for-heavy-duty-vehicles",
  "india-s-national-logistics-policy-carbon-intensity-standards","03b5f234","82f09535","g19"];

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status", { match: (q) => q.eq("is_archived", false) });
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0,8), it); }
const targets = FLIP_KEYS.map((k) => byKey.get(k)).filter(Boolean);

// strip the stored "[slot_key] " prefix the pipeline prepends to slot-bound FACT/GAP claim_text (line 432)
const stripSlot = (t) => t.replace(/^\[[^\]]+\]\s+/, "");
const norm = (s) => (s || "").toLowerCase();
// MECHANICAL normalized matcher: build a char-offset map from a whitespace/markdown-collapsed view of
// content_md back to the ORIGINAL string, so a normalized claim_text match yields an EXACT original offset
// at which a fixed marker can be inserted (diff-assert: removing the marker yields the original byte-identical).
// Normalization = lowercase + drop markdown emphasis/heading/list punctuation + collapse whitespace runs to 1.
const DROP = /[*_`>#]/; // markdown emphasis/heading/quote chars dropped from the match view (not from content)
function normMap(s) {
  let out = "", map = [], prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (DROP.test(ch)) continue;
    if (/\s/.test(ch)) { if (prevSpace || out.length === 0) continue; out += " "; map.push(i); prevSpace = true; continue; }
    out += ch.toLowerCase(); map.push(i); prevSpace = false;
  }
  // trim trailing space
  while (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
  return { view: out, map }; // map[k] = original index of view char k
}
function locateNormalized(cm, claim) {
  const c = normMap(cm), q = normMap(claim);
  if (!q.view) return -1;
  const idx = c.view.indexOf(q.view);
  if (idx < 0) return -1;
  return c.map[idx]; // original content_md offset of the sentence start
}

let totFact = 0, totBelow = 0, locatable = 0, locatableStripped = 0, notLocatable = 0, slotPrefixed = 0, normLocatable = 0;
const perItem = [];
for (const it of targets) {
  const claims = await readAll("section_claim_provenance", "id,section_row_id,claim_text,claim_kind,source_tier_at_grounding",
    { match: (q) => q.eq("intelligence_item_id", it.id).eq("claim_kind", "FACT") });
  const secIds = [...new Set(claims.map((c) => c.section_row_id).filter(Boolean))];
  const secMap = new Map();
  for (const sid of secIds) { const { data } = await sb.from("intelligence_item_sections").select("id,content_md").eq("id", sid).single(); if (data) secMap.set(sid, data.content_md || ""); }
  let below = 0, loc = 0, locStrip = 0, notLoc = 0, slotPfx = 0;
  const samples = [];
  for (const c of claims) {
    totFact++;
    const isBelow = c.source_tier_at_grounding == null || ![1,2].includes(c.source_tier_at_grounding);
    if (!isBelow) continue;
    below++; totBelow++;
    const cm = secMap.get(c.section_row_id) || "";
    const raw = c.claim_text || "";
    const stripped = stripSlot(raw);
    const hasSlotPfx = stripped !== raw;
    if (hasSlotPfx) { slotPfx++; slotPrefixed++; }
    const rawIn = cm && norm(cm).includes(norm(raw));
    const stripIn = cm && norm(cm).includes(norm(stripped));
    const normOff = cm ? locateNormalized(cm, stripped) : -1; // mechanical normalized locate (offset or -1)
    if (rawIn) { loc++; locatable++; }
    else if (stripIn) { locStrip++; locatableStripped++; }
    else { notLoc++; notLocatable++; if (samples.length < 2) samples.push({ tier: c.source_tier_at_grounding, slot: hasSlotPfx, claim: stripped.slice(0,90), cmHas: cm ? "section-present" : "NO-SECTION", cmlen: cm.length, normOff }); }
    if (normOff >= 0) { c._normLoc = true; } // recovered by the normalized matcher
    if (normOff >= 0) normLocatable++;
  }
  perItem.push({ key: it.legacy_id || it.id.slice(0,8), type: it.item_type, prio: it.priority, status: it.provenance_status, factClaims: claims.length, below, loc, locStrip, notLoc, slotPfx, samples });
}

console.log("\n===== (b)-NARROW RELABEL SHAPE PROBE — 30 flip items (READ-ONLY) =====");
console.log(`items resolved: ${targets.length}/${FLIP_KEYS.length}`);
console.log(`FACT claims total: ${totFact} | below-floor (null or not 1/2): ${totBelow} | slot-prefixed among below: ${slotPrefixed}`);
console.log(`below-floor relabel feasibility: claim_text verbatim in content_md = ${locatable} | only-after-slot-strip = ${locatableStripped} | NOT locatable = ${notLocatable}`);
console.log(`  => mechanically-relabelable (raw OR slot-stripped located): ${locatable + locatableStripped} | residual->priority_review: ${notLocatable}`);
console.log(`NORMALIZED matcher (whitespace+markdown collapse, offset-mapped, MECHANICAL): locates ${normLocatable}/${totBelow} below-floor (${Math.round(normLocatable/totBelow*100)}%) | residual NOT locatable even normalized: ${totBelow - normLocatable}`);
console.log("\nper-item (key | type | prio | status | factClaims | below | loc | locStrip | notLoc | slotPfx):");
for (const p of perItem) console.log(`  ${p.key.padEnd(34)} ${(p.type||"").padEnd(11)} ${(p.prio||"").padEnd(8)} ${(p.status||"").padEnd(11)} F=${String(p.factClaims).padStart(3)} below=${String(p.below).padStart(3)} loc=${String(p.loc).padStart(3)} strip=${String(p.locStrip).padStart(3)} notLoc=${String(p.notLoc).padStart(3)} slotPfx=${String(p.slotPfx).padStart(3)}`);
console.log("\nnot-locatable samples (first items with residual):");
for (const p of perItem) if (p.samples.length) { console.log(`  [${p.key}]`); for (const s of p.samples) console.log(`     tier=${s.tier} slot=${s.slot} ${s.cmHas} cmlen=${s.cmlen} :: ${s.claim}`); }
process.exit(0);
