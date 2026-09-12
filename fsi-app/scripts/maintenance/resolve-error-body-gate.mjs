#!/usr/bin/env node
// resolve-error-body-gate.mjs -- MAINT step for task 7.4 of the W9 brief-chain build plan, Part 7
// (ADR-030 rider, 2026-09-12): the error-body-gate flag (`src/lib/agent/canonical-pipeline.ts` ~L1671,
// `created_by: "error-body-gate"`) is written whenever a stored capture is excluded from grounding as a
// failed fetch (bot wall / 403 / 404 / Request-Access block / nav shell -- `isErrorBody`,
// `src/lib/sources/entity-gate.mjs`) -- 34 open rows, no resolver anywhere in the codebase before this
// file [CONFIRMED, grepped the full repo for a reader/resolver of this created_by value].
//
// THE RULE (task 7.4, verbatim): "re-fetch the flagged URL through the existing capture path (free
// capture first; a still-failing fetch routes to attach-found-sources' worklist with the host named)."
// This step:
//   1. Extracts every failed-fetch URL named in the flag (recommended_actions[].rationale first --
//      `${url}: stored capture is a failed fetch ...` -- description as a fallback), via the SAME shared
//      extractor `resolve-cited-host-gate.mjs` uses (scripts/maintenance/lib/flag-url-extract.mjs).
//   2. RESPECTS THE SCRAPE-HOLD GATE. `holdEngaged()` (src/lib/sources/fetch-hold.mjs, SCRAPE_HOLD) is
//      checked ONCE per run, before any fetch. While engaged, EVERY row is reported `fetch_held` and
//      NONE is fetched, and NONE of that run's flags are resolved (a held flag stays open -- the hold is
//      a genuine machine block on the underlying capability, not a human-approval gate on THIS queue, so
//      leaving it open until the hold lifts is honest, never a bypass). Build-mode rule 16 (CLAUDE.md):
//      the standing scrape cadence stays off during build, but an explicit coordinator dispatch of this
//      named step is not the autonomous cadence that rule holds off -- it is gated by SCRAPE_HOLD like
//      every other coordinator-dispatched fetch in this repo (provenance-heal, attach-found-sources).
//   3. FREE CAPTURE FIRST, THE EXISTING PATH, NEVER RE-DERIVED. `captureCitedUrl` (scripts/mint/
//      heal-provenance.mjs's own THIRD PASS -- Cellar-first for eur-lex, FR-API for federal_register, a
//      PDF branch, plain-GET otherwise, imported unmodified) is called per URL through a politeness-
//      wrapped `fetch` (`makePoliteFetch`, export-census-rows.mjs, the SAME 1 req/s the MAINT wrapper for
//      heal-provenance itself uses -- see provenance-heal.mjs's own header). A `"captured"` outcome is
//      stored through `buildCaptureSearchRow` (heal-provenance.mjs's own row-shape builder, unmodified)
//      inserted into `agent_run_searches` via the guarded path -- "the same write the heal uses" per the
//      dispatch's own wording. This is a NEW capture row; the prior failed-fetch row is left as-is (an
//      honest historical record) -- RD-13's read-side gate already excludes it from grounding by content
//      (isErrorBody), and the fresh row is what future grounding actually reads.
//   4. A `"held"` outcome (still failing) routes to the attach-found-sources worklist -- the existing
//      seed file (`scripts/_worklists/attach-found-sources.seed.json`, read the SAME way
//      attach-found-sources.mjs reads its own `--arg` worklist: a JSON array on disk) gets ONE new entry
//      per still-failing URL.
//   5. The error-body-gate flag is resolved (status='resolved') once every URL it named has been either
//      recaptured or routed -- resolution_note records the outcome per URL, per ADR-030's rider.
//
// FIX ROUND 1 (reviewer, review-7.1-7.4.md finding C -- Important, both parts CONFIRMED broken).
//
// (a) ROW SHAPE now matches attach-found-sources.mjs's OWN readiness gate exactly, read directly off
// that file (`isWorklistRowReady`, `scripts/maintenance/attach-found-sources.mjs:66-69`): a row needs
// ALL FOUR of `item_id`, `token`, `url`, `quote` non-empty, or `partitionWorklist` files it under
// `notReady` PERMANENTLY (no future browser-lane fill can ever reach it, because nothing in that lane's
// contract knows to add a `url`/`quote` pair to a bare `{item_id, token, class, sentence, search_id}`
// row -- the reviewer's own finding). `buildWorklistEntry` now writes `url: <the failed-fetch URL
// itself>` and `quote: <an excerpt of the error-body-gate flag's OWN description naming the failed
// fetch>` (`excerptQuote`, capped at 500 chars -- the flag's description already names the failure class
// per its own write site: "stored capture(s) excluded from grounding as failed fetches (bot wall / 403
// / 404 / nav shell)"), so every row this step appends now PASSES `isWorklistRowReady` and is filed
// `ready`, never permanently stuck. NOTE ON SHAPE, STILL HONEST (the reviewer's finding narrows, it does
// not resolve): `token` here is still the bare HOST, never a Gate-A orphan FIGURE, so
// heal-provenance.mjs's own `foundSourcesForItem` matching (which keys strictly on `orphan.token` against
// a verbatim numeric/date span) still never matches this row to a real orphan -- being `ready` means the
// row CAN be attempted, not that anything currently attempts to consume a `class: "error_body_refetch"`
// row's own semantics. The `class` marker still exists so a human/coordinator can tell the two row
// families apart; a future consumer extension for this class is still NOT built here (out of this task's
// small-mechanical scope).
//
// (b) DURABILITY: `.github/workflows/maintenance.yml` now runs `scripts/maintenance/
// commit-worklist-artifact.sh` (a generalized sibling of task 6.1b's `commit-brief-apply-artifact.sh` for
// `brief-apply.yml`'s run artifact, modeled on it, not copied verbatim, per the fix-round instruction)
// immediately after this step's own `apply` dispatch, committing `scripts/_worklists/
// attach-found-sources.seed.json` back to the dispatched ref. Same posture as the template: a rejected
// push on a protected ref (`master`) DEGRADES to a `::warning::`, never fails the run (the real per-item
// work already happened); only a git error before any push attempt is a genuine tooling failure worth
// `exit 1`. Read `attach-found-sources.mjs`'s own consumer contract before relying on this: it takes its
// worklist ONLY via `--arg <path>` on disk, never from `integrity_flags` -- so committing the FILE back
// to the ref (never a DB row) is the only architecturally consistent fix, exactly as the review found.
//
// PURE DECISION, TESTED. `buildWorklistEntry`, `buildResolutionNote`, `planErrorBodyFlag` and
// `mergeWorklistEntries` are pure -- no I/O, no DB, no fetch -- so the dry report lists every URL's
// planned action (recapture attempt / hold-blocked) without ever fetching or writing, per the spec's own
// "dry output lists ... a sample per outcome" requirement.
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently re-verified
// here -- no DB credentials in this worktree, and SCRAPE_HOLD's live value was not probed]. The 34-row
// count and the flag shape are read from the dispatch's own resolver map and the live canonical-pipeline.ts
// write site (re-read in full for this file); this script's own dry mode is the mechanism that reconfirms
// the count and the hold state live at dispatch time before any apply.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { readAll, guardedUpdate, guardedInsert } from "../lib/db.mjs";
import { hostOf } from "../lib/institution-key.mjs";
import { captureCitedUrl, buildCaptureSearchRow } from "../mint/heal-provenance.mjs";
import { makePoliteFetch } from "../mint/export-census-rows.mjs";
import { holdEngaged } from "../../src/lib/sources/fetch-hold.mjs";
import { extractFlagUrls } from "./lib/flag-url-extract.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.4 / ADR-030 rider",
  reason:
    "Resolve the error-body-gate integrity_flags family: re-fetch each flagged URL through the existing " +
    "free capture path (heal-provenance.mjs's captureCitedUrl, unmodified), storing a fresh non-error " +
    "capture the same way the heal does (buildCaptureSearchRow + the guarded insert) or routing a still- " +
    "failing URL to the attach-found-sources worklist with the host named. Respects the scrape-hold gate " +
    "(SCRAPE_HOLD): held rows are reported and never fetched. Resolves the flag with the outcome " +
    "recorded, per ADR-030's rider: no human click required on this queue.",
});

export const RESOLVED_BY = "resolve-error-body-gate";
export const WORKLIST_CLASS = "error_body_refetch";
export const DEFAULT_WORKLIST_RELATIVE_PATH = "scripts/_worklists/attach-found-sources.seed.json";

const FLAG_COLUMNS = "id, subject_ref, description, recommended_actions, status";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/** Every failed-fetch URL named in one error-body-gate flag (thin wrapper over the shared extractor, so
 *  this file's own test can assert against its own name without importing the lib module directly). */
export function extractFailedUrls(flag) {
  return extractFlagUrls(flag);
}

/** Trim `text` to a readable excerpt (default 500 chars, `attach-found-sources.seed.json`'s own
 *  `isWorklistRowReady` only requires a non-empty `quote` -- 500 is generous headroom under
 *  `integrity_flags.description`'s own 480-char write-time cap, so a description is almost always
 *  carried whole). Pure. Never throws on null/undefined. */
export function excerptQuote(text, maxLen = 500) {
  const t = String(text ?? "").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 3))}...`;
}

/**
 * The attach-found-sources worklist entry for one still-failing URL -- fix round 1 (reviewer finding C):
 * now carries `url` and `quote` so the row PASSES `attach-found-sources.mjs`'s own `isWorklistRowReady`
 * gate (all four of item_id/token/url/quote required) instead of being permanently `notReady`. `url` is
 * the failed-fetch URL itself; `quote` is an excerpt of the error-body-gate FLAG'S OWN description,
 * which already names the failure class at its write site ("stored capture(s) excluded from grounding as
 * failed fetches (bot wall / 403 / 404 / nav shell)") -- per the fix-round instruction, never a fetched
 * page's own text (there is none; the fetch failed). `token` still carries the HOST, not a Gate-A orphan
 * FIGURE -- see this file's header for why that divergence from the seed file's OTHER rows is still
 * honest and still unresolved, distinguished by `class`.
 * @param {string} itemId @param {string} url @param {string} host @param {string|null} reason
 * @param {string} flagDescription the error-body-gate flag's own `description` column
 */
export function buildWorklistEntry(itemId, url, host, reason, flagDescription) {
  return {
    item_id: itemId,
    token: host,
    url,
    quote: excerptQuote(flagDescription),
    class: WORKLIST_CLASS,
    sentence: `Stored capture at ${url} is a failed fetch (error-body-gate${reason ? `, ${reason}` : ""}); find a working URL for this instrument or a mirror of its content.`,
    search_id: null,
  };
}

/** Merge `newEntries` into `existingRows` (the parsed worklist JSON array), deduplicating on
 *  (item_id, token, url, class) so a re-run against the SAME still-failing URL never appends a duplicate
 *  row. `url` is now part of the identity (fix round 1): the seed file's existing Gate-A-figure rows
 *  don't carry a `url` at seed time either, so the key degrades gracefully to the pre-fix (item_id,
 *  token, class) shape for those. Pure; returns the new full array (existing rows first, in order, then
 *  genuinely new entries). */
export function mergeWorklistEntries(existingRows, newEntries) {
  const key = (r) => `${r.item_id}|${r.token}|${r.url ?? ""}|${r.class ?? ""}`;
  const seen = new Set((existingRows ?? []).map(key));
  const out = [...(existingRows ?? [])];
  let appended = 0;
  for (const entry of newEntries ?? []) {
    const k = key(entry);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(entry);
    appended += 1;
  }
  return { rows: out, appended };
}

/** Compose one flag's resolution_note from its per-URL outcomes. Pure. */
export function buildResolutionNote(outcomes) {
  if (!outcomes.length) return "error-body-gate: no URL could be extracted from this flag's description/recommended_actions.";
  if (outcomes[0].action === "fetch_held") {
    return `error-body-gate: scrape hold engaged (SCRAPE_HOLD) -- ${outcomes.length} URL(s) NOT attempted, never bypassed. Re-dispatch after the hold lifts.`;
  }
  const parts = outcomes.map((o) => {
    if (o.action === "recaptured" || o.action === "would_attempt_recapture") return `${o.url} -> ${o.action === "recaptured" ? "recaptured" : "would attempt recapture"}`;
    return `${o.url} -> still failing (${o.reason ?? "unresolved"}), routed to attach-found-sources worklist as ${o.host}`;
  });
  return `error-body-gate resolved: ${parts.join("; ")}.`;
}

/** Per-flag pure plan: extracted URLs plus, when `held` is true, the fetch_held outcome shape (no I/O
 *  either way -- deciding WHETHER to fetch is pure; actually fetching is main()'s job). */
export function planErrorBodyFlag(flag, held) {
  const urls = extractFailedUrls(flag);
  const itemId = flag.subject_ref;
  if (held && urls.length) {
    return { flagId: flag.id, itemId, urls, outcomes: urls.map((url) => ({ url, action: "fetch_held" })) };
  }
  return { flagId: flag.id, itemId, urls, outcomes: null }; // outcomes resolved by main() per URL (fetch is not pure)
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   holdEngaged: () => boolean,
 *   readOpenFlags: () => Promise<Array>,
 *   captureUrl: (url:string, itemId:string) => Promise<object>,
 *   insertCapture: (row:object) => Promise<void>,
 *   resolveFlag: (id:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 *   readWorklist: () => Array,
 *   writeWorklist: (rows:Array) => void,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "resolve-error-body-gate", mode, counts: {}, applied: 0, per_flag: [], read_back: {}, exitCode: 0 };

  const held = deps.holdEngaged();
  const flags = await deps.readOpenFlags();

  let urlsTotal = 0;
  let noUrlCount = 0;
  let recapturedCount = 0;
  let stillFailingCount = 0;
  let resolvedCount = 0;
  const newWorklistEntries = [];

  for (const flag of flags) {
    const plan = planErrorBodyFlag(flag, held);
    if (!plan.urls.length) {
      noUrlCount += 1;
      summary.per_flag.push({ flag_id: plan.flagId, item_id: plan.itemId, url_count: 0, outcomes: [], note: buildResolutionNote([]) });
      continue;
    }
    urlsTotal += plan.urls.length;

    if (held) {
      const note = buildResolutionNote(plan.outcomes);
      summary.per_flag.push({ flag_id: plan.flagId, item_id: plan.itemId, url_count: plan.urls.length, outcomes: plan.outcomes, note });
      continue; // never resolved while the hold is engaged -- a genuine machine block, not a bypass
    }

    const outcomes = [];
    for (const url of plan.urls) {
      if (!apply) {
        outcomes.push({ url, action: "would_attempt_recapture" });
        continue;
      }
      const result = await deps.captureUrl(url, plan.itemId);
      if (result.status === "captured") {
        recapturedCount += 1;
        await deps.insertCapture(result.row);
        outcomes.push({ url, action: "recaptured" });
      } else {
        stillFailingCount += 1;
        const host = hostOf(url);
        outcomes.push({ url, host, action: "still_failing", reason: result.reason ?? null });
        newWorklistEntries.push(buildWorklistEntry(plan.itemId, url, host, result.reason, flag.description));
      }
    }

    const note = buildResolutionNote(outcomes);
    summary.per_flag.push({ flag_id: plan.flagId, item_id: plan.itemId, url_count: plan.urls.length, outcomes, note });

    if (apply) {
      await deps.resolveFlag(plan.flagId, note);
      resolvedCount += 1;
    }
  }

  summary.counts = {
    open_flags: flags.length,
    hold_engaged: held,
    urls_total: urlsTotal,
    flags_with_no_extractable_url: noUrlCount,
    recaptured: recapturedCount,
    still_failing: stillFailingCount,
  };

  if (!apply) {
    summary.note =
      `DRY -- ${flags.length} open error-body-gate flag(s), ${urlsTotal} failed-fetch URL(s) named. ` +
      `Scrape hold ${held ? "ENGAGED (every row would report fetch_held; nothing would be attempted)" : "lifted"}. ` +
      `Nothing fetched or written.`;
    return summary;
  }

  if (newWorklistEntries.length) {
    const existing = deps.readWorklist();
    const { rows, appended } = mergeWorklistEntries(existing, newWorklistEntries);
    if (appended) deps.writeWorklist(rows);
    summary.counts.worklist_entries_appended = appended;
  } else {
    summary.counts.worklist_entries_appended = 0;
  }

  summary.applied = resolvedCount;
  summary.note = held
    ? `Scrape hold engaged -- ${flags.length} flag(s) deferred, NONE resolved, NOTHING fetched. Re-dispatch after the hold lifts.`
    : `Resolved ${resolvedCount}/${flags.length} error-body-gate flag(s): ${recapturedCount} URL(s) recaptured, ` +
      `${stillFailingCount} still failing (${summary.counts.worklist_entries_appended} new worklist entrie(s) ` +
      `appended to attach-found-sources.seed.json).`;

  const remaining = await deps.readOpenFlags();
  summary.read_back = { remaining_open: remaining.length };

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "resolve-error-body-gate",
    main,
    needsDb: true,
    buildDeps: async () => {
      const fetchImpl = makePoliteFetch({ fetchImpl: fetch });
      const worklistPath = resolve(fsiRoot(), DEFAULT_WORKLIST_RELATIVE_PATH);
      return {
        holdEngaged: () => holdEngaged(),
        readOpenFlags: () =>
          readAll("integrity_flags", FLAG_COLUMNS, {
            match: (q) => q.eq("status", "open").eq("created_by", "error-body-gate"),
          }),
        captureUrl: async (url, itemId) => {
          const result = await captureCitedUrl(url, { fetchImpl });
          if (result.status !== "captured") return { status: "held", reason: result.reason ?? null };
          return { status: "captured", row: buildCaptureSearchRow(itemId, result, new Date().toISOString(), "resolve-error-body-gate:recapture") };
        },
        insertCapture: (row) => guardedInsert("agent_run_searches", row, { cite: CITE, select: "id" }),
        resolveFlag: (id, note) =>
          guardedUpdate(
            "integrity_flags",
            (q) => q.eq("id", id),
            { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
            { cite: CITE },
          ),
        readWorklist: () => {
          if (!existsSync(worklistPath)) return [];
          try {
            const parsed = JSON.parse(readFileSync(worklistPath, "utf8"));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        },
        writeWorklist: (rows) => writeFileSync(worklistPath, `${JSON.stringify(rows, null, 2)}\n`),
      };
    },
  });
}
