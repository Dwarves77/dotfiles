// applied-status.mjs: the ONE place that decides whether a migration file is applied, never applied, or accounted for
// (lane MIGTEST-1, 2026-10-08; scope widened by the coordinator the same day).
//
// WHY. Before this, each per-migration test asserted its own header literally (`/NOT APPLIED/`, or `APPLIED (production
// ledger version 2026..., as of ...)` with the version typed in), and build-applied-map.test.mjs carried the ledger row
// count as a number. Every apply therefore needed hand edits in tests (four on 2026-10-08, PR 1027), and nine tests
// (358 to 369) went on asserting NOT APPLIED for migrations the ledger holds. Separately, every migration lane appended a
// `never:<file>` line to APPLIED-MAP.json, a shared-append file, and four PRs conflicted twice in one day (F51's
// doctrine forbids exactly this). The record of what is applied is the map (supabase/migrations/APPLIED-MAP.json, ledger
// rows and the keyed outside-ledger / duplicate-prefix rulings ONLY) and the ledger export
// (docs/inventories/applied-migrations.json); a file the map names nowhere is not applied when its own header says so.
// Everything reads that through this module (GATE-5's principle: one function, every consumer reads it).
//
// THE DERIVATION (pure; the map and the file text are passed in).
//   derivesNeverApplied(text)  a header that says the file is not applied: a first-line `NEVER APPLIED` status, or a header
//                              line `-- NOT APPLIED` within the first 30 lines.
//   namedFiles(map)            every file the map names: a ledger row's file or superseded_by, or a keyed entry's file.
//   accountFor({file,text,map}) -> { accounted, how }   how is 'ledger-row' | 'superseder' | 'keyed:<class>' |
//                              'never-applied-by-header' | null. A file the map names nowhere is accounted for ONLY when
//                              its header derives never-applied; otherwise it is the one failure (an applied file with no
//                              row and no ruling, or a header that is wrong).
//   neverAppliedFiles({map,files}) the unmapped files whose header derives never-applied (what a replay skips).
//
// THE HEADER FORM. expectedHeaderFor(file): the form the record implies.
//   - the map holds a ledger row for the file -> APPLIED, the status line
//     `APPLIED (production ledger version <ledger version from the map>, as of <YYYY-MM-DD>)` that MIG-HIST-1 used on 351
//     to 357. The date is the day the flip was made and is not derivable (352 to 356 carry the day after their ledger
//     timestamp), so any date is accepted; the version is the map's.
//   - the map names the file nowhere and its header derives never-applied -> NOT APPLIED.
//   - anything else (named only as a superseder, outside-ledger, duplicate-prefix, or unmapped without a not-applied
//     header) has no derivable form: throws.
// This form is the one the two-track lane migrations (352 and later) use. Older files carry other conventions
// (`APPLIED UNDER LEDGER VERSION` first-line status, a recovered file's `-- applied status: APPLIED`); a caller does
// not ask this module about them.
//
// headerProblems(text, file): the reasons the file's header disagrees with that form, empty when it agrees. Only the
// first 30 header lines are read, and the `-- subject:` line is not a status line: it is the description the migrations
// inventory prints, written at authoring time, so it may still say NOT APPLIED after the flip (rewriting it also
// regenerates docs/inventories/migrations.md, a separate step).
//
// ledgerCount(): the number of rows in the committed ledger export, through the one reader of that file.
//
// `root` (every fs function) is the fsi-app directory; it defaults to this checkout, and a test injects a temp copy.
// Node builtins and relative imports only (the no-npm discipline glob); this module imports no map reader or generator,
// so the reader, the audit and the generator can all import it without a cycle.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppliedInventory } from "../../../scripts/proof/sync-applied-migrations.mjs";
import { declaresNotApplied, statusClassOfFile } from "../../../scripts/migrations/migration-compare.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HEADER_LINES = 30;

const migDirOf = (root) => join(root, "supabase", "migrations");
const ledgerPathOf = (root) => join(root, "docs", "inventories", "applied-migrations.json");

/** A map key is a ledger version unless it carries a class prefix (`outside:<file>`, `dup:<file>`). */
export const isFileKey = (key) => String(key).includes(":");

/** True when the file's own header says it is not applied (a first-line NEVER APPLIED status, or `-- NOT APPLIED` in the first 30 lines). */
export function derivesNeverApplied(text) {
  const t = String(text ?? "").replace(/\r\n/g, "\n");
  return statusClassOfFile(t) === "never-applied" || declaresNotApplied(t);
}

/** Every file name the map names (a ledger row's file or superseded_by, or a keyed entry's file). */
export function namedFiles(map) {
  const out = new Set();
  for (const e of Object.values(map)) {
    if (!e || typeof e !== "object") continue;
    if (e.file) out.add(e.file);
    if (e.superseded_by) out.add(e.superseded_by);
  }
  return out;
}

/**
 * Is the file accounted for? PURE.
 * @param {{ file: string, text: string, map: object }} p
 * @returns {{ accounted: boolean, how: string|null }}
 */
export function accountFor({ file, text, map }) {
  for (const [key, e] of Object.entries(map)) {
    if (!e || typeof e !== "object") continue;
    if (!isFileKey(key) && e.file === file) return { accounted: true, how: "ledger-row" };
  }
  for (const [key, e] of Object.entries(map)) {
    if (!e || typeof e !== "object") continue;
    if (isFileKey(key) && e.file === file) return { accounted: true, how: `keyed:${e.class}` };
  }
  for (const e of Object.values(map)) {
    if (e && typeof e === "object" && e.superseded_by === file) return { accounted: true, how: "superseder" };
  }
  if (derivesNeverApplied(text)) return { accounted: true, how: "never-applied-by-header" };
  return { accounted: false, how: null };
}

/**
 * The unmapped files whose header derives never-applied, sorted. PURE.
 * @param {{ map: object, files: Iterable<[string,string]> }} p  files: [name, text] pairs
 */
export function neverAppliedFiles({ map, files }) {
  const named = namedFiles(map);
  const out = [];
  for (const [name, text] of files) if (!named.has(name) && derivesNeverApplied(text)) out.push(name);
  return out.sort();
}

/**
 * The header form the record implies for a migration file.
 * @param {string} file bare file name, e.g. "372_profiles_read.sql"
 * @param {{ root?: string, map?: object, text?: string }} [opts]  map and text default to the files under root
 * @returns {{ file: string, applied: boolean, class: string, ledgerVersion: string|null, ledgerVersions: string[], statusPattern: RegExp|null }}
 */
export function expectedHeaderFor(file, { root = DEFAULT_ROOT, map, text } = {}) {
  const m = map ?? JSON.parse(readFileSync(join(migDirOf(root), "APPLIED-MAP.json"), "utf8"));
  const rows = Object.entries(m)
    .filter(([key, e]) => !isFileKey(key) && e && e.file === file)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (rows.length) {
    const versions = rows.map(([key]) => key);
    return {
      file,
      applied: true,
      class: rows[0][1].class,
      ledgerVersion: versions[0],
      ledgerVersions: versions,
      statusPattern: new RegExp(`APPLIED \\(production ledger version (?:${versions.join("|")}), as of \\d{4}-\\d{2}-\\d{2}\\)`),
    };
  }
  const keyed = Object.entries(m).find(([key, e]) => isFileKey(key) && e && e.file === file);
  if (keyed) throw new Error(`${file}: the map classes it ${keyed[1].class}, which has no derivable header form`);
  if (Object.values(m).some((e) => e && e.superseded_by === file)) throw new Error(`${file}: named only as a superseder, so it has no header form of its own`);
  const body = text ?? readFileSync(join(migDirOf(root), file), "utf8");
  if (derivesNeverApplied(body)) return { file, applied: false, class: "never-applied", ledgerVersion: null, ledgerVersions: [], statusPattern: null };
  throw new Error(`${file}: named nowhere in APPLIED-MAP.json and its header does not say NOT APPLIED, so no header form is derivable (an applied file owes a ledger row or a ruling; an unapplied one owes the header)`);
}

/**
 * Why a migration file's header disagrees with what the record implies; [] when it agrees.
 * @param {string} text the migration file's text
 * @param {string} file bare file name
 * @param {{ root?: string, map?: object }} [opts]
 * @returns {string[]}
 */
export function headerProblems(text, file, opts = {}) {
  const exp = expectedHeaderFor(file, { ...opts, text });
  const head = String(text).replace(/\r\n/g, "\n").split("\n", HEADER_LINES);
  const statusLines = head.filter((l) => !l.startsWith("-- subject:"));
  const problems = [];
  if (exp.applied) {
    const stale = statusLines.filter((l) => /NOT APPLIED\b/.test(l));
    if (!statusLines.some((l) => exp.statusPattern.test(l))) {
      problems.push(`the map holds ledger row ${exp.ledgerVersions.join(", ")} (class ${exp.class}), so the header's first ${HEADER_LINES} lines must carry "APPLIED (production ledger version ${exp.ledgerVersion}, as of YYYY-MM-DD)"`);
    }
    for (const l of stale) problems.push(`the header still says NOT APPLIED although the ledger holds the row: ${l.trim().slice(0, 120)}`);
  } else {
    for (const l of statusLines.filter((x) => /\bAPPLIED \(production ledger version\b/.test(x))) {
      problems.push(`the header claims a ledger version although the map holds no row for the file: ${l.trim().slice(0, 120)}`);
    }
  }
  return problems.map((p) => `${file}: ${p}`);
}

/** The number of rows in the committed ledger export (the one reader of applied-migrations.json validates it). */
export function ledgerCount({ root = DEFAULT_ROOT } = {}) {
  return parseAppliedInventory(readFileSync(ledgerPathOf(root), "utf8")).length;
}
