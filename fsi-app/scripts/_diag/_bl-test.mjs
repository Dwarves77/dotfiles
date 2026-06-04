import { readFileSync } from "node:fs";import { resolve, dirname } from "node:path";import { fileURLToPath } from "node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
import { browserlessFetch, BrowserlessError } from "../../src/lib/sources/canonical-fetch.mjs";
console.log("key set:", !!process.env.BROWSERLESS_API_KEY, "len:", (process.env.BROWSERLESS_API_KEY||"").length);
try {
  const r = await browserlessFetch("https://example.com", { waitTimeoutMs: 5000, gotoTimeoutMs: 15000 });
  console.log(`LIVE: status=${r.status} htmlLen=${r.htmlLength} textLen=${r.textLength} renderMs=${r.renderMs}`);
  console.log("=> Browserless WORKS. Content fetch is unblocked.");
} catch (e) {
  console.log(`BLOCKED: ${e instanceof BrowserlessError ? `status=${e.status} ${e.message}` : e.message}`);
}
