#!/usr/bin/env node
// lease.mjs — standalone per-item mutation-lease CLI for the promotion lane. id-stamp.mjs requires the lease to
// be ALREADY HELD by the caller (heartbeat check; no lease, no touch), so the caller acquires here, runs id-stamp
// / drain-clear, and releases here (or drain-clear releases in its own finally). acquire/heartbeat/release wrap
// the mig-211 RPCs (mutation-lease.mjs). Resolves an item key (id/legacy_id prefix) to the uuid, same as the
// other _reground tools. Usage: node lease.mjs <itemKey> <acquire|heartbeat|release> <holder> [lane]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const [, , KEY, ACTION, HOLDER, LANE = null] = process.argv;
if (!KEY || !ACTION || !HOLDER) { console.error("usage: lease.mjs <itemKey> <acquire|heartbeat|release> <holder> [lane]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll } = await jiti.import("../lib/db.mjs");
const { acquireLease, heartbeatLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const it = (await readAll("intelligence_items", "id,legacy_id,title", {}))
  .find((x) => x.id.startsWith(KEY) || (x.legacy_id || "") === KEY || (x.legacy_id || "").startsWith(KEY));
if (!it) { console.error(`item not found: ${KEY}`); process.exit(1); }
const short = it.legacy_id || it.id.slice(0, 8);

if (ACTION === "acquire") {
  const r = await acquireLease(sb, it.id, HOLDER, LANE);
  if (!r.acquired) { console.error(`LEASE HELD by "${r.cur_holder}" (heartbeat ${r.cur_heartbeat}) for ${short} — refusing (H5)`); process.exit(2); }
  console.log(`ACQUIRED lease on ${short} (${it.id}) holder=${HOLDER} lane=${LANE ?? "-"}${r.takeover ? " [stale takeover]" : ""}`);
} else if (ACTION === "heartbeat") {
  const held = await heartbeatLease(sb, it.id, HOLDER).catch(() => false);
  console.log(held ? `HELD by ${HOLDER} for ${short}` : `NOT held by ${HOLDER} for ${short}`);
  process.exit(held ? 0 : 2);
} else if (ACTION === "release") {
  const released = await releaseLease(sb, it.id, HOLDER);
  console.log(released ? `RELEASED lease on ${short}` : `no lease to release for ${short} (holder ${HOLDER})`);
} else { console.error(`unknown action: ${ACTION}`); process.exit(1); }
process.exit(0);
