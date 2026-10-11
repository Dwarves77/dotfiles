import { ShieldCheck } from "lucide-react";
import { authorIdentityLabel } from "./identity-format";
import type { CommunityAuthorIdentity } from "./types";

interface AuthorIdentityChipProps {
  identity: CommunityAuthorIdentity | null | undefined;
}

export function AuthorIdentityChip({ identity }: AuthorIdentityChipProps) {
  // SEC-5 (migration 372): an anonymous author is labelled "Anonymous member" and keeps the Verified marker; the
  // label is never blank, so the marker always has a line beside it.
  const line = authorIdentityLabel(identity);
  if (!line) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--color-text-secondary)",
        flexWrap: "wrap",
        minWidth: 0,
      }}
    >
      <span style={{ overflowWrap: "anywhere" }}>{line}</span>
      {identity?.verified && (
        <span
          aria-label="Verified member"
          title="Verified — corroborated corporate identity"
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
      )}
    </span>
  );
}
