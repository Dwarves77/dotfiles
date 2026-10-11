#!/usr/bin/env node

import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
// Prior art (lane L36, 2026-09-17): runCli (scripts/maintenance/lib/cli.mjs) is the shared bootstrap
// (argv scaffold, .env.local load, DB-creds-check-and-exit(2), IS_MAIN pattern) every scripts/maintenance/
// *.mjs wrapper already uses. This script hand-rolled the same boilerplate; runCli replaces it below. Its
// own --theme/--write/--execute flags and console lines are unchanged; the maintenance.yml
// generate-theme-brief step keeps calling this script's own flags directly (system-health-audit-2026-09-17.md
// section 2 names this script in the clone family).
import { runCli } from "../maintenance/lib/cli.mjs";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";
import { loadThemes, loadThemeMaterial, computeThemeGaps, buildThemeBundle } from "../turns/theme-briefs/data.mjs";
import { applyThemeBriefs, writeThemeBriefRow } from "../turns/apply-theme-briefs.mjs";

/** Default bundle budget for the single-theme print (same default as the export step). */
const BUNDLE_CHAR_BUDGET = 60000;

/**
 * Build one theme's brief input bundle over injected reads (the shared builder).
 * @returns {Promise<{ok:true,bundle:object}|{ok:false,error:string}>}
 */
export async function runTheme(themeId, deps) {
  const themes = await loadThemes(deps, [themeId]);
  if (!themes.length) return { ok: false, error: `no connection_themes row with id ${themeId}.` };
  const material = await loadThemeMaterial(deps, themes);
  const gaps = computeThemeGaps(themes, material).get(themeId) ?? [];
  const bundle = buildThemeBundle({ theme: themes[0], reason: "requested", prior: null, supersedes_theme_id: null }, material, gaps, { charBudget: BUNDLE_CHAR_BUDGET });
  return { ok: true, bundle };
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatterMd(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { ok: false, error: "Markdown payload must start with a '---' frontmatter block (theme_id / title / member_hash) followed by '---' and the brief body." };
  const [, fmBlock, body] = m;
  const fields = {};
  for (const line of fmBlock.split("\n")) {
    const kv = /^([a-zA-Z_]+):\s*(.+)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ok: true, theme_id: fields.theme_id, title: fields.title, member_hash: fields.member_hash, brief_md: body.trim() };
}

/**
 * Parse an authored brief payload file (by extension: .json or .md/.markdown). PURE.
 * @param {string} filePath
 * @param {string} fileContent
 * @returns {{ok:true, theme_id:string, title:string, brief_md:string, member_hash:string} | {ok:false, error:string}}
 */
export function parseBriefPayload(filePath, fileContent) {
  const ext = extname(filePath).toLowerCase();
  let parsed;
  if (ext === ".json") {
    try {
      const obj = JSON.parse(fileContent);
      parsed = { ok: true, theme_id: obj.theme_id, title: obj.title, brief_md: obj.brief_md, member_hash: obj.member_hash };
    } catch (e) {
      return { ok: false, error: `invalid JSON: ${e.message}` };
    }
  } else if (ext === ".md" || ext === ".markdown") {
    parsed = parseFrontmatterMd(fileContent);
    if (!parsed.ok) return parsed;
  } else {
    return { ok: false, error: `unsupported payload extension '${ext}' -- use .json or .md.` };
  }

  const missing = ["theme_id", "title", "brief_md", "member_hash"].filter((k) => !parsed[k]);
  if (missing.length) return { ok: false, error: `payload is missing required field(s): ${missing.join(", ")}.` };
  return { ok: true, theme_id: parsed.theme_id, title: parsed.title, brief_md: parsed.brief_md, member_hash: parsed.member_hash };
}

/**
 * Validate a parsed payload against the theme's LIVE member_ids -- refuses on member_hash mismatch
 * (membership drifted since the payload's author looked at the bundle). PURE.
 * @param {{theme_id:string, title:string, brief_md:string, member_hash:string}} payload
 * @param {string[]} liveMemberIds - connection_themes.member_ids, read fresh at write time
 * @returns {{ok:true, row:object} | {ok:false, error:string}}
 */
export function validateAgainstLiveMembers(payload, liveMemberIds) {
  const liveHash = computeMemberHash(liveMemberIds);
  if (payload.member_hash !== liveHash) {
    return {
      ok: false,
      error:
        `member_hash mismatch: payload was authored against ${payload.member_hash}, but the theme's LIVE ` +
        `membership now hashes to ${liveHash}. Re-run --theme ${payload.theme_id} to fetch the current bundle and re-author.`,
    };
  }
  return {
    ok: true,
    row: {
      theme_id: payload.theme_id,
      member_hash: liveHash,
      member_count: liveMemberIds.length,
      title: payload.title,
      brief_md: payload.brief_md,
      generated_at: new Date().toISOString(),
      generated_by: "session-executor",
    },
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  await runCli({ step: "generate-theme-brief", main, needsDb: true });
}

/** True when a .json payload carries the structured `sections` form. */
export function isStructuredPayload(filePath, fileContent) {
  if (extname(filePath).toLowerCase() !== ".json") return false;
  try {
    const obj = JSON.parse(fileContent);
    return obj !== null && typeof obj === "object" && obj.sections !== undefined;
  } catch {
    return false;
  }
}

/**
 * Validate and (with execute) persist one authored payload, over injected deps. Structured payloads go
 * through applyThemeBriefs (the batch validator and writer); legacy payloads through the member_hash check and
 * writeThemeBriefRow (the same writer).
 * @returns {Promise<{ok:boolean, error?:string, message?:string}>}
 */
export async function runWrite({ filePath, content, execute, deps, now = () => new Date().toISOString() }) {
  if (isStructuredPayload(filePath, content)) {
    const entry = JSON.parse(content);
    const stamp = now();
    const json = {
      batch: typeof entry.batch === "string" && entry.batch ? entry.batch : `theme-briefs-write-${stamp.slice(0, 10).replaceAll("-", "")}`,
      generated_at: stamp,
      authored_by: "session-lane",
      entries: [{ theme_id: entry.theme_id, member_hash: entry.member_hash, title: entry.title, sections: entry.sections, claims: entry.claims }],
    };
    const r = await applyThemeBriefs({ json, execute, deps, now });
    if (!r.ok) return { ok: false, error: r.fileErrors.join("; ") };
    if (r.refused.length) return { ok: false, error: r.refused.flatMap((x) => x.errors).join("; ") };
    if (r.readBackFailures.length) return { ok: false, error: `read-back failed for ${r.readBackFailures.join(", ")}` };
    return { ok: true, message: execute ? `WROTE (${r.written[0].mode}): theme_briefs row for theme ${entry.theme_id} (batch ${json.batch}).` : `payload valid for theme ${entry.theme_id} (DRY RUN).` };
  }

  const payload = parseBriefPayload(filePath, content);
  if (!payload.ok) return { ok: false, error: `payload invalid -- ${payload.error}` };
  const themes = await loadThemes(deps, [payload.theme_id]);
  if (!themes.length) return { ok: false, error: `payload's theme_id ${payload.theme_id} does not exist in connection_themes (it may have dissolved since the bundle was fetched).` };
  const validated = validateAgainstLiveMembers(payload, themes[0].member_ids);
  if (!validated.ok) return { ok: false, error: validated.error };
  if (!execute) return { ok: true, message: `payload valid for theme ${payload.theme_id} (member_hash matches live membership, ${validated.row.member_count} members) (DRY RUN).` };
  const w = await writeThemeBriefRow({ ...validated.row, generated_at: now() }, deps);
  return { ok: true, message: `WROTE (${w.mode}): theme_briefs row for theme ${payload.theme_id} (prior snapshot: ${w.snapshot}).` };
}

async function main() {
  const args = process.argv.slice(2);
  const themeIdRaw = args[args.indexOf("--theme") + 1];
  const themeId = args.includes("--theme") && themeIdRaw && !themeIdRaw.startsWith("--") ? themeIdRaw : null;
  const writePathRaw = args[args.indexOf("--write") + 1];
  const writePath = args.includes("--write") && writePathRaw && !writePathRaw.startsWith("--") ? writePathRaw : null;
  const EXECUTE = args.includes("--execute");

  if (!themeId && !writePath) {
    console.error("generate-theme-brief: one of --theme <id> or --write <file> is required.");
    process.exit(1);
  }
  if (themeId && writePath) {
    console.error("generate-theme-brief: pass --theme OR --write, not both.");
    process.exit(1);
  }

  const db = await import("../lib/db.mjs");
  const deps = { readAll: db.readAll, readAllByIds: db.readAllByIds, guardedInsert: db.guardedInsert, guardedUpdate: db.guardedUpdate };

  if (themeId) {
    const r = await runTheme(themeId, deps);
    if (!r.ok) {
      console.error(`generate-theme-brief: ${r.error}`);
      process.exit(1);
    }
    console.log(JSON.stringify(r.bundle, null, 2));
    process.exit(0);
  }

  let fileContent;
  try {
    fileContent = readFileSync(writePath, "utf8");
  } catch (e) {
    console.error(`generate-theme-brief: cannot read ${writePath}: ${e.message}`);
    process.exit(1);
  }
  const r = await runWrite({ filePath: writePath, content: fileContent, execute: EXECUTE, deps });
  if (!r.ok) {
    console.error(`generate-theme-brief: ${r.error}`);
    process.exit(1);
  }
  console.log(`generate-theme-brief: ${r.message}`);
  if (!EXECUTE) console.log("DRY RUN -- nothing written. Re-run with --execute to apply.");
  process.exit(0);
}
