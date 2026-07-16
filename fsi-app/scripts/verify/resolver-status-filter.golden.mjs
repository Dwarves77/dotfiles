#!/usr/bin/env node
// resolver-status-filter.golden.mjs — behavioral golden for the buildResolver status filter (hardening A1,
// seam 1). Locks: a SUSPENDED source is UNSELECTABLE by the grounding resolver (the Task-3-suspended EUR-Lex
// junk-drawer 404 that was the citation-of-record for 927 facts can never be re-selected as a FACT source),
// while active sources resolve normally. Pure (no DB); imports the real buildResolver via jiti. Invariant RD-39.
// Run: node scripts/verify/resolver-status-filter.golden.mjs  — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// POSITIVE CONTROL: a EUR-Lex host whose ONLY registry row is the suspended junk-drawer -> unselectable.
const suspendedOnly = buildResolver([
  { id: "junk-drawer", url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040", base_tier: 1, status: "suspended" },
]);
const s1 = suspendedOnly.resolveSpan("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0952");
check("suspended junk-drawer is UNSELECTABLE (sourceId null)", s1.sourceId === null && s1.tier === null);

// NEGATIVE CONTROL: an active source resolves normally.
const activeOnly = buildResolver([
  { id: "active-1", url: "https://www.legislation.gov.uk/ukpga/2008/27", base_tier: 1, status: "active" },
]);
const a1 = activeOnly.resolveSpan("https://www.legislation.gov.uk/ukpga/2008/27/section/1");
check("active source resolves normally", a1.sourceId === "active-1" && a1.tier === 1);

// MIXED: suspended + active on the SAME host -> active is selected, suspended never.
const mixed = buildResolver([
  { id: "junk", url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040", base_tier: 1, status: "suspended" },
  { id: "real", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0952", base_tier: 2, status: "active" },
]);
const m1 = mixed.resolveSpan("https://eur-lex.europa.eu/anything");
check("active EUR-Lex row selected over the suspended one", m1.sourceId === "real" && m1.tier === 2);

// BACKWARD-COMPAT: undefined status stays included (callers not selecting status are unaffected).
const noStatus = buildResolver([{ id: "legacy", url: "https://eur-lex.europa.eu/x", base_tier: 1 }]);
check("undefined status is included (backward-compatible)", noStatus.resolveSpan("https://eur-lex.europa.eu/y").sourceId === "legacy");

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
