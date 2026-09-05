// provenance-heal.mjs — MAINT dispatch step: heals quarantined/archived-unreasoned/slot-incomplete
// intelligence_items by attaching the grounding they were missing, per the operator's ruling verbatim
// (2026-09-03): "if items are being flagged as not credible for the site because of not having sources
// that is an issue with finding the source not that item. you need to attach a source. the item isn't
// [bad] because you didn't do that."
//
// UPSTREAM: scripts/mint/heal-provenance.mjs's own guarded main() core — capture (Cellar-first for CELEX,
// the Federal Register API for federalregister.gov, a plain polite GET otherwise, all imported from
// export-census-rows.mjs unmodified), grounding-span location under normalization, missing-slot filling
// (record-facts.mjs / record-facts-research.mjs, imported unmodified), Gate A refresh (write-item.ts's
// buildGateARow, imported unmodified), and the same touch-and-reselect re-derivation
// rederive-record-provenance.mjs uses. This wrapper is orchestration + real db.mjs/fetch wiring only — see
// that file's own header for the five-step contract and every governing file it imports rather than edits.
//
// WHAT IT DOES.
//   Dry: reads the selected items and their existing captures/claims/sections live, PLANS every step
//   (which claims would ground, which slots would fill FACT vs GAP, what the Gate A scan would say, what
//   validate_item_provenance says right now) without making any network fetch or DB write, and lists the
//   fetches it would make. Writes nothing.
//   Apply: performs the plan through the guarded path (scripts/lib/db.mjs — rule 015): agent_run_searches
//   inserts (full text, ADR-016), section_claim_provenance span rewrites/inserts, intelligence_item_sections
//   inserts/updates, item_gate_a_state upserts, and the intelligence_items touch that fires the
//   set_provenance_status trigger. An `archived-unreasoned` item that comes back verified is un-archived
//   (archive_reason stays null — never invented). An item still failing after all five steps is left
//   exactly as it is, reported with the remaining criterion.
//
// TIME BUDGET (lane HEAL-BUDGET, 2026-09-04; dry mode too since lane HEAL-9): runs of EITHER mode stop
// cleanly (never mid-item) once HEAL_TIME_BUDGET_SECONDS (a step env this workflow sets, see
// maintenance.yml's own timeout-minutes comment) is spent, writing summary.json's
// `stopped_at_budget`/`items_remaining` rather than letting the job's own timeout-minutes kill the process
// with nothing written. Re-dispatch with --arg "ids:<items_remaining>" (from that run's own artifact) to
// finish the rest — see docs/runbooks/MAINTENANCE-RUNBOOK.md's provenance-heal section. Every item's
// five/ten-step sequence still runs to completion or not at all; only the NEXT item is ever skipped by a
// run-level budget stop.
//
// PER-ITEM WALL-CLOCK BACKSTOP (lane HEAL-10, 2026-09-04): `itemTimeBudgetSeconds`, derived below from the
// SAME HEAL_TIME_BUDGET_SECONDS (no new workflow env), caps how long any ONE item's STEP SOURCE/STEP C
// orphan-token search can run — the confirmed dominant per-item cost (see heal-provenance.mjs's own header
// TENTH PASS section for the measured basis). A token skipped by this cap is reported `item_bound_hit`,
// never silently dropped; the item still finishes its remaining steps (Gate A + re-derive) on whatever
// grounding it reached.
//
// `--arg` selects the population:
//   (blank) or "quarantined-live" — every live (is_archived=false), quarantined intelligence_items row
//     (the default — the operator's ruling's primary target).
//   "archived-unreasoned"         — archived rows with archive_reason IS NULL (an un-reasoned archive is
//     not evidence the item is bad either — the same ruling, applied to the archive side).
//   "ids:<uuid,uuid,...>"         — exactly these items, regardless of current status.
//   "slots-backfill"              — every verified, live market_signal/initiative/research_finding item
//     missing a slot item-type-required-slots.json now requires (migration 299's still-unapplied "149";
//     see docs/runbooks/MAINTENANCE-RUNBOOK.md for the sequencing this satisfies). Does NOT reach an
//     archived-but-verified item — see "kit-backfill" below for the form that does.
//   "kit-backfill" (2026-09-05, lane KIT-BACKFILL, W2.3/W2.4)
//                                  — every verified item of EVERY item_type item-type-required-slots.json
//     has an entry for (not only the three above), archived included, missing >=1 required slot. This is
//     the strict superset that actually closes migration-299-precheck.mjs's guard to N=0 (it reaches the
//     62-of-149 items "slots-backfill" cannot, being archived) and covers the wider one-or-two-FACT
//     population outside the three criterion-5-only types. See docs/runbooks/MAINTENANCE-RUNBOOK.md §8's
//     "kit-backfill" subsection for the live dry-run counts and the exact dispatch sequence with migration
//     299.
// Any of the five forms above may carry the suffix "+strip-unprovable" (e.g.
// "quarantined-live+strip-unprovable", "ids:<uuid,...>+strip-unprovable") — an explicit, opt-in token
// (lane HEAL-10, 2026-09-04) that, in apply mode ONLY, additionally lets STEP BRIEF-HONEST write a
// full_brief with an exhausted-unprovable token's own sentence/clause removed, and lets STEP D append a
// RELABEL-from-full-brief paragraph — both PLANNED and reported on every dispatch regardless of the
// suffix; see heal-provenance.mjs's header TENTH PASS section for the full accept/refuse contract and
// docs/runbooks/MAINTENANCE-RUNBOOK.md's provenance-heal section for dispatch examples.
// apply mode does NOT require --arg beyond a valid selection — this mirrors tag-proposals.mjs's own
// posture (see this repo's other MAINT steps): a healing write is additive/reversible (nothing here
// deletes or downgrades a row; the provenance-flip binding, ADR-017, only ever lets THIS path escalate
// toward `verified`, never force it), not the single-named-id gate a blanket tag-apply needs.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main as healMain, parseSelection, loadRequiredSlots, computeItemTimeBudgetSeconds } from "../mint/heal-provenance.mjs";
import { makePoliteFetch } from "../mint/export-census-rows.mjs";
import { runCli } from "./lib/cli.mjs";

// Re-exported unmodified — this wrapper's own `main`/`parseSelection` ARE heal-provenance.mjs's (unlike
// tag-proposals.mjs/tag-ratification.mjs, whose wrappers add selection-report formatting the core library
// doesn't do itself, heal-provenance.mjs's own main() already owns the full dry/apply/selection contract —
// see that file's header). Re-exporting keeps `node scripts/maintenance/provenance-heal.mjs --mode dry`
// and a direct `import { main } from "./heal-provenance.mjs"` call byte-identical, and lets this wrapper's
// own test import them by this file's name, matching every sibling wrapper's test-import shape.
export { healMain as main, parseSelection };

export const CITE = Object.freeze({
  skill: "provenance-heal-2026-09-03",
  reason:
    "MAINT provenance-heal dispatch (Lane HEAL, 2026-09-03): attaches the grounding a quarantined or " +
    "archived-unreasoned item was missing — capture, span-location, missing-slot FACT-or-honest-GAP, Gate " +
    "A refresh, then re-derivation through the real set_provenance_status trigger — per the operator's " +
    "ruling that a missing source is this repo's gap to close, not evidence the item itself is bad. Every " +
    "write goes through scripts/mint/heal-provenance.mjs's own guarded core (imported, not reimplemented).",
});

const ITEM_COLUMNS =
  "id, title, item_type, source_id, source_url, instrument_identifier, canonical_instrument_key, " +
  "full_brief, is_archived, archive_reason, provenance_status";

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "provenance-heal",
    main: healMain,
    needsDb: true,
    buildDeps: async () => {
      const {
        readAll, readClient, guardedInsert, guardedInsertMany, guardedUpdate, guardedUpdateByIds,
        registerSource, institutionKey,
      } = await import("../lib/db.mjs");
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const rc = readClient();

      const rpc = async (itemId) => {
        const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
        if (error) return { valid: false, recommended_status: null, failures: [{ criterion: "rpc", reason: error.message }] };
        return Array.isArray(data) ? data[0] : data;
      };

      // HEAL-BUDGET (2026-09-04): the run's own time budget, derived from HEAL_TIME_BUDGET_SECONDS (a
      // step env .github/workflows/maintenance.yml sets — see that file's own timeout-minutes comment
      // for the arithmetic tying this number to the job's raised timeout). Absent/non-numeric/<=0 means
      // no budget (heal-provenance.mjs's own main() treats that as unbounded, unchanged pre-HEAL-BUDGET
      // behavior) — a local by-hand run with no env set is never silently time-boxed.
      const rawBudget = Number(process.env.HEAL_TIME_BUDGET_SECONDS);
      const timeBudgetSeconds = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : null;
      // TENTH PASS (2026-09-04, lane HEAL-10): derived from the SAME HEAL_TIME_BUDGET_SECONDS the run-level
      // budget already reads — no new workflow env needed. null (no cap) when the run itself is unbudgeted,
      // matching timeBudgetSeconds's own posture. See computeItemTimeBudgetSeconds's own header and
      // heal-provenance.mjs's header TENTH PASS section for the measured basis.
      const itemTimeBudgetSeconds = timeBudgetSeconds != null ? computeItemTimeBudgetSeconds(timeBudgetSeconds) : null;

      return {
        fetchImpl: makePoliteFetch({ fetchImpl: fetch }), // 1 req/s, $0 — same politeness gap export-census-rows.mjs uses
        requiredSlotsMap: loadRequiredSlots(),
        timeBudgetSeconds, // HEAL-BUDGET — heal-provenance.mjs's main() stops cleanly before this is exceeded
        itemTimeBudgetSeconds, // TENTH PASS — per-item wall-clock backstop under STEP SOURCE/STEP C's own loops

        // ── selection reads ──────────────────────────────────────────────────────────────────────
        readQuarantinedLive: () => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
        }),
        readArchivedUnreasoned: () => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => q.eq("is_archived", true).is("archive_reason", null),
        }),
        // `includeArchived` (2026-09-05, lane KIT-BACKFILL): kit-backfill's own selection passes `true` so
        // an archived-but-verified item (still reachable by set_provenance_status on its next touch — see
        // migration-299-precheck.mjs's header) is not silently excluded from what closes its guard; every
        // OTHER caller (slots-backfill) omits the option, defaulting to the original is_archived=false-only
        // behavior unchanged.
        readCandidateTypeItems: (itemTypes, { includeArchived = false } = {}) => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => {
            const base = q.eq("provenance_status", "verified").in("item_type", itemTypes);
            return includeArchived ? base : base.eq("is_archived", false);
          },
        }),
        readByIds: (ids) => readAll("intelligence_items", ITEM_COLUMNS, { match: (q) => q.in("id", ids) }),

        // ── per-item reads ───────────────────────────────────────────────────────────────────────
        readCaptures: (itemId) => readAll("agent_run_searches", "id, result_url, result_content", { match: (q) => q.eq("intelligence_item_id", itemId) }),
        // basis_claim_id: HEAL-6's Gate-B coverage (`computeDerivedCovered` in heal-provenance.mjs) reads it
        // off every DERIVED claim; without it in the projection the fix is dormant and every apply strips
        // the derived coverage the mint pipeline established (heal #21: 88 of 94 items stuck on criterion 7).
        readClaims: (itemId) => readAll("section_claim_provenance", "id, claim_kind, claim_text, source_span, source_id, search_result_id, section_row_id, basis_claim_id", { match: (q) => q.eq("intelligence_item_id", itemId) }),
        readSections: (itemId) => readAll("intelligence_item_sections", "id, item_id, section_key, section_order, content_md", { match: (q) => q.eq("item_id", itemId) }),
        readGateAState: async (itemId) => {
          const { data, error } = await rc.from("item_gate_a_state").select("intelligence_item_id").eq("intelligence_item_id", itemId).maybeSingle();
          if (error) throw new Error(`provenance-heal: readGateAState failed: ${error.message}`);
          return data ?? null;
        },
        readSourceUrl: async (sourceId) => {
          if (!sourceId) return null;
          const { data, error } = await rc.from("sources").select("url").eq("id", sourceId).maybeSingle();
          if (error) throw new Error(`provenance-heal: readSourceUrl failed: ${error.message}`);
          return data?.url ?? null;
        },
        // STEP A/C bucket 3 (corpus pool) — a batch-scoped `.in("result_url", urls)` read, NEVER a
        // whole-table `agent_run_searches` scan (the brief's own explicit line). `urls` is the small
        // http/https + trailing-slash variant set buildUrlVariants produces for one item's canonical URL.
        readCapturesByUrls: (urls) => (urls?.length
          ? readAll("agent_run_searches", "id, intelligence_item_id, result_url, result_content", { match: (q) => q.in("result_url", urls) })
          : Promise.resolve([])),
        // `sources` read ONCE per RUN (main() calls this, not per item) — the SAME bounded whole-table
        // read shape db.mjs's own registerSource dedup already performs (`readAll("sources", "id,url,status")`);
        // `sources` is explicitly NOT the `agent_run_searches` table the brief's batch-scoping rule targets.
        readAllSources: () => readAll("sources", "id, url, base_tier, tier_override, institution_id, status"),
        // STEP B (OWN-BODY) — `institutions` (migration 122) has had zero writers until this lane; find by
        // its own registrable_domain key, or let insertInstitution below create the row.
        readInstitutionByDomain: async (domain) => {
          const { data, error } = await rc.from("institutions").select("id").eq("registrable_domain", domain).maybeSingle();
          if (error) throw new Error(`provenance-heal: readInstitutionByDomain failed: ${error.message}`);
          return data ?? null;
        },
        // STEP SOURCE (EIGHTH PASS, 2026-09-04, lane HEAL-7) — see heal-provenance.mjs's own header EIGHTH
        // PASS section for the ruling this implements. `readSourceByUrl` reads the SAME bounded whole-table
        // `sources` shape readAllSources/db.mjs's own registerSource dedup already use (never a per-call
        // filtered read against the small registry table), matched by the SAME institutionKey identity rule
        // registerSource dedups by — so a lookup here and a registerSource dedup below always agree on
        // whether a URL's host is "already registered".
        readSourceByUrl: async (url) => {
          const key = institutionKey(url);
          if (!key) return null;
          const all = await readAll("sources", "id, url, base_tier, tier_override, institution_id, status");
          return all.find((s) => institutionKey(s.url) === key) ?? null;
        },
        // base_tier here is ALWAYS the caller's classTierForHost value (SC-13 no-guess registration) —
        // heal-provenance.mjs's STEP SOURCE is the only caller, and it never omits base_tier, so db.mjs's
        // own `?? 7` default is never reached through this path.
        registerSource: (source) => registerSource(source, { cite: CITE }),
        validateProvenance: rpc,
        readProvenanceStatus: async (itemId) => {
          const { data, error } = await rc.from("intelligence_items").select("provenance_status").eq("id", itemId).maybeSingle();
          if (error) throw new Error(`provenance-heal: readProvenanceStatus failed: ${error.message}`);
          return data?.provenance_status ?? null;
        },

        // ── writes, all through the guarded path (rule 015) ─────────────────────────────────────
        insertSearch: async (row) => {
          const r = await guardedInsert("agent_run_searches", row, { cite: CITE, select: "id, result_url" });
          return r.inserted;
        },
        insertClaim: async (row) => {
          const r = await guardedInsert("section_claim_provenance", row, { cite: CITE, select: "id" });
          return r.inserted;
        },
        updateClaimSpan: (id, patch) => guardedUpdate("section_claim_provenance", (q) => q.eq("id", id), patch, { cite: CITE }),
        updateClaimKind: (id, patch) => guardedUpdate("section_claim_provenance", (q) => q.eq("id", id), patch, { cite: CITE }),
        // STEP B — `institutions` (migration 122) find-or-create, and the sources.institution_id write
        // itself (NEW writer surface for this file; see the report for the confirmed-nowhere-else-writes basis).
        insertInstitution: async (row) => {
          const r = await guardedInsert("institutions", row, { cite: CITE, select: "id" });
          return r.inserted;
        },
        updateSourceInstitution: (sourceId, institutionId) =>
          guardedUpdate("sources", (q) => q.eq("id", sourceId), { institution_id: institutionId }, { cite: CITE }),
        insertSection: async (row) => {
          const r = await guardedInsert("intelligence_item_sections", row, { cite: CITE, select: "id, section_key" });
          return r.inserted;
        },
        updateSectionContent: (id, content_md) => guardedUpdate("intelligence_item_sections", (q) => q.eq("id", id), { content_md }, { cite: CITE }),
        // STEP BRIEF-HONEST (TENTH PASS, 2026-09-04, lane HEAL-10, Task 3) — only ever called when
        // apply=true AND the dispatch's own --arg carries "+strip-unprovable" (heal-provenance.mjs's own
        // healOneItem gates this; the wrapper never gates it independently, matching every other write
        // here). Writes full_brief with the sentence/clause removed that planBriefHonest already re-
        // verified passes Gate A on the rewrite — never a synthesized/paraphrased replacement.
        updateItemBrief: (itemId, full_brief) => guardedUpdate("intelligence_items", (q) => q.eq("id", itemId), { full_brief }, { cite: CITE }),
        upsertGateA: (row, exists) =>
          exists
            ? guardedUpdate("item_gate_a_state", (q) => q.eq("intelligence_item_id", row.intelligence_item_id), row, { cite: CITE })
            : guardedInsert("item_gate_a_state", row, { cite: CITE, select: "intelligence_item_id" }),
        touchItem: (itemId) => guardedUpdateByIds("intelligence_items", [itemId], { updated_at: new Date().toISOString() }, { cite: CITE, select: "id" }),
        unarchiveItem: (itemId) => guardedUpdate("intelligence_items", (q) => q.eq("id", itemId), { is_archived: false, archive_reason: null }, { cite: CITE }),
      };
    },
  });
}
