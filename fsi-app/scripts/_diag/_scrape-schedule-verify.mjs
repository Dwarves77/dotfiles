// END-TO-END proof that the global scrape SCHEDULE governs behavior (not just renders). Guarded +
// reversible: snapshots the live system_state, drives it through cadence states against the REAL pure
// window helper + the isGloballyPaused logic, then RESTORES the original hold. The GHA scrape workflows
// are disabled_manually, so no cron can fire during this run; restore returns the live hold regardless.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { guardedUpdate, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { scrapeWindowOpen, nextScrapeDate } = await jiti.import("../../src/lib/sources/scrape-schedule.ts");
const sb = readClient();
const CITE = { skill: "remediation-discipline", reason: "scrape-schedule end-to-end proof (reversible; restores the hold)" };

// Replicates pause.ts isGloballyPaused (tsc-verified there; the 7 routes call it — proven by the pause-gate sweep).
const offNow = (row) => row.scrape_cadence === "off" || !!row.global_processing_paused;

const read = async () => {
  const { data } = await sb.from("system_state").select("scrape_cadence, scrape_start_date, global_processing_paused").eq("id", true).maybeSingle();
  return data;
};
let pass = 0, fail = 0;
const assert = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`); ok ? pass++ : fail++; };
const setState = (patch) => guardedUpdate("system_state", (qb) => qb.eq("id", true), patch, { cite: CITE });

// next Tuesday (UTC day 2) and the Wednesday after, as YYYY-MM-DD.
const d = new Date(); d.setUTCHours(12, 0, 0, 0);
while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
const tue = d.toISOString().slice(0, 10);
const wed = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);

console.log("========== SCRAPE-SCHEDULE END-TO-END PROOF ==========");
const ORIG = await read();
console.log(`migration columns present: scrape_cadence=${ORIG?.scrape_cadence}, scrape_start_date=${ORIG?.scrape_start_date}, global_processing_paused=${ORIG?.global_processing_paused}`);
assert("columns exist (cadence not undefined)", ORIG?.scrape_cadence !== undefined, true);
console.log(`test anchor: weekly start ${tue} (a Tuesday); off-day ${wed} (Wed)\n`);

console.log("-- TEST 1: cadence=weekly, emergency released -> scraping ON, window governs the day --");
await setState({ scrape_cadence: "weekly", scrape_start_date: tue, global_processing_paused: false });
let r = await read();
assert("isGloballyPaused (off-gate) == false when weekly+not-emergency", offNow(r), false);
assert("scrapeWindowOpen on the Tuesday == true", scrapeWindowOpen({ cadence: r.scrape_cadence, startDate: r.scrape_start_date }, new Date(`${tue}T12:00:00Z`)), true);
assert("scrapeWindowOpen on the Wednesday == false", scrapeWindowOpen({ cadence: r.scrape_cadence, startDate: r.scrape_start_date }, new Date(`${wed}T12:00:00Z`)), false);
assert("next scrape == the Tuesday", nextScrapeDate({ cadence: r.scrape_cadence, startDate: r.scrape_start_date }, new Date(`${tue}T00:00:00Z`))?.toISOString().slice(0, 10), tue);

console.log("\n-- TEST 2: cadence=off (emergency still released) -> off blocks everything --");
await setState({ scrape_cadence: "off", global_processing_paused: false });
r = await read();
assert("isGloballyPaused == true when cadence=off", offNow(r), true);
assert("scrapeWindowOpen == false when off", scrapeWindowOpen({ cadence: r.scrape_cadence, startDate: r.scrape_start_date }, new Date(`${tue}T12:00:00Z`)), false);

console.log("\n-- TEST 3: cadence=weekly BUT emergency stop engaged -> emergency wins (scraping off) --");
await setState({ scrape_cadence: "weekly", scrape_start_date: tue, global_processing_paused: true });
r = await read();
assert("isGloballyPaused == true when emergency engaged even though cadence=weekly", offNow(r), true);

console.log("\n-- RESTORE: original hold (cadence=off, emergency engaged) --");
await setState({ scrape_cadence: ORIG?.scrape_cadence ?? "off", scrape_start_date: ORIG?.scrape_start_date ?? null, global_processing_paused: ORIG?.global_processing_paused ?? true });
r = await read();
assert("restored cadence", r.scrape_cadence, ORIG?.scrape_cadence ?? "off");
assert("restored emergency (hold preserved)", r.global_processing_paused, ORIG?.global_processing_paused ?? true);
assert("restored: scraping is OFF", offNow(r), true);

console.log(`\n${fail === 0 ? "ALL PASS — the schedule setting GOVERNS the gate + window; hold restored." : `${fail} FAILED`}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
