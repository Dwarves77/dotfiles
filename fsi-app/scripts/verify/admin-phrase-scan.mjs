/** ADMIN HUMAN-GATE PHRASE SCAN — SOFT review signal (Unit 0c Part 4, operator ruling 2026-07-13).
 *  Scans admin (+ profile) component JSX for human-gate framing that contradicts RD-20 (the machine gates ARE
 *  the approval; admin copy states what the machine did / what's visible, never what a human must decide).
 *  SOFT: reports violations for review and ALWAYS exits 0 — never fails the build (a phrase is a heuristic, per
 *  the census enforcement assessment). The ruled allowlist (emergency-stop / SC-3 override / community) is exempt.
 *  Run: node scripts/verify/admin-phrase-scan.mjs */
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { scanAdminPhrases } from "../lib/admin-phrase-scan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRS = ["src/components/admin", "src/components/profile"];

function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = resolve(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(e)) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(resolve(ROOT, d))).map((p) => ({ path: relative(ROOT, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));
const hits = scanAdminPhrases(files);

console.log(`admin-phrase-scan (SOFT): scanned ${files.length} admin/profile component file(s).`);
if (hits.length === 0) {
  console.log("  OK — no human-gate framing outside the ruled allowlist (emergency-stop / SC-3 override / community).");
} else {
  console.log(`  REVIEW SIGNAL — ${hits.length} human-gate phrase(s) (SOFT, does not fail the build):`);
  for (const h of hits) console.log(`    ${h.path}:${h.line}  "${h.phrase}"  | ${h.text}`);
  console.log("  Relabel to visibility language (staged / minted / rejected + why), or allowlist if it is a genuine human control.");
}
process.exit(0); // SOFT — never fails the build
