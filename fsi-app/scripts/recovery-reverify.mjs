// RETROACTIVE re-verification of THE 90 (the number we acted on by re-admitting 90 sources),
// to the four-part standard. Read-only: re-classifies the ACTUAL final fetch data
// (docs/recovery-phase1b-results.json, per-URL canonical:{status,len}) through three
// classifiers and reproduces the split — verifies the ARTIFACT, not the instrument.
//
//   right-failure-forced : the 5xx/429 entries (the non-answers the contamination mis-scored).
//   stored-outcome       : reproduce systematic=90 from the recorded fetch data.
//   mutation-checked     : the CONTAMINATED classifier (non-answer->dead) vs the CORRECTED one
//                          on the SAME inputs — does the split move, and does the 90 move?
//   4th-copy             : does the recovery classifier MATCH reachability.mjs (the SSOT), or
//                          is it an uncollapsed copy with a divergence?
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classifyReachability, REACH } from "../src/lib/sources/reachability.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = JSON.parse(readFileSync(resolve(ROOT, "docs/recovery-phase1b-results.json"), "utf8"));
const entries = Object.values(cache).filter((e) => e && e.canonical);
const SUB = 1500;
const len = (e) => e.canonical.len || 0;
const st = (e) => e.canonical.status;

// (a) recovery FINAL classifier (recovery-1c.mjs) — the one that produced 90.
const recoveryFinal = (e) => {
  const s = st(e), l = len(e);
  if (s === 429) return "inconclusive-429";
  if (s >= 200 && s < 300) return l >= SUB ? "systematic" : "thin";
  if (s === 404 || s === 410) return "dead";
  if (s >= 500 || s === 0) return "inconclusive-5xx";
  return "dead";
};
// (b) CONTAMINATED classifier (the original non-answer-as-negative bug): any non-2xx -> dead.
const contaminated = (e) => {
  const s = st(e), l = len(e);
  if (s >= 200 && s < 300) return l >= SUB ? "systematic" : "thin";
  return "dead"; // 429 / 5xx / 0 / 404 ALL -> dead (the bug)
};
// (c) SSOT-aligned (reachability.mjs) + the content dimension. errored when status is 0/absent.
const ssot = (e) => {
  const o = classifyReachability({ status: st(e), errored: !st(e) });
  if (o === REACH.REACHABLE) return len(e) >= SUB ? "systematic" : "thin";
  if (o === REACH.DEAD) return "dead";
  return "inconclusive"; // 429/5xx/403/errored
};

const dist = (fn) => entries.reduce((a, e) => { const k = fn(e); a[k] = (a[k] || 0) + 1; return a; }, {});
const sys = (fn) => entries.filter((e) => fn(e) === "systematic").length;

console.log(`=== RETROACTIVE re-verify of THE 90 — re-classify the actual ${entries.length} cached fetch results ===\n`);
console.log("stored class distribution (as acted on):", JSON.stringify(entries.reduce((a, e) => { a[e.class] = (a[e.class] || 0) + 1; return a; }, {})));
console.log("");
console.log("-- reproduce systematic=90 from the recorded fetch data --");
console.log(`  recoveryFinal (the tool that produced 90): systematic=${sys(recoveryFinal)}   dist=${JSON.stringify(dist(recoveryFinal))}`);
console.log(`  SSOT-aligned (reachability.mjs):           systematic=${sys(ssot)}   dist=${JSON.stringify(dist(ssot))}`);
console.log(`  CONTAMINATED (non-answer->dead) [mutation]: systematic=${sys(contaminated)}   dist=${JSON.stringify(dist(contaminated))}`);

const reproduced = sys(recoveryFinal) === 90 && sys(ssot) === 90;
console.log(`\n  => THE 90 reproduces from the cached fetch data (recoveryFinal AND SSOT): ${reproduced}`);
console.log(`  => mutation: the contaminated classifier moves the dead/inconclusive boundary`);
console.log(`     (inconclusive-5xx ${dist(recoveryFinal)["inconclusive-5xx"] || 0} -> dead), but systematic stays`);
console.log(`     ${sys(contaminated)} — because SYSTEMATIC = 2xx+substantive, a bucket the non-answer bug never touched.`);
console.log(`     So the 90 re-admit never rested on the contaminated boundary (the bug moved the 44, not the 90).`);

// 4th-copy: does recoveryFinal collapse to the SSOT's reachability verdict on every entry?
const collapseRec = (c) => c === "systematic" || c === "thin" ? "reachable" : c.startsWith("inconclusive") ? "inconclusive" : "dead";
const collapseSsot = (c) => c === "systematic" || c === "thin" ? "reachable" : c === "dead" ? "dead" : "inconclusive";
const disagree = entries.filter((e) => collapseRec(recoveryFinal(e)) !== collapseSsot(ssot(e)));
console.log(`\n-- 4th-copy check: recovery classifier vs the SSOT (reachability dimension), all ${entries.length} entries --`);
console.log(`  disagreements: ${disagree.length}`);
for (const e of disagree.slice(0, 10)) console.log(`    ${e.url}  canon=${st(e)}/${len(e)}  recovery=${recoveryFinal(e)} ssot=${ssot(e)}`);
if (disagree.length === 0) console.log(`  -> the recovery classifier MATCHES the SSOT on every cached entry (consistent, but still a separate COPY — fold it in).`);
process.exit(reproduced ? 0 : 1);
