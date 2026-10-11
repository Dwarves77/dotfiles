import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DRIFT, evalPredicate } from "./drift-check.mjs";
import { findRawSourceFetch } from "./verify.mjs";

// The canonical enumeration. hostsFetch = a content-fetch audit must scan this class.
// reason = why a class is legitimately not scanned for a source fetch (recorded, not
// silently dropped). Adding a NEW surface type without registering it here re-opens
// the not_walked-invisible gap — so this list is a named standing-maintenance object
// (design doc S5).
export const SURFACE_CLASSES = Object.freeze([
  { id: "routes",               desc: "Next.js API route handlers",                globs: ["src/app/api/**/route.ts"],                                                          hostsFetch: true },
  { id: "workers",              desc: "worker / scheduled route handlers",         globs: ["src/app/api/worker/**/route.ts"],                                                   hostsFetch: true },
  { id: "crons",                desc: "scheduled triggers (config -> surface)",    globs: ["vercel.json", ".github/workflows/*.yml", ".github/workflows/*.yaml"],                isConfig: true,  hostsFetch: false, reason: "config, not code: walked as scheduler (see scheduled[]); the surface it schedules is fetch-audited under its own class" },
  { id: "build-seed-runners",   desc: "one-shot / batch corpus runners",           globs: ["supabase/seed/*.mjs", "scripts/**/*.mjs"],                                          hostsFetch: true },
  { id: "migrations-sql",       desc: "schema + data migrations",                  globs: ["supabase/migrations/*.sql"],                                                        hostsFetch: false, reason: "SQL — cannot host a JS source-content fetch" },
  { id: "edge-instrumentation", desc: "middleware / proxy / instrumentation",      globs: ["src/middleware.ts", "src/proxy.ts", "src/instrumentation.ts", "middleware.ts", "instrumentation.ts"], hostsFetch: true },
  { id: "lib-helpers",          desc: "shared library helpers",                    globs: ["src/lib/**/*.ts"],                                                                  hostsFetch: true },
  { id: "test-fixtures",        desc: "tests + selftests (non-production)",         globs: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.selftest.mjs", "scripts/**/*-reconstruction.mjs"], hostsFetch: false, reason: "non-production — excluded from production content-fetch verdicts" },
]);

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", ".vercel", "coverage"]);

// ── glob matcher (supports **, *, ?, literal segments) ────────────────────────
function globToRe(glob) {
  const g = glob.replace(/\\/g, "/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        if (g[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
      } else { re += "[^/]*"; }
    } else if (c === "?") { re += "[^/]"; }
    else if (".+^${}()|[]\\".includes(c)) { re += "\\" + c; }
    else { re += c; }
  }
  return new RegExp("^" + re + "$");
}
export function matchesGlob(path, glob) { return globToRe(glob).test(path.replace(/\\/g, "/")); }

// A path can belong to MORE THAN ONE class (a worker route is both `routes` and
// `workers`) — class coverage is not a partition. The exclusion keeps D3's own infra
// (scripts/lib/**) and test fixtures out of the build-runner production set.
function classExcludes(clsId, path) {
  if (clsId === "build-seed-runners")
    return path.startsWith("scripts/lib/") || /\.selftest\.mjs$/.test(path) || /-reconstruction\.mjs$/.test(path);
  return false;
}
export function classifyPath(p) {
  const path = p.replace(/\\/g, "/");
  return SURFACE_CLASSES
    .filter((cls) => cls.globs.some((g) => matchesGlob(path, g)) && !classExcludes(cls.id, path))
    .map((c) => c.id);
}

// ── discovery (real FS walk, classified by the same predicate) ────────────────
function walkFiles(root) {
  const out = [];
  (function rec(rel) {
    let entries;
    try { entries = readdirSync(resolve(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const child = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rec(child); }
      else out.push(child);
    }
  })("");
  return out;
}
export function discoverSurfaces(root) {
  const out = Object.fromEntries(SURFACE_CLASSES.map((c) => [c.id, []]));
  for (const f of walkFiles(root)) for (const cls of classifyPath(f)) out[cls].push(f);
  for (const k in out) out[k].sort();
  return out;
}

// ── coverage block ────────────────────────────────────────────────────────────
export function emptyCoverage(method) {
  return { method, walked: [], not_walked: [], cannot_see: [], assumptions_unverified: [] };
}
// COMPLETE iff every surface class is accounted in walked OR not_walked. A coverage
// block that silently omits a class is the exact failure mode this rejects.
export function validateCoverage(cov) {
  const acct = new Set();
  for (const e of cov.walked) acct.add(e.class);
  for (const e of cov.not_walked) acct.add(e.class);
  const missing = SURFACE_CLASSES.map((c) => c.id).filter((id) => !acct.has(id));
  return { complete: missing.length === 0, missing };
}

// ── cron walk (config -> scheduled surface) ───────────────────────────────────
function walkCrons(root, configFiles) {
  const scheduled = [];
  for (const rel of configFiles) {
    let text; try { text = readFileSync(resolve(root, rel), "utf8"); } catch { continue; }
    if (rel.endsWith("vercel.json")) {
      try { for (const c of (JSON.parse(text).crons ?? [])) scheduled.push({ config: rel, schedule: c.schedule, surface: c.path }); } catch {}
    } else {
      const cron = /cron:\s*['"]?([^'"\n]+)/.exec(text);
      const run = /node\s+(\S+\.mjs)/.exec(text) || /curl[^\n]*?(\/api\/[^\s'"]+)/.exec(text);
      scheduled.push({ config: rel, schedule: cron ? cron[1].trim() : "(none)", surface: run ? (run[1] || run[2]) : "(unresolved)" });
    }
  }
  return scheduled;
}

// ── the content-fetch audit (surface-enumerated) ──────────────────────────────
const FETCH_AUDIT_METHOD =
  "content-fetch drift audit (surface-enumerated; AST noRawSourceFetch + findRawSourceFetch text-lint)";

export function auditContentFetch(root, { canonicalToken = "browserlessRender" } = {}) {
  const surfaces = discoverSurfaces(root);
  const cov = emptyCoverage(FETCH_AUDIT_METHOD);
  const flagged = [];

  for (const cls of SURFACE_CLASSES) {
    const files = surfaces[cls.id];
    if (cls.id === "crons") {
      cov.walked.push({ class: "crons", configs: files, scheduled: walkCrons(root, files) });
      continue;
    }
    if (!cls.hostsFetch) {
      cov.not_walked.push({ class: cls.id, count: files.length, reason: cls.reason });
      continue;
    }
    let flaggedHere = 0;
    for (const rel of files) {
      let text;
      try { text = readFileSync(resolve(root, rel), "utf8"); }
      catch { cov.cannot_see.push({ class: cls.id, file: rel, reason: "unreadable" }); continue; }
      const astDrifted = evalPredicate(text, { kind: "noRawSourceFetch" }).verdict === DRIFT.DRIFTED;
      const textHits = findRawSourceFetch(text, { canonicalToken }).length;
      if (astDrifted || textHits > 0) {
        flagged.push({ class: cls.id, file: rel, byAst: astDrifted, byText: textHits });
        flaggedHere++;
      }
    }
    cov.walked.push({ class: cls.id, files: files.length, flagged: flaggedHere });
  }

  cov.assumptions_unverified.push(
    "raw-fetch flags are CANDIDATES (fail-loud heuristic): a fetch(<var>) on a legit api/rss access-method branch false-DRIFTs and clears on human review; it NEVER false-IMPLEMENTs (never hides a real raw fetch). Confirm each flagged file's SCRAPE path routes through the canonical fn.",
    "the surface-class registry is point-in-time: a new runtime/route class added without registering here re-opens the not_walked-invisible gap (design doc S5 maintenance set)."
  );
  return { coverage: cov, flagged, surfaces };
}
