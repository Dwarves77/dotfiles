#!/usr/bin/env node
// mutation-lease.golden.mjs — behavioral golden for the per-item mutation lease (H5, mig 211). Proves the
// two-writer mutual exclusion the parallel drain rests on, against the LIVE acquire/heartbeat/release functions:
// a second session's acquire on a held item is REFUSED (naming the incumbent); the holder can heartbeat + release;
// after release the item re-acquires; a stale lease (heartbeat past the threshold) is taken over. Uses a SYNTHETIC
// item uuid (mutation_leases has no FK to intelligence_items) so it never touches real data; self-cleans.
// Run: node scripts/verify/mutation-lease.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient } = await jiti.import("../lib/db.mjs");
const { acquireLease, heartbeatLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// A synthetic, deterministic-per-run test item id (no Math.random / Date allowed in workflows, but this is a
// plain script — still, use a fixed sentinel uuid namespaced to the golden so a crashed prior run is reclaimable).
const ITEM = "00000000-0000-4000-8000-00000000abcd";
// Clean any leftover from a crashed prior run (release under both holders).
await releaseLease(sb, ITEM, "golden-A").catch(() => {});
await releaseLease(sb, ITEM, "golden-B").catch(() => {});

// 1. First acquire succeeds (fresh).
const a1 = await acquireLease(sb, ITEM, "golden-A", "A");
check("session A acquires a free item (acquired=true, not a takeover)", a1.acquired === true && a1.takeover === false);

// 2. Second session's acquire on the held item is REFUSED, naming the incumbent.
const a2 = await acquireLease(sb, ITEM, "golden-B", "B");
check("session B is REFUSED on a held item (acquired=false)", a2.acquired === false);
check("the refusal names the incumbent holder (golden-A)", a2.cur_holder === "golden-A");

// 3. Holder can heartbeat; the other cannot claim ownership via heartbeat.
check("holder A heartbeat returns still_held=true", (await heartbeatLease(sb, ITEM, "golden-A")) === true);
check("non-holder B heartbeat returns still_held=false", (await heartbeatLease(sb, ITEM, "golden-B")) === false);

// 4. A non-holder release is a no-op; the holder release frees the item.
check("non-holder B release is a no-op (released=false)", (await releaseLease(sb, ITEM, "golden-B")) === false);
check("still held after B's no-op release (A re-acquire refused)", (await acquireLease(sb, ITEM, "golden-B", "B")).acquired === false);
check("holder A release frees the item (released=true)", (await releaseLease(sb, ITEM, "golden-A")) === true);

// 5. After release the item re-acquires cleanly by either session.
const a3 = await acquireLease(sb, ITEM, "golden-B", "B");
check("after release, session B acquires the now-free item", a3.acquired === true && a3.takeover === false);

// 6. STALE TAKEOVER: with a 0-second stale threshold the live lease is immediately claimable (proves the
//    heartbeat-past-threshold takeover path; a crashed holder cannot wedge an item forever).
const a4 = await acquireLease(sb, ITEM, "golden-A", "A", 0);
check("stale lease (0s threshold) is TAKEN OVER by A (acquired=true, takeover=true)", a4.acquired === true && a4.takeover === true);

// cleanup
await releaseLease(sb, ITEM, "golden-A").catch(() => {});
await releaseLease(sb, ITEM, "golden-B").catch(() => {});

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
