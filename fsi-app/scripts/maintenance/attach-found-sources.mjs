// attach-found-sources.mjs — MAINT dispatch step (Lane ATTACH-SOURCES, 2026-09-05, W3.1 per
// docs/plans/complete-system-build-plan-2026-09-04.md).
//
// THE GAP THIS CLOSES. wiring-audit-2026-09-04.md gap 4 / C1-loop-map.md §6: HEAL apply #42
// (2026-09-04) measured 443 Gate-A orphan figures on 76 quarantined items that `scripts/mint/
// heal-provenance.mjs`'s own STEP SOURCE could not resolve at $0 — every candidate URL it could derive
// from the item's OWN citations (`candidateUrlsForOrphan`) was tried and exhausted (`no_candidate_url` /
// `unresolved`). The operator's standing ruling on this file (heal-provenance.mjs's own header,
// 2026-09-03, verbatim): "if items are being flagged as not credible for the site because of not having
// sources that is an issue with finding the source not that item. you need to attach a source." The $0,
// no-LLM lever this step arms: a session Haiku BROWSER lane (never this runtime, never an API call from
// here) does the actual web search a human would do, and hands back what it found as a worklist row
// `{ item_id, token, url, quote }`. This step consumes that worklist THROUGH heal-provenance.mjs's own
// STEP SOURCE (ELEVENTH PASS there, `deps.foundSourcesForItem` — see that file's own header) — never a
// second grounding mechanism: the SAME class-table tier (SC-13, never invented), the SAME verbatim
// `locateSpanInText` requirement (the worklist's own `quote` is carried through only as audit evidence,
// never trusted as a substitute for the token appearing on the fetched page), and the SAME guarded
// `insertClaim`/`registerSource` write path (rule 015) every other STEP SOURCE outcome already uses.
//
// WORKLIST CONTRACT (also documented in docs/runbooks/MAINTENANCE-RUNBOOK.md's own section for this
// step — read that copy before filling one). A JSON file: an array of
//   { item_id: string, token: string, url: string, quote: string }
// `item_id` and `token` come from the SEED (below) verbatim — never retyped, so a token this step tries
// is byte-identical to the Gate-A orphan token that was actually measured. `url` is the page the Haiku
// browser lane found stating the figure; `quote` is the verbatim sentence/clause it read there (evidence
// for the coordinator/operator to cross-check, never itself the grounding needle — GROUND still requires
// `token` verbatim on the FETCHED page, under this file's normal normalization). A row missing `url` or
// `quote` (i.e. still a bare seed row the browser lane has not filled yet) is skipped as NOT READY, never
// an error — dispatching against the raw, unfilled seed is always a safe no-op.
//
// THE SEED (item_id + token, deliberately WITHOUT url/quote — the browser lane fills those, never this
// step). Generated from heal-provenance.mjs's OWN measurement, never a second orphan-detection mechanism:
// dispatch `provenance-heal --mode dry --arg <the 76 quarantined items>` (or `quarantined-live` broadly),
// download that run's `summary.json`, then
//   node scripts/maintenance/lib/extract-worklist-seed.mjs <summary.json> scripts/_worklists/attach-found-sources.seed.json
// (`extract-worklist-seed.mjs`, this same lane) pulls every `steps.source[]` entry whose `outcome` is
// `no_candidate_url` or `unresolved` into `{ item_id, token }` seed rows — see that script's own header.
//
// `--arg`: the worklist file's path (relative to the fsi-app root, or absolute). Required in both modes —
// there is no default population the way `provenance-heal`'s blank arg means (this step has nothing to
// select without a worklist). `mode=dry` reads the SAME selection and runs the SAME STEP SOURCE plan as
// `mode=apply` (via heal-provenance.mjs's own `main()`) with zero writes and zero fetches beyond what
// `mode=dry` already means there. `mode=apply` writes through the SAME guarded path provenance-heal uses.
//
// IDEMPOTENT BY CONSTRUCTION, not by extra bookkeeping here: a token STEP SOURCE has already grounded
// (this dispatch or an earlier one) is no longer a Gate-A orphan on the next fresh scan, so it is never
// offered a worklist candidate to try again — re-dispatching the SAME worklist against an item with no
// remaining orphans is a clean no-op, never a duplicate write.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { main as healMain } from "../mint/heal-provenance.mjs";
import { buildHealDeps } from "./provenance-heal.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "attach-found-sources-2026-09-05",
  reason:
    "MAINT attach-found-sources dispatch (Lane ATTACH-SOURCES, W3.1): consumes a Haiku-browser-lane " +
    "worklist ({item_id, token, url, quote}) through scripts/mint/heal-provenance.mjs's own STEP SOURCE " +
    "(the SAME class-table tier, verbatim locate, and guarded write every other STEP SOURCE outcome " +
    "uses) to attach the source a Gate-A orphan figure was missing, per the operator's ruling that a " +
    "missing source is this repo's gap to close, not evidence the item is bad.",
});

/** True when `row` carries enough to actually try (item_id, token, url, quote all non-empty strings).
 *  Pure. A row missing url/quote is a bare, not-yet-filled SEED row — NOT an error. */
export function isWorklistRowReady(row) {
  return !!(row && String(row.item_id ?? "").trim() && String(row.token ?? "").trim() &&
    String(row.url ?? "").trim() && String(row.quote ?? "").trim());
}

/**
 * Validates and partitions a raw worklist array into { ready, notReady, malformed }. Pure.
 *  - `malformed`: not an object, or missing item_id/token entirely (cannot even be grouped) — reported,
 *    never silently dropped.
 *  - `notReady`: has item_id/token but no url/quote yet (a bare seed row).
 *  - `ready`: has all four fields.
 */
export function partitionWorklist(rows) {
  const ready = [];
  const notReady = [];
  const malformed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object" || !String(row.item_id ?? "").trim() || !String(row.token ?? "").trim()) {
      malformed.push(row);
      continue;
    }
    if (isWorklistRowReady(row)) ready.push(row);
    else notReady.push(row);
  }
  return { ready, notReady, malformed };
}

/**
 * Filters a raw worklist array to a bounded, item-scoped slice BEFORE partitionWorklist ever sees it
 * (lane M6b item 4, chained gate-a-rescan.yml step). Pure. `itemIds`, when given (an array or Set),
 * keeps only rows whose `item_id` is a member -- the exact set the gate-a-rescan run left with
 * `orphan_count > 0`, never a wider corpus-wide pass. `limit`, when given, caps the RETURNED row count
 * (applied after the itemIds filter, preserving row order) -- the chained step's own `CHAINED_LIMIT`
 * bound. Either filter absent/null is a no-op for that axis, so an unfiltered call behaves exactly as
 * before this lane (every existing caller/test that never passes these options is unaffected).
 * @param {unknown[]} rows
 * @param {{ itemIds?: Iterable<string>|null, limit?: number|null }} [opts]
 * @returns {unknown[]}
 */
export function filterWorklistRows(rows, { itemIds = null, limit = null } = {}) {
  let out = Array.isArray(rows) ? rows : [];
  if (itemIds) {
    const wanted = itemIds instanceof Set ? itemIds : new Set(itemIds);
    out = out.filter((row) => row && wanted.has(row.item_id));
  }
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    out = out.slice(0, limit);
  }
  return out;
}

/**
 * Groups READY worklist rows into the shape heal-provenance.mjs's `deps.foundSourcesForItem` expects:
 * `Map<item_id, { [token]: [{ url, quote }, ...] }>`. Pure. Multiple rows for the same (item_id, token)
 * accumulate — STEP SOURCE tries them in the order given, first match wins (candidateUrlsForOrphan's own
 * documented behavior, unchanged by this step).
 */
export function groupWorklistByItem(readyRows) {
  const byItem = new Map();
  for (const row of readyRows) {
    const perItem = byItem.get(row.item_id) ?? {};
    const list = perItem[row.token] ?? [];
    list.push({ url: row.url, quote: row.quote });
    perItem[row.token] = list;
    byItem.set(row.item_id, perItem);
  }
  return byItem;
}

/** Every `via: "worklist"` outcome across a heal-provenance summary's `per_item[].steps.source[]` — the
 *  count of orphans THIS worklist actually grounded (STEP SOURCE's own reporting, never recomputed). */
export function countGroundedViaWorklist(perItem) {
  let n = 0;
  for (const entry of perItem ?? []) {
    for (const s of entry?.steps?.source ?? []) if (s?.via === "worklist") n += 1;
  }
  return n;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {object} deps — every heal-provenance.mjs dep (see buildHealDeps) PLUS `readWorklistFile(path)`
 *   -> Promise<array>, injected so this stays DB/fs-free under `node --test` (rule: DI, DRY by default).
 *   PLUS (lane M6b item 4) OPTIONAL `itemIdsFilter` (array|Set|null) and `rowLimit` (number|null),
 *   applied via `filterWorklistRows` immediately after the read, BEFORE partitionWorklist -- the chained
 *   gate-a-rescan.yml step's own item-id scope and CHAINED_LIMIT bound. Absent on every existing caller
 *   (provenance-heal's own dispatch, every prior test), so behaviour there is unchanged.
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const path = String(arg ?? "").trim();
  if (!path) {
    return {
      step: "attach-found-sources", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: 'REFUSED — --arg must name the worklist JSON file path (e.g. "scripts/_worklists/<name>.json"). See this step\'s own header for the {item_id, token, url, quote} contract.',
    };
  }

  let rawRows;
  try {
    rawRows = await deps.readWorklistFile(path);
  } catch (e) {
    return {
      step: "attach-found-sources", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: `REFUSED — could not read worklist file '${path}': ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const rows = filterWorklistRows(rawRows, { itemIds: deps.itemIdsFilter ?? null, limit: deps.rowLimit ?? null });
  const { ready, notReady, malformed } = partitionWorklist(rows);
  const baseCounts = {
    worklist_rows: Array.isArray(rawRows) ? rawRows.length : 0,
    // rows_offered (brief item 4): the row count AFTER the itemIds/limit filter -- what this run actually
    // had to work with, distinct from worklist_rows (the file's own total before scoping).
    rows_offered: rows.length,
    worklist_ready: ready.length,
    worklist_not_ready: notReady.length,
    worklist_malformed: malformed.length,
  };

  if (ready.length === 0) {
    return {
      step: "attach-found-sources", mode, counts: baseCounts, applied: 0, read_back: {}, exitCode: 0,
      note: notReady.length
        ? `Nothing to do — ${notReady.length} worklist row(s) present but none carry url+quote yet (a seed the browser lane has not filled). No fetch, no write.`
        : "Nothing to do -- the worklist is empty (or nothing matched this run's own item-id/limit scope).",
    };
  }

  const byItem = groupWorklistByItem(ready);
  const ids = [...byItem.keys()];
  const heal = await healMain(
    { mode, arg: `ids:${ids.join(",")}`, out: null },
    { ...deps, foundSourcesForItem: (itemId) => byItem.get(itemId) ?? {} },
  );

  return {
    step: "attach-found-sources",
    mode,
    counts: {
      ...baseCounts,
      items_selected: ids.length,
      grounded_via_worklist: countGroundedViaWorklist(heal.per_item),
      heal: heal.counts,
    },
    applied: heal.applied ?? 0,
    read_back: {},
    heal,
    exitCode: typeof heal.exitCode === "number" ? heal.exitCode : 0,
  };
}

/**
 * Parses `--items-file <path>` and `--limit <n>` out of raw argv (lane M6b item 4) -- a SEPARATE, small
 * parse from runCli's own --mode/--arg/--out (that contract stays fixed for every scripts/maintenance/
 * *.mjs step). Both optional; absent on every existing dispatch. Pure. `--items-file` names a local JSON
 * file holding either a bare array of item ids or `{ ids: [...] }`; reading it is the CLI entrypoint's
 * own job (see below), not this parser's.
 * @param {string[]} argv
 * @returns {{ itemsFile: string|null, limit: number|null }}
 */
export function parseExtraCliArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const itemsFile = get("--items-file") ?? null;
  const limitRaw = get("--limit");
  const limit = limitRaw !== undefined ? Number(limitRaw) : null;
  return { itemsFile, limit: Number.isFinite(limit) ? limit : null };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const { itemsFile, limit } = parseExtraCliArgs(process.argv.slice(2));
  await runCli({
    step: "attach-found-sources",
    main,
    needsDb: true,
    buildDeps: async () => {
      let itemIdsFilter = null;
      if (itemsFile) {
        const raw = JSON.parse(readFileSync(resolve(fsiRoot(), itemsFile), "utf8"));
        itemIdsFilter = Array.isArray(raw) ? raw : (Array.isArray(raw?.ids) ? raw.ids : []);
      }
      return {
        ...(await buildHealDeps()),
        readWorklistFile: async (path) => JSON.parse(readFileSync(resolve(fsiRoot(), path), "utf8")),
        itemIdsFilter,
        rowLimit: limit,
      };
    },
  });
}
