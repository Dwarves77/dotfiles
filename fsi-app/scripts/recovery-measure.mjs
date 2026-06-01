// ~347 recovery — PHASE 1 / 1b (read-and-validate) + PHASE 2 (classify the mix).
// READ-ONLY: reads source_verifications + does external fetches. ZERO mutation.
//
// Phase-1b hardening (operator ruling): a Browserless 429 means the render was REFUSED
// -> the source is UNTESTED, never "dead" (the fetchOk principle: non-2xx is INCONCLUSIVE,
// not a conclusion — the same error the original 420 made, one level down). So:
//   - canonical renders are RATE-LIMIT-SPACED (low concurrency + delay) to stay under the
//     Browserless plan;
//   - a 429 is retried with backoff and, if still 429, classified INCONCLUSIVE (not dead);
//   - sub-threshold 200s (e.g. 86-char redirect stubs) are a SEPARATE "thin" bucket, not
//     auto-counted as systematic;
//   - results are saved to a resumable JSON cache (re-running resolves only the
//     still-inconclusive 429s — far fewer renders, never re-rendering a settled URL).
//
// Classes: systematic (plain fails, canonical recovers substantive content) / intermittent
// (plain GET resolves now) / thin (canonical 2xx but < SUBSTANTIVE) / dead (canonical real
// negative 4xx/5xx/network) / inconclusive (429 after retries — untested, retry next run).
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { browserlessFetch, BrowserlessError } from "../src/lib/sources/canonical-fetch.mjs";

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.message || e));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const CACHE = resolve(ROOT, "docs/recovery-phase1b-results.json");

const SUBSTANTIVE = 1500;
const PLAIN_TIMEOUT = 10000;
const RENDER_CONCURRENCY = 2;   // spaced to stay under the Browserless plan rate
const RENDER_DELAY_MS = 600;    // gap between render starts
const RENDER_HARD_MS = 35000;

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} hard-timeout ${ms}ms`)), ms))]);

async function plainGet(url) {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(PLAIN_TIMEOUT), headers: { "User-Agent": "Mozilla/5.0 (compatible; CarosLedge-Recovery/1.0)" } });
    if (!r.ok) return { ok: false, status: r.status };
    const text = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { ok: text.length >= SUBSTANTIVE, status: r.status, len: text.length };
  } catch (e) { return { ok: false, status: 0, err: e?.name || String(e) }; }
}

async function canonicalOnce(url) {
  try {
    const r = await withTimeout(browserlessFetch(url, { maxTextLength: 20000, gotoTimeoutMs: 20000 }), RENDER_HARD_MS, "canonical");
    return { status: r.status, len: r.text?.length || 0 };
  } catch (e) { return { status: e instanceof BrowserlessError ? (e.status ?? 0) : 0, err: e?.message }; }
}

// 429 = render refused (rate limit) -> retry with backoff; a 429 is INCONCLUSIVE, never dead.
async function canonicalRetry(url) {
  const backoff = [0, 5000, 12000, 30000];
  let last;
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i]) await sleep(backoff[i]);
    last = await canonicalOnce(url);
    if (last.status !== 429) return last;
  }
  return last; // still 429 after retries
}

function classifyCanon(canon, len) {
  if (canon.status === 429) return "inconclusive";          // refused — untested, not dead
  if (canon.status >= 200 && canon.status < 300) return len >= SUBSTANTIVE ? "systematic" : "thin";
  return "dead";                                            // real 4xx/5xx/network negative
}

const c = new pg.Client({ connectionString: CONN });
await c.connect();
let rows;
try {
  rows = (await c.query(
    `SELECT DISTINCT candidate_url FROM public.source_verifications
     WHERE rejection_reason = 'reachability' AND action_taken = 'rejected' AND candidate_url IS NOT NULL`
  )).rows.map((r) => r.candidate_url);
} finally { await c.end(); }

let cache = {};
try { cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch {}
const save = () => writeFileSync(CACHE, JSON.stringify(cache));

console.log(`=== ~347 recovery — Phase 1b (READ-ONLY, spaced, 429-as-inconclusive) ===`);
console.log(`reachability-rejected distinct candidate_urls: ${rows.length}`);
console.log(`resuming from cache: ${Object.values(cache).filter((v) => v.final).length} already settled\n`);

// Pass 1 — plain GET (free, concurrency 8) for anything without a plain result yet.
const needPlain = rows.filter((u) => !cache[u]?.plain);
let p = 0;
await (async function plainPool() {
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < needPlain.length) {
      const u = needPlain[i++];
      const plain = await plainGet(u);
      cache[u] = { ...(cache[u] || {}), url: u, plain };
      if (plain.ok) { cache[u].class = "intermittent"; cache[u].final = true; }
      if (++p % 50 === 0) { console.log(`  plain ${p}/${needPlain.length}`); save(); }
    }
  }));
})();
save();

// Pass 2 — canonical render (SPACED) only for plain-failing + not-yet-settled (incl. prior 429s).
const needRender = rows.filter((u) => !cache[u]?.final && !cache[u]?.plain?.ok);
console.log(`\nplain-failing needing a (spaced) canonical render: ${needRender.length}`);
let r = 0, renders = 0;
await (async function renderPool() {
  let i = 0;
  await Promise.all(Array.from({ length: RENDER_CONCURRENCY }, async () => {
    while (i < needRender.length) {
      const u = needRender[i++];
      await sleep(RENDER_DELAY_MS);
      const canon = await canonicalRetry(u); renders++;
      const cls = classifyCanon(canon, canon.len || 0);
      cache[u] = { ...cache[u], url: u, class: cls, canonical: canon, final: cls !== "inconclusive" };
      if (++r % 20 === 0) { console.log(`  render ${r}/${needRender.length} (renders=${renders})`); save(); }
    }
  }));
})();
save();

const all = rows.map((u) => cache[u]);
const tally = (cls) => all.filter((x) => x?.class === cls);
const sys = tally("systematic"), inter = tally("intermittent"), thin = tally("thin"), dead = tally("dead"), incon = tally("inconclusive");

console.log(`\n=== PHASE 2 — CLEANED MIX (of ${rows.length}) ===`);
console.log(`  SYSTEMATIC    (plain fails, canonical recovers substantive content): ${sys.length}`);
console.log(`  INTERMITTENT  (plain GET resolves now):                              ${inter.length}`);
console.log(`  THIN-200      (canonical 2xx but < ${SUBSTANTIVE} chars — stub/redirect, NOT counted systematic): ${thin.length}`);
console.log(`  DEAD          (canonical real 4xx/5xx/network negative):             ${dead.length}`);
console.log(`  INCONCLUSIVE  (429 after retries — still rate-limited/untested):     ${incon.length}`);
console.log(`  (spaced renders this run: ${renders})`);

const sample = (arr, n = 6) => arr.slice(0, n).map((x) => `      ${x.url}  [plain ${x.plain?.status}/${x.plain?.len ?? "-"}${x.canonical ? `, canon ${x.canonical.status}/${x.canonical.len ?? "-"}` : ""}]`).join("\n");
console.log(`\n  systematic (recovered):\n${sample(sys, 12) || "      (none)"}`);
console.log(`  thin-200 (flagged):\n${sample(thin) || "      (none)"}`);
console.log(`  inconclusive (still 429):\n${sample(incon) || "      (none)"}`);
console.log(`  dead (true negatives):\n${sample(dead) || "      (none)"}`);

console.log(`\nCLEANED: ${sys.length} systematic + ${inter.length} intermittent + ${thin.length} thin + ${dead.length} dead + ${incon.length} inconclusive(429).`);
console.log(`Full results saved: docs/recovery-phase1b-results.json. Re-run resolves only the ${incon.length} inconclusive(429).`);
console.log(`Phase 3 (re-admit -> PROVISIONAL via normal d3GuardAdmission path) HELD for operator go on these clean numbers.`);
process.exitCode = 0;
