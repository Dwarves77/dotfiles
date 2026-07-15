/** DURABLE DATA RE-POINTS ($0, operator GO — $0 track, 2026-07-14, item 4). Two durable writes that "set up the
 *  paid queue" for eu_clean_trucking (8c186db2 — wrong_url, 0 facts held):
 *    (1) RE-POINT source_url: the held ELI /oj/eng URL roadblocks; the enacted text is at the CELEX
 *        /legal-content URL that identifier-variants DERIVES (goldened). source_url is a stable column the paid
 *        fetch reads, so the re-point is durable and directs the paid re-ground at the right document.
 *    (2) KRONE T-456/24 CHALLENGE INTELLIGENCE as a durable integrity_flags note (NOT item_timelines: the §14
 *        harvest in sectionBrief DELETES+rebuilds item_timelines on every re-ground, so a raw timeline row would
 *        be clobbered by the paid re-ground). integrity_flags persists across re-grounds; the paid re-ground /
 *        operator consumes it to place the challenge in §6/§14. Facts are EUR-Lex-verified (CELEX 62024TN0456 /
 *        62024TO0456 / C-522/25 P) — no fabrication.
 *
 *  VERIFICATION-BEFORE-AUTHORIZATION: reads the current source_url first and only patches if it is the expected
 *  ELI URL (halts on divergence). Per-write read-back. Guarded path (snapshots every write). Idempotent: skips
 *  the flag insert if an identical challenge note already exists.
 *  Usage: node scripts/reground-datapoints-2026-07-14.mjs [--apply]   (dry-run default)
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate, guardedInsert } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const cite = { skill: "remediation-discipline", reason: "durable data re-points 2026-07-14 (eu_clean_trucking CELEX re-point + Krone T-456/24 challenge intel)" };

const ITEM_ID = "8c186db2-ca7c-4b92-8960-3337a4d01b09"; // eu_clean_trucking_2024_1610
const EXPECTED_OLD = "https://eur-lex.europa.eu/eli/reg/2024/1610/oj/eng";
const CELEX_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1610";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KRONE_FLAG = {
  category: "coverage_gap",
  subject_type: "item",
  subject_ref: ITEM_ID,
  status: "open",
  created_by: "challenge-intelligence-2026-07-14",
  description: "Challenge intelligence to incorporate at the paid re-ground of eu_clean_trucking (Reg (EU) 2024/1610): Case T-456/24 Krone Commercial Vehicle SE & 7 others (trailer manufacturers) v European Parliament and Council — action brought 30 Aug 2024, contesting the trailer-design provisions (trailers emit no CO2 in traffic yet bear design obligations over which manufacturers argue they have no influence). General Court (Third Chamber) ORDER 22 May 2025; appeal to the Court of Justice (Case C-522/25 P) brought 31 Jul 2025. Source: EUR-Lex CELEX 62024TN0456 (notice) / 62024TO0456 (order). Place in Section 6 (Anticipated/Pending Regulatory Events) or the Section 14 timeline; a raw item_timelines insert is clobbered by the §14 harvest.",
  recommended_actions: [
    { action: "incorporate at re-ground", rationale: "add the T-456/24 challenge + C-522/25 P appeal to eu_clean_trucking §6/§14 when the paid re-ground runs against the CELEX enacted text" },
    { action: "cite EUR-Lex", rationale: "ground the challenge facts to CELEX 62024TN0456 / 62024TO0456 (the court notice + order), a T1/T2 primary" },
  ],
};

async function main() {
  console.log(`\n=== reground-datapoints (${APPLY ? "APPLY" : "DRY-RUN"}) — eu_clean_trucking 8c186db2 ===`);

  // (1) verify current source_url, then re-point.
  const { data: cur, error: rErr } = await sb.from("intelligence_items").select("id, source_url, provenance_status").eq("id", ITEM_ID).single();
  if (rErr || !cur) { console.error(`read failed: ${rErr?.message}`); process.exit(1); }
  console.log(`current source_url: ${cur.source_url}`);
  console.log(`current provenance: ${cur.provenance_status}`);
  if (cur.source_url === CELEX_URL) {
    console.log("source_url ALREADY the CELEX URL — re-point is a no-op (idempotent).");
  } else if (cur.source_url !== EXPECTED_OLD) {
    console.error(`HALT (divergence): expected old source_url\n  ${EXPECTED_OLD}\nbut found\n  ${cur.source_url}\nrefusing to re-point a source_url that isn't the diagnosed ELI URL.`);
    process.exit(2);
  } else if (APPLY) {
    const u = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", ITEM_ID), { source_url: CELEX_URL }, { cite, select: "id, source_url" });
    const back = u.rows?.[0]?.source_url;
    console.log(`re-pointed source_url -> ${back}  (${back === CELEX_URL ? "VERIFIED" : "MISMATCH!"}, snapshot ${u.snapshot})`);
    if (back !== CELEX_URL) process.exit(3);
  } else {
    console.log(`would re-point source_url -> ${CELEX_URL}`);
  }

  // (2) Krone challenge intelligence (idempotent: skip if an identical open note exists).
  const { data: existing } = await sb.from("integrity_flags").select("id")
    .eq("subject_ref", ITEM_ID).eq("created_by", KRONE_FLAG.created_by).eq("status", "open").limit(1);
  if (existing?.length) {
    console.log(`Krone challenge note already present (integrity_flags ${existing[0].id}) — skip.`);
  } else if (APPLY) {
    const ins = await guardedInsert("integrity_flags", KRONE_FLAG, { cite, select: "id" });
    console.log(`Krone T-456/24 challenge note inserted (integrity_flags ${ins.inserted?.id}, snapshot ${ins.snapshot}).`);
  } else {
    console.log(`would insert Krone T-456/24 challenge intelligence note (integrity_flags, category=coverage_gap).`);
  }

  console.log("\n=== done ===");
}
main().catch((e) => { console.error(e); process.exit(1); });
