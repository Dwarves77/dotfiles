/** Unit B data dispositions (operator ruling 2026-07-13, flag-system). GOVERNING SKILL: remediation-discipline.
 *  Guarded writes ONLY (snapshot + cite + reversibility). Idempotent: touches status='open' rows only, so a
 *  re-run is a no-op. Every closure carries resolved_by + resolved_at + resolution_note (null-note forbidden).
 *  --apply writes; default is DRY-RUN (counts only). Env: .env.local (service-role). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readAll, guardedUpdate, guardedInsert } = await import("./lib/db.mjs");
const APPLY = process.argv.includes("--apply");
const nowIso = new Date().toISOString();
const cite = (reason) => ({ skill: "remediation-discipline", reason });

async function openFlags(created_by) {
  return readAll("integrity_flags", "id,subject_ref,subject_type,description,status,recommended_actions",
    { match: (q) => q.eq("created_by", created_by).eq("status", "open") });
}
async function closeIds(ids, resolved_by, note, reason) {
  if (!ids.length) return 0;
  if (!APPLY) return ids.length;
  await guardedUpdate("integrity_flags", (q) => q.in("id", ids),
    { status: "resolved", resolved_by, resolved_at: nowIso, resolution_note: note }, { cite: cite(reason) });
  return ids.length;
}
const report = {};

// ── (item 1 tail) 119 null_orgId seed-fallback flags — anonymous public-page renders, mis-filed as data_integrity;
// producer already fixed in #304 to route these to telemetry. Close the already-filed rows. ──
{
  const f = await openFlags("seed-fallback-trigger");
  const ids = f.filter((r) => /null_orgId/.test(r.description || "")).map((r) => r.id);
  report.null_orgId = await closeIds(ids, "seed-fallback-reclassify-2026-07-13",
    "Reclassified: null_orgId is an anonymous / no-org render of a public page (homepage), NOT an integrity violation — expected traffic mis-filed as data_integrity. Producer fixed in #304 (routed to console telemetry). Closed as not-an-integrity-flag.",
    "flag-system item 1 tail: close the 119 mis-filed null_orgId seed-fallback flags (producer fixed #304).");
}

// ── (item 4) HISTORICAL TERMINALS — honest closures with recorded reasons ──
{
  // exhaustion_record (26): self-declared "Interim FLAG-PATTERN store, superseded by migration 147".
  const f = await openFlags("exhaustion_record");
  report.exhaustion_record = await closeIds(f.map((r) => r.id), "superseded-by-mig-147-2026-07-13",
    "Interim FLAG-PATTERN transport-exhaustion store, superseded by migration 147 (self-declared in the flag). Closed as superseded-by-147 residue; the pattern is retired.",
    "flag-system item 4: exhaustion_record closed as superseded-by-147.");
}
{
  // b-audit-2026-05-29 UNADJUDICABLE subset: s15 fabricated-URL flags whose evidence was WIPED post-archive.
  const f = await openFlags("b-audit-2026-05-29");
  const ids = f.filter((r) => /UNADJUDICABLE/i.test(r.description || "")).map((r) => r.id);
  report.b_audit_unadjudicable = await closeIds(ids, "evidence-destroyed-unadjudicable-2026-07-13",
    "s15 fabricated-URL audit flag whose citations were WIPED post-archive — cannot be re-verified (evidence destroyed). Closed as evidence-destroyed-unadjudicable; any item restore is #43-gated (regeneration re-creates checkable citations).",
    "flag-system item 4: b-audit unadjudicable subset closed as evidence-destroyed.");
}

// ── (item 7 / FMC-1b) keep A/B/C; complete the xref web (B<->C, A<->C); close recon flags; mint vocab-gap item. ──
const B = "7ae06612-5467-40ca-a9b3-e6dc14601b44", A = "7ae77ef8-211a-4f20-ad88-341c8dcdae65", C = "6b55b53d-f383-453a-a029-707b86b80013";
{
  // existing edges (avoid dup inserts)
  const xr = await readAll("item_cross_references", "source_item_id,target_item_id",
    { match: (q) => q.in("source_item_id", [A, B, C]) });
  const has = new Set(xr.map((r) => `${r.source_item_id}->${r.target_item_id}`));
  const want = [[B, C], [A, C]]; // B<->A already exists (manual related)
  const toAdd = want.filter(([s, t]) => !has.has(`${s}->${t}`) && !has.has(`${t}->${s}`));
  let added = 0;
  if (APPLY) {
    for (const [s, t] of toAdd) {
      await guardedInsert("item_cross_references", { source_item_id: s, target_item_id: t, relationship: "related", origin: "manual" },
        { cite: cite("flag-system item 7 / FMC-1b: complete same-entity xref web (only 'related' in vocab; vocab gap flagged separately).") });
      added++;
    }
  } else { added = toAdd.length; }
  report.fmc_xrefs_added = added;

  // close the FMC reconciliation flags
  const rf = await openFlags("reconciliation-remediation-2026-07-10");
  report.fmc_recon_closed = await closeIds(rf.map((r) => r.id), "fmc-1b-2026-07-13",
    "FMC ruled Option 1b (keep A/B/C; same-entity, NOT duplication). Subsumption check found C's 25 claims 0/25 shared with B — archiving C would drop 25 grounded claims + a distinct WEF source. Kept all three; completed the xref web (B-C, A-C). Near-miss recorded: the original 'x2 merge-owed' framing assumed content-duplication that did not exist.",
    "flag-system item 7: close FMC recon flags as same-entity-kept-both-xref-completed.");

  // vocab-gap: same-entity vs topically-related is an entity-layer item (surface should render ONE initiative,
  // two source angles, not three unrelated cards). Mint ONE flag (idempotent by subject_ref+created_by).
  if (APPLY) {
    const existing = await readAll("integrity_flags", "id",
      { match: (q) => q.eq("created_by", "xref-vocab-gap").eq("subject_ref", "item_cross_references.relationship") });
    if (!existing.length) {
      await guardedInsert("integrity_flags", {
        category: "data_quality", subject_type: "system", subject_ref: "item_cross_references.relationship",
        description: "xref relationship vocabulary lacks a SAME-ENTITY class distinct from topically-'related'. FMC A/B/C are one entity (two source angles) but can only be linked as 'related'; the surface should eventually render one initiative, not three unrelated cards. Entity-layer item.",
        recommended_actions: [{ action: "add a same-entity relationship value to the xref vocabulary + a surface rollup that renders same-entity items as one", rationale: "FMC-1b surfaced it; distinguishes same-entity from topical relatedness" }],
        status: "open", created_by: "xref-vocab-gap",
      }, { cite: cite("flag-system item 7: record the same-entity-vs-related vocab gap as an entity-layer item.") });
      report.vocab_gap_flag = "minted";
    } else { report.vocab_gap_flag = "exists"; }
  } else { report.vocab_gap_flag = "would-mint"; }
}

console.log(`[close-flag-system-unit-b] ${APPLY ? "APPLIED" : "DRY-RUN"}:`, JSON.stringify(report, null, 1));
// read-back
if (APPLY) {
  const stillOpen = {};
  for (const cb of ["exhaustion_record", "reconciliation-remediation-2026-07-10"]) {
    stillOpen[cb] = (await openFlags(cb)).length;
  }
  const no = (await openFlags("seed-fallback-trigger")).filter((r) => /null_orgId/.test(r.description || "")).length;
  console.log(`[read-back] null_orgId still open: ${no} (expect 0); exhaustion_record open: ${stillOpen.exhaustion_record} (expect 0); fmc recon open: ${stillOpen["reconciliation-remediation-2026-07-10"]} (expect 0).`);
}
