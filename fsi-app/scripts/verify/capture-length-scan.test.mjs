// capture-length-scan.test.mjs -- D32 (defect-fix-plan-2026-09-12.md, lane L21) structural guard: "no
// tracked SQL or script computes length(result_content) or char_length(result_content) outside the
// trigger." agent_run_searches.result_chars (migration 322) is the trigger-maintained, indexed measure --
// every reader that only needs to know HOW LONG a capture is must use it instead of decompressing
// result_content to measure it in SQL, which is the exact read shape (a corpus-wide length(result_content)
// scan, ~240 MB decompressed) that exhausted the Supabase small-tier disk IO burst budget and hung the
// database for three and a half hours on 2026-09-13.
//
// Same "git ls-files + line scan + named allowlist" shape scripts/lib/is-main.test.mjs's own regression
// guard uses for the broken-main-guard idiom.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", ".."); // fsi-app/scripts/verify -> fsi-app/scripts -> fsi-app -> repo root

// The regex the guard enforces: length(result_content) or char_length(result_content), any whitespace
// inside the parens, an optional single-identifier qualifier (e.g. s.result_content), case-insensitive.
// Never matches a DIFFERENT column merely sharing the result_content prefix (e.g. result_content_excerpt)
// because the pattern requires result_content to be followed immediately by optional whitespace then ")".
const BANNED = /\b(?:char_)?length\(\s*(?:\w+\.)?result_content\s*\)/i;

// Every entry names the file (repo-root-relative, exactly as `git ls-files` prints it) and WHY it is
// exempt. Each entry is itself asserted still tracked below -- a stale allowlist entry (naming a file that
// no longer exists / was renamed) fails this guard rather than silently doing nothing.
const ALLOWLIST = [
  {
    path: "fsi-app/supabase/migrations/322_agent_run_searches_result_chars.sql",
    reason: "the trigger function that computes result_chars FROM result_content -- the one write site.",
  },
  {
    path: "fsi-app/supabase/migrations/323_agent_run_searches_result_chars_backfill.sql",
    reason: "the one-time chunked backfill for pre-existing rows, gated by result_chars IS NULL.",
  },
  {
    path: "fsi-app/scripts/verify/capture-length-scan.test.mjs",
    reason: "this guard's own source carries the banned literal in its regex/allowlist text.",
  },
  {
    path: "docs/plans/defect-fix-plan-2026-09-12.md",
    reason: "historical evidence text (the 2026-09-13 postgres-log quote) describing the query that caused the incident -- not a live call site.",
  },
  {
    path: "docs/dispatches/lane-briefs/2026-09-05/lane-feslot2b.js",
    reason: "a historical dispatch record (FE-SLOT-2, 2026-09-05) quoting a read-only measurement SQL snippet in its own brief text -- not a live call site.",
  },
];
const ALLOWLIST_PATHS = new Set(ALLOWLIST.map((e) => e.path));

function trackedFiles() {
  return execSync("git ls-files", { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\n")
    .filter(Boolean)
    .filter((p) => /\.(?:sql|mjs|ts|tsx|md|js|yml)$/.test(p));
}

test("capture-length-scan: no tracked file outside the allowlist computes length(result_content) / char_length(result_content)", () => {
  const tracked = trackedFiles();
  const offenders = [];
  for (const rel of tracked) {
    if (ALLOWLIST_PATHS.has(rel)) continue;
    const content = readFileSync(resolve(REPO, rel), "utf8");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (BANNED.test(lines[i])) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `length(result_content) / char_length(result_content) found outside the allowlist: ${offenders.join(", ")}`,
  );
});

test("capture-length-scan: every allowlist entry is a real, currently-tracked file (a stale entry fails, never silently no-ops)", () => {
  const tracked = new Set(trackedFiles());
  // Use the full tracked-file listing (not extension-filtered) too, in case an allowlisted path's own
  // extension were ever narrowed out of the scan above -- this assertion must fail loudly either way.
  const allTracked = new Set(
    execSync("git ls-files", { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean),
  );
  for (const entry of ALLOWLIST) {
    assert.ok(entry.reason && entry.reason.length > 0, `allowlist entry ${entry.path} must carry a reason`);
    assert.ok(
      tracked.has(entry.path) || allTracked.has(entry.path),
      `stale allowlist entry: ${entry.path} is not a tracked file`,
    );
  }
});
