/** STEP 5 worklist assembler (Wave 2 relaunch, 2026-07-15). Prepends the two ZEROED incident items
 *  (Nashville, Fjords — non-restorable, intact pools -> cheap resynth recovery) to the current C3-floor
 *  re-ground candidate list (scripts/tmp/funded-pass-worklist.json, freshly built cheapest-first). The zeroed
 *  items go FIRST so they recover before any no-gain tripwire could halt the run. Writes the combined worklist.
 *  Usage: node scripts/step5-worklist.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = resolve(ROOT, "scripts/tmp/funded-pass-worklist.json");
const wl = JSON.parse(readFileSync(P, "utf8"));

const ZEROED = [
  { id: "e65ec48d-09f3-4c6f-923d-391a99d73049", key: "Nashville Building Energy Programs (ZEROED-recover)", cls: "resynth" },
  { id: "82f09535-ef34-4674-a16c-e7d9753b41bf", key: "World Heritage Fjords ZEV (ZEROED-recover)", cls: "resynth" },
];
// de-dup: drop any zeroed id already present, then prepend
const zeroedIds = new Set(ZEROED.map((z) => z.id));
const rest = wl.worklist.filter((w) => !zeroedIds.has(w.id));
wl.worklist = [...ZEROED, ...rest];
wl.count = wl.worklist.length;
wl.caller = "wave2-reattribution"; // F16-signed caller (passes the scrape hold)
wl.generatedFrom = "STEP 5 relaunch: 2 ZEROED incident items (resynth recovery) FIRST, then C3-floor re-attribution cheapest-first, under run-lock (mig 205) + no-gain tripwire; $36 remaining bound.";
writeFileSync(P, JSON.stringify(wl, null, 2));
console.log(`STEP 5 worklist: ${wl.count} items (2 zeroed-recover FIRST + ${rest.length} C3-floor candidates).`);
console.log(`first 4: ${wl.worklist.slice(0, 4).map((w) => w.key.slice(0, 34)).join(" | ")}`);
