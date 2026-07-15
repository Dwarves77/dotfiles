/** WAVE 1a — C5 (missing_required_slot) SLOT RE-TAGS (operator GO 2026-07-15, $5 bound shared W1+W3-diag).
 *  validate_item_provenance criterion 5 requires, per reg required slot, a FACT/GAP claim whose claim_text
 *  contains the literal slot_key token. Verified reg items carry it as a bracket prefix — e.g.
 *  "[primary_deadline] The first reporting is due 2026...". Many held items HAVE the slot's content as a claim
 *  but it was never slot-tagged. The fix is to prepend the [slot_key] tag to the claim that GENUINELY states
 *  the slot — a Haiku JUDGE decides (word-overlap only nominates); never fabricate to clear the criterion, and
 *  honest-hold (leave the slot unfilled) where no claim genuinely covers it (operator: "never forced").
 *
 *  This is the integrity rule mechanized for slot coverage: a tag is applied ONLY to an existing claim the judge
 *  confirms supports the slot; ABSENT/UNCERTAIN -> no change (the item stays held on that slot). Claim updates
 *  fire set_provenance_status_claims_trg, so the item re-evals automatically. Guarded writes (rule 015).
 *  Usage: node scripts/wave1a-slot-retag.mjs [--apply] [--bound=5]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "./lib/db.mjs";
import { canonicalGenerate, textOf } from "./lib/anthropic.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const BOUND = (() => { const a = process.argv.find((x) => x.startsWith("--bound=")); return a ? Number(a.slice(8)) : 5; })();
const HAIKU = "claude-haiku-4-5-20251001";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "source-credibility-model", reason: "Wave 1a C5 slot re-tag: prepend [slot_key] to the claim a Haiku judge confirms states the slot (slot-forcing genuine-support; never fabricated); honest-hold where absent" };

// Haiku spend estimate (4.5: ~$1/Mtok in, $5/Mtok out). Conservative per-call ceiling used for the bound.
let haikuCalls = 0, estUsd = 0;
const estCall = (inChars, outChars) => (inChars / 4 / 1e6) * 1.0 + (outChars / 4 / 1e6) * 5.0;

const SLOTS = {
  effective_date: "the date the instrument entered into force / took legal effect (an in-force / effective / commencement date)",
  primary_deadline: "the principal compliance deadline or key obligation milestone date that covered parties must meet",
  jurisdictional_scope: "who/what/where the instrument applies to — covered entities, geography, sectors, or size/threshold criteria",
  penalty_summary: "the penalties, sanctions, or enforcement consequences for non-compliance",
};

async function validate(id) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  return (Array.isArray(data) ? data[0] : data) ?? null;
}
async function statusOf(id) {
  const { data } = await sb.from("intelligence_items").select("provenance_status").eq("id", id).single();
  return data?.provenance_status ?? "unknown";
}
const failList = (v) => v?.valid ? "(valid)" : [...new Set((v?.failures || []).map((f) => `${f.criterion}:${f.reason}`))].join(",");

// C5 items + their missing slot_keys, from the live gate.
async function c5Items() {
  const { data } = await sb.from("intelligence_items").select("id, title")
    .eq("provenance_status", "quarantined").in("item_type", ["regulation", "directive", "standard", "guidance", "framework"]);
  const out = [];
  for (const it of data || []) {
    const v = await validate(it.id);
    const slots = [...new Set((v?.failures || []).filter((f) => f.reason === "missing_required_slot").map((f) => f.slot_key))];
    if (slots.length) out.push({ ...it, slots, otherFails: (v?.failures || []).some((f) => f.reason !== "missing_required_slot") });
  }
  return out;
}
async function claimsOf(id) {
  const { data } = await sb.from("section_claim_provenance").select("id, claim_text, claim_kind")
    .eq("intelligence_item_id", id).in("claim_kind", ["FACT", "GAP"]);
  // candidates = claims NOT already bracket-tagged (avoid double-tag)
  return (data || []).filter((c) => c.claim_text && !/^\s*\[/.test(c.claim_text));
}

async function judge(slotKey, claims) {
  const list = claims.map((c, i) => `#${i} (${c.id}): ${String(c.claim_text).slice(0, 260)}`).join("\n");
  const system = `You are a STRICT regulatory-provenance judge. Return ONLY the uuid of the SINGLE claim whose PRIMARY, DIRECT assertion IS the slot, or the literal word NONE. Bias strongly toward NONE. A claim that merely MENTIONS the subject — names a "covered entity", cites a date in passing, or states an obligation imposed ON covered parties — is NOT the slot and must be NONE. Specifically: jurisdictional_scope requires a claim that DEFINES the covered population (entity type, revenue/size threshold, geography, or sector) — an obligation on covered entities is NOT a scope definition. effective_date / primary_deadline require the date to BE the claim's point, not incidental. When in doubt, answer NONE. Output the uuid or NONE, nothing else.`;
  const user = `SLOT "${slotKey}" = ${SLOTS[slotKey] || slotKey}.\n\nCLAIMS:\n${list}\n\nWhich single claim id has this slot as its PRIMARY direct assertion? Reply with the uuid or NONE.`;
  const resp = await canonicalGenerate({ messages: [{ role: "user", content: user }], system, model: HAIKU, maxTokens: 60 });
  const out = textOf(resp).trim();
  haikuCalls += 1; estUsd += estCall(system.length + user.length, out.length);
  const m = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const id = m ? m[0] : null;
  return claims.find((c) => c.id === id) || null; // must be one of the presented claims
}

async function main() {
  console.log(`\n=== WAVE 1a — C5 slot re-tags (${APPLY ? "APPLY" : "DRY-RUN"}) | bound $${BOUND} ===`);
  const items = await c5Items();
  console.log(`C5-failing items: ${items.length}`);
  const flips = [], tagged = [], held = [];
  for (const it of items) {
    if (estUsd >= BOUND) { console.log(`\nHALT: est spend $${estUsd.toFixed(4)} >= bound $${BOUND}`); break; }
    const before = await statusOf(it.id);
    const claims = await claimsOf(it.id);
    const decisions = [];
    for (const slot of it.slots) {
      const pick = claims.length ? await judge(slot, claims) : null;
      if (pick) {
        decisions.push({ slot, claimId: pick.id, text: pick.claim_text });
      } else {
        decisions.push({ slot, claimId: null });
      }
    }
    // apply tags
    for (const d of decisions) {
      if (!d.claimId) { held.push(`${it.title} :: ${d.slot} (no genuine claim -> honest hold)`); continue; }
      if (APPLY) {
        await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", d.claimId),
          { claim_text: `[${d.slot}] ${d.text}` }, { cite });
      }
      tagged.push(`${it.title} :: [${d.slot}] -> claim ${d.claimId.slice(0, 8)}`);
    }
    const after = APPLY ? await statusOf(it.id) : before;
    const v = await validate(it.id);
    if (before !== after && after === "verified") flips.push(`${it.title}: ${before} -> ${after}`);
    console.log(`  ${before}->${after.padEnd(11)} | slots:[${it.slots.join(",")}] tagged:${decisions.filter((d) => d.claimId).length}/${it.slots.length} | remaining: ${failList(v)} | ${String(it.title).slice(0, 44)}`);
  }
  console.log(`\n=== WAVE 1a ${APPLY ? "DONE" : "DRY"} — Haiku calls: ${haikuCalls}, est $${estUsd.toFixed(4)}/${BOUND} | flips: ${flips.length} | tags: ${tagged.length} | honest-holds: ${held.length} ===`);
  flips.forEach((f) => console.log(`  FLIP: ${f}`));
  if (!APPLY) { tagged.slice(0, 30).forEach((t) => console.log(`  would-tag: ${t}`)); held.slice(0, 20).forEach((h) => console.log(`  hold: ${h}`)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
