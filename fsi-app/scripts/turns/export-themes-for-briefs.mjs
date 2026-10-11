#!/usr/bin/env node

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { emitThemeBriefsArtifact } from "./theme-briefs/artifact.mjs";
import { fixtureDeps } from "./theme-briefs/fixture-deps.mjs";
import {
  loadThemes, loadBriefs, loadLineage, loadThemeMaterial, computeThemeGaps, themesNeedingBrief, buildThemeBundle,
} from "./theme-briefs/data.mjs";

export const DEFAULT_CHAR_BUDGET = 60000;

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: argv,
      options: { "out-dir": { type: "string" }, "char-budget": { type: "string" }, limit: { type: "string" }, theme: { type: "string", multiple: true }, fixture: { type: "string" } },
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values["out-dir"]) return { ok: false, error: "--out-dir is required (the bundle is written there, never into the repo)" };
  const charBudget = values["char-budget"] ? Number(values["char-budget"]) : DEFAULT_CHAR_BUDGET;
  if (!Number.isFinite(charBudget) || charBudget < 1000) return { ok: false, error: `--char-budget must be a number of at least 1000, got ${JSON.stringify(values["char-budget"])}` };
  let limit = null;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit <= 0) return { ok: false, error: `--limit must be a positive integer, got ${JSON.stringify(values.limit)}` };
  }
  const themeIds = (values.theme || []).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  return { ok: true, outDir: values["out-dir"], charBudget, limit, themeIds: themeIds.length ? themeIds : null, fixture: values.fixture ?? null };
}

/**
 * The export, over injected reads. Returns the bundle file object and a summary; writes nothing.
 * @param {{readAll:Function, readAllByIds:Function}} deps
 * @param {{charBudget:number, limit?:number|null, themeIds?:string[]|null, now?:()=>string}} opts
 */
export async function buildExport(deps, { charBudget, limit = null, themeIds = null, now = () => new Date().toISOString() }) {
  const allThemes = await loadThemes(deps);
  const briefs = await loadBriefs(deps);
  const lineage = await loadLineage(deps);
  let needs = themesNeedingBrief(allThemes, briefs.rows, { lineage });
  const themesTotal = allThemes.length;
  const skippedCurrent = themesTotal - needs.length;
  if (themeIds) {
    const want = new Set(themeIds);
    needs = needs.filter((n) => want.has(n.theme.id));
  }
  const needsTotal = needs.length;
  if (limit) needs = needs.slice(0, limit);

  const material = await loadThemeMaterial(deps, needs.map((n) => n.theme));
  const gapsByTheme = computeThemeGaps(needs.map((n) => n.theme), material);
  const bundles = needs.map((n) => buildThemeBundle(n, material, gapsByTheme.get(n.theme.id) ?? [], { charBudget }));

  const byReason = { no_brief: 0, stale: 0, superseded: 0 };
  for (const n of needs) byReason[n.reason]++;
  const summary = {
    themes_total: themesTotal,
    themes_needing_brief: needsTotal,
    themes_exported: bundles.length,
    skipped_current: skippedCurrent,
    by_reason: byReason,
    briefs_have_member_ids: briefs.structured,
    members_omitted: bundles.reduce((a, b) => a + b.truncation.members_omitted, 0),
    claims_omitted: bundles.reduce((a, b) => a + b.truncation.claims_omitted, 0),
    forward_events_omitted: bundles.reduce((a, b) => a + b.truncation.forward_events_omitted, 0),
    edges_omitted: bundles.reduce((a, b) => a + b.truncation.edges_omitted, 0),
    char_budget: charBudget,
  };
  return { file: { schema_version: "tb1-export-2026-10-04.1", generated_at: now(), summary, bundles }, summary, needs };
}

/** The harness-run artifact input for one export run. Pure. */
export function exportArtifactInput({ parsed, summary, needs, outPath, startedAt }) {
  return {
    action: "export",
    startedAt,
    config: { char_budget: parsed.charBudget, limit: parsed.limit, theme_ids: parsed.themeIds, bundle_path: outPath },
    inputsRef: ["connection_themes", "theme_briefs", "connection_theme_runs"],
    perItem: needs.slice(0, summary.themes_exported).map((n) => ({
      id: n.theme.id,
      outcome: `needs_${n.reason}`,
      verdict: n.supersedes_theme_id ? `supersedes theme ${n.supersedes_theme_id}` : null,
      evidence_refs: [outPath],
      error: null,
    })),
    metrics: { ...summary, no_brief: summary.by_reason.no_brief, stale: summary.by_reason.stale, superseded: summary.by_reason.superseded },
    defectsFound: [],
    fullTraceRefs: [outPath],
    proposerNotes: "Auto-emitted by export-themes-for-briefs.mjs after the bundle was written; read-only, no database write.",
  };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`export-themes-for-briefs: ${parsed.error}\nusage: node scripts/turns/export-themes-for-briefs.mjs --out-dir <dir> [--char-budget N] [--limit N] [--theme <id,id>]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("export-themes-for-briefs: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const startedAt = new Date().toISOString();
  let deps;
  if (parsed.fixture) {
    deps = fixtureDeps(JSON.parse(readFileSync(resolve(parsed.fixture), "utf8")));
  } else {
    const { readAll, readAllByIds } = await import("../lib/db.mjs");
    deps = { readAll, readAllByIds };
  }
  const { file, summary, needs } = await buildExport(deps, parsed);

  mkdirSync(resolve(parsed.outDir), { recursive: true });
  const outPath = join(resolve(parsed.outDir), `theme-briefs-export-${startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(file, null, 2));
  console.log(`export-themes-for-briefs: ${summary.themes_exported} of ${summary.themes_needing_brief} theme(s) needing a brief exported (${summary.themes_total} themes total; no_brief=${summary.by_reason.no_brief} stale=${summary.by_reason.stale} superseded=${summary.by_reason.superseded}) to ${outPath}`);
  console.log(`export-themes-for-briefs: truncation under --char-budget ${summary.char_budget}: members omitted ${summary.members_omitted}, claims omitted ${summary.claims_omitted}, forward events omitted ${summary.forward_events_omitted}, edges omitted ${summary.edges_omitted}`);

  if (parsed.fixture) {
    console.log("export-themes-for-briefs: --fixture run, no harness-run artifact written.");
    process.exit(0);
  }
  const artifactPath = emitThemeBriefsArtifact(exportArtifactInput({ parsed, summary, needs, outPath, startedAt }));
  console.log(`export-themes-for-briefs: wrote ${artifactPath}`);
  process.exit(0);
}
