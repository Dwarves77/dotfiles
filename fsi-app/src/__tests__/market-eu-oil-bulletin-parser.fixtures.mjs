// Committed fixture for src/lib/market/parsers/eu-weekly-oil-bulletin.mjs's parser tests.
//
// THESE VALUES ARE ILLUSTRATIVE TEST DATA, NOT ASSERTED LIVE FIGURES. This lane does not fetch the
// published EU Weekly Oil Bulletin (see the parser module's own header for why), so these numbers are
// NOT read from a real bulletin issue — they exist only to exercise the parser's field mapping, unit
// selection and error handling. Never present them, or a value derived from them, as a real published
// price (CLAUDE.md standing rule 2: never fabricate numbers presented as real).
//
// LOCATION: under src/__tests__/, not co-located with the parser module (src/lib/market/parsers/), so
// F25-module-liveness's own isTestFile() check (which excludes any path containing "/__tests__/") does
// not flag this fixture as an unwired module — its only "importer" is a test, and F25 correctly does not
// count a test as a production consumer of anything. Living under src/lib/market/ would make it a false
// F25 violation with no clean fix inside this lane's write set (.discipline/ is out of scope).
//
// Plain ESM string export so node --test can import it directly with no fs path resolution — the same
// reasoning contracts-*.test.mjs fixtures use elsewhere in this repo (fixture data as a tracked module,
// not a loose file the test has to locate on disk).

export const SAMPLE_BULLETIN_CSV = `week_ending;product;price_eur;n_member_states
2026-08-17;eurosuper-95;1512.30;24
2026-08-17;automotive-diesel;1487.10;24
2026-08-17;heating-gas-oil;1103.55;22
2026-08-17;lpg-motor-fuel;712.40;19
2026-08-17;residual-fuel-oil-1pct;498.90;15
2026-08-17;heavy-fuel-oil-3-5pct;452.20;14
2026-08-24;eurosuper-95;1519.85;24
2026-08-24;automotive-diesel;1493.60;24
2026-08-24;heating-gas-oil;1108.70;22
2026-08-24;lpg-motor-fuel;709.15;19
2026-08-24;residual-fuel-oil-1pct;501.05;15
2026-08-24;heavy-fuel-oil-3-5pct;455.80;14`;

// Rows exercising every warning path the parser must handle without throwing.
export const SAMPLE_BULLETIN_CSV_WITH_ERRORS = `week_ending;product;price_eur;n_member_states
2026-08-24;eurosuper-95;1519.85;24
24-08-2026;automotive-diesel;1493.60;24
2026-08-24;unknown-product;999.99;24
2026-08-24;heating-gas-oil;not-a-number;22
2026-08-24;lpg-motor-fuel;709.15;not-a-count
2026-08-24;lpg-motor-fuel;-5.00;19`;
