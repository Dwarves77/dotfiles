// Unit test for the PURE scrape-schedule logic (no DB). Proves scrapeWindowOpen + nextScrapeDate
// against fixed dates (no Date.now reliance). Run: node scripts/_diag/_scrape-schedule-test.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { scrapeWindowOpen, nextScrapeDate } = await jiti.import("../../src/lib/sources/scrape-schedule.ts");

let pass = 0, fail = 0;
const U = (ymd) => new Date(`${ymd}T12:00:00Z`); // midday UTC so startOfUtcDay lands on the right day
function eq(name, got, want) {
  const ok = got === want;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (got ${got}, want ${want})`);
  ok ? pass++ : fail++;
}

console.log("== scrapeWindowOpen ==");
// 2026-07-07 is a Tuesday. Weekly anchored there => Tuesdays only.
const wk = { cadence: "weekly", startDate: "2026-07-07" };
eq("weekly anchor day (Tue 07-07)", scrapeWindowOpen(wk, U("2026-07-07")), true);
eq("weekly +7 (Tue 07-14)", scrapeWindowOpen(wk, U("2026-07-14")), true);
eq("weekly +1 (Wed 07-08)", scrapeWindowOpen(wk, U("2026-07-08")), false);
eq("weekly +6 (Mon 07-13)", scrapeWindowOpen(wk, U("2026-07-13")), false);
eq("weekly before anchor (07-06)", scrapeWindowOpen(wk, U("2026-07-06")), false);

// Monthly anchored on the 1st.
const mo = { cadence: "monthly", startDate: "2026-07-01" };
eq("monthly anchor (07-01)", scrapeWindowOpen(mo, U("2026-07-01")), true);
eq("monthly next (08-01)", scrapeWindowOpen(mo, U("2026-08-01")), true);
eq("monthly off-day (07-02)", scrapeWindowOpen(mo, U("2026-07-02")), false);
eq("monthly before anchor (06-30)", scrapeWindowOpen(mo, U("2026-06-30")), false);

// Monthly day-31 anchor clamps to a short month's last day (Feb 2027 -> 28).
const mo31 = { cadence: "monthly", startDate: "2026-01-31" };
eq("monthly-31 clamps to Feb 28 (2027-02-28)", scrapeWindowOpen(mo31, U("2027-02-28")), true);
eq("monthly-31 not Feb 27", scrapeWindowOpen(mo31, U("2027-02-27")), false);
eq("monthly-31 hits 03-31", scrapeWindowOpen(mo31, U("2027-03-31")), true);

// off => never.
eq("off never opens", scrapeWindowOpen({ cadence: "off", startDate: "2026-07-07" }, U("2026-07-07")), false);
eq("no anchor never opens", scrapeWindowOpen({ cadence: "weekly", startDate: null }, U("2026-07-07")), false);

console.log("== nextScrapeDate ==");
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);
eq("weekly next from Wed 07-08 -> 07-14", iso(nextScrapeDate(wk, U("2026-07-08"))), "2026-07-14");
eq("weekly next ON Tue 07-07 -> 07-07", iso(nextScrapeDate(wk, U("2026-07-07"))), "2026-07-07");
eq("weekly before start -> start", iso(nextScrapeDate(wk, U("2026-07-01"))), "2026-07-07");
eq("monthly next from 07-15 -> 08-01", iso(nextScrapeDate(mo, U("2026-07-15"))), "2026-08-01");
eq("off -> null", iso(nextScrapeDate({ cadence: "off", startDate: "2026-07-07" }, U("2026-07-07"))), null);

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
