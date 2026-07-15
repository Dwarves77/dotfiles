/** WAVE 1a (hand-verified subset) — tag ONLY the pure-C5 flip claims a human judge confirmed genuinely state
 *  the slot (the blanket Haiku judge mis-calibrated: too lenient tagged a weak SB261 claim, too strict rejected
 *  a genuine S.Korea one — so the flip-producing tags are hand-verified). Never forced: items whose slot content
 *  is genuinely absent stay held. Guarded claim update fires set_provenance_status_claims_trg -> auto re-eval.
 *  Usage: node scripts/wave1a-apply-verified.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "source-credibility-model", reason: "Wave 1a hand-verified C5 slot tag: prepend [slot_key] to a claim a human judge confirmed states the slot (genuine-support, never forced)" };

// item | claim_id | slot — each hand-verified against the claim text.
const TAGS = [
  ["42b8bfee-92ea-4cde-bfe9-a25eb7cb49d9", "e0a8668b-7cf2-44ce-bbf5-cb45b52c9032", "primary_deadline", "SB253"],
  ["956bad5c-80b0-411b-8fd5-726cc0d4a333", "20662f1d-6db1-4143-9b05-fbeee3e3f019", "primary_deadline", "CARB-ACT"],
  ["b293a2b6-c882-44dc-8efc-a801ed6a160b", "6fa1e6c2-459e-405d-acf2-e97063264c3b", "jurisdictional_scope", "SKorea-MOF"],
];

async function validate(id) { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); return (Array.isArray(data) ? data[0] : data) ?? null; }
async function statusOf(id) { const { data } = await sb.from("intelligence_items").select("provenance_status").eq("id", id).single(); return data?.provenance_status ?? "?"; }
const fails = (v) => v?.valid ? "(valid)" : [...new Set((v?.failures || []).map((f) => `${f.criterion}:${f.reason}`))].join(",");

async function main() {
  console.log(`\n=== WAVE 1a hand-verified tags (${APPLY ? "APPLY" : "DRY"}) ===`);
  const flips = [];
  for (const [itemId, claimPrefix, slot, label] of TAGS) {
    // resolve the exact claim id (allow a truncated prefix), and fetch current text
    const { data: cs } = await sb.from("section_claim_provenance").select("id, claim_text").eq("id", claimPrefix);
    const c = (cs || [])[0];
    if (!c) { console.log(`  ${label}: claim ${claimPrefix} NOT FOUND — skip`); continue; }
    if (/^\s*\[/.test(c.claim_text)) { console.log(`  ${label}: already tagged — skip`); continue; }
    const before = await statusOf(itemId);
    if (APPLY) await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", c.id), { claim_text: `[${slot}] ${c.claim_text}` }, { cite });
    const after = APPLY ? await statusOf(itemId) : before;
    const v = await validate(itemId);
    if (before !== after && after === "verified") flips.push(`${label}: ${before} -> ${after}`);
    console.log(`  ${label}: ${before}->${after} | [${slot}] claim ${c.id.slice(0, 8)} | remaining: ${fails(v)}`);
  }
  console.log(`\n=== flips: ${flips.length} ===`); flips.forEach((f) => console.log(`  FLIP: ${f}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
