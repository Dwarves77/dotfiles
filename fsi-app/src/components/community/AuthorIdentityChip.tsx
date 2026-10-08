/**
 * AuthorIdentityChip, the author-identity line (spec 05 section 2, section 5 components 1/11; amended by R8.7,
 * 2026-09-25, migration 336).
 *
 * "A room can and should know who you are when you're talking, unless you choose to be anonymous"
 * (operator, R8.7). Renders name + company (when present), org type, role, sector, region, and a
 * verification mark, via formatAuthorIdentity, identity.mjs's projectAuthorIdentity is the ONE place
 * that decides whether name/company are present at all (withheld only when the post or the author
 * opted into anonymity; the verified mark is never withheld by anonymity). This is the replacement
 * for the legacy raw author name in any surface that shows a post from the entity-bound,
 * guard-enforced posting flow; Post.tsx renders this INSTEAD OF the legacy author name when the post
 * carries an identity projection (see Post.tsx's header for the fallback rule when it does not).
 *
 * Pure presentational, no data dependency.
 */

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
