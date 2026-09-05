#!/usr/bin/env node
// migration-299-precheck.mjs — the executable guard for migration 299 (Lane KIT-BACKFILL, 2026-09-05).
//
// WHY THIS EXISTS. `supabase/migrations/299_item_type_required_slots_wave3.sql`'s own header names a
// self-check SQL query to run BEFORE the migration lands ("get N, then re-mint those N items, THEN
// apply") — but as written that check is a comment a coordinator has to remember to run by hand, not a
// gate anything refuses on. The plan's own W2.3 requires "the migration 299 pre-check extended so it
// refuses to apply while any live verified item would be quarantined by it" — this file is that
// extension: the SAME query, executable, exiting non-zero (refusing) while N > 0, so "the coordinator
// remembered to check" becomes "the coordinator's own apply step failed until the check passes."
//
// WHAT IT CHECKS, EXACTLY (byte-identical semantics to migration 299's own header SQL and to the live
// `validate_item_provenance` criterion 5 it will start enforcing): for each of the four
// (item_type, slot_key) pairs the migration inserts, a `verified` item of that item_type — archived or
// not; see the archive-status note at the CLI query below, this is not a narrowing to "live" in the
// non-archived sense — is COVERED when at least one of its claims has `claim_kind IN ('FACT','GAP')` AND
// `claim_text` contains the slot_key as a case-insensitive substring (criterion 5's own
// `claim_text ILIKE '%' || slot_key || '%'` — migration 113's documented pattern, reproduced here in JS
// rather than re-executed as SQL so this guard needs only `readAll`, never a raw query round trip).
// `N` (the migration's own name for this) is the count of DISTINCT items failing that coverage for AT
// LEAST ONE of their applicable new slots — an item needing both research-credibility slots still
// counts once, matching the migration's own "distinct items, not slot-rows" framing.
//
// TWO MODES, one script:
//   (default) PRE-CHECK  — run before `apply_migration` for 299. Exits 1 (refuses) while N > 0, printing
//     the per-(item_type, slot_key) breakdown and the failing item ids so a backfill run
//     (`provenance-heal --arg kit-backfill --mode apply` — reaches every one of the 149 including the
//     archived-but-verified members `--arg slots-backfill` cannot, see that mode's own header) has
//     an exact worklist. Exits 0 (safe to apply) once N = 0.
//   `--post`  POST-CHECK — run after `apply_migration` for 299 has landed. Re-runs the SAME coverage
//     query (nothing about it depends on whether the live `item_type_required_slots` rows exist yet —
//     see the header above) and ADDITIONALLY confirms no live item of the three item_types is
//     `provenance_status = 'quarantined'` for reason `missing_required_slot` naming one of the three new
//     slot_key values — the concrete, read-back proof the migration's own step 4 asks for ("zero
//     market_signal/initiative/research_finding item is quarantined for missing_required_slot that was
//     verified before step 1's count"). Exits 1 if either check finds a survivor.
//
// $0, deterministic, no LLM: readAll (paginated, unguarded reads) + JS aggregation. Makes no write of
// any kind — this is a GATE, not a backfill; the backfill itself is `provenance-heal --arg kit-backfill`
// (scripts/maintenance/provenance-heal.mjs, dispatching scripts/mint/heal-provenance.mjs's own
// resolveKitBackfillCandidates selection — no separate script; see this lane's REPORT for why: the
// per-item capture/slot-write/section-attach mechanism already existed in heal-provenance.mjs's SLOTS
// step, and duplicating it into a new file would violate the "no copies of logic" rule), dispatched
// separately per this file's own printed worklist (`failingIds` in the JSON this script prints).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// claimCoversSlot: reused UNMODIFIED from heal-provenance.mjs (no copies of logic — CLAUDE.md rule)
// (its own comment: "the exact criterion-5 check ... migration 299's own self-check SQL, verbatim shape").
// This file no longer carries its own copy (removed 2026-09-05, lane KIT-BACKFILL, when the pre-existing
// export was found by grep — see this lane's REPORT for the discovery).
import { claimCoversSlot } from "./heal-provenance.mjs";

// The exact four (item_type, slot_key) pairs migration 299 inserts, in its own file order.
export const NEW_REQUIRED_SLOTS = Object.freeze([
  { item_type: "market_signal", slot_key: "corridor_identity" },
  { item_type: "initiative", slot_key: "corridor_identity" },
  { item_type: "research_finding", slot_key: "evidence_agreement_signal" },
  { item_type: "research_finding", slot_key: "source_authority_signal" },
]);

export const NEW_REQUIRED_ITEM_TYPES = Object.freeze([
  ...new Set(NEW_REQUIRED_SLOTS.map((s) => s.item_type)),
]);

export { claimCoversSlot };

/**
 * PURE CORE. `items`: [{id, item_type}] — every live, verified item of the three affected types.
 * `claimsByItemId`: Map(item_id -> claim[]) (or a plain object; both are read the same way below).
 * Returns { n, byPair: [{item_type, slot_key, missing_count, missing_ids}], failingIds: string[] } —
 * `n` is DISTINCT items failing >=1 applicable pair, matching the migration's own "n_would_fail" framing.
 */
export function computeGuard(items, claimsByItemId) {
  const getClaims = (id) =>
    claimsByItemId instanceof Map ? claimsByItemId.get(id) ?? [] : claimsByItemId?.[id] ?? [];

  const byPair = NEW_REQUIRED_SLOTS.map((pair) => {
    const missingIds = [];
    for (const item of items) {
      if (item.item_type !== pair.item_type) continue;
      const claims = getClaims(item.id);
      const covered = claims.some((c) => claimCoversSlot(c, pair.slot_key));
      if (!covered) missingIds.push(item.id);
    }
    return { item_type: pair.item_type, slot_key: pair.slot_key, missing_count: missingIds.length, missing_ids: missingIds };
  });

  const failingIdSet = new Set();
  for (const p of byPair) for (const id of p.missing_ids) failingIdSet.add(id);

  return { n: failingIdSet.size, byPair, failingIds: [...failingIdSet] };
}

/** PRE-CHECK verdict from a computed guard: refuse (ok:false) while n > 0. Pure. */
export function evaluatePreCheck(guard) {
  return {
    ok: guard.n === 0,
    n: guard.n,
    message:
      guard.n === 0
        ? "migration 299 pre-check: N = 0 — every live verified market_signal/initiative/research_finding " +
          "item already carries a FACT-or-GAP claim for each of its applicable new required slots. Safe to apply."
        : `migration 299 pre-check REFUSES: N = ${guard.n} live verified item(s) would be quarantined by ` +
          `criterion 5 on their next touch once this migration lands. Backfill first (provenance-heal ` +
          `--arg kit-backfill --mode apply — reaches archived members too; --arg slots-backfill only ` +
          `reaches the non-archived ones), then re-run this check.`,
  };
}

/**
 * POST-CHECK verdict: the same coverage re-check (should read n=0 after a successful backfill, REGARDLESS
 * of whether the migration's own rows exist live yet — see this file's header), PLUS the live quarantine
 * read-back the migration's own step 4 names. `quarantinedForNewSlots`: [{id, item_type}] — every live,
 * non-archived item of the three types with provenance_status='quarantined' whose failure reason cites
 * `missing_required_slot` for one of the three new slot_key values (caller resolves this from the item's
 * own validate_item_provenance failures — see readQuarantinedForNewSlots below for the real-DB shape).
 */
export function evaluatePostCheck(guard, quarantinedForNewSlots) {
  const survivors = quarantinedForNewSlots ?? [];
  const ok = guard.n === 0 && survivors.length === 0;
  const parts = [];
  parts.push(guard.n === 0 ? "coverage re-check: N = 0." : `coverage re-check: N = ${guard.n} (STILL missing coverage).`);
  parts.push(
    survivors.length === 0
      ? "quarantine read-back: 0 items quarantined for missing_required_slot on the three new slots."
      : `quarantine read-back: ${survivors.length} item(s) quarantined for missing_required_slot on a new slot — ${survivors.map((s) => s.id).join(", ")}`,
  );
  return { ok, n: guard.n, quarantined_count: survivors.length, message: parts.join(" ") };
}

// ── real deps (CLI entrypoint) ───────────────────────────────────────────────────────────────────────

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const post = process.argv.includes("--post");
  try {
    process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local"));
  } catch {
    // CI injects env directly; a local run without .env.local relies on the caller's shell env.
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("migration-299-precheck: no DB creds (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — cannot run here (exit 2).");
    process.exit(2);
  }

  const { readAll } = await import("../lib/db.mjs");

  // NO is_archived filter — matches migration 299's own self-check SQL verbatim (its header block has
  // none) and the live re-derivation below (2026-09-05, Lane KIT-BACKFILL): the set_provenance_status
  // trigger (migration 115) fires on writes to intelligence_items/_sections/section_claim_provenance
  // regardless of archive status, and heal-provenance.mjs's OWN "archived-unreasoned" selection mode
  // (shouldUnarchive) deliberately writes to archived-verified rows to re-derive them — so an
  // archived-but-verified item is not inert; it can still be re-touched and, on that touch, quarantined
  // by criterion 5 once these rows land. [CONFIRMED, live, 2026-09-05]: filtering is_archived=false here
  // undercounts N to 87 (20 initiative + 36 market_signal + 31 research_finding, all non-archived); the
  // unfiltered count — the one migration 299's own self-check actually computes — is 149 (70 initiative +
  // 46 market_signal + 33 research_finding; the extra 50/10/2 are archived-but-verified). 149 is also the
  // exact figure this lane's dispatch names as "the 149 pre-kit items", confirming the migration's own
  // self-check (not a narrower live-only read) is the binding definition of N. Do not re-add this filter
  // without re-deriving both numbers again — see this lane's REPORT for the reconciliation.
  const items = await readAll("intelligence_items", "id, item_type", {
    match: (q) => q.eq("provenance_status", "verified").in("item_type", NEW_REQUIRED_ITEM_TYPES),
  });
  const ids = items.map((i) => i.id);
  const claimRows = ids.length
    ? await readAll("section_claim_provenance", "intelligence_item_id, claim_kind, claim_text", {
        match: (q) => q.in("intelligence_item_id", ids),
      })
    : [];
  const claimsByItemId = new Map();
  for (const c of claimRows) {
    const arr = claimsByItemId.get(c.intelligence_item_id) ?? [];
    arr.push(c);
    claimsByItemId.set(c.intelligence_item_id, arr);
  }
  const guard = computeGuard(items, claimsByItemId);

  if (!post) {
    const verdict = evaluatePreCheck(guard);
    console.log(JSON.stringify({ mode: "pre", ...verdict, by_pair: guard.byPair.map((p) => ({ item_type: p.item_type, slot_key: p.slot_key, missing_count: p.missing_count })) }, null, 2));
    process.exit(verdict.ok ? 0 : 1);
  }

  // POST-CHECK: quarantine read-back over the same three item_types, filtered to the reason criterion 5
  // itself uses. `validate_item_provenance`'s own failure array isn't stored per-row anywhere durable —
  // the live proof is: any of these items now sitting quarantined at all is worth naming, since the ONLY
  // required-slot change this migration makes is the three new rows; a coordinator confirms the specific
  // reason from the item's own validate_item_provenance() call when the count is non-zero.
  // NO is_archived filter here either, for the same reason as the pre-check read above: an
  // archived-but-verified item this migration quarantines on its next touch is exactly the harm step 4
  // of the migration's own sequence asks to be read back as zero.
  const quarantined = await readAll("intelligence_items", "id, item_type, provenance_status", {
    match: (q) => q.eq("provenance_status", "quarantined").in("item_type", NEW_REQUIRED_ITEM_TYPES),
  });
  const verdict = evaluatePostCheck(guard, quarantined);
  console.log(JSON.stringify({ mode: "post", ...verdict }, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}
