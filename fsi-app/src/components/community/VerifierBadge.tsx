/**
 * VerifierBadge — small star/checkmark badge for verified members.
 *
 * Phase D additive. Pure presentational.
 *
 * Data source (real, schema-backed):
 *   user_profiles.verifier_status (Migration 027), values:
 *     'none' | 'pending' | 'active' | 'revoked'
 *   The badge surfaces ONLY for status === 'active'.
 *
 * Wiring status:
 *   The /api/community/posts endpoint (route.ts) currently denormalises
 *   author as { user_id, name, headshot_url } without verifier_status.
 *   Surfacing the badge through the live feed therefore requires a
 *   one-line widening of the SELECT inside the posts API (out of file
 *   scope for this PR).
 *
 *   To keep this PR strictly additive (no API changes), the badge
 *   component accepts an explicit `verifierStatus` prop. Post.tsx
 *   passes it through; while the API does not yet supply the field,
 *   the prop is undefined and the badge does not render. When the
 *   API is widened in a follow-up, the badge lights up automatically
 *   for active verifiers — no further UI change needed.
 *
 * Visual idiom:
 *   - 11px label, 0.06em tracking, uppercase
 *   - Cyan tone matched to design system (--color-cyan), with sage
 *     fallback for tokens not present in the active theme
 *   - Single icon + word, sits inline with the author name in Post header
 */

import { ShieldCheck } from "lucide-react";

interface VerifierBadgeProps {
  /**
   * Mirrors the underlying user_profiles.verifier_status text column.
   * Badge renders only when this is 'active'. All other values
   * (including 'pending', 'revoked', 'none', undefined) render null.
   */
  verifierStatus?: "none" | "pending" | "active" | "revoked" | null;
}

export function VerifierBadge({ verifierStatus }: VerifierBadgeProps) {
  if (verifierStatus !== "active") return null;

  return (
    <span
      aria-label="Verified contributor"
      title="Verified contributor"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-cyan, var(--color-text-secondary))",
        border: "1px solid var(--color-cyan, var(--color-border))",
        borderRadius: 3,
        flexShrink: 0,
      }}
    >
      <ShieldCheck size={10} aria-hidden="true" />
      Verified
    </span>
  );
}
