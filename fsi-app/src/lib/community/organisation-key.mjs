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
