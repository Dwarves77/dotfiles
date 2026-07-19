#!/usr/bin/env node
// reassign-to-a.mjs — Session B examined a Lane A item and found it is GENUINE JUDGMENT, not a mechanical
// promotion (no canonical instrument to id-stamp, capture is a portal/press/wrong-instrument artifact, or the
// failure needs a human call). Per the hard rule ("if the id is not findable / the capture is suspect, annotate
// the worklist row for Lane A and move on, do not judge it"), this ANNOTATES the drain_worklist row with the
// Session-B finding and RELEASES the lease. It never versions a claim, never drains — reassignment only.
// Usage: node reassign-to-a.mjs <itemKey> <holder> "<reason>"
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const [, , KEY, HOLDER, REASON] = process.argv;
if (!KEY || !HOLDER || !REASON) { console.error('usage: reassign-to-a.mjs <itemKey> <holder> "<reason>"'); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll } = await jiti.import("../lib/db.mjs");
const { releaseLease, heartbeatLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const it = (await readAll("intelligence_items", "id,legacy_id,title", {}))
  .find((x) => x.id.startsWith(KEY) || (x.legacy_id || "") === KEY || (x.legacy_id || "").startsWith(KEY));
if (!it) { console.error(`item not found: ${KEY}`); process.exit(1); }
const short = it.legacy_id || it.id.slice(0, 8);

// Must hold the lease to annotate + release (no lease, no touch).
const held = await heartbeatLease(sb, it.id, HOLDER).catch(() => false);
if (!held) { console.error(`LEASE NOT HELD by "${HOLDER}" for ${short} — acquire first`); process.exit(2); }

const note = `session-B REASSIGN-TO-A: ${REASON}`;
const { error } = await svc.from("drain_worklist").update({ lane: "A", notes: note, assigned_by: "session-B", assigned_at: new Date().toISOString() }).eq("intelligence_item_id", it.id);
if (error) { console.error(`worklist update failed: ${error.message}`); process.exit(3); }
console.log(`ANNOTATED ${short} -> Lane A: ${REASON}`);

const released = await releaseLease(sb, it.id, HOLDER);
console.log(released ? `RELEASED lease on ${short}` : `no lease row to release for ${short}`);
process.exit(0);
