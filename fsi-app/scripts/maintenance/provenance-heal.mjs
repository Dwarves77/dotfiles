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
// `--arg` selects the population:
//   (blank) or "quarantined-live" — every live (is_archived=false), quarantined intelligence_items row
//     (the default — the operator's ruling's primary target).
//   "archived-unreasoned"         — archived rows with archive_reason IS NULL (an un-reasoned archive is
//     not evidence the item is bad either — the same ruling, applied to the archive side).
//   "ids:<uuid,uuid,...>"         — exactly these items, regardless of current status.
//   "slots-backfill"              — every verified, live market_signal/initiative/research_finding item
//     missing a slot item-type-required-slots.json now requires (migration 299's still-unapplied "149";
//     see docs/runbooks/MAINTENANCE-RUNBOOK.md for the sequencing this satisfies).
// apply mode does NOT require --arg beyond a valid selection — this mirrors tag-proposals.mjs's own
// posture (see this repo's other MAINT steps): a healing write is additive/reversible (nothing here
// deletes or downgrades a row; the provenance-flip binding, ADR-017, only ever lets THIS path escalate
// toward `verified`, never force it), not the single-named-id gate a blanket tag-apply needs.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main as healMain, parseSelection, loadRequiredSlots } from "../mint/heal-provenance.mjs";
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
      } = await import("../lib/db.mjs");
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const rc = readClient();

      const rpc = async (itemId) => {
        const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
        if (error) return { valid: false, recommended_status: null, failures: [{ criterion: "rpc", reason: error.message }] };
        return Array.isArray(data) ? data[0] : data;
      };

      return {
        fetchImpl: makePoliteFetch({ fetchImpl: fetch }), // 1 req/s, $0 — same politeness gap export-census-rows.mjs uses
        requiredSlotsMap: loadRequiredSlots(),

        // ── selection reads ──────────────────────────────────────────────────────────────────────
        readQuarantinedLive: () => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
        }),
        readArchivedUnreasoned: () => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => q.eq("is_archived", true).is("archive_reason", null),
        }),
        readCandidateTypeItems: (itemTypes) => readAll("intelligence_items", ITEM_COLUMNS, {
          match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified").in("item_type", itemTypes),
        }),
        readByIds: (ids) => readAll("intelligence_items", ITEM_COLUMNS, { match: (q) => q.in("id", ids) }),

        // ── per-item reads ───────────────────────────────────────────────────────────────────────
        readCaptures: (itemId) => readAll("agent_run_searches", "id, result_url, result_content", { match: (q) => q.eq("intelligence_item_id", itemId) }),
        readClaims: (itemId) => readAll("section_claim_provenance", "id, claim_kind, claim_text, source_span, search_result_id", { match: (q) => q.eq("intelligence_item_id", itemId) }),
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
        insertSection: async (row) => {
          const r = await guardedInsert("intelligence_item_sections", row, { cite: CITE, select: "id, section_key" });
          return r.inserted;
        },
        updateSectionContent: (id, content_md) => guardedUpdate("intelligence_item_sections", (q) => q.eq("id", id), { content_md }, { cite: CITE }),
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
