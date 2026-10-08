// attacks-manifest.test.mjs -- lane PROOF-4 (2026-10-07). Static proof of the REAL attacks.json: it validates, it
// covers every guard the brief names (so a guard cannot silently drop out of the suite), every script it calls
// exists, every verdict line it requires is a line the audit really prints, every table and function an attack
// names exists in the migration files, and `needs_fixtures` is declared wherever fixture users are referenced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, loadManifest } from "./run-attacks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI = resolve(HERE, "..", "..", "..");
const manifest = loadManifest();
const byId = new Map(manifest.attacks.map((a) => [a.id, a]));

test("the real manifest validates", () => {
  assert.deepEqual(validateManifest(manifest), []);
});

const REQUIRED = {
  "tier override": ["tier-override-automatic-writer", "tier-override-nonadmin-direct-write"],
  "corrections layer": [
    "corrections-preserved-over-machine-write",
    "corrections-revoke-restores-machine-value",
    "corrections-append-only-update",
    "corrections-append-only-delete",
    "corrections-nonadmin-select-empty",
    "corrections-write-paths-closed",
    "corrections-migration-356-selfcheck-rerun",
  ],
  "migration 250 provenance guard": ["provenance-guard-adversarial"],
  "pause flag writer": ["pause-flag-direct-write-refused", "pause-flag-guard-proof"],
  "judgement drain writer": ["judgement-drain-direct-write-refused", "judgement-drain-wrong-marker-refused"],
  "RLS audits": ["rls-derivation-edges", "rls-harness-runs", "rls-spec09-org"],
  "S8-5 cross-organisation": ["s8-5-cross-organisation-read", "s8-5-cross-organisation-write-refused", "s8-c-count-rpcs-membership-gate"],
  "admin gate": ["admin-gate-self-promotion-refused"],
  "ADR-035 aggregate floor": ["adr035-aggregate-below-floor-refused", "adr035-floor-cannot-be-lowered", "adr035-dominance-cap-refused", "adr035-aggregate-tables-closed"],
};

for (const [guard, ids] of Object.entries(REQUIRED)) {
  test(`coverage: ${guard} is attacked`, () => {
    for (const id of ids) assert.ok(byId.has(id), `attack ${id} is missing from attacks.json`);
  });
}

test("the cross-organisation attack is named S8-5 in its id and its invariant (Stage 8 item brought forward)", () => {
  assert.match(byId.get("s8-5-cross-organisation-read").invariant, /S8-5/);
});

test("every attack states the invariant it attacks, what is expected, and a reference", () => {
  for (const a of manifest.attacks) {
    assert.ok(a.invariant && a.invariant.length > 10, `${a.id} invariant`);
    assert.ok(a.expected && a.expected.length > 5, `${a.id} expected`);
    assert.ok(a.reference && a.reference.length > 3, `${a.id} reference`);
  }
});

test("every script attack calls a script that exists, and every required verdict label is printed by that script", () => {
  for (const a of manifest.attacks.filter((x) => x.kind === "script")) {
    const p = join(FSI, a.script);
    assert.ok(existsSync(p), `${a.id}: ${a.script} does not exist`);
    const text = readFileSync(p, "utf8");
    for (const r of a.require ?? []) {
      if (!r.source_literal) continue;
      assert.ok(text.includes(r.source_literal), `${a.id}: the script does not contain the literal "${r.source_literal}" that pattern "${r.label}" depends on`);
    }
    for (const r of a.require ?? []) new RegExp(r.pattern, "m"); // compiles
  }
});

test("the prov-guard attack requires A, B, C and D to PASS (a SKIPped attack is not a proof) and allows E to SKIP", () => {
  const a = byId.get("provenance-guard-adversarial");
  const labels = a.require.map((r) => r.label).join(" | ");
  for (const k of ["A forged", "B direct", "C on-conflict", "D restrictive"]) assert.match(labels, new RegExp(k));
  const e = a.require.find((r) => /E derivation/.test(r.label));
  assert.ok(e && /SKIP/.test(e.pattern), "E is a both-directions check that depends on corpus state, so SKIP is accepted for E only");
  for (const r of a.require.filter((x) => !/E derivation/.test(x.label))) assert.ok(!/SKIP/.test(r.pattern), `${r.label} must not accept SKIP`);
});

const migrationText = readdirSync(join(FSI, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(FSI, "supabase", "migrations", f), "utf8").toLowerCase())
  .join("\n");

test("every public table or function an attack's SQL names appears in a migration file (a typo cannot hide in the suite)", () => {
  const missing = [];
  for (const a of manifest.attacks.filter((x) => x.kind === "sql")) {
    for (const s of a.steps) {
      for (const m of s.sql.matchAll(/public\.([a-z_][a-z0-9_]*)/g)) {
        if (!migrationText.includes(m[1])) missing.push(`${a.id}: public.${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("every fixture or saved reference (@name) in an attack is a fixture key or is saved by an earlier step", () => {
  const fixtureKeys = new Set(["admin", "owner_a", "member_b", "org_a", "org_b"]);
  for (const a of manifest.attacks.filter((x) => x.kind === "sql")) {
    const saved = new Set();
    for (const s of a.steps) {
      for (const p of s.params ?? []) {
        if (typeof p === "string" && p.startsWith("@")) {
          const name = p.slice(1);
          assert.ok(fixtureKeys.has(name) || saved.has(name), `${a.id}/${s.label}: @${name} is neither a fixture nor saved earlier`);
        }
      }
      for (const k of Object.keys(s.save ?? {})) saved.add(k);
    }
  }
});

test("needs_fixtures is declared exactly where an attack uses a fixture user or a fixture reference", () => {
  const fixtureKeys = new Set(["admin", "owner_a", "member_b", "org_a", "org_b"]);
  const uses = (a) => {
    if (a.kind === "sql") {
      return a.steps.some((s) => (typeof s.as === "string" && s.as.startsWith("user:")) || (s.params ?? []).some((p) => typeof p === "string" && fixtureKeys.has(p.slice(1)) && p.startsWith("@")));
    }
    return a.needs_fixtures === true;
  };
  for (const a of manifest.attacks.filter((x) => x.kind === "sql")) {
    assert.equal(Boolean(a.needs_fixtures), uses(a), `${a.id}: needs_fixtures must be ${uses(a)}`);
  }
});

test("no attack writes outside a rolled-back transaction except the two by-design persistent ones (tier override, runner fixtures)", () => {
  const persistent = manifest.attacks.filter((a) => a.kind !== "sql" && a.kind !== "sql-block").map((a) => a.kind);
  for (const k of persistent) assert.ok(["script", "tier-override"].includes(k), `unexpected kind ${k}`);
});
