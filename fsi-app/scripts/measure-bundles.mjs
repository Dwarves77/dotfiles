#!/usr/bin/env node

import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const NEXT_DIR = resolve(process.cwd(), ".next");
const CHUNKS_DIR = resolve(NEXT_DIR, "static");

// Routes worth tracking. Add new routes here when they ship.
const ROUTES = [
  { label: "/", manifest: "app/page" },
  { label: "/admin", manifest: "app/admin/page" },
  { label: "/community", manifest: "app/community/page" },
  { label: "/community/browse", manifest: "app/community/browse/page" },
  { label: "/login", manifest: "app/login/page" },
  { label: "/map", manifest: "app/map/page" },
  { label: "/market", manifest: "app/market/page" },
  { label: "/onboarding", manifest: "app/onboarding/page" },
  { label: "/operations", manifest: "app/operations/page" },
  { label: "/profile", manifest: "app/profile/page" },
  { label: "/regulations", manifest: "app/regulations/page" },
  { label: "/regulations/[slug]", manifest: "app/regulations/[slug]/page" },
  { label: "/research", manifest: "app/research/page" },
  { label: "/settings", manifest: "app/settings/page" },
];

function readManifest(manifestPath) {
  const file = resolve(NEXT_DIR, "server", `${manifestPath}_client-reference-manifest.js`);
  if (!existsSync(file)) return null;
  const src = readFileSync(file, "utf8");
  const m = src.match(/__RSC_MANIFEST\["[^"]+"\]\s*=\s*(\{[\s\S]+\});?\s*$/);
  if (!m) return null;
  return Function(`"use strict"; return (${m[1]});`)();
}

function chunkSize(relPath) {
  const abs = resolve(CHUNKS_DIR, relPath.replace(/^static\//, ""));
  if (!existsSync(abs)) return 0;
  return statSync(abs).size;
}

function fmt(bytes) {
  return (bytes / 1024).toFixed(1) + " kB";
}

if (!existsSync(NEXT_DIR)) {
  console.error("No .next/ directory found. Run `npm run build` first.");
  process.exit(1);
}

const layoutManifest = readManifest("app/page");
const sharedChunks = layoutManifest?.entryJSFiles?.["[project]/src/app/layout"] ?? [];
const sharedBytes = sharedChunks.reduce((a, c) => a + chunkSize(c), 0);

console.log("\nPer-route client bundle inventory\n");
console.log(
  "Route                            |   Entry (First Load) | Route-specific entry |     All client (entry+async)"
);
console.log(
  "---------------------------------|----------------------|----------------------|------------------------------"
);

for (const r of ROUTES) {
  const m = readManifest(r.manifest);
  if (!m) {
    console.log(`${r.label.padEnd(33)} | ${"MISSING".padStart(20)} | ${"MISSING".padStart(20)} | ${"MISSING".padStart(28)}`);
    continue;
  }
  const pageKey = Object.keys(m.entryJSFiles || {}).find((k) => k.endsWith("/page"));
  const entryChunks = pageKey ? Array.from(new Set(m.entryJSFiles[pageKey])) : [];
  const entryBytes = entryChunks.reduce((a, c) => a + chunkSize(c), 0);
  const routeOnly = entryChunks.filter((c) => !sharedChunks.includes(c));
  const routeOnlyBytes = routeOnly.reduce((a, c) => a + chunkSize(c), 0);

  const allClient = new Set();
  for (const mod of Object.values(m.clientModules || {})) {
    for (const c of mod.chunks || []) {
      if (typeof c === "string" && c.startsWith("/_next/")) {
        allClient.add(c.replace(/^\/_next\//, ""));
      }
    }
  }
  const allBytes = Array.from(allClient).reduce((a, c) => a + chunkSize(c), 0);

  console.log(
    `${r.label.padEnd(33)} | ${fmt(entryBytes).padStart(20)} | ${fmt(routeOnlyBytes).padStart(20)} | ${fmt(allBytes).padStart(28)}`
  );
}

console.log(
  `\nShared layout chunks: ${sharedChunks.length} files, ${fmt(sharedBytes)} (counted once in Entry totals above)\n`
);
console.log("Reading guide:");
console.log("  - Entry is what users pay before hydration. This is the metric to drive down.");
console.log("  - Route-specific entry is the portion unique to this route (Entry minus shared).");
console.log("  - All client includes async chunks (next/dynamic, lazy()). For the wrap pattern in");
console.log("    server components with ssr:true, async chunks are typically still in Entry —");
console.log("    deferral requires ssr:false in a client component shim.");
console.log("");
