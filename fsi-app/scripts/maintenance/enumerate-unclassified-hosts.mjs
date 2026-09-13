#!/usr/bin/env node
// enumerate-unclassified-hosts.mjs -- MAINT step, defect D14 item 2 (docs/plans/defect-fix-plan-2026-09-12.md).
//
// READ-ONLY. Writes NOTHING to the database, ever -- there is no `--mode apply` branch, no guardedUpdate,
// no guardedInsert. `mode` is accepted only for parity with the runCli/composite-action contract every
// MAINT step shares; this step behaves identically regardless of its value. The coordinator runs it
// through maintenance.yml as a dry-only step named `enumerate-unclassified-hosts` (this step never mints
// a class-table rule itself -- SC-13 (source-credibility-model skill Section 3) forbids a model or a
// script guessing a tier; only the coordinator, a doctrine act, rules a host's class from this list).
//
// WHAT IT DOES. Lists every host of the pending `provisional_sources` rows and the `sources` rows with
// status='provisional' that rule (a) (existingTierForHost, an existing active institution) and rule (b)
// (classTierForHost, the SC-13 class table -- including the D14 government-label and legal-publisher
// extension just landed alongside this script) STILL do not resolve -- the residue defect D14 item 1
// could not close deterministically. Per host: the row's own stored `name`, `discovered_via`, the
// citing item's title where one exists (a match against `agent_run_searches.result_url`'s host, joined
// to `intelligence_items.title` via `intelligence_item_id` -- the only live table that records which
// item's agent run surfaced a given URL; provisional_sources/sources carry no item reference of their
// own), and the row count. Never a guessed tier, never an auto-registration -- this step only LISTS.
//
// OUTPUT. Two files written directly to this run's own `--out` directory (never the repo, per standing
// rule 5 -- machine evidence never lands in docs/ top level): `unclassified-hosts.json` (the full
// per-host detail) and `unclassified-hosts.md` (the same data as a Markdown table, for the coordinator
// to read directly off the run artifact). `runCli`'s own `summary.json` (counts only) is written
// alongside them, same as every other MAINT step.
//
// REUSE, NEVER A SECOND COPY: `existingTierForHost` (scripts/maintenance/canonical-autoverify.mjs, rule
// a) and `classTierForHost` (src/lib/sources/host-authority.ts, rule b) are the SAME functions
// resolve-provisional-sources.mjs consumes -- this step's residue is defined as "whatever that step's
// own rule a/b would leave unresolved", so it must run the identical two functions, never a re-derived
// approximation. `hostOf` (scripts/lib/db.mjs) is the same host-extraction helper every maintenance
// script in this family uses.
import { readAll, hostOf } from "../lib/db.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { existingTierForHost } from "./canonical-autoverify.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D14 item 2",
  reason:
    "Read-only enumeration of the provisional_sources/sources hosts that rule (a) and rule (b), as " +
    "extended by D14, still do not resolve -- lists them (name, discovered_via, citing item title, row " +
    "count) for the coordinator's own class-table ruling; writes to the run's own out-dir only, never " +
    "the database and never the repo.",
});

// ---------------------------------------------------------------------------------------------------
// Pure grouping logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/**
 * True when a row's host resolves under NEITHER rule (a) nor rule (b). Pure, no I/O.
 * @param {string|null} host
 * @param {{ existingTier: number|null, classTier: number|null }} resolved
 */
export function isUnresolved(host, { existingTier, classTier }) {
  return host != null && existingTier == null && classTier == null;
}

/**
 * Groups the residue rows from both tables by host, attaching each host's stored names,
 * `discovered_via` values, and any citing item title found in the search log. Pure: no I/O, no DB, no
 * fetch. Callers resolve `existingTier`/`classTier` per row (against the live registry / class table)
 * and pre-filter with `isUnresolved` before calling this -- this function only groups and joins.
 * @param {Array<{ table: "provisional_sources"|"sources", id: string, host: string, name?: string|null, discovered_via?: string|null }>} rows
 * @param {Map<string, Array<{ intelligence_item_id: string|null }>>} searchResultsByHost host -> the
 *   agent_run_searches rows whose result_url's host matches (caller pre-groups; pure here)
 * @param {Map<string, string>} itemTitleById intelligence_items.id -> title
 * @returns {Array<{ host: string, row_count: number, tables: string[], names: string[], discovered_via: string[], citing_item_titles: string[] }>}
 *   sorted by row_count desc, then host asc (largest residue clusters first).
 */
export function groupUnresolvedHosts(rows, searchResultsByHost, itemTitleById) {
  const byHost = new Map();
  for (const row of rows) {
    if (!byHost.has(row.host)) {
      byHost.set(row.host, { host: row.host, tables: new Set(), names: new Set(), discovered_via: new Set(), row_count: 0 });
    }
    const g = byHost.get(row.host);
    g.row_count += 1;
    g.tables.add(row.table);
    if (row.name) g.names.add(row.name);
    if (row.discovered_via) g.discovered_via.add(row.discovered_via);
  }

  const out = [];
  for (const g of byHost.values()) {
    const citingTitles = new Set();
    for (const sr of searchResultsByHost.get(g.host) ?? []) {
      const title = sr.intelligence_item_id ? itemTitleById.get(sr.intelligence_item_id) : null;
      if (title) citingTitles.add(title);
    }
    out.push({
      host: g.host,
      row_count: g.row_count,
      tables: [...g.tables].sort(),
      names: [...g.names].sort(),
      discovered_via: [...g.discovered_via].sort(),
      citing_item_titles: [...citingTitles].sort(),
    });
  }
  return out.sort((a, b) => b.row_count - a.row_count || a.host.localeCompare(b.host));
}

/** Groups a flat list of `{ result_url, intelligence_item_id }` search-log rows by the URL's host
 *  (via the caller-supplied `hostOfFn`, so this stays pure / dependency-injected). Rows whose URL has
 *  no parsable host are dropped -- they cannot join to any provisional/sources host either. */
export function indexSearchResultsByHost(searchRows, hostOfFn) {
  const byHost = new Map();
  for (const r of searchRows ?? []) {
    const host = r.result_url ? hostOfFn(r.result_url) : null;
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push({ intelligence_item_id: r.intelligence_item_id ?? null });
  }
  return byHost;
}

/** Renders the per-host list as a Markdown table (the artifact the coordinator reads directly). Pure. */
export function renderMarkdown(hosts, { generatedAt }) {
  const lines = [
    "# Unclassified provisional-source hosts (defect D14 item 2)",
    "",
    `Generated: ${generatedAt}`,
    "",
    `${hosts.length} host(s) resolve under neither rule (a) (existing institution) nor rule (b) ` +
      "(SC-13 class table, including the D14 government-label / legal-publisher extension). Each " +
      "stays worklisted (never rejected, per D13) until the coordinator rules its class.",
    "",
    "| Host | Row count | Table(s) | Stored name(s) | Discovered via | Citing item title(s) |",
    "|---|---|---|---|---|---|",
  ];
  for (const h of hosts) {
    lines.push(
      `| ${h.host} | ${h.row_count} | ${h.tables.join(", ")} | ${h.names.join("; ") || "-"} | ` +
        `${h.discovered_via.join(", ") || "-"} | ${h.citing_item_titles.join("; ") || "-"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs). Read-only: `mode` is
// accepted for parity with every other MAINT step but never branches this step's behaviour.
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply", out?: string|null }} opts
 * @param {{
 *   readPendingProvisional: () => Promise<Array>,
 *   readProvisionalSourcesRows: () => Promise<Array>,
 *   readActiveSources: () => Promise<Array>,
 *   readSearchLog: () => Promise<Array<{ result_url: string|null, intelligence_item_id: string|null }>>,
 *   readItemTitles: () => Promise<Array<{ id: string, title: string|null }>>,
 *   classTierForHost: (host: string, name?: string|null) => number|null,
 *   now?: () => string,
 * }} deps
 */
export async function main({ out = null } = {}, deps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const classTierFn = deps.classTierForHost ?? classTierForHost;

  const [pendingProvisional, sourcesProvisional, activeSources, searchRows, itemRows] = await Promise.all([
    deps.readPendingProvisional(),
    deps.readProvisionalSourcesRows(),
    deps.readActiveSources(),
    deps.readSearchLog(),
    deps.readItemTitles(),
  ]);

  const unresolvedRows = [];
  const collect = (table, rows) => {
    for (const row of rows) {
      const host = row.url ? hostOf(row.url) : null;
      if (!host) continue; // no parsable host: a different residue class (resolve-provisional-sources's own worklist), not this list's job
      const existingTier = existingTierForHost(host, activeSources)?.tier ?? null;
      // D14 residue ruling (2026-09-13): thread the row's OWN stored `name` so this step's definition of
      // "unresolved" stays IDENTICAL to resolve-provisional-sources.mjs's own rule (b) -- this step's own
      // header says its residue is defined as "whatever that step's own rule a/b would leave unresolved",
      // so it must call classTierForHost with the SAME arguments, never a narrower approximation.
      const classTier = existingTier == null ? classTierFn(host, row.name) : null;
      if (isUnresolved(host, { existingTier, classTier })) {
        unresolvedRows.push({ table, id: row.id, host, name: row.name ?? null, discovered_via: row.discovered_via ?? null });
      }
    }
  };
  collect("provisional_sources", pendingProvisional);
  collect("sources", sourcesProvisional);

  const searchResultsByHost = indexSearchResultsByHost(searchRows, hostOf);
  const itemTitleById = new Map(itemRows.map((r) => [r.id, r.title ?? null]));
  const hosts = groupUnresolvedHosts(unresolvedRows, searchResultsByHost, itemTitleById);

  const generatedAt = now();
  const summary = {
    step: "enumerate-unclassified-hosts",
    mode: "dry", // read-only always; no apply branch exists for this step
    counts: {
      pending_provisional_sources: pendingProvisional.length,
      sources_provisional: sourcesProvisional.length,
      unresolved_rows: unresolvedRows.length,
      unresolved_hosts: hosts.length,
    },
    applied: 0,
    read_back: {},
    generated_at: generatedAt,
    exitCode: 0,
  };

  if (out) {
    mkdirSync(out, { recursive: true });
    const jsonPath = join(out, "unclassified-hosts.json");
    const mdPath = join(out, "unclassified-hosts.md");
    writeFileSync(jsonPath, JSON.stringify({ generated_at: generatedAt, hosts }, null, 2) + "\n");
    writeFileSync(mdPath, renderMarkdown(hosts, { generatedAt }));
    summary.artifacts = { json: jsonPath, markdown: mdPath };
  }
  summary.note =
    `${hosts.length} unclassified host(s) across ${unresolvedRows.length} row(s) ` +
    `(${pendingProvisional.length} pending provisional_sources, ${sourcesProvisional.length} ` +
    `sources rows with status='provisional'). Nothing written to the database. ${out ? "Artifact " +
    "written to " + out + "." : "No --out given; artifact not written."}`;

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "enumerate-unclassified-hosts",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readPendingProvisional: () =>
        readAll(
          "provisional_sources",
          "id, name, url, discovered_via, status",
          { match: (q) => q.in("status", ["pending_review", "needs_more_data"]) },
        ),
      readProvisionalSourcesRows: () =>
        readAll("sources", "id, name, url, status", { match: (q) => q.eq("status", "provisional") }),
      // Same shape as resolve-provisional-sources.mjs's own readActiveSources: read the whole live
      // registry once, resolve many rows against it, never per-row.
      readActiveSources: () => readAll("sources", "id, url, status, base_tier, tier_override", {}),
      readSearchLog: () => readAll("agent_run_searches", "result_url, intelligence_item_id", {}),
      readItemTitles: () => readAll("intelligence_items", "id, title", {}),
    }),
  });
}
