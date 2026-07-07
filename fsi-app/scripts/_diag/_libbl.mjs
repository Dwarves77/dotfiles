import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { browserlessFetch } = await import("../../src/lib/sources/canonical-fetch.mjs");
const { detectRoadblock } = await import("../../src/lib/sources/primary-fallback.mjs");
const U = "https://www.smartfreightcentre.org/en/skills/library/measuring-and-reporting-the-carbon-footprint-of-electric-freight-vehicle-operations-whitepaper/";
try {
  const r = await browserlessFetch(U, { maxTextLength: 120000 });
  const d = detectRoadblock(r.text, { httpStatus: r.status });
  console.log(`status=${r.status} tier=${r.tier} textLen=${r.textLength} fullLen=${r.fullTextLength} roadblocked=${d.roadblocked}(${d.reason})`);
  console.log(`head: ${(r.text||"").slice(0,300).replace(/\s+/g," ")}`);
  const links = [...(r.html||"").matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(h=>/\.pdf|s3\.amazonaws|documents\//i.test(h));
  console.log(`\npdf/document links: ${[...new Set(links)].slice(0,8).join("  ")}`);
} catch(e){ console.log(`THREW ${e.name} status=${e.status} ${String(e.message).slice(0,160)}`); }
