/**
 * NoDirectMessagingNotice — the one-line statement spec 05 §5 component 8 / acceptance 5 requires
 * wherever a reader would look for direct messaging ("no direct messaging anywhere... where a
 * reader would look for DM, a one-line statement that peer contact happens in threads, not DMs").
 *
 * Placed in GroupModals.tsx's MembersModal (the "Members" button's member list — the single most
 * likely place someone looks to message a peer directly) and in CouncilMembersRail.tsx (the group
 * page's members rail). Pure presentational, no data dependency.
 */

import { MessageCircleOff } from "lucide-react";

export function NoDirectMessagingNotice() {
  return (
    <p
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        margin: 0,
        fontSize: 11,
        lineHeight: 1.5,
        color: "var(--color-text-muted)",
      }}
    >
      <MessageCircleOff size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        No direct messaging on Caro&rsquo;s Ledge. Peer contact happens in threads, in the open,
        never one-to-one.
      </span>
    </p>
  );
}
