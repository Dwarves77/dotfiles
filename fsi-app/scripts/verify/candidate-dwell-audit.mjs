// candidate-dwell-audit.mjs -- VERIFIER (read-only, 0 Browserless): the candidate-drain half of D26's
// research-or-erase discipline, generalized from item-quarantine dwell to portal_link_candidates dwell.
// GOVERNING SKILLS: remediation-discipline (Section 2.1 -- Quarantine Is an Open Investigation,
// research-or-erase). A discovered candidate that sits forever with no session-verdict batch ever having
// looked at it is the SAME forbidden "permanent limbo, never a terminal state" class
// quarantine-disposition-audit.mjs already enforces for quarantined items, applied here to the OTHER half
// of the intake funnel -- D26's own confirmed root cause: 3,751 portal_link_candidates rows stood as
// candidates with 3 ever promoted, because the free ($0) session-Haiku decider was never fed.
//
// INVARIANT: no portal_link_candidates row (status='candidate') may sit past DWELL_BOUND_DAYS unless a
// committed session-verdict batch file (the JSON batches discoverVerdictsFiles below reads) already names its candidate_id (a
// row a session lane has looked at, even if that specific verdict was later excluded for a stale
// prompt_version, is not "never fed" -- this audit asks "was this row ever handed to the decider", not
// "did its verdict apply cleanly"; the consume runner's own validateVerdictsFile is the schema gate).
//
// Exit 0 = invariant holds. Exit 1 = at least one past-bound, never-named candidate -- this gates the
// live-data audit lane (CI-with-secrets / nightly); pre-push has no DB secrets so it validates WIRING via
// the invariant-coverage meta-gate, not this live run. Reads only: portal_link_candidates (DB) + the
// committed ledger-verdicts-*.json files (filesystem, already in the checkout). Env:
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// PURE HELPERS BELOW ARE STATICALLY IMPORTABLE WITHOUT A DB (candidate-dwell-audit.test.mjs, the no-npm-ci
// suite) -- the DB client (`../lib/db.mjs`, which pulls @supabase/supabase-js) is loaded with a DYNAMIC
// import inside main() ONLY, the SAME seam run-ledger-consume.mjs uses for the identical reason: this
// file's own STATIC import graph must stay portable (.discipline/glob-portability.test.mjs's TRANSITIVE
// CHECK would otherwise flag a top-level `import ... from "../lib/db.mjs"` here -- exactly why
// quarantine-disposition-audit.mjs, which DOES import db.mjs statically, has no test file at all).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { discoverVerdictsFiles } from "../turns/run-ledger-consume.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

export const DWELL_BOUND_DAYS = 14;
const BOUND_MS = DWELL_BOUND_DAYS * 24 * 60 * 60 * 1000;

/**
 * Every candidate_id named by ANY committed ledger-verdicts-*.json batch under `dir`, regardless of
 * whether that entry's own verdict is still current (a stale prompt_version excludes a verdict from USE,
 * not from having been LOOKED AT -- this audit's own question). A malformed/unreadable batch is skipped
 * for this read-only census, never thrown -- schema enforcement is run-ledger-consume.mjs's own job. Pure
 * given injected I/O.
 * @param {string} dir @param {{readFileSyncImpl?: (p:string,enc:string)=>string, discoverVerdictsFilesImpl?: (d:string)=>string[]}} [opts]
 * @returns {Set<string>}
 */
export function namedCandidateIds(dir, opts = {}) {
  const readFileImpl = opts.readFileSyncImpl ?? readFileSync;
  const discover = opts.discoverVerdictsFilesImpl ?? discoverVerdictsFiles;
  const ids = new Set();
  for (const file of discover(dir)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileImpl(file, "utf8"));
    } catch {
      continue; // malformed/unreadable batch: skip, never throw
    }
    for (const entry of Array.isArray(parsed?.entries) ? parsed.entries : []) {
      if (typeof entry?.candidate_id === "string" && entry.candidate_id) ids.add(entry.candidate_id);
    }
  }
  return ids;
}

/**
 * Split live `status='candidate'` rows into withinBound / pastBoundNamed / pastBoundUnnamed (the hard
 * tripwire) against `namedIds` (see namedCandidateIds above) and `nowMs`. Pure.
 * @param {{id:string,url:string,first_seen_at:string}[]} rows
 * @param {Set<string>} namedIds
 * @param {{nowMs?: () => number}} [opts]
 * @returns {{withinBound: object[], pastBoundNamed: object[], pastBoundUnnamed: object[]}}
 */
export function classifyDwellCandidates(rows, namedIds, opts = {}) {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const now = nowMs();
  const withinBound = [];
  const pastBoundNamed = [];
  const pastBoundUnnamed = [];
  for (const r of rows || []) {
    const seenAt = new Date(r.first_seen_at).getTime();
    const ageMs = Number.isFinite(seenAt) ? now - seenAt : 0;
    if (ageMs <= BOUND_MS) {
      withinBound.push(r);
      continue;
    }
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    if (namedIds.has(r.id)) pastBoundNamed.push({ ...r, ageDays });
    else pastBoundUnnamed.push({ ...r, ageDays });
  }
  return { withinBound, pastBoundNamed, pastBoundUnnamed };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try {
    process.loadEnvFile(resolve(ROOT, ".env.local"));
  } catch {
    /* CI: env may be pre-loaded */
  }
  const { readAll } = await import("../lib/db.mjs");

  let rows;
  try {
    rows = await readAll("portal_link_candidates", "id,url,source_id,first_seen_at,status", {
      match: (q) => q.eq("status", "candidate"),
    });
  } catch (e) {
    console.error(`candidate-dwell-audit: read failed: ${e.message}`);
    process.exit(2);
  }

  const verdictsDir = resolve(ROOT, "scripts", "turns", "ledger-verdicts");
  const named = namedCandidateIds(verdictsDir);
  const { withinBound, pastBoundNamed, pastBoundUnnamed } = classifyDwellCandidates(rows || [], named);

  console.log(`\n===== CANDIDATE-DWELL INVARIANT (read-only) =====`);
  console.log(
    `portal_link_candidates status=candidate: ${(rows || []).length}  |  within ${DWELL_BOUND_DAYS}d: ${withinBound.length}  ` +
      `|  past-bound NAMED in a verdict batch (being worked): ${pastBoundNamed.length}  ` +
      `|  past-bound UNNAMED (never fed the free decider): ${pastBoundUnnamed.length}`
  );

  if (pastBoundUnnamed.length) {
    console.log(`\n── PAST-BOUND, UNNAMED (>${DWELL_BOUND_DAYS}d, no committed ledger-verdicts entry names this candidate_id) ──`);
    for (const r of pastBoundUnnamed.slice(0, 40)) {
      console.log(`  ${r.id}  ${String(r.ageDays).padStart(4)}d  ${(r.url || "").slice(0, 80)}`);
    }
    if (pastBoundUnnamed.length > 40) console.log(`  … +${pastBoundUnnamed.length - 40} more`);
    console.log(
      `\nDISPOSITION: export this backlog (--export-candidates --with-text), classify via a session-Haiku ` +
        `lane, commit a ledger-verdicts-NNN.json batch naming these candidate_id(s), then run apply --verdicts <path>.`
    );
    console.log(`Drive the past-bound UNNAMED count to 0.`);
    process.exit(1);
  }
  console.log(`invariant holds: every candidate past the ${DWELL_BOUND_DAYS}d bound is named by a committed verdict batch (or within bound).`);
  process.exit(0);
}
