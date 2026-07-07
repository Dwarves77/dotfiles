// scripts/dedup-2026-07-07-enact.mjs
//
// DUPLICATE-INSTRUMENT DISPOSITION ENACTMENT (Phase-3d). Enacts the operator's rulings on the six
// duplicate groups from DATE-AND-DEDUP-AUDIT-2026-07-07 (dispatch 2026-07-07: "Jason's calls
// embedded, transmitting as written enacts them"). All state verified live before writes
// (stale-premise guard); every write guarded (snapshot + read-back) via scripts/lib/db.mjs.
//
// RULINGS ENACTED:
//  1. PPWR (Reg 2025/40): KEEP efdb3390 ("EU PPWR 2025/40" — 74 claims, xrefs, the g2 slug the UI
//     links, timeline freshly harvested); ADOPT the loser's canonical ELI URL onto the survivor;
//     ARCHIVE 5cc10a6d (44 claims, 0 milestones) as duplicate_instrument.
//  2. CSRD (same CELEX URL — the pair that PROVED the same-instrument gap): KEEP f0833999 (56K
//     brief, 14 sections, 31 claims); ARCHIVE 9c5d1d17 (EMPTY brief, 0 sections). Both quarantined,
//     not customer-visible; survivor is the only substantive twin.
//  3. Reuters: KEEP 4de1e28e (23 claims, 8 sections); ARCHIVE d136c88c (10 claims).
//  4. ECTA: KEEP 58bf0406 (34K brief); ARCHIVE 29132ca6. RESIDUAL (flagged, not done): the loser's
//     3 extra claims are NOT ported — claim rows FK into the loser's section rows; re-parenting
//     across items is a separate, careful operation. The archived twin retains them for that pass.
//  5. AFIR (Reg 2023/1804 — THREE items, identifier-level identity CONFIRMED: CELEX:32023R1804 ≡
//     eli/reg/2023/1804/oj ≡ …/oj/eng): per the ruling, the mislabeled item is RE-TYPED to its
//     true instrument identity FIRST (never deleted on a label defect) — 6b0939a5's title
//     "EU Regulation 2023/1804 - Sustainability Reporting Requirements" is corrected to the AFIR
//     identity its own brief describes. THEN, identity confirmed at the identifier level, the
//     survivor-verified rule picks 62ba40b0 (verified, correctly titled, richest); 6b0939a5 and
//     ff95b385 ARCHIVE as confirmed identical duplicates.
//  6. Singapore Green Finance Incentive: KEEP BOTH — mpa.gov.sg (Maritime & Port Authority) and
//     mas.gov.sg (Monetary Authority) are TWO AGENCIES regulating one domain (the ministry-vs-
//     maritime-authority pattern, pair-2 precedent) — complementary instruments, NOT duplicates.
//     WIRE a cross-reference edge instead of deleting.
//
// archive_reason 'duplicate_instrument' extends the archive partition (4 prior values) with an
// orthogonal 5th: same-instrument twin superseded by a named survivor. Survivor mapping recorded in
// docs/ops/deletion-reclassification-log.md (same commit).
//
// SAFETY: DRY-RUN default; --execute writes. Zero spend (no model calls, no fetches).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate, guardedInsert, archiveRows } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* preloaded */ }

const EXECUTE = process.argv.includes("--execute");

const cite = {
  skill: "environmental-policy-and-innovation",
  reason: "Phase-3d duplicate-instrument disposition (operator rulings 2026-07-07): PPWR/CSRD/Reuters/ECTA archive-loser per the audit table; AFIR re-type-then-archive (identifier-identity confirmed); Singapore keep-both + xref edge",
};

// (group, survivor, losers) — full UUIDs verified live 2026-07-07.
const PPWR_KEEP = "efdb3390-7530-44e5-b99d-9b20157ae186";
const PPWR_LOSE = "5cc10a6d-b671-425e-abdb-8b3ba41678b3";
const PPWR_CANONICAL_ELI = "https://eur-lex.europa.eu/eli/reg/2025/40/oj";
const CSRD_LOSE = "9c5d1d17-4388-43a0-b9df-67de1fc0e582";   // keep f0833999-8c58-4f00-8389-0a3f938641f3
const REUTERS_LOSE = "d136c88c-8816-4727-b15d-a80b96f0f57b"; // keep 4de1e28e-f221-40fd-818b-f5382533caa0
const ECTA_LOSE = "29132ca6-9172-45ab-95c2-e7fd7b8aa62a";    // keep 58bf0406-3be9-45bd-a2c8-b7c9d0b5c1a4
const AFIR_KEEP = "62ba40b0-f03e-4f2b-a3c1-0bc199880eea";
const AFIR_MISLABELED = "6b0939a5-30fe-4afe-88d5-26d6b96bb752";
const AFIR_THIRD = "ff95b385-6cb2-453a-94e6-b9fc84d7f851";
const AFIR_TRUE_TITLE = "Alternative Fuels Infrastructure Regulation (AFIR) — Regulation (EU) 2023/1804 [duplicate of the primary AFIR item]";
const SG_MPA = "44906e93-07a5-4b4c-8b3d-508b39ae605b";
const SG_MAS = "64e9d38d-75bf-4fc3-b946-eebff05a0d6a";

const ARCHIVE_SET = [PPWR_LOSE, CSRD_LOSE, REUTERS_LOSE, ECTA_LOSE, AFIR_MISLABELED, AFIR_THIRD];

async function main() {
  console.log(`\ndedup-2026-07-07-enact — ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  // Stale-premise guard: every touched row must exist, unarchived, before writes.
  const rows = await readAll("intelligence_items", "id, title, provenance_status, is_archived, source_url", {
    match: (q) => q.in("id", [PPWR_KEEP, AFIR_KEEP, SG_MPA, SG_MAS, ...ARCHIVE_SET]),
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of [PPWR_KEEP, AFIR_KEEP, SG_MPA, SG_MAS, ...ARCHIVE_SET]) {
    const r = byId.get(id);
    if (!r) throw new Error(`stale premise: ${id} not found`);
    if (r.is_archived) throw new Error(`stale premise: ${id} already archived`);
  }
  if (byId.get(AFIR_KEEP).provenance_status !== "verified")
    throw new Error("survivor-verified rule violated: AFIR survivor is not verified");
  console.log("stale-premise guard: all 10 rows present, unarchived; AFIR survivor verified ✓\n");

  if (!EXECUTE) {
    console.log("WOULD: adopt canonical ELI URL onto PPWR survivor efdb3390");
    console.log(`WOULD: re-type AFIR mislabeled 6b0939a5 title → "${AFIR_TRUE_TITLE}"`);
    console.log(`WOULD: archive 6 losers as duplicate_instrument: ${ARCHIVE_SET.map((i) => i.slice(0, 8)).join(", ")}`);
    console.log("WOULD: insert xref edge 44906e93 (MPA) → 64e9d38d (MAS), relationship=related, origin=manual");
    console.log("\ndry-run complete — pass --execute to enact.");
    return;
  }

  // 1. PPWR survivor adopts the canonical ELI URL (the one thing the loser had better).
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", PPWR_KEEP), { source_url: PPWR_CANONICAL_ELI }, { cite });
  console.log("PPWR survivor efdb3390: source_url → canonical ELI ✓");

  // 2. AFIR: cure the label defect FIRST (re-type to true instrument identity), never delete on a label.
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", AFIR_MISLABELED), { title: AFIR_TRUE_TITLE }, { cite });
  console.log("AFIR 6b0939a5: mislabel cured (re-typed to true AFIR identity) ✓");

  // 3. Archive the six confirmed twins (guarded; snapshots + read-back inside archiveRows).
  await archiveRows("intelligence_items", ARCHIVE_SET, { cite, archive_reason: "duplicate_instrument" });
  console.log(`archived ${ARCHIVE_SET.length} duplicate twins (duplicate_instrument) ✓`);

  // 4. Singapore: keep both, wire the complementary-instrument edge.
  await guardedInsert("item_cross_references", {
    source_item_id: SG_MPA, target_item_id: SG_MAS, relationship: "related", origin: "manual",
  }, { cite });
  console.log("Singapore MPA↔MAS xref edge inserted (keep-both, two-agency pattern) ✓");

  console.log("\nDONE — read-backs verified by the guarded helpers. Survivor map in the deletion log.");
}

main().catch((err) => { console.error(err); process.exit(1); });
