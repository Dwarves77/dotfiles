// 362_portfolios.test.mjs -- static proof of migration 362 (lane S8-D) by parsing the SQL file: no database, no
// SQL parser dependency (same convention as 353 and 356). The ATTACKS (cross-org read, create, member injection,
// forged author, org_id rewrite, immutable members) run in the migration's own self-check at apply time inside a
// rolled-back sub-transaction, using two real orgs' members; this file proves the file carries each attack, the
// guard it exercises, and that the policies and privileges the attacks depend on are the ones written.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./362_portfolios.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const table = (name) => new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(SQL)?.[1] ?? "";

test("header: subject line, NOT APPLIED, selection of held things, roll-ups never stored", () => {
  assert.match(RAW, /^-- subject: Migration 362 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /NEVER stored/);
  assert.match(RAW, /ADR-042/);
});

test("portfolios: org-owned, name unique per org case-insensitively, composite-FK target, length checks", () => {
  const body = table("portfolios");
  assert.match(body, /org_id\s+uuid NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE/);
  assert.match(body, /name_key\s+text GENERATED ALWAYS AS \(lower\(btrim\(name\)\)\) STORED/);
  assert.match(body, /created_by uuid REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
  assert.match(body, /CHECK \(length\(btrim\(name\)\) > 0\)/);
  assert.match(body, /CHECK \(length\(name\) <= 80\)/);
  assert.match(body, /UNIQUE \(id, org_id\)/);
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS portfolios_org_name_key_uidx ON public\.portfolios \(org_id, name_key\)/);
});

test("portfolio_members: exactly one target matching the kind, corridor ids shaped cl:corridor:*, items cascade", () => {
  const body = table("portfolio_members");
  assert.match(body, /item_id\s+uuid REFERENCES public\.intelligence_items\(id\) ON DELETE CASCADE/);
  assert.match(body, /entity_id\s+text REFERENCES public\.entities\(entity_id\)/);
  assert.match(body, /CHECK \(member_kind IN \('item', 'corridor', 'entity'\)\)/);
  assert.match(body, /member_kind = 'item'\s+AND item_id IS NOT NULL AND entity_id IS NULL/);
  assert.match(body, /member_kind = 'corridor' AND item_id IS NULL AND entity_id LIKE 'cl:corridor:%'/);
  assert.match(body, /member_kind = 'entity'\s+AND item_id IS NULL AND entity_id IS NOT NULL AND entity_id NOT LIKE 'cl:corridor:%'/);
});

test("the composite FK pins a member to its portfolio's own org", () => {
  const body = table("portfolio_members");
  assert.match(body, /FOREIGN KEY \(portfolio_id, org_id\)\s+REFERENCES public\.portfolios \(id, org_id\) ON DELETE CASCADE/);
});

test("one record per (portfolio, member): partial unique indexes on item and on entity", () => {
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS portfolio_members_item_uidx\s+ON public\.portfolio_members \(portfolio_id, item_id\) WHERE item_id IS NOT NULL/);
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS portfolio_members_entity_uidx\s+ON public\.portfolio_members \(portfolio_id, entity_id\) WHERE entity_id IS NOT NULL/);
});

test("caps: 100 portfolios per org and 500 members per portfolio, by trigger", () => {
  assert.match(SQL, /CREATE TRIGGER portfolios_org_cap_trg BEFORE INSERT ON public\.portfolios/);
  assert.match(SQL, /count\(\*\) FROM public\.portfolios p WHERE p\.org_id = NEW\.org_id\) >= 100/);
  assert.match(SQL, /CREATE TRIGGER portfolio_members_cap_trg BEFORE INSERT ON public\.portfolio_members/);
  assert.match(SQL, /count\(\*\) FROM public\.portfolio_members m WHERE m\.portfolio_id = NEW\.portfolio_id\) >= 500/);
  assert.match(SQL, /portfolio_cap_reached/);
  assert.match(SQL, /portfolio_member_cap_reached/);
});

test("RLS is on for both tables and every policy is org-scoped through user_belongs_to_org", () => {
  assert.match(SQL, /ALTER TABLE public\.portfolios ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /ALTER TABLE public\.portfolio_members ENABLE ROW LEVEL SECURITY/);
  const policies = SQL.match(/CREATE POLICY \w+ ON public\.\w+ FOR \w+[\s\S]*?;/g) ?? [];
  assert.equal(policies.length, 7, "four on portfolios, three on portfolio_members");
  for (const p of policies) {
    assert.match(p, /public\.user_belongs_to_org\(org_id\)/, p);
    assert.match(p, /auth\.role\(\) = 'service_role'/, p);
  }
  assert.doesNotMatch(SQL, /USING \(true\)/);
});

test("INSERT policies bind the author to auth.uid(); portfolio_members has no UPDATE policy", () => {
  assert.match(SQL, /CREATE POLICY portfolios_org_insert[\s\S]*?created_by = auth\.uid\(\)/);
  assert.match(SQL, /CREATE POLICY portfolio_members_org_insert[\s\S]*?added_by = auth\.uid\(\)/);
  assert.doesNotMatch(SQL, /CREATE POLICY portfolio_members_\w+ ON public\.portfolio_members FOR UPDATE/);
  assert.match(SQL, /CREATE POLICY portfolios_org_update ON public\.portfolios FOR UPDATE\s+USING[\s\S]*?WITH CHECK/);
});

test("privileges: anon has nothing; a signed-in user may rename a portfolio and nothing else; members are immutable", () => {
  assert.match(SQL, /REVOKE ALL ON public\.portfolios FROM anon/);
  assert.match(SQL, /REVOKE ALL ON public\.portfolio_members FROM anon/);
  assert.match(SQL, /REVOKE UPDATE ON public\.portfolios FROM authenticated/);
  assert.match(SQL, /GRANT UPDATE \(name\) ON public\.portfolios TO authenticated/);
  assert.match(SQL, /REVOKE UPDATE ON public\.portfolio_members FROM authenticated/);
  assert.doesNotMatch(SQL, /GRANT UPDATE \([^)]*org_id/);
});

test("nothing stores a roll-up: no count, band, class or total column on either table", () => {
  for (const name of ["portfolios", "portfolio_members"]) {
    const body = table(name);
    assert.doesNotMatch(body, /\b(item_count|member_count|band|origin_class|total|rollup|score)\b/i, name);
  }
});

test("the self-check attacks the layer as two real orgs' members, then rolls back, and skips honestly", () => {
  const sc = /DO \$selfcheck\$([\s\S]*?)\$selfcheck\$;/.exec(SQL)?.[1] ?? "";
  assert.ok(sc.length > 0, "self-check block present");
  assert.match(sc, /SET LOCAL ROLE authenticated/);
  assert.match(sc, /set_config\('request\.jwt\.claims'/);
  // disjoint orgs, real rows: no minted profiles
  assert.match(sc, /FROM public\.org_memberships m/);
  assert.doesNotMatch(sc, /INSERT INTO public\.(profiles|org_memberships|organizations)\b/);
  for (const msg of [
    "an org member could not read its own portfolio",
    "an org member could not read its own members",
    "another org read a portfolio",
    "another org read portfolio members",
    "another org created a portfolio in this org",
    "a portfolio was created with a forged author",
    "an org member could not create its own portfolio",
    "another org added a member claiming the portfolio",
    "a member was injected into another org",
    "a member was added with a forged author",
    "the same member was added twice",
    "a corridor member with a non-corridor id was accepted",
    "another org renamed a portfolio",
    "another org deleted portfolio members",
    "another org deleted a portfolio",
    "the portfolio did not survive the cross-org attack intact",
    "portfolio members did not survive the cross-org attack",
    "a portfolio was moved to another org",
    "an org member could not rename its own portfolio",
    "a portfolio member row was edited",
  ]) {
    assert.ok(sc.includes(msg), `self-check carries the attack: ${msg}`);
  }
  assert.match(sc, /fewer than two orgs with disjoint members, skipped/);
  assert.match(sc, /RAISE EXCEPTION 'c362_selfcheck_rollback'/);
  assert.match(sc, /EXCEPTION WHEN OTHERS THEN\s+IF SQLERRM <> 'c362_selfcheck_rollback' THEN RAISE; END IF/);
});

test("the structural post-check counts the seven policies by name", () => {
  for (const n of [
    "portfolios_org_read", "portfolios_org_insert", "portfolios_org_update", "portfolios_org_delete",
    "portfolio_members_org_read", "portfolio_members_org_insert", "portfolio_members_org_delete",
  ]) {
    assert.match(SQL, new RegExp(`'${n}'`), n);
  }
  assert.match(SQL, /IF n_policies <> 7 THEN RAISE EXCEPTION/);
});

test("no dash or section-sign glyph anywhere in the file (rule 022)", () => {
  assert.doesNotMatch(RAW, new RegExp("[" + String.fromCharCode(0x2013, 0x2014, 0xa7) + "]"));
});
