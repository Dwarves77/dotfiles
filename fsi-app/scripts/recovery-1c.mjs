// ~347 recovery — PHASE 1c: resolve the remaining INCONCLUSIVE bucket. After this the
// "failed-to-answer miscounted as negative" error class is CLOSED — we will have retried
// EVERYTHING that failed to answer (429s in 1b, now 500s + near-empty thin), so any
// remaining 5xx is defensibly inconclusive-not-recoverable, not an un-retried artifact.
//
// Targets (from the 1b cache): the 50 "dead" that are ALL canon 500 (a 500 is a render/
// server error = inconclusive, never a definitive negative — the fetchOk principle) +
// the ~20 near-empty thin-200s (<100 chars, likely SPA-not-loaded). Re-render with a
// LONGER timeout (all-500-zero-404 smells like render-timeout, not site-death), spaced.
// READ-ONLY: external fetches + measurement-cache write only. ZERO DB / corpus mutation.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { browserlessFetch, BrowserlessError } from "../src/lib/sources/canonical-fetch.mjs";

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.message || e));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const CACHE = resolve(ROOT, "docs/recovery-phase1b-results.json");
const cache = JSON.parse(readFileSync(CACHE, "utf8"));

const SUBSTANTIVE = 1500, CONC = 2, DELAY = 800, GOTO = 45000, HARD = 65000;
const withTimeout = (p, ms, l) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${l} hard-timeout`)), ms))]);

async function renderLong(url) {
  try {
    const r = await withTimeout(browserlessFetch(url, { maxTextLength: 20000, gotoTimeoutMs: GOTO, waitTimeoutMs: 8000 }), HARD, "render");
    return { status: r.status, len: r.text?.length || 0 };
  } catch (e) { return { status: e instanceof BrowserlessError ? (e.status ?? 0) : 0, err: e?.message }; }
}
async function retry(url) {
  const backoff = [0, 6000, 15000, 35000];
  let last;
  for (let i = 0; i < backoff.length; i++) { if (backoff[i]) await sleep(backoff[i]); last = await renderLong(url); if (last.status !== 429) return last; }
  return last;
}
function classify(canon, len) {
  if (canon.status === 429) return "inconclusive-429";
  if (canon.status >= 200 && canon.status < 300) return len >= SUBSTANTIVE ? "systematic" : "thin";
  if (canon.status === 404 || canon.status === 410) return "dead";          // definitive not-found
  if (canon.status >= 500 || canon.status === 0) return "inconclusive-5xx"; // server/render/network error
  return "dead";
}

const targets = Object.values(cache).filter(
  (x) => (x.class === "dead" && x.canonical?.status === 500) || (x.class === "thin" && (x.canonical?.len || 0) < 100)
);
console.log(`=== Phase-1c — resolve the inconclusive bucket (READ-ONLY) ===`);
console.log(`targets: ${targets.length} (500s + near-empty thin) — re-render, longer timeout, spaced\n`);

let i = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < targets.length) {
    const x = targets[i++];
    await sleep(DELAY);
    const canon = await retry(x.url);
    const cls = classify(canon, canon.len || 0);
    cache[x.url] = { ...x, class: cls, canonical: canon, final: !cls.startsWith("inconclusive") };
    if (++done % 10 === 0) { console.log(`  ${done}/${targets.length}`); writeFileSync(CACHE, JSON.stringify(cache)); }
  }
}));
writeFileSync(CACHE, JSON.stringify(cache));

const all = Object.values(cache);
const t = (c) => all.filter((x) => x.class === c);
const sys = t("systematic"), inter = t("intermittent"), thin = t("thin"), dead = t("dead"), in5 = t("inconclusive-5xx"), in429 = t("inconclusive-429");

console.log(`\n=== FINALIZED MIX (of ${all.length}) ===`);
console.log(`  SYSTEMATIC          (recovered, substantive content): ${sys.length}`);
console.log(`  INTERMITTENT        (plain resolves now):             ${inter.length}`);
console.log(`  THIN-200            (2xx but <${SUBSTANTIVE} — content-length judgment, NOT a fetch artifact): ${thin.length}`);
console.log(`  DEAD (404/410)      (definitive not-found):           ${dead.length}`);
console.log(`  INCONCLUSIVE-5xx    (still 5xx/network after a proper retry — defensibly not-recoverable): ${in5.length}`);
console.log(`  INCONCLUSIVE-429    (still rate-limited):             ${in429.length}`);

const sample = (a, n = 8) => a.slice(0, n).map((x) => `      ${x.url}  [canon ${x.canonical?.status}/${x.canonical?.len ?? "-"}]`).join("\n");
console.log(`\n  newly-recovered-to-systematic this run (from the old 500s/thin) is reflected in SYSTEMATIC=${sys.length}.`);
console.log(`  remaining inconclusive-5xx sample:\n${sample(in5) || "      (none — inconclusive class CLOSED)"}`);
console.log(`  dead-404 sample:\n${sample(dead) || "      (none confirmed dead)"}`);

console.log(`\nThe inconclusive (failed-to-answer) class is now CLOSED: every 429 and 500 was retried. SYSTEMATIC=${sys.length} is the FINAL floor.`);
console.log(`Phase 3 (re-admit -> PROVISIONAL via normal d3GuardAdmission path) HELD for operator go on this finalized mix.`);
process.exitCode = 0;
