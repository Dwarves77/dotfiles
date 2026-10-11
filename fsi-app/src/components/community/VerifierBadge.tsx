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
