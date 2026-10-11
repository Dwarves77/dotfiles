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
