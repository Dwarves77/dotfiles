// organisation-key.mjs — server-only, pseudonymous per-organisation identifier (spec 05 §2, §3;
// migration 293's community_member_profiles.organisation_key column comment; migration 294's
// community_benchmark_responses.organisation_key column comment; docs/dispatches lane COMMUNITY-C).
// PURE — no I/O, no env read. The caller (a route, running server-side only) supplies the salt from
// process.env.COMMUNITY_ORG_SALT and the verified corporate email DOMAIN (never the full address)
// explicitly, so this module is unit-testable without touching the environment and cannot itself be the
// place a client-supplied value leaks in (see migration 294's own header on exactly that risk).
//
// WHAT THIS DERIVES A KEY FROM: the member's VERIFIED CORPORATE EMAIL DOMAIN, salted with an
// operator-provisioned secret (env var COMMUNITY_ORG_SALT — read by the routes, never by this module)
// and hashed with HMAC-SHA256. Two members at the same employer (same domain) always derive the SAME
// organisation_key (this is the point — it lets k-anonymity count DISTINCT organisations, spec 05 §1);
// nobody outside the server can invert the key back to the domain without the salt. This is a step
// further than spec 05 §2's own "the platform knows exactly who you are, the room does not" — the
// organisation_key makes an AGGREGATE not even reveal which employer's data is whose within it.
//
// NEVER SURFACED TO A CLIENT. identity.mjs's projectAuthorIdentity() allowlist does not carry this
// column (see that module's header); this module's own output is consumed only by server-side route
// code, which stores it in community_member_profiles.organisation_key /
// community_benchmark_responses.organisation_key (both REVOKEd from anon/authenticated SELECT — see
// migrations 293, 294) and never echoes it back in an HTTP response body.
//
// REFUSES for two independent reasons, checked explicitly rather than left to fail open:
//   1. `verified` is not `true` — an org key must never exist for an unverified member. Migration 293's
//      own CHECK constraint (verified=true requires organisation_key NOT NULL) is the DB-side half of
//      this same contract; this function is the JS-side half that keeps an unverified profile from ever
//      being handed one.
//   2. the domain is a FREE-MAIL / consumer webmail domain (FREE_MAIL_DOMAINS below) — spec 05 §2's own
//      model (Gartner Peer Insights: "identifiable CORPORATE email matching their stated company") is
//      meaningless against a gmail.com address, because a free-mail domain does not identify an employer
//      at all — every free-mail user would collide into the SAME organisation_key, silently manufacturing
//      fake k-anonymity (five gmail.com users look like "5 organisations" when they may all be the same
//      actor working around the guard). Refusing derivation outright, rather than hashing the free-mail
//      domain anyway, is the only posture consistent with spec 05 §1's antitrust requirement.

import { createHmac } from "node:crypto";

/** Consumer / free webmail domains — NEVER treated as a corporate identity (see file header, reason 2).
 * A data table, not an inline conditional, so extending it is a one-line, reviewable diff. Not
 * exhaustive by design (an unlisted free-mail provider is a gap to add here, not a reason to widen the
 * check into something fuzzier — a false negative here is recoverable, a false positive silently
 * refuses a legitimate corporate domain). */
export const FREE_MAIL_DOMAINS = Object.freeze([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me",
  "aol.com",
  "gmx.com", "gmx.net", "gmx.de",
  "mail.com",
  "zoho.com",
  "yandex.com", "yandex.ru",
  "qq.com", "163.com", "126.com", "sina.com",
  "fastmail.com",
  "web.de",
  "inbox.com",
]);

/** Lowercases and strips a leading "@" so a caller may pass either "acme.com" or "@acme.com". */
function normaliseDomain(domain) {
  return String(domain ?? "").trim().toLowerCase().replace(/^@/, "");
}

/**
 * @param {string} domain - a bare domain, e.g. "acme-forwarding.com" (never a full email address).
 * @returns {boolean}
 */
export function isFreeMailDomain(domain) {
  return FREE_MAIL_DOMAINS.includes(normaliseDomain(domain));
}

/**
 * Extracts the domain half of an email address. PURE, no deliverability validation beyond "has exactly
 * one @, with content on both sides" — the caller is expected to already hold a platform-confirmed auth
 * email (Supabase auth.users.email), not arbitrary user input.
 *
 * @param {string|null|undefined} email
 * @returns {string|null} lowercased domain, or null if `email` is not shaped like `local@domain`.
 */
export function domainFromEmail(email) {
  const trimmed = String(email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  return domain.includes(".") ? domain : null;
}

/**
 * True when `domain` is a plausible CORPORATE domain (syntactically valid, not free-mail) — used by the
 * verification route to decide whether the platform's already-known account email qualifies as
 * "verified" without deriving a key yet ("a corporate domain on the account IS the verification").
 *
 * @param {string|null} domain
 * @returns {boolean}
 */
export function isCorporateDomain(domain) {
  const normalised = normaliseDomain(domain);
  return !!normalised && normalised.includes(".") && !isFreeMailDomain(normalised);
}

/**
 * Derives (or refuses to derive) a pseudonymous organisation_key. PURE — the caller supplies `salt`
 * (from process.env.COMMUNITY_ORG_SALT, read server-side only, never inside this module) and the domain
 * explicitly, so this function has no environment dependency and is fully unit-testable.
 *
 * @param {{ domain?: string|null, verified?: boolean, salt?: string|null }} input
 * @returns {{ organisationKey: string|null, refused: boolean, reason: string|null }}
 */
export function deriveOrganisationKey({ domain, verified, salt } = {}) {
  if (verified !== true) {
    return { organisationKey: null, refused: true, reason: "member is not verified" };
  }
  const normalised = normaliseDomain(domain);
  if (!normalised || !normalised.includes(".")) {
    return { organisationKey: null, refused: true, reason: "no valid email domain to derive from" };
  }
  if (isFreeMailDomain(normalised)) {
    return {
      organisationKey: null,
      refused: true,
      reason: `"${normalised}" is a free-mail domain, not a corporate identity — cannot derive an organisation_key`,
    };
  }
  if (!salt || !String(salt).trim()) {
    return { organisationKey: null, refused: true, reason: "COMMUNITY_ORG_SALT is not configured" };
  }
  const organisationKey = createHmac("sha256", String(salt)).update(normalised, "utf8").digest("hex");
  return { organisationKey, refused: false, reason: null };
}
