#!/usr/bin/env node

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";
import { validateThemeBriefsFile, renderBriefMd, THEME_BRIEFS_SCHEMA_VERSION } from "./theme-briefs/schema.mjs";
import { loadThemes, loadThemeMaterial, computeThemeGaps, buildValidationContext } from "./theme-briefs/data.mjs";
import { emitThemeBriefsArtifact } from "./theme-briefs/artifact.mjs";
import { fixtureDeps } from "./theme-briefs/fixture-deps.mjs";

export const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "theme-briefs apply: persist validated session-authored theme briefs to theme_briefs (guarded path, rule 015).",
};

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: argv, options: { briefs: { type: "string" }, execute: { type: "boolean" }, fixture: { type: "string" } }, strict: true }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.briefs) return { ok: false, error: "--briefs <batch.json> is required (one named batch file per run)" };
  return { ok: true, briefs: values.briefs, execute: values.execute === true, fixture: values.fixture ?? null };
}

/**
 * The theme_briefs row for a validated entry. `structured` says whether migration 351's columns exist.
 * generated_by is the batch name; generated_at is the caller's clock.
 */
export function buildThemeBriefRow(entry, { batch, themeMemberIds, nowIso, structured }) {
  const row = {
    theme_id: entry.theme_id,
    member_hash: computeMemberHash(themeMemberIds),
    member_count: themeMemberIds.length,
    title: entry.title.trim(),
    brief_md: renderBriefMd(entry),
    generated_at: nowIso,
    generated_by: batch,
  };
  if (structured) {
    row.sections = entry.sections;
    row.claims = entry.claims;
    row.member_ids = [...themeMemberIds].sort();
  }
  return row;
}

/** True when theme_briefs has migration 351's columns. A read error that names a column means not yet. */
export async function probeStructuredColumns({ readAll }) {
  try {
    await readAll("theme_briefs", "theme_id, sections, claims, member_ids", { orderBy: "theme_id" });
    return true;
  } catch (err) {
    if (/column|sections|claims|member_ids/i.test(String(err?.message ?? err))) return false;
    throw err;
  }
}

/**
 * Write one theme_briefs row through the guarded path: guardedInsert when no row exists for the theme,
 * guardedUpdate (which snapshots the prior row) when one does. The one writer of the table.
 * @param {object} row
 * @param {{readAll:Function, guardedInsert:Function, guardedUpdate:Function}} deps
 * @returns {Promise<{mode:"insert"|"update", snapshot:string|null}>}
 */
export async function writeThemeBriefRow(row, { readAll, guardedInsert, guardedUpdate }) {
  const existing = await readAll("theme_briefs", "theme_id", { orderBy: "theme_id", match: (q) => q.eq("theme_id", row.theme_id) });
  if (existing.length) {
    const res = await guardedUpdate("theme_briefs", (qb) => qb.eq("theme_id", row.theme_id), row, { cite: CITE });
    return { mode: "update", snapshot: res.snapshot ?? null };
  }
  const res = await guardedInsert("theme_briefs", row, { cite: CITE, select: "theme_id" });
  return { mode: "insert", snapshot: res.snapshot ?? null };
}

/**
 * Validate a parsed batch against the live database and (with execute) write the valid entries.
 * @param {{json:object, execute:boolean, deps:{readAll:Function, readAllByIds:Function, guardedInsert?:Function, guardedUpdate?:Function}, now?:()=>string}} o
 */
export async function applyThemeBriefs({ json, execute, deps, now = () => new Date().toISOString() }) {
  const entryThemeIds = Array.isArray(json?.entries) ? [...new Set(json.entries.map((e) => e?.theme_id).filter((x) => typeof x === "string"))] : [];
  const themes = await loadThemes(deps, entryThemeIds);
  const material = await loadThemeMaterial(deps, themes);
  const gapsByTheme = computeThemeGaps(themes, material);
  const ctx = buildValidationContext(themes, material, gapsByTheme);
  const verdict = validateThemeBriefsFile(json, ctx);
  const result = { schema_version: THEME_BRIEFS_SCHEMA_VERSION, batch: json?.batch ?? null, ok: verdict.ok, fileErrors: verdict.fileErrors, valid: verdict.valid, refused: verdict.refused, written: [], readBackFailures: [], structured: null };
  if (!verdict.ok || !verdict.valid.length) return result;

  result.structured = await probeStructuredColumns(deps);
  const themeById = new Map(themes.map((t) => [t.id, t]));
  for (const entry of verdict.valid) {
    const theme = themeById.get(entry.theme_id);
    const row = buildThemeBriefRow(entry, { batch: json.batch, themeMemberIds: theme.member_ids, nowIso: now(), structured: result.structured });
    if (!execute) {
      result.written.push({ theme_id: entry.theme_id, mode: "dry", snapshot: null });
      continue;
    }
    const w = await writeThemeBriefRow(row, deps);
    result.written.push({ theme_id: entry.theme_id, mode: w.mode, snapshot: w.snapshot });
  }
  if (execute) {
    const ids = result.written.map((w) => w.theme_id);
    const back = await deps.readAllByIds("theme_briefs", "theme_id, member_hash, generated_by", ids, { idColumn: "theme_id" });
    const byId = new Map(back.map((r) => [r.theme_id, r]));
    for (const entry of verdict.valid) {
      const stored = byId.get(entry.theme_id);
      const want = computeMemberHash(themeById.get(entry.theme_id).member_ids);
      if (!stored || stored.member_hash !== want || stored.generated_by !== json.batch) result.readBackFailures.push(entry.theme_id);
    }
  }
  return result;
}

/** The harness-run artifact input for one apply run. Pure. */
export function applyArtifactInput({ parsed, r, briefsPath, startedAt }) {
  const readBackBad = new Set(r.readBackFailures);
  const perItem = [
    ...r.valid.map((e) => ({
      id: e.theme_id,
      outcome: parsed.execute ? (readBackBad.has(e.theme_id) ? "written_readback_failed" : "applied") : "valid_dry",
      verdict: "ok",
      evidence_refs: [briefsPath],
      error: readBackBad.has(e.theme_id) ? "stored member_hash or generated_by did not match what was written" : null,
    })),
    ...r.refused.map((f) => ({ id: f.theme_id ?? `entry-${f.index}`, outcome: "refused", verdict: f.errors[0] ?? "refused", evidence_refs: [briefsPath], error: f.errors.join(" | ") })),
  ];
  return {
    action: "apply",
    startedAt,
    config: { mode: parsed.execute ? "apply" : "dry", batch: r.batch, briefs_file: parsed.briefs, structured_columns: r.structured },
    inputsRef: [parsed.briefs],
    perItem: perItem.length ? perItem : [{ id: r.batch ?? "batch", outcome: "no_entries", verdict: r.fileErrors.join(" | ") || "no valid entries", evidence_refs: [briefsPath], error: r.fileErrors[0] ?? null }],
    metrics: { entries_total: r.valid.length + r.refused.length, valid: r.valid.length, refused: r.refused.length, written: parsed.execute ? r.written.length : 0, read_back_failures: r.readBackFailures.length },
    defectsFound: [
      ...r.fileErrors.map((e) => ({ description: `batch file refused: ${e}`, root_cause: "structural problem in the committed batch file", fix_ref: null })),
      ...r.refused.map((f) => ({ description: `entry ${f.index} (theme ${f.theme_id ?? "?"}) refused: ${f.errors.length} reason(s)`, root_cause: f.errors[0] ?? "", fix_ref: null })),
    ],
    fullTraceRefs: [briefsPath],
    proposerNotes: "Auto-emitted by apply-theme-briefs.mjs. Refused entries are residue with their reasons in per_item; they never blocked the valid entries.",
  };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-theme-briefs: ${parsed.error}\nusage: node scripts/turns/apply-theme-briefs.mjs --briefs <batch.json> [--execute]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("apply-theme-briefs: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const briefsPath = resolve(parsed.briefs);
  let json;
  try {
    json = JSON.parse(readFileSync(briefsPath, "utf8"));
  } catch (err) {
    console.error(`apply-theme-briefs: cannot read or parse ${briefsPath}: ${err.message}`);
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  let deps;
  if (parsed.fixture) {
    deps = fixtureDeps(JSON.parse(readFileSync(resolve(parsed.fixture), "utf8")));
  } else {
    const db = await import("../lib/db.mjs");
    deps = { readAll: db.readAll, readAllByIds: db.readAllByIds, guardedInsert: db.guardedInsert, guardedUpdate: db.guardedUpdate };
  }
  const r = await applyThemeBriefs({ json, execute: parsed.execute, deps });

  if (!r.ok) {
    for (const e of r.fileErrors) console.error(`apply-theme-briefs: ${e}`);
  }
  console.log(`apply-theme-briefs: batch ${r.batch ?? "(unnamed)"}: ${r.valid.length} valid, ${r.refused.length} refused${parsed.execute ? "" : " (DRY RUN, nothing written)"}.`);
  for (const f of r.refused) for (const e of f.errors) console.log(`  REFUSED ${e}`);
  for (const w of r.written) console.log(`  ${w.mode === "dry" ? "WOULD WRITE" : `WROTE (${w.mode})`} theme_briefs ${w.theme_id}${w.snapshot ? ` (prior snapshot ${w.snapshot})` : ""}`);
  if (r.readBackFailures.length) console.error(`apply-theme-briefs: read-back FAILED for ${r.readBackFailures.join(", ")}`);

  if (parsed.fixture) {
    console.log("apply-theme-briefs: --fixture run, no harness-run artifact written.");
    process.exit(!r.ok || r.readBackFailures.length ? 1 : 0);
  }
  const artifactPath = emitThemeBriefsArtifact(applyArtifactInput({ parsed, r, briefsPath, startedAt }));
  console.log(`apply-theme-briefs: wrote ${artifactPath}`);
  process.exit(!r.ok || r.readBackFailures.length ? 1 : 0);
}
