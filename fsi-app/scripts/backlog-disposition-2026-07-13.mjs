// BACKLOG DISPOSITION + STALE-VERIFIED BACKFILL (operator ruling 2026-07-13). GOVERNING SKILL:
// remediation-discipline (§2.1/2.2 quarantine-is-an-open-investigation; deferral = dispositioning-as-blocked).
//
// Guarded + attributed writes; dry-run by default, --apply to execute; per-section read-back verification.
// The disposition applies the operator's ruled classes to the LIVE partition (which diverged from the
// ruling's stale assumptions — see the PR body's judgment log). Every past-bound/expired flag ends in EXACTLY
// one state: RD-28-held, quarantined-item-exempt (flag follows item, owned by quarantine-disposition-audit),
// closed-with-attributed-reason, or valid-deferral-with-reopener.
//
// Usage: node fsi-app/scripts/backlog-disposition-2026-07-13.mjs [--apply]
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate, guardedInsert, guardedDelete } from "./lib/db.mjs";
import { isValidDeferral, isValidRenewal } from "./lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const NOW = new Date();
const nowIso = NOW.toISOString();
const BOUND_MS = 30 * 86_400_000;
const say = (...a) => console.log(...a);
const SKILLCONF = new Set(["skill-conformance-audit", "skill-conformance-semantic"]);

// The register-step / next-sanctioned-grounding-run reopener (built go-forward as SC-13 / PR #309).
const REOPENER = {
  owner: "operator (Jason) — the sanctioned grounding run",
  reason: "Blocked on the next sanctioned grounding run: item quarantined on null-tier / sub-floor FACT grounding. The SC-13 register-at-grounding re-ground (PR #309) registers the span host at a deterministic tier and re-grounds from the stored pool; awaits GROUNDING_ACQUIRE_ENABLED ON (operator-fired) + the grounding pass. Disposition path: re-ground / register.",
  deferred_until: "2026-10-31T00:00:00.000Z",
  resolution_event: "next sanctioned grounding run (acquire-lock ON, pre-logged I2): SC-13 register-at-grounding re-ground per PR #309",
};
{ const v = isValidDeferral(REOPENER, NOW); if (!v.ok) { console.error(`FATAL: reopener payload invalid — ${v.error}`); process.exit(1); } }

// ── READ the live landscape ──────────────────────────────────────────────────────────────────────────
const flags = await readAll("integrity_flags", "id,created_by,subject_type,subject_ref,status,recommended_actions,created_at,description",
  { match: (q) => q.eq("status", "open") });
const items = await readAll("intelligence_items", "id,provenance_status,is_archived");
const itemById = new Map(items.map((r) => [r.id, r]));
const liveQuarantined = new Set(items.filter((r) => !r.is_archived && r.provenance_status === "quarantined").map((r) => r.id));

const ageMs = (f) => NOW.getTime() - Date.parse(f.created_at);
const isRd28 = (f) => Array.isArray(f.recommended_actions) && f.recommended_actions.some((a) => a && a.hold_class === "rd28-resting-state");
const pastBound = flags.filter((f) => ageMs(f) > BOUND_MS && f.created_by !== "disposition_deferred"
  && !isRd28(f) && !["register-step-gap", "data-audit-lane"].includes(f.created_by));

// Classify each past-bound flag. is_archived is PRIMARY: an archived item is terminally dispositioned
// (archive is a valid disposition per quarantine-disposition-audit), so its stale open flags CLOSE.
const classes = { rd28: [], quarantinedExempt: [], closeArchived: [], closeDeleted: [], closeSeed: [], closeEntity: [], other: [] };
for (const f of pastBound) {
  const item = f.subject_type === "item" ? itemById.get(f.subject_ref) : null;
  if (f.created_by === "seed-fallback-trigger") { classes.closeSeed.push(f); continue; }
  if (f.created_by === "entity-gate-2026-06-01") { classes.closeEntity.push(f); continue; }
  if (f.subject_type === "item" && !item) { classes.closeDeleted.push(f); continue; }         // deleted subject
  if (f.subject_type === "item" && item.is_archived) { classes.closeArchived.push(f); continue; } // archived = dispositioned
  if (f.subject_type === "item" && liveQuarantined.has(f.subject_ref)) { classes.quarantinedExempt.push(f); continue; }
  if (SKILLCONF.has(f.created_by) && item && item.provenance_status === "verified") { classes.rd28.push(f); continue; }
  classes.other.push(f);
}

say(`\n== LIVE PARTITION (past-bound=${pastBound.length}) ==`);
say(`  RD-28-held (skill-conformance on verified):     ${classes.rd28.length}`);
say(`  quarantined-item exempt (live, flag follows item): ${classes.quarantinedExempt.length}`);
say(`  close: archived-item (dispositioned via archive):  ${classes.closeArchived.length}`);
say(`  close: deleted-subject:                          ${classes.closeDeleted.length}`);
say(`  close: seed-fallback (superseded by Unit A):     ${classes.closeSeed.length}`);
say(`  close: entity-gate (folded into review batch):   ${classes.closeEntity.length}`);
say(`  OTHER (fits-neither — LOG per item):             ${classes.other.length}`);
for (const f of classes.other) say(`    [OTHER] ${f.id} cb=${f.created_by} st=${f.subject_type} item_status=${f.subject_type === "item" ? (itemById.get(f.subject_ref)?.provenance_status ?? "deleted") : "-"}`);

// ── Deferral coverage for live-quarantined items underlying past-bound flags ───────────────────────────
const deferredFlags = flags.filter((f) => f.created_by === "disposition_deferred" && f.subject_type === "item");
const deferByItem = new Map(); // latest deferral per item
for (const f of deferredFlags) {
  const du = f.recommended_actions?.[0]?.deferral?.deferred_until;
  const t = du ? Date.parse(du) : NaN;
  const prev = deferByItem.get(f.subject_ref);
  if (!prev || (Number.isFinite(t) && t > (prev.until ?? -Infinity))) deferByItem.set(f.subject_ref, { flag: f, until: t });
}
const isExpired = (t) => Number.isNaN(t) || t <= NOW.getTime();

// (a) live-quarantined items carrying a past-bound flag: ensure a valid deferral (create if none).
const qItemsWithPastbound = new Set(classes.quarantinedExempt.map((f) => f.subject_ref));
const createDeferral = [];
for (const itemId of qItemsWithPastbound) if (!deferByItem.has(itemId)) createDeferral.push(itemId);

// (b) disposition_deferred flags. If the item is LIVE-quarantined: renew (expired) or leave (valid future).
//     Otherwise the deferral is MOOT (item archived / deleted / recovered-to-verified) and CLOSES — regardless
//     of expiry (a valid-future deferral on a deleted subject is deferral-hygiene rot too, not just expired ones).
const renewDeferral = [], closeDeferred = [], leaveDeferral = [];
for (const f of deferredFlags) {
  const item = itemById.get(f.subject_ref);
  const liveQ = item && !item.is_archived && item.provenance_status === "quarantined";
  if (!liveQ) { closeDeferred.push(f); continue; } // moot: archived / deleted / verified
  const du = f.recommended_actions?.[0]?.deferral?.deferred_until;
  if (isExpired(du ? Date.parse(du) : NaN)) renewDeferral.push({ flag: f, prevReason: f.recommended_actions?.[0]?.deferral?.reason });
  else leaveDeferral.push(f);
}

say(`\n== DEFERRALS (grounding reopener) ==`);
say(`  create (live-quarantined, no deferral):        ${createDeferral.length}`);
say(`  renew  (expired, item live-quarantined):       ${renewDeferral.length}`);
say(`  close  (expired, item archived/deleted/verified): ${closeDeferred.length}`);
say(`  leave  (valid future deferral):                ${leaveDeferral.length}`);

// ── Guessed-5 registry batch (FK-safe surface; sources are DELETE-protected + base_tier NOT NULL) ──────
const g5 = (await readAll("sources", "id,url,name,base_tier,status,auto_run_enabled"))
  .filter((s) => s.base_tier === 5 && s.status === "provisional" && s.auto_run_enabled === false);
say(`\n== GUESSED-5 REGISTRY BATCH ==  ${g5.length} rows -> one review-batch flag (no mutation of FK-referenced sources)`);

if (!APPLY) { say("\nDRY-RUN (no --apply). No writes performed."); process.exit(0); }

// ══════════════════════════════ APPLY ══════════════════════════════
let ok = true;
const cite = (reason) => ({ skill: "remediation-discipline", reason });

// A. Backfill: archived + verified -> unverified (root-cause consistency; the stale-verified cache).
// BEST-EFFORT: the mig-43 provenance-binding trigger re-validates on any provenance write and requires the
// BOUND RECONCILER CREDENTIAL to flip an item's provenance (service_role is not authorized). That credential
// is the known standing blocker (broken post-mig-157; operator DDL window owed). If the backfill is
// credential-blocked, REPORT it and continue — the root-cause CODE fix (archivePatch) still lands go-forward,
// and the backfill runs when the reconciler credential is restored. Part B (integrity_flags) is unaffected.
{
  const targets = items.filter((r) => r.is_archived && r.provenance_status === "verified").map((r) => r.id);
  if (!targets.length) say("A. backfill: 0 archived-verified (already clean).");
  else {
    try {
      const r = await guardedUpdate("intelligence_items", (qb) => qb.in("id", targets),
        { provenance_status: "unverified" }, { cite: cite("Part A backfill: archived items must not retain provenance_status=verified (stale-verified cache; archive is terminal, out of the customer gate). Reset off verified.") });
      const check = await readAll("intelligence_items", "id", { match: (q) => q.eq("is_archived", true).eq("provenance_status", "verified") });
      say(`A. backfill archived-verified: updated=${r.updated} target=${targets.length}; remaining archived+verified=${check.length} ${check.length === 0 ? "PASS" : "FAIL"}`);
      ok = ok && r.updated === targets.length && check.length === 0;
    } catch (e) {
      say(`A. backfill BLOCKED (${targets.length} archived+verified rows): ${String(e.message).split("\n")[0].slice(0, 160)}`);
      say(`   -> reconciler-credential DDL window owed (standing blocker); the root-cause archivePatch fix lands go-forward; backfill re-runs when the cred is restored.`);
      // NOT a hard failure of the unit — Part B proceeds; this is a named operator-awaited item.
    }
  }
}

// B-a. RD-28-held mint on skill-conformance flags over VERIFIED items (preserve existing actions + add marker).
{
  let n = 0;
  for (const f of classes.rd28) {
    const existing = Array.isArray(f.recommended_actions) ? f.recommended_actions : [];
    const ra = [...existing, { hold_class: "rd28-resting-state", action: "hold", rationale: "Skill-conformance residue on a VERIFIED (resting-state) item — held; reopens on change-evidence or a contract-version migration (same class as the 65 held-mints, Unit B)." }];
    const r = await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id), { recommended_actions: ra },
      { cite: cite("Part B-2a: skill-conformance on a verified resting-state item -> RD-28-held (held-with-reopener).") });
    n += r.updated;
  }
  say(`B-a. RD-28-held mint: ${n}/${classes.rd28.length}`);
  ok = ok && n === classes.rd28.length;
}

// B-b/c/d. Close: deleted-subject + seed-fallback + entity-gate (attributed).
async function closeFlags(list, note) {
  if (!list.length) return 0;
  const r = await guardedUpdate("integrity_flags", (qb) => qb.in("id", list.map((f) => f.id)),
    { status: "resolved", resolved_by: "backlog-disposition-2026-07-13", resolved_at: nowIso, resolution_note: note },
    { cite: cite(`Part B close: ${note}`) });
  return r.updated;
}
{
  const nArch = await closeFlags(classes.closeArchived, "Subject intelligence_item is ARCHIVED (is_archived=true) — a terminal disposition (archive/reclassify/erase per quarantine-disposition-audit). The stale open flag follows the item to closed.");
  const nDel = await closeFlags(classes.closeDeleted, "Subject intelligence_item was hard-deleted — the flag is orphaned (deleted-subject rot). Closed with attribution.");
  const nSeed = await closeFlags(classes.closeSeed, "Seed-fallback producer defect fixed in Unit A (#304): null_orgId anonymous public-page renders route to telemetry, never a flag. These pre-fix flags are superseded.");
  const nEnt = await closeFlags(classes.closeEntity, "Entity-gate first-fetch UNCERTAIN (source classification) — folded into the guessed-5 source-review batch flag for operator classification; standalone flag closed.");
  say(`B-b close archived-item:   ${nArch}/${classes.closeArchived.length}`);
  say(`B-b close deleted-subject: ${nDel}/${classes.closeDeleted.length}`);
  say(`B-c close seed-fallback:   ${nSeed}/${classes.closeSeed.length}`);
  say(`B-d close entity-gate:     ${nEnt}/${classes.closeEntity.length}`);
  ok = ok && nArch === classes.closeArchived.length && nDel === classes.closeDeleted.length && nSeed === classes.closeSeed.length && nEnt === classes.closeEntity.length;
}

// B-e/f. Deferrals with the grounding reopener: create (missing) + renew (expired, live) + close (moot).
{
  let created = 0, renewed = 0, rejected = 0, closedD = 0;
  for (const itemId of createDeferral) {
    const r = await guardedInsert("integrity_flags", {
      category: "data_quality", subject_type: "item", subject_ref: itemId, status: "open", created_by: "disposition_deferred",
      description: "Quarantined item deferred pending the next sanctioned grounding run (SC-13 register-at-grounding re-ground, PR #309).",
      recommended_actions: [{ deferral: REOPENER }],
    }, { cite: cite("Part B-1: register-gap/quarantined item with no deferral -> dispositioned-as-blocked with the register-step re-ground reopener.") });
    if (r.inserted) created++;
  }
  for (const { flag: f, prevReason } of renewDeferral) {
    const v = isValidRenewal(REOPENER, prevReason, NOW);
    if (!v.ok) { rejected++; say(`  [renew-REJECTED] ${f.id}: ${v.error.slice(0, 80)}`); continue; }
    const r = await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id), { recommended_actions: [{ deferral: REOPENER }] },
      { cite: cite("Part B-3: expired deferral renewed with a NEW blocker/reopener (the sanctioned grounding run / SC-13 re-ground), not a repackaged clock re-set.") });
    renewed += r.updated;
  }
  if (closeDeferred.length) {
    const r = await guardedUpdate("integrity_flags", (qb) => qb.in("id", closeDeferred.map((f) => f.id)),
      { status: "resolved", resolved_by: "backlog-disposition-2026-07-13", resolved_at: nowIso, resolution_note: "Deferral whose item is no longer live-quarantined (archived / deleted / recovered-to-verified) — the block is moot; closed with attribution." },
      { cite: cite("Part B-3: deferral on a dispositioned item (archived/deleted/verified) -> closed (moot), not renewed. Includes valid-future deferrals on deleted subjects (deferral-hygiene rot).") });
    closedD = r.updated;
  }
  say(`B-e create deferrals: ${created}/${createDeferral.length}`);
  say(`B-f renew deferrals:  ${renewed}/${renewDeferral.length} (rejected ${rejected})`);
  say(`B-f close moot deferrals: ${closedD}/${closeDeferred.length}`);
  ok = ok && created === createDeferral.length && closedD === closeDeferred.length;
}

// B-h. Guessed-5 review batch: ONE flag naming the hosts (FK-safe; no source mutation). IDEMPOTENT.
{
  const existingBatch = flags.find((f) => f.created_by === "register-step-gap" && f.subject_ref === "sources.guessed-tier-5-registry");
  if (existingBatch) { say(`B-h guessed-5 review batch flag: already exists (${existingBatch.id}) — skip`); }
  else {
  const hosts = [...new Set(g5.map((s) => { try { return new URL(s.url).host.replace(/^www\./, ""); } catch { return s.name; } }))].sort();
  const r = await guardedInsert("integrity_flags", {
    category: "source_issue", subject_type: "system", subject_ref: "sources.guessed-tier-5-registry", status: "open",
    created_by: "register-step-gap",
    description: `Batched-registration-list: ${g5.length} provisional sources auto-registered at the GUESSED sub-floor default tier 5 (pre-SC-13). Census clean (0 verified items rest on a guessed tier). Re-triage as AMBIGUOUS: operator re-tiers each in the next registration batch. FK-safe (sources are DELETE-protected + base_tier NOT NULL) — surfaced, not mutated.`.slice(0, 480),
    recommended_actions: [{ action: "reclassify_tier_batch", rationale: "Operator re-tiers these guessed-5 hosts to their honest canonical tier (or confirms 5). The 44-host pattern.", hold_class: "rd28-resting-state", hosts: hosts.slice(0, 140) }],
  }, { cite: cite("Part B-4: 124 guessed-5 registry rows surfaced as one review-batch flag for operator re-tiering (FK-safe; base_tier NOT NULL + sources DELETE-protected forbid mutation/deletion).") });
  say(`B-h guessed-5 review batch flag: ${r.inserted ? "inserted 1 (" + hosts.length + " hosts)" : "FAILED"}`);
  ok = ok && !!r.inserted;
  }
}

// B-i. Orphaned deferrals: a disposition_deferred flag whose subject item is DELETED is rot the
// deferral-hygiene-audit names at ANY status (a resolved orphan still references a gone subject). The
// correct disposition is to REMOVE it (guarded, snapshot-reversible) — it defers a subject that is gone.
{
  const allDeferred = await readAll("integrity_flags", "id,subject_ref,subject_type,status",
    { match: (q) => q.eq("created_by", "disposition_deferred").eq("subject_type", "item") });
  const orphanIds = allDeferred.filter((f) => f.subject_ref && !itemById.has(f.subject_ref)).map((f) => f.id);
  if (orphanIds.length) {
    const r = await guardedDelete("integrity_flags", orphanIds,
      { cite: cite("Part B: orphaned disposition_deferred flag (subject intelligence_item hard-deleted) — deferral-hygiene rot at any status; removed (snapshot-reversible), it defers a subject that no longer exists.") });
    say(`B-i delete orphaned deferrals (deleted subject): ${r.deleted ?? orphanIds.length}/${orphanIds.length}`);
  } else say("B-i delete orphaned deferrals: 0 (none).");
}

say(`\n== APPLY ${ok ? "OK" : "HAD FAILURES"} ==`);
process.exit(ok ? 0 : 1);
