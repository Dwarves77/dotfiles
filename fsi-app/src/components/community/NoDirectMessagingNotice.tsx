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
