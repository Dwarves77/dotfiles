// migration-history-diff.mjs: the recorded diff of every code-differs row (lane MIG-HIST-2, 2026-10-09).
//
// WHY. MIG-HIST-1 found rows whose repo file differs in code from the statements production's ledger stored (82 on
// the 2026-10-09 export). The map said `code-differs` and the audit then failed every one of them on every run, so
// the red could never be told apart from a NEW difference: a file edited after the fact, or a ledger row rewritten,
// was invisible inside a permanent red. This module gives each such row a RECORD of what the difference is, in the map
// itself, and gives the audit the one function that recomputes it.
//
// THE RECORD (APPLIED-MAP.json, on a ledger entry whose class is code-differs):
//   diff: { class, file_only, stored_only, sha256 }
//   class        'file-only'         the file has statements the ledger never stored; nothing stored is missing from the
//                                    file (audit section 6 H1: the file gained statements after the apply, or they were
//                                    applied by another route)
//                'changed-in-place'  both sides have statements the other lacks (H2)
//                'stored-only'       the ledger holds statements the file lacks (the file lost statements)
//   file_only    count of normalised file statements absent from the stored text
//   stored_only  count of normalised stored statements absent from the file, stray comment fragments excluded
//   sha256       sha256 over the two normalised statement lists (the very lists scripts/migrations/migration-compare.mjs
//                returns), so any change to either side of the difference changes the hash. The hash does NOT cover the
//                file's header or comments: a first-line status flip by the refresh path leaves it unchanged.
//
// WHAT READS IT. The audit (migration-history-audit.mjs): a code-differs row with no record fails DIFF_RECORD_MISSING;
// a record that no longer equals the live difference fails DIFF_DRIFT; a matching record is a reported finding.
//
// WHERE IT IS WRITTEN. The map generator (scripts/migrations/build-applied-map.mjs) builds the entry (name, file, class)
// and does not know this field, so the annotator below runs AFTER it:
//   node fsi-app/scripts/migrations/build-applied-map.mjs <reconciliation.json> --export-dir <dir> --write
//   node fsi-app/scripts/verify/migration-history-diff.mjs --export-dir <dir> --write
// A regenerated map without this second step fails the audit with DIFF_RECORD_MISSING naming that command.
//
// Pure core (no filesystem, no database); the CLI is behind the main guard. Read-only unless --write.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { compareStored } from "../migrations/migration-compare.mjs";
import { MIG_DIR, MAP_PATH, ledgerKeys, serializeMap } from "../migrations/build-applied-map.mjs";

export const DIFF_CLASSES = Object.freeze(["file-only", "changed-in-place", "stored-only"]);

/**
 * The record of one pair, or null when the pair does not differ in code.
 * @param {string} storedText the ledger row's stored statements, joined
 * @param {string} fileText the migration file's text
 * @returns {{ class: string, file_only: number, stored_only: number, sha256: string } | null}
 */
export function diffRecord(storedText, fileText) {
  const c = compareStored(storedText, fileText);
  if (c.kind !== "code-differs") return null;
  const cls = c.fileOnly.length && c.storedOnly.length ? "changed-in-place" : c.fileOnly.length ? "file-only" : "stored-only";
  const sha256 = createHash("sha256").update(JSON.stringify({ file_only: c.fileOnly, stored_only: c.storedOnly })).digest("hex");
  return { class: cls, file_only: c.fileOnly.length, stored_only: c.storedOnly.length, sha256 };
}

/** True when a recorded `diff` equals a freshly computed one (all four fields). */
export function sameDiff(recorded, live) {
  return !!recorded && !!live
    && recorded.class === live.class
    && recorded.file_only === live.file_only
    && recorded.stored_only === live.stored_only
    && recorded.sha256 === live.sha256;
}

/**
 * Write the record onto every code-differs ledger entry, and remove a record from an entry that is not code-differs.
 * Returns a NEW map; the input is not mutated. Key order inside an entry: the generator's fields first, `diff` last.
 * @param {object} map parsed APPLIED-MAP.json
 * @param {Map<string,string|null>} storedByVersion stored statements per ledger version (null = none stored)
 * @param {Map<string,string>} files file name to text
 * @returns {{ map: object, problems: string[], recorded: number }}
 */
export function annotateMap(map, storedByVersion, files) {
  const out = {};
  const problems = [];
  let recorded = 0;
  for (const [k, e] of Object.entries(map)) {
    const { diff: _old, ...rest } = e;
    out[k] = rest;
  }
  for (const v of ledgerKeys(out)) {
    const e = out[v];
    if (e.class !== "code-differs") continue;
    const stored = storedByVersion.get(v);
    const text = e.file ? files.get(e.file) : undefined;
    if (stored == null) { problems.push(`${v}: class code-differs but the export holds no stored statements`); continue; }
    if (text == null) { problems.push(`${v}: class code-differs but ${e.file ?? "no file"} is not in the repo`); continue; }
    const rec = diffRecord(stored, text);
    if (!rec) { problems.push(`${v}: class code-differs but ${e.file} no longer differs from the stored statements in code; regenerate the map first`); continue; }
    e.diff = rec;
    recorded++;
  }
  return { map: out, problems, recorded };
}

/**
 * The ledger export directory as stored statements per version. Same format build-applied-map.mjs reads: index.json plus one
 * `<file>` per row whose first line is a header and whose remainder is the stored statements.
 * @param {string} dir
 * @returns {Map<string,string|null>}
 */
export function storedFromExportDir(dir) {
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  const out = new Map();
  for (const row of index) {
    if (row.statements_null) { out.set(row.version, null); continue; }
    const text = readFileSync(join(dir, row.file), "utf8").replace(/\r\n/g, "\n");
    out.set(row.version, text.split("\n").slice(1).join("\n"));
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--export-dir");
  const dir = at < 0 ? null : argv[at + 1];
  if (!dir || dir.startsWith("--")) {
    console.error("usage: migration-history-diff.mjs --export-dir <ledger export dir> [--write]");
    process.exit(2);
  }
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  const files = new Map(readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((f) => [f, readFileSync(resolve(MIG_DIR, f), "utf8").replace(/\r\n/g, "\n")]));
  const { map: next, problems, recorded } = annotateMap(map, storedFromExportDir(dir), files);
  if (problems.length) { for (const p of problems) console.error(`migration-history-diff: ${p}`); process.exit(1); }
  const text = serializeMap(next);
  console.error(`migration-history-diff: recorded ${recorded} code-differs diffs`);
  if (argv.includes("--write")) { writeFileSync(MAP_PATH, text); console.error(`migration-history-diff: wrote ${MAP_PATH}`); }
  else process.stdout.write(text);
}

if (isMainModule(import.meta.url)) main();
