/**
 * Wave-α Track C7.3 — guarded duplicate/twin merges (items + sources).
 *
 * GOVERNING SKILLS: remediation-discipline (RD-4 archive-as-disposition; class-over-instance dedup) +
 * source-credibility-model (source-registry dedup, provenance edge re-point) + environmental-policy-and-
 * innovation (same-instrument twin identity, EP-11).
 *
 * WHAT IT DOES (all through the guarded db.mjs path — cite + prior-value snapshot + read-back; idempotent):
 *   A. ITEM TWINS  — archives the dup-loser item (is_archived + archive_reason='duplicate_instrument');
 *      the verified keeper is NEVER touched, so its provenance_status is preserved (proven: 5cc10a6d is
 *      verified+archived — archiving does not re-quarantine). Skips a loser already archived (idempotent).
 *   B. SOURCE URL-DUPS — for each keeper/twin pair (same normalized URL, same institution, same tier),
 *      RE-POINTS every referencing edge (provenance claims, citations, the item's source_id, agent_runs,
 *      fetches, …) from twin -> keeper, THEN suspends the twin (status='suspended'). Order matters: edges
 *      move first so no live row is left pointing at a suspended source. Bias tags are deliberately left on
 *      the twin (the keeper has its own set; moving them would duplicate).
 *   C. ECOVADIS — 5 same-institution rows collapse to the canonical root (4a956756); the 4 others re-point
 *      to it. The Sprint-3 sweep POLICY (pause the tier-6 vendor + re-ground its claims) is flagged as a
 *      RULING, not auto-applied.
 *
 * DRY-RUN by default (prints exactly what each step would move/archive); --apply writes + appends the
 * deletion-reclassification-log. The orchestrator runs it --apply in the gated main session.
 *
 * FRESH EVIDENCE (read-only, 2026-07-11, project kwrsbpiseruzbfwjpvsp) — see the report; the register's
 * "PPWR both-verified two LIVE rows" and 2 other twin pairs were ALREADY merged 2026-07-07
 * (archive_reason='duplicate_instrument'); this script carries only what is still live-unmerged.
 *
 * Rule-012: import.meta.url-relative paths, no hardcoded home dir.
 */
import { appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate, archiveRows, readClient } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
// EcoVadis is entity-level dedup entangled with the Sprint-3 sweep POLICY (pause the tier-6 vendor) — a
// source-credibility/operator ruling, NOT a mechanical URL-dup. Held out of the auto-apply set; the
// orchestrator opts in with --include-ecovadis AFTER the pause ruling.
const INCLUDE_ECOVADIS = process.argv.includes("--include-ecovadis");
const LOG = resolve(ROOT, "..", "docs", "ops", "deletion-reclassification-log.md");

const CITE = {
  skill: "remediation-discipline",
  reason: "Wave-α C7.3 guarded duplicate/twin merge (items archive_reason=duplicate_instrument; source edge re-point + suspend)",
};

// ── A. ITEM TWINS (auto-merge set) ────────────────────────────────────────────────────────────────
// ONLY the clean case: keeper VERIFIED, loser quarantined, loser carries 0 cross-references. Both derive
// canonical key 32019R1242 (proven). The both-quarantined pairs are NEEDS-RULING (below), not here.
const ITEM_TWIN_MERGES = [
  {
    instrument: "HDV CO2 2019/1242 (CELEX 32019R1242)",
    keepId: "ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7",   // verified, instr 2019/1242
    loseId: "b7736a1a-2c81-4d58-87b4-ee09330eaff2",   // quarantined, instr eli/reg/2019/1242/oj, xrefs=0
    reason: "duplicate_instrument",
  },
];

// ── NEEDS RULING — item twins NOT in the auto-merge set (both-quarantined; keeper direction is a DB-1 call) ──
const NEEDS_RULING_ITEM_TWINS = [
  { instrument: "FuelEU Maritime 2023/1805 (CELEX 32023R1805)", rows: "7a0ead55 (quarantined, 49 claims/62KB/20 timelines) vs e4d84c60 (quarantined, 32 claims/39KB, 13 cits, 3 xrefs)", note: "both quarantined; richer-grounding (7a0ead55) vs more-citations/xrefs (e4d84c60) — keeper direction + a 3-xref re-point is a judgment call." },
  { instrument: "HDV CO2 amendment 2024/1610 (CELEX 32024R1610)", rows: "3ae89ce6 (quarantined, 45 claims/64KB, source=climate.ec.europa.eu SUMMARY page, canonical key UNDERIVABLE) vs 8c186db2 (quarantined, 7 claims, source=eur-lex ELI ENACTED, key 32024R1610)", note: "richness-vs-source-authority conflict; 3ae89ce6 has no derivable canonical key. DB-1 item-domain call." },
];

// ── B. SOURCE URL-DUPS (auto-merge set) — resolved by 8-char id prefix at runtime ─────────────────
// keep = the active canonical row; twins = same-URL dup registrations to retire (suspend after re-point).
const SOURCE_DUP_MERGES = [
  { group: "breeam.com",             keep: "ef347aa7", twins: ["dcb667a7"] },
  { group: "climate-laws.org",       keep: "7d939fc1", twins: ["410466f8"] },
  { group: "climatemachine.mit.edu", keep: "622d0e55", twins: ["addc7d05"] },
  { group: "csrf.ac.uk",             keep: "071dff9e", twins: ["c096820c", "70de33a1"] }, // 70de33a1 = provisional, 0 edges
  { group: "doee.dc.gov",            keep: "5f12cb79", twins: ["b2c71c2c"] },              // twin active, 0 edges
  { group: "flk.npc.gov.cn",         keep: "dae165c8", twins: ["b4b04ad0"] },              // twin active, carries 1 item
  { group: "freightwaves.com",       keep: "111c637d", twins: ["de15227a"] },             // twin suspended, 0 edges (bias only)
  { group: "splash247.com",          keep: "b2588399", twins: ["295fba96"] },
];

// ── C. ECOVADIS (auto-merge the dedup; the pause is a RULING) ─────────────────────────────────────
const ECOVADIS_MERGE = { group: "ecovadis.com (institution-level)", keep: "4a956756", twins: ["4fdb662c", "a6b20a8a", "a2d25d50", "6f698bf0"] };

// Every source-referencing edge column (public schema, verified via information_schema 2026-07-11).
// source_bias_tags is intentionally EXCLUDED (keeper keeps its own bias set; re-pointing duplicates).
const SOURCE_EDGE_COLUMNS = [
  ["section_claim_provenance", "source_id"],
  ["intelligence_item_citations", "source_id"],
  ["intelligence_items", "source_id"],
  ["agent_runs", "source_id"],
  ["raw_fetches", "source_id"],
  ["source_verifications", "resulting_source_id"],
  ["source_trust_events", "source_id"],
  ["monitoring_queue", "source_id"],
  ["pending_first_fetch", "source_id"],
  ["staged_updates", "source_id"],
  ["notification_events", "source_id"],
  ["regional_data_facts", "source_id"],
  ["state_cost_facts", "source_id"],
  ["portal_link_candidates", "source_id"],
  ["ingest_rejections", "source_id"],
  ["canonical_source_candidates", "current_source_id"],
  ["canonical_source_candidates", "promoted_to_source_id"],
  ["provisional_sources", "cited_by_source_id"],
  ["provisional_sources", "promoted_to_source_id"],
  ["source_citations", "citing_source_id"],
  ["source_citations", "cited_source_id"],
  ["source_tier_opinions", "opining_source_id"],
  ["source_tier_opinions", "target_source_id"],
  ["source_conflicts", "resolved_by_source_id"],
];

const logLines = [];

async function countRefs(table, col, id) {
  const { count, error } = await readClient().from(table).select("*", { count: "exact", head: true }).eq(col, id);
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}

async function repointEdges(fromId, toId, label) {
  let moved = 0;
  for (const [table, col] of SOURCE_EDGE_COLUMNS) {
    const c = await countRefs(table, col, fromId);
    if (c.error) { console.warn(`   ! ${table}.${col} count error: ${c.error} (skipped)`); continue; }
    if (!c.count) continue;
    if (!APPLY) { console.log(`   would re-point ${c.count.toString().padStart(3)}  ${table}.${col}`); moved += c.count; continue; }
    try {
      const res = await guardedUpdate(table, (qb) => qb.eq(col, fromId), { [col]: toId }, { cite: CITE });
      console.log(`   re-pointed ${String(res.updated).padStart(3)}  ${table}.${col}`);
      moved += res.updated;
    } catch (e) {
      console.error(`   ! ${table}.${col} re-point FAILED (${e.message}) — likely a (item,source) unique collision where the item already cites the keeper; resolve the twin edge manually. NOT aborting.`);
    }
  }
  console.log(`   ${label}: ${APPLY ? "re-pointed" : "would re-point"} ${moved} edge row(s) total`);
  return moved;
}

async function mergeSourceGroup(sources, { group, keep, twins }, tag) {
  const byPrefix = (p) => sources.find((s) => s.id.slice(0, 8) === p);
  const keeper = byPrefix(keep);
  if (!keeper) { console.error(`[merge] ${group}: keeper ${keep} NOT FOUND — skipping`); return; }
  console.log(`\n[${tag}] ${group} — keep ${keeper.id.slice(0, 8)} (${keeper.status}) "${(keeper.name || "").slice(0, 32)}"`);
  for (const tp of twins) {
    const twin = byPrefix(tp);
    if (!twin) { console.log(`   twin ${tp}: not found (already removed?) — skip [idempotent]`); continue; }
    if (twin.id === keeper.id) { console.log(`   twin ${tp}: == keeper — skip`); continue; }
    console.log(`   twin ${twin.id.slice(0, 8)} (${twin.status}) "${(twin.name || "").slice(0, 32)}"`);
    await repointEdges(twin.id, keeper.id, `   twin ${tp}`);
    if (twin.status === "suspended") {
      console.log(`   twin ${tp}: already suspended — status unchanged [idempotent]`);
    } else if (!APPLY) {
      console.log(`   would suspend twin ${tp} (status ${twin.status} -> suspended)`);
    } else {
      await guardedUpdate("sources", (qb) => qb.eq("id", twin.id), { status: "suspended" }, { cite: CITE });
      console.log(`   suspended twin ${tp}`);
    }
    logLines.push(`- ${new Date().toISOString()} · source-dup · KEEP ${keeper.id.slice(0, 8)} <- ARCHIVE(suspend) ${twin.id.slice(0, 8)} · ${group} · edges re-pointed to keeper · Wave-α C7.3`);
  }
}

async function main() {
  console.log(`[c7.3-merge] mode = ${APPLY ? "APPLY" : "DRY-RUN"}\n=== A. ITEM TWINS (archive_reason=duplicate_instrument) ===`);
  const items = await readAll("intelligence_items", "id, title, provenance_status, is_archived");
  const itemById = (id) => items.find((r) => r.id === id);
  for (const m of ITEM_TWIN_MERGES) {
    const keep = itemById(m.keepId), lose = itemById(m.loseId);
    if (!keep) { console.error(`[merge] ${m.instrument}: KEEPER missing — skip`); continue; }
    if (!lose) { console.log(`[merge] ${m.instrument}: loser missing — skip [idempotent]`); continue; }
    console.log(`\n${m.instrument}\n   keep ${keep.id.slice(0, 8)} (${keep.provenance_status}) | archive ${lose.id.slice(0, 8)} (${lose.provenance_status})`);
    if (lose.is_archived) { console.log(`   loser already archived — skip [idempotent]`); continue; }
    if (!APPLY) { console.log(`   would archive ${lose.id.slice(0, 8)} (reason=${m.reason})`); continue; }
    await archiveRows("intelligence_items", [lose.id], { cite: CITE, archive_reason: m.reason });
    const after = await readClient().from("intelligence_items").select("provenance_status").eq("id", keep.id).single();
    console.log(`   archived loser; keeper provenance_status now = ${after.data?.provenance_status} (must be unchanged)`);
    logLines.push(`- ${new Date().toISOString()} · item-twin · KEEP ${keep.id.slice(0, 8)} <- ARCHIVE ${lose.id.slice(0, 8)} · ${m.instrument} · archive_reason=${m.reason} · Wave-α C7.3`);
  }

  console.log(`\n=== NEEDS RULING — item twins NOT auto-merged (report only) ===`);
  for (const n of NEEDS_RULING_ITEM_TWINS) console.log(`   ${n.instrument}\n      ${n.rows}\n      -> ${n.note}`);

  console.log(`\n=== B. SOURCE URL-DUPS (re-point edges twin->keeper, then suspend twin) ===`);
  const sources = await readAll("sources", "id, url, name, status, base_tier");
  for (const g of SOURCE_DUP_MERGES) await mergeSourceGroup(sources, g, "src-dup");

  console.log(`\n=== C. ECOVADIS (institution-level dedup 5->1) — NEEDS RULING ===`);
  console.log(`   RULING (why held): the survivor 4a956756 grounds 11 claims at tier-6 (commercial vendor); the 5 rows are DIFFERENT vendor pages (root/about/blog/whitepapers), not exact-URL dups. The Sprint-3 source-quality sweep posture (EcoVadis-style vendor marketing -> pause + re-ground its claims) is a source-credibility/operator decision. Dedup-then-pause is valid, but which page is canonical + whether to pause is a ruling.`);
  if (INCLUDE_ECOVADIS) {
    console.log(`   --include-ecovadis set: performing the 5->1 dedup (keeper 4a956756). Pause remains a separate ruling.`);
    await mergeSourceGroup(sources, ECOVADIS_MERGE, "ecovadis");
  } else {
    console.log(`   HELD — pass --include-ecovadis to run the 5->1 dedup after the pause ruling. (Skipped; not in the auto-apply set.)`);
  }

  if (APPLY && logLines.length) {
    appendFileSync(LOG, `\n### ${new Date().toISOString().slice(0, 10)} · Wave-α C7.3 guarded duplicate/twin merges\n\n${logLines.join("\n")}\n`);
    console.log(`\n[c7.3-merge] appended ${logLines.length} line(s) to ${LOG}`);
  }
  console.log(`\n[c7.3-merge] ${APPLY ? "APPLY complete" : "DRY-RUN complete — pass --apply to write"}.`);
}

main().catch((e) => { console.error("[c7.3-merge] fatal:", e); process.exit(1); });
