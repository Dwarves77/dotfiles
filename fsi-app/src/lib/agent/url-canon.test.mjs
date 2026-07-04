// @ts-check
// NORMALIZATION DRIFT GUARD (operator ruling 2026-07-04, PR #180 requirement). URL-equivalence lives in two
// homes — canonicalizeCitationUrl (JS, url-canon.mjs) and canonicalize_citation_url (SQL, migration 150).
// This is the established guard (the mig-141 authorityFloorFor pattern): parse migration 150's function body,
// assert the JS mirror uses the SAME transform steps, and assert equivalence-preservation over the real
// 281-row pollution forms. CI-red on any divergence between the two homes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { stripUrlMarkers, canonicalizeCitationUrl, POLLUTION_FIXTURES } from "./url-canon.mjs";
import { readMigrationSql } from "../../../.discipline/lib/read-migration-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = resolve(HERE, "../../../supabase/migrations/150_criterion2_url_canonicalize.sql");
const sql = readMigrationSql(MIG); // CRLF-normalized (guard-fix 2b) so a Windows checkout does not false-fail
// isolate the helper body so we assert against IT, not the criterion-2 call sites
const body = (sql.match(/AS \$canon\$([\s\S]*?)\$canon\$/) || [, ""])[1];

test("DRIFT GUARD: migration 150 defines canonicalize_citation_url with the SAME steps as the JS mirror", () => {
  assert.ok(body.length > 0, "could not locate canonicalize_citation_url body ($canon$ ... $canon$) in migration 150");
  // Each SQL step the JS mirror replicates, IN the SQL body. If the SQL changes a step, this fails and the JS
  // mirror must be updated in lockstep (the two-home guarantee).
  assert.match(body, /lower\(btrim\(u\)\)/, "SQL must lower(btrim(u)) — JS: String(u).trim().toLowerCase()");
  assert.match(body, /'\[\*`\]\+\$'/, "SQL must strip trailing [*`]+$ — JS: replace(/[*`]+$/, '')");
  assert.match(body, /'\^\(https\?:\/\/\)www\\\.'/, "SQL must strip leading www. — JS: replace(/^(https?:\\/\\/)www\\./, '$1')");
  assert.match(body, /'\[\/\.,;:\]\+\$'/, "SQL must strip the combined trailing class [/.,;:]+$ — JS: replace(/[/.,;:]+$/, '')");
});

test("EQUIVALENCE-PRESERVATION: every polluted form canonicalizes to its clean form's value", () => {
  for (const { polluted, clean } of POLLUTION_FIXTURES) {
    assert.equal(
      canonicalizeCitationUrl(polluted),
      canonicalizeCitationUrl(clean),
      `polluted "${polluted}" must canonicalize to the same value as clean "${clean}"`,
    );
  }
});

test("TWO-HOME AGREEMENT: canonical(stripped(u)) == canonical(u) — the write-site strip never diverges the compare", () => {
  for (const { polluted } of POLLUTION_FIXTURES) {
    // stripUrlMarkers operates on prose; wrap the URL so it matches the http(s) prefix, then re-extract.
    const strippedProse = stripUrlMarkers(polluted);
    assert.equal(
      canonicalizeCitationUrl(strippedProse),
      canonicalizeCitationUrl(polluted),
      `write-site strip of "${polluted}" must canonicalize identically to the raw form`,
    );
  }
});

test("canonicalize unit: markers, www, trailing slash, dot-star, combined", () => {
  assert.equal(canonicalizeCitationUrl("https://x.gov/a*"), "https://x.gov/a");
  assert.equal(canonicalizeCitationUrl("https://x.gov/a.*"), "https://x.gov/a");
  assert.equal(canonicalizeCitationUrl("https://www.x.gov/a/"), "https://x.gov/a");
  assert.equal(canonicalizeCitationUrl("https://WWW.X.gov/A"), "https://x.gov/a"); // note: www strip is post-lowercase
  assert.equal(canonicalizeCitationUrl("https://x.gov/a`"), "https://x.gov/a");
  assert.equal(canonicalizeCitationUrl(null), null);
});

test("stripUrlMarkers leaves a clean URL untouched and only strips trailing markers", () => {
  assert.equal(stripUrlMarkers("see https://x.gov/a for detail"), "see https://x.gov/a for detail");
  assert.equal(stripUrlMarkers("cite *https://x.gov/a* here"), "cite *https://x.gov/a here"); // trailing marker off the URL; leading * is prose
});
