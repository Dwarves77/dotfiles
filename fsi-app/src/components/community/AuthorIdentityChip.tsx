/**
 * AuthorIdentityChip — the pseudonymous author-identity line (spec 05 §2, §5 components 1/11).
 *
 * "The platform knows exactly who you are. The room does not." Renders org type + role + sector +
 * region, plus a verification mark — and structurally CANNOT render a name or company, because its
 * prop type (CommunityAuthorIdentity) carries none. This is the deliberate replacement for a real
 * name in any surface that shows a post from the entity-bound, guard-enforced posting flow;
 * Post.tsx renders this INSTEAD OF the legacy author name when the post carries an identity
 * projection (see Post.tsx's header for the fallback rule when it does not).
 *
 * Pure presentational, no data dependency.
 */

import { ShieldCheck } from "lucide-react";
import { formatAuthorIdentity } from "./identity-format";
import type { CommunityAuthorIdentity } from "./types";

interface AuthorIdentityChipProps {
  identity: CommunityAuthorIdentity | null | undefined;
}

export function AuthorIdentityChip({ identity }: AuthorIdentityChipProps) {
  const line = formatAuthorIdentity(identity);
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
