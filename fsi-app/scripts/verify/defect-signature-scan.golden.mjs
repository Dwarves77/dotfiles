#!/usr/bin/env node
// defect-signature-scan.golden.mjs -- behavioral golden for defect-signature-scan.mjs.
// Fixture-driven, NO live DB. Locks the positive and negative control behavior the Wave 2 close gate
// depends on (per the flow-goldens mandate). Run: node scripts/verify/defect-signature-scan.golden.mjs
// Exits 0 on PASS, 1 on FAIL.

import { scanItem, detectNumeric } from './defect-signature-scan.mjs';

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed++; };

// --- POSITIVE CONTROL 1: S-CONFLATE (the ISO 14083 shape) ---
// One span (the bare title of Reg (EU) 2023/1805) reused across 3 FACT claims that name three distinct
// instruments (2023/1805, ISO 14083, CountEmissions); ISO 14083 and CountEmissions are absent from the span.
const SPAN_1805_TITLE = 'Regulation (EU) 2023/1805 of the European Parliament and of the Council of 13 September 2023 on the use of renewable and low-carbon fuels in maritime transport, and amending Directive 2009/16/EC';
const isoFacts = [
  { idx: 1, id: 'a', claim_text: 'CountEmissions EU (Regulation (EU) 2023/1805) embeds ISO 14083 WTW methodology by reference.', source_span: SPAN_1805_TITLE },
  { idx: 2, id: 'b', claim_text: 'From 1 July 2025, Regulation (EU) 2023/1805 applies; transport organisers must issue ISO 14083-aligned certificates.', source_span: SPAN_1805_TITLE },
  { idx: 3, id: 'c', claim_text: 'Regulation (EU) 2023/1805 mandates an ISO 14083-aligned calculation methodology.', source_span: SPAN_1805_TITLE },
];
const isoHits = scanItem(isoFacts);
check('positive: ISO 14083 shape produces >= 1 S-CONFLATE hit', isoHits.some((h) => h.signature === 'S-CONFLATE'));

// --- POSITIVE CONTROL 2: S-NUMERIC (the euro 6,800 shape) ---
// A real-but-mis-cited number: euro 6,800 is correct in the primary law but absent from this stored span.
const numFact = { idx: 1, id: 'd', claim_text: 'From 2030 onwards the excess-emissions premium rises to €6,800/gCO2/tkm.', source_span: '45% by 2030' };
const numHit = detectNumeric(numFact);
check('positive: euro 6,800 not in span produces an S-NUMERIC hit', numHit && numHit.signature === 'S-NUMERIC' && numHit.rationale.includes('6800'));

// --- NEGATIVE CONTROL: accuracy-clean, well-grounded facts produce ZERO hits ---
const cleanFacts = [
  { idx: 1, id: 'e', claim_text: 'The 2030 checkpoint requires at least 20% reduction by 2030.', source_span: 'to reduce the total annual GHG emissions from international shipping by at least 20%, striving for 30%, by 2030' },
  { idx: 2, id: 'f', claim_text: 'The ZEHID programme is backed by circa £200m in funding.', source_span: 'The Zero Emission HGV and Infrastructure Demonstrator (ZEHID) programme, backed by circa £200m in funding from the Department for Transport.' },
  { idx: 3, id: 'g', claim_text: 'Financial institutions issued green bonds worth KRW 640 billion aligned with the K-Taxonomy.', source_span: 'Financial institutions issued green bonds worth KRW 640 billion aligned with the K-Taxonomy in 2022.' },
];
const cleanHits = scanItem(cleanFacts);
check('negative: accuracy-clean facts produce ZERO hits', cleanHits.length === 0);
if (cleanHits.length) console.log('   unexpected hits:', JSON.stringify(cleanHits));

console.log(failed ? `\nGOLDEN FAILED (${failed})` : '\nGOLDEN PASSED');
process.exit(failed ? 1 : 0);
