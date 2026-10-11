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
