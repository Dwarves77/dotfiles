// Focused instance report for the bug-class detector: CANDIDATE_CORRUPT in LIVE paths only.
// Live = src/** (the running app) + .github/workflows/** (CI orchestration) + supabase/seed
// standing runners. Excludes one-shot scripts/** (already-executed, interlock-guarded) and the
// detector's own probe/selftest files. Run: node scripts/lib/inconclusive-report.mjs ..
import { resolve } from "node:path";
import { auditInconclusive } from "./inconclusive-probe.mjs";

const root = resolve(process.argv[2] || ".");
const { hits } = auditInconclusive(root);

const LIVE = (f) =>
  (f.startsWith("src/") || f.startsWith(".github/workflows/") ||
   (f.startsWith("supabase/seed/") && /runner|pilot|discover/i.test(f)));
const EXCLUDE = (f) => /inconclusive-probe|fetch-negative-probe|\.selftest\.|surface-registry/.test(f);

const live = hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT" && LIVE(h.file) && !EXCLUDE(h.file));
const byFile = new Map();
for (const h of live) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}

console.log("=== BUG-CLASS INSTANCE LIST (live paths; CANDIDATE_CORRUPT; scope visible BEFORE any fix) ===\n");
for (const form of [1, 2, 3, 4]) {
  const files = [...byFile.entries()].filter(([, hs]) => hs.some((h) => h.form === form));
  console.log(`--- FORM ${form} (${{1:"fetch non-2xx -> negative",2:"classifier-uncertain -> substantive default",3:"error-body -> content",4:"orchestration: retry-nonidempotent / transient -> hard-fail"}[form]}) ---`);
  if (!files.length) { console.log("  (none in live paths)\n"); continue; }
  for (const [file, hs] of files) {
    const fh = hs.filter((h) => h.form === form);
    for (const h of fh) console.log(`  ${file}:${h.line} [${h.anchor}]  ${h.snippet.slice(0, 90)}`);
  }
  console.log("");
}
console.log(`=== ${live.length} live CANDIDATE_CORRUPT across ${byFile.size} files (forms 1-4) ===`);
