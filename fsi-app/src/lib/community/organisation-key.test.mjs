import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOrganisationKey,
  domainFromEmail,
  isCorporateDomain,
  isFreeMailDomain,
  FREE_MAIL_DOMAINS,
} from "./organisation-key.mjs";

test("domainFromEmail: extracts the lowercased domain half", () => {
  assert.equal(domainFromEmail("Jane@Acme-Forwarding.com"), "acme-forwarding.com");
});

test("domainFromEmail: rejects malformed input rather than guessing", () => {
  assert.equal(domainFromEmail("not-an-email"), null);
  assert.equal(domainFromEmail("@acme.com"), null);
  assert.equal(domainFromEmail("jane@"), null);
  assert.equal(domainFromEmail(""), null);
  assert.equal(domainFromEmail(null), null);
  assert.equal(domainFromEmail("jane@localhost"), null); // no dot — not a real domain
});

test("isFreeMailDomain: known consumer webmail providers are flagged", () => {
  for (const d of ["gmail.com", "GMAIL.COM", "outlook.com", "yahoo.co.uk", "icloud.com", "proton.me"]) {
    assert.equal(isFreeMailDomain(d), true, d);
  }
});

test("isFreeMailDomain: a corporate domain is not flagged", () => {
  assert.equal(isFreeMailDomain("acme-forwarding.com"), false);
});

test("FREE_MAIL_DOMAINS: a small closed data table, not an inline conditional", () => {
  assert.ok(Array.isArray(FREE_MAIL_DOMAINS));
  assert.ok(FREE_MAIL_DOMAINS.length > 10);
  assert.ok(Object.isFrozen(FREE_MAIL_DOMAINS));
});

test("isCorporateDomain: true for a real, non-free-mail domain; false for free-mail or malformed", () => {
  assert.equal(isCorporateDomain("acme-forwarding.com"), true);
  assert.equal(isCorporateDomain("gmail.com"), false);
  assert.equal(isCorporateDomain("localhost"), false);
  assert.equal(isCorporateDomain(null), false);
});

// ── deriveOrganisationKey ───────────────────────────────────────────────────────────────────────

test("deriveOrganisationKey: refuses when the member is not verified, even with a good domain and salt", () => {
  const r = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: false, salt: "s3cr3t" });
  assert.equal(r.organisationKey, null);
  assert.equal(r.refused, true);
  assert.match(r.reason, /not verified/);
});

test("deriveOrganisationKey: refuses a free-mail domain even when verified=true", () => {
  const r = deriveOrganisationKey({ domain: "gmail.com", verified: true, salt: "s3cr3t" });
  assert.equal(r.organisationKey, null);
  assert.equal(r.refused, true);
  assert.match(r.reason, /free-mail/);
});

test("deriveOrganisationKey: refuses when no salt is configured", () => {
  const r = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "" });
  assert.equal(r.organisationKey, null);
  assert.equal(r.refused, true);
  assert.match(r.reason, /COMMUNITY_ORG_SALT/);
});

test("deriveOrganisationKey: refuses a malformed/missing domain", () => {
  const r = deriveOrganisationKey({ domain: "", verified: true, salt: "s3cr3t" });
  assert.equal(r.refused, true);
  assert.match(r.reason, /domain/);
});

test("deriveOrganisationKey: succeeds for a verified corporate domain with a salt, deterministically", () => {
  const r1 = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "s3cr3t" });
  const r2 = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "s3cr3t" });
  assert.equal(r1.refused, false);
  assert.equal(r1.reason, null);
  assert.equal(typeof r1.organisationKey, "string");
  assert.ok(r1.organisationKey.length > 20);
  assert.equal(r1.organisationKey, r2.organisationKey, "same domain + salt must derive the same key");
});

test("deriveOrganisationKey: two members at the same employer derive the SAME key regardless of local-part", () => {
  const a = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "s3cr3t" });
  const b = deriveOrganisationKey({ domain: "ACME-FORWARDING.COM", verified: true, salt: "s3cr3t" });
  assert.equal(a.organisationKey, b.organisationKey);
});

test("deriveOrganisationKey: two DIFFERENT employers derive DIFFERENT keys under the same salt", () => {
  const a = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "s3cr3t" });
  const b = deriveOrganisationKey({ domain: "beta-logistics.com", verified: true, salt: "s3cr3t" });
  assert.notEqual(a.organisationKey, b.organisationKey);
});

test("deriveOrganisationKey: a different salt derives a different key for the SAME domain (never surfaced, but proves the salt matters)", () => {
  const a = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "salt-one" });
  const b = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "salt-two" });
  assert.notEqual(a.organisationKey, b.organisationKey);
});

test("deriveOrganisationKey: the derived key never contains the domain itself (not reversible by inspection)", () => {
  const r = deriveOrganisationKey({ domain: "acme-forwarding.com", verified: true, salt: "s3cr3t" });
  assert.ok(!r.organisationKey.includes("acme"));
});
