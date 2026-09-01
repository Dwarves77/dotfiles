#!/usr/bin/env node
// generate-theme-brief.mjs — theme_briefs (migration 266, flywheel U6) has NO WRITER anywhere in the
// repo (verified: `grep -rl "from(\"theme_briefs\")"` before this file existed matched only
// api/admin/themes/route.ts's READ). This is that writer, in two steps matching migration 266's own
// $0/session-executed posture (no LLM call inside this script — a human or an in-session agent
// authors the actual brief prose; this script assembles the input and validates/persists the output):
//
//   --theme <id>   assembles the BRIEF INPUT BUNDLE (theme row, member items, their intra-theme edges,
//                  their forward events) and prints it as JSON for in-session authoring. The bundle
//                  carries member_hash (computeMemberHash over the theme's CURRENT member_ids, see
//                  brief-staleness.mjs) so the author's payload can later prove it was written against
//                  THIS exact membership.
//   --write <file> validates an authored brief payload (JSON or Markdown-with-frontmatter — see
//                  parseBriefPayload below) and upserts the theme_briefs row via the guarded path.
//                  Refuses if the payload's member_hash no longer matches the theme's LIVE
//                  member_ids (membership drifted between --theme and --write — the same
//                  staleness-is-detected-never-silent posture migration 266's own header states,
//                  applied here at WRITE time instead of read time).
//
// THE ONE computeMemberHash SoT: src/lib/connections/brief-staleness.mjs — "sort member_ids
// lexicographically, join empty string, md5 hex". This script imports it, never re-implements it (a
// second implementation would silently diverge from the read path's staleness check).
//
// UPSERT VIA THE GUARDED PATH: db.mjs has no guardedUpsert (only guardedInsert/guardedUpdate/
// guardedDelete/guardedInsertMany). theme_briefs.theme_id is PRIMARY KEY, so "upsert" here is
// check-then-branch: read the existing row by theme_id; guardedInsert if absent, guardedUpdate if
// present. This is not a workaround — an update via guardedUpdate SNAPSHOTS the prior brief before
// overwriting it (R1's own reversibility posture), which a raw .upsert() would not give for free.
//
// Usage:
//   node scripts/connections/generate-theme-brief.mjs --theme <connection_themes-id> [--dry]
//   node scripts/connections/generate-theme-brief.mjs --write <path-to-authored-payload> [--dry|--execute]
//     --dry      (default for --write) validate + report, write nothing
//     --execute  actually upsert the theme_briefs row (explicit opt-in)
// Exit 0 done · 1 bad args / validation failure · 2 no DB creds (--theme/--write both need a DB read).

import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";

/**
 * Assemble the brief input bundle from already-loaded rows. PURE — no DB, the caller supplies
 * everything already read.
 * @param {{id:string, member_ids:string[], dominant_signals?:any, surfaces?:string[], convergence?:number, pivots?:any}} theme
 * @param {Array<object>} memberItems - intelligence_items rows for theme.member_ids
 * @param {Array<{source_item_id:string,target_item_id:string,relationship:string,origin:string,basis:any,score:number}>} intraEdges
 * @param {Array<object>} forwardEvents - item_forward_events rows for theme.member_ids
 * @returns {object}
 */
export function buildBriefBundle(theme, memberItems, intraEdges, forwardEvents) {
  const memberHash = computeMemberHash(theme.member_ids);
  return {
    theme_id: theme.id,
    member_hash: memberHash,
    member_count: theme.member_ids.length,
    dominant_signals: theme.dominant_signals ?? [],
    surfaces: theme.surfaces ?? [],
    convergence: theme.convergence ?? null,
    pivots: theme.pivots ?? [],
    members: memberItems,
    intra_theme_edges: intraEdges,
    forward_events: forwardEvents,
  };
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
    return { ok: false, error: `unsupported payload extension '${ext}' — use .json or .md.` };
  }

  const missing = ["theme_id", "title", "brief_md", "member_hash"].filter((k) => !parsed[k]);
  if (missing.length) return { ok: false, error: `payload is missing required field(s): ${missing.join(", ")}.` };
  return { ok: true, theme_id: parsed.theme_id, title: parsed.title, brief_md: parsed.brief_md, member_hash: parsed.member_hash };
}

/**
 * Validate a parsed payload against the theme's LIVE member_ids — refuses on member_hash mismatch
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

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

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("generate-theme-brief: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const { readAll, guardedInsert, guardedUpdate } = await import("../lib/db.mjs");
const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "U6 generate-theme-brief: assemble the brief input bundle and persist an authored brief to theme_briefs (guarded path, rule 015).",
};

if (themeId) {
  const themes = await readAll("connection_themes", "id, member_ids, dominant_signals, surfaces, convergence, pivots", { match: (q) => q.eq("id", themeId) });
  const theme = themes[0];
  if (!theme) {
    console.error(`generate-theme-brief: no connection_themes row with id ${themeId}.`);
    process.exit(1);
  }
  const allMembers = await readAll("intelligence_items", "id, title, legacy_id, item_type, jurisdiction_iso, added_date, priority", { match: (q) => q.in("id", theme.member_ids) });
  const allEdges = await readAll("item_cross_references", "source_item_id, target_item_id, relationship, origin, basis, score", { match: (q) => q.in("source_item_id", theme.member_ids) });
  const intraEdges = allEdges.filter((e) => theme.member_ids.includes(e.target_item_id));
  const forwardEvents = await readAll(
    "item_forward_events",
    "id, intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_span, confidence",
    { match: (q) => q.in("intelligence_item_id", theme.member_ids) },
  );

  const bundle = buildBriefBundle(theme, allMembers, intraEdges, forwardEvents);
  console.log(JSON.stringify(bundle, null, 2));
  process.exit(0);
}

// --write path
let fileContent;
try {
  fileContent = readFileSync(writePath, "utf8");
} catch (e) {
  console.error(`generate-theme-brief: cannot read ${writePath}: ${e.message}`);
  process.exit(1);
}
const payload = parseBriefPayload(writePath, fileContent);
if (!payload.ok) {
  console.error(`generate-theme-brief: payload invalid — ${payload.error}`);
  process.exit(1);
}

const themes = await readAll("connection_themes", "id, member_ids", { match: (q) => q.eq("id", payload.theme_id) });
const theme = themes[0];
if (!theme) {
  console.error(`generate-theme-brief: payload's theme_id ${payload.theme_id} does not exist in connection_themes (it may have dissolved since the bundle was fetched).`);
  process.exit(1);
}

const validated = validateAgainstLiveMembers(payload, theme.member_ids);
if (!validated.ok) {
  console.error(`generate-theme-brief: ${validated.error}`);
  process.exit(1);
}

console.log(
  `generate-theme-brief: payload valid for theme ${payload.theme_id} (member_hash matches live membership, ` +
  `${validated.row.member_count} members)${EXECUTE ? "" : " (DRY RUN)"}.`,
);

if (!EXECUTE) {
  console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
  process.exit(0);
}

const existing = await readAll("theme_briefs", "theme_id", { match: (q) => q.eq("theme_id", payload.theme_id) });
if (existing.length) {
  const res = await guardedUpdate("theme_briefs", (qb) => qb.eq("theme_id", payload.theme_id), validated.row, { cite: CITE });
  console.log(`WROTE (update): theme_briefs row for theme ${payload.theme_id} updated (${res.updated} row, prior snapshot: ${res.snapshot}).`);
} else {
  const res = await guardedInsert("theme_briefs", validated.row, { cite: CITE, select: "theme_id" });
  console.log(`WROTE (insert): theme_briefs row for theme ${payload.theme_id} created (snapshot: ${res.snapshot}).`);
}
process.exit(0);
}
