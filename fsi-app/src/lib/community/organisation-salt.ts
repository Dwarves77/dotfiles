// organisation-salt.ts — the ONE place the community organisation-key salt is resolved (server-side only).
//
// WHY THIS EXISTS (2026-09-03, operator: "this seems overly complicated"): spec 05's benchmark responses
// are keyed by an anonymous organisation_key = HMAC(salt, verified corporate email domain) so that no
// competitor can turn a stored key back into a company name (organisation-key.mjs owns that derivation and
// never reads the environment). The salt used to be its own secret, COMMUNITY_ORG_SALT, which nobody had
// provisioned, so the whole response path refused. This module removes the extra provisioning step:
//
//   1. If COMMUNITY_ORG_SALT is set, it is used as-is (a dedicated salt decouples organisation keys from
//      every other secret's rotation — the better long-term shape, but optional).
//   2. Otherwise the salt is DERIVED from WORKER_SECRET (already present on Vercel and in .env.local,
//      secrets-registry.mjs TOPOLOGY) with HKDF-SHA256 and a fixed, versioned info string. HKDF is a
//      one-way key derivation, so the derived salt does not reveal WORKER_SECRET, and the same
//      WORKER_SECRET always yields the same salt, which is what keeps one organisation's responses joined
//      across time. Consequence, stated so nobody is surprised: rotating WORKER_SECRET re-keys every
//      organisation (their earlier responses stay in the aggregate but a re-verified member gets a new key).
//      Set COMMUNITY_ORG_SALT before rotating WORKER_SECRET to avoid that.
//   3. If neither is set, null: the caller refuses exactly as before (organisation-key.mjs's own guard).
//
// Pure given its inputs (env is injected), so it is unit-tested without touching process.env.

import { hkdfSync } from "node:crypto";

export const ORG_SALT_HKDF_INFO = "caros-ledge/community-organisation-key/v1";

export type OrganisationSaltSource = "COMMUNITY_ORG_SALT" | "derived-from-WORKER_SECRET" | null;

export function resolveOrganisationSalt(
  env: { COMMUNITY_ORG_SALT?: string; WORKER_SECRET?: string } = process.env as Record<string, string | undefined>
): { salt: string | null; source: OrganisationSaltSource } {
  const explicit = typeof env.COMMUNITY_ORG_SALT === "string" ? env.COMMUNITY_ORG_SALT.trim() : "";
  if (explicit.length >= 16) return { salt: explicit, source: "COMMUNITY_ORG_SALT" };

  const worker = typeof env.WORKER_SECRET === "string" ? env.WORKER_SECRET.trim() : "";
  if (worker.length >= 16) {
    const derived = Buffer.from(hkdfSync("sha256", worker, "", ORG_SALT_HKDF_INFO, 32)).toString("hex");
    return { salt: derived, source: "derived-from-WORKER_SECRET" };
  }

  return { salt: null, source: null };
}
