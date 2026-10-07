#!/usr/bin/env node
// sync-applied-migrations.mjs -- write the committed inventory of what production has applied (lane PROOF-1,
// coordinator ruling 2026-10-07). The migration replay applies exactly what production has applied, and file
// headers are not evidence of that (several headers still say NOT APPLIED for applied migrations), so the
// source is production's own migration list.
//
// HAND STEP (no credentials here, no network): the coordinator's executor exports the Supabase MCP
// `list_migrations` result as JSON, an array of { version, name }, then runs
//   node scripts/proof/sync-applied-migrations.mjs <path-to-export.json>
// and commits the output, fsi-app/docs/inventories/applied-migrations.json. Names and versions only; no secrets.
//
// Usage: node scripts/proof/sync-applied-migrations.mjs <export.json> [--out <path>]
// Exit: 0 = written; 1 = the export is malformed (named reason); 2 = usage error.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = resolve(HERE, "..", "..", "docs", "inventories", "applied-migrations.json");

/** Validate and normalize an export. PURE. Throws a message naming the first problem. */
export function normalizeExport(rows) {
  if (!Array.isArray(rows)) throw new Error("the export must be a JSON array of { version, name }");
  const seen = new Set();
  const out = rows.map((r, i) => {
    if (typeof r?.version !== "string" || !/^\d+$/.test(r.version)) throw new Error(`row ${i} has no numeric string version`);
    if (typeof r?.name !== "string" || r.name.trim() === "") throw new Error(`row ${i} (version ${r.version}) has no name`);
    const key = `${r.version}\u0000${r.name}`;
    if (seen.has(key)) throw new Error(`row ${i} duplicates version ${r.version} name ${r.name}`);
    seen.add(key);
    return { version: r.version, name: r.name };
  });
  return out.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Build the committed inventory. PURE. */
export function buildInventory(rows, syncedAt) {
  const migrations = normalizeExport(rows);
  return {
    source: "Supabase MCP list_migrations, exported by the coordinator's executor and synced with scripts/proof/sync-applied-migrations.mjs",
    synced_at: syncedAt,
    count: migrations.length,
    migrations,
  };
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf("--out");
  const out = oi >= 0 ? resolve(argv[oi + 1]) : DEFAULT_OUT;
  const input = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
  if (!input) { console.error("usage: sync-applied-migrations.mjs <export.json> [--out <path>]"); process.exit(2); }
  try {
    const inv = buildInventory(JSON.parse(readFileSync(resolve(input), "utf8")), new Date().toISOString());
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(inv, null, 2) + "\n", "utf8");
    console.log(`sync-applied-migrations: wrote ${inv.count} applied migration(s)`);
  } catch (e) {
    console.error(`sync-applied-migrations: ${e.message}`);
    process.exit(1);
  }
}
