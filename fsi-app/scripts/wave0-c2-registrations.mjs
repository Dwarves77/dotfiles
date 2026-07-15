/** WAVE 0 — C2 (ungrounded_url) URL-PRESENCE REGISTRATIONS (operator GO 2026-07-15, standing autonomy for
 *  this class). validate_item_provenance criterion 2 fails when a URL cited in a brief's prose does not resolve
 *  to any registered source / pool row / the item's own source_url. The fix is to register the cited URL at its
 *  HONEST institutional tier so the citation grounds. registration-does-not-unlock: C2 is a URL-PRESENCE check,
 *  NOT a fact-tier check — registering here records honest provenance and clears C2; it attributes NO fact and
 *  confers NO reg-fact eligibility (the moat / SC-11/SC-14 hold; grounding is not re-run).
 *
 *  The 5 C2 items surfaced 7 URLs. gov.gov.uk (Green Building) is a MALFORMED domain (doubled "gov") — a broken
 *  citation, NOT registered here (never register a fake domain); routed to Wave 1b prose correction. The other 6
 *  are legit and register at ruled tiers. Mexico is C2-only -> flips to verified; the rest retain other blockers.
 *
 *  Guarded + idempotent (skips an already-registered exact URL). Re-evals each item by a guarded touch so the
 *  set_provenance_status trigger recomputes (quarantined items flip freely — guard_provenance_flip only gates
 *  items leaving 'unverified'). Usage: node scripts/wave0-c2-registrations.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedInsertMany, guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "source-credibility-model", reason: "Wave 0 C2 URL-presence registration (SC-13): cited primary/framework URLs registered at honest tier so brief-prose citations resolve; registration-does-not-unlock (no fact eligibility, grounding not re-run)" };

// url | base_tier | name | note. Ruled 2026-07-15 from the census + institutional identity.
const URLS = [
  ["https://diputados.gob.mx/leyesbiblio/pdf/lgeepa.pdf", 1, "Cámara de Diputados — LGEEPA (Ley General del Equilibrio Ecológico y la Protección al Ambiente)", "Mexican federal law library (primary legal text)"],
  ["https://diputados.gob.mx/leyesbiblio/pdf/linfcal.pdf", 1, "Cámara de Diputados — Ley de Infraestructura de la Calidad", "Mexican federal law library (primary legal text)"],
  ["https://law.go.kr/lsinfop.do?lsiseq=207083", 1, "Korea Ministry of Government Legislation — National Law Information Center (law.go.kr)", "official Korean statute database (primary legal text)"],
  ["https://airkorea.or.kr", 3, "Korea Environment Corporation — AirKorea", "govt air-quality data portal (agency data)"],
  ["https://assets.bbhub.io/company/sites/60/2021/10/final-2017-tcfd-report.pdf", 4, "TCFD — Final Report (Recommendations of the Task Force on Climate-related Financial Disclosures, 2017)", "FSB task-force framework document (industry/standards framework)"],
  ["https://s.fhg.de/reff", 4, "Fraunhofer — research methodology (s.fhg.de shortlink)", "applied-research institute methodology reference"],
];

// The 5 C2 items to re-evaluate after registration.
const C2_ITEMS = [
  ["6373df1e-1461-478e-b480-70dee471d597", "Mexico SEMARNAT (C2-only -> expect FLIP)"],
  ["9e594959-7de8-41e8-a25c-5b1976f77b34", "Green Building (C2 gov.gov.uk malformed + C3 -> stays held)"],
  ["3581c084-9486-4085-82cc-b650380bd83d", "GLEC Framework v3 (C2+C4 -> C2 cleared, C4 remains)"],
  ["2d2cd311-d026-457c-bbd0-9b65a8f6cf60", "California SB 261 (C2+C5 -> C2 cleared, C5 remains)"],
  ["b293a2b6-c882-44dc-8efc-a801ed6a160b", "South Korea MOF (C2+C5 -> C2 cleared, C5 remains)"],
];

const nowIso = () => new Date().toISOString();

async function validate(id) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(data) ? data[0] : data;
  return r ?? null;
}
async function statusOf(id) {
  const { data } = await sb.from("intelligence_items").select("provenance_status").eq("id", id).single();
  return data?.provenance_status ?? "unknown";
}

async function main() {
  console.log(`\n=== WAVE 0 — C2 URL-presence registrations (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  // idempotency: which exact URLs already exist?
  const rows = [];
  for (const [url, tier, name, note] of URLS) {
    const { data: ex } = await sb.from("sources").select("id").eq("url", url).limit(1);
    if (ex && ex.length) { console.log(`  skip (already registered): ${url}`); continue; }
    rows.push({ name, url, base_tier: tier, tier_at_creation: tier, intelligence_types: [], status: "active",
      notes: `Wave 0 C2 URL-presence registration 2026-07-15 (${note}); registration-does-not-unlock: honest tier, not reg-fact eligibility.` });
  }
  console.log(`to register: ${rows.length}`);
  for (const r of rows) console.log(`  T${r.base_tier}  ${r.url}`);

  // pre-state
  console.log(`\n-- pre-state --`);
  for (const [id, label] of C2_ITEMS) console.log(`  ${(await statusOf(id)).padEnd(11)} ${label}`);

  if (!APPLY) { console.log("\ndry-run — re-run --apply to register + re-eval."); return; }

  if (rows.length) {
    const res = await guardedInsertMany("sources", rows, { cite });
    console.log(`\nregistered ${res.inserted?.length ?? rows.length} sources (snapshot ${res.snapshot}).`);
  }

  // re-eval each item via a guarded touch (fires set_provenance_status; quarantined flips freely)
  console.log(`\n-- re-eval (guarded touch -> trigger recompute) --`);
  const flips = [];
  for (const [id, label] of C2_ITEMS) {
    const before = await statusOf(id);
    await guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), { updated_at: nowIso() }, { cite });
    const after = await statusOf(id);
    const v = await validate(id);
    const remaining = v?.valid ? "(valid)" : (v?.failures || []).map((f) => `${f.criterion}:${f.reason}`).filter((x, i, a) => a.indexOf(x) === i).join(",");
    if (before !== after) flips.push(`${label}: ${before} -> ${after}`);
    console.log(`  ${before} -> ${after.padEnd(11)} | remaining: ${remaining} | ${label}`);
  }
  console.log(`\n=== WAVE 0 DONE — flips: ${flips.length} ===`);
  flips.forEach((f) => console.log(`  FLIP: ${f}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
