"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ToggleSwitch } from "@/components/account/AccountPrimitives";
import { Check } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// NotificationPreferences
// Reusable component for /onboarding step 4 and /settings#notifications.
// Reads + writes the `notification_preferences` row for the current user.
//
// Schema (migration 032):
//   user_id PK, enabled, on_mention, on_reply_in_my_threads,
//   on_new_post_in_joined_groups, on_invite, on_promote,
//   channels[], updated_at
//
// Defaults at signup (Phase C lock spec):
//   enabled=true, on_mention=true, on_reply_in_my_threads=true,
//   on_new_post_in_joined_groups=false, on_invite=true, on_promote=true,
//   channels=['in_app']
//
// Locked toggle: on_invite is intentionally not toggleable. It's required for
// the invitation flow (you have to be reachable to be invited) and is shown as
// a non-interactive locked-on row with a tooltip.
// ───────────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  enabled: boolean;
  on_mention: boolean;
  on_reply_in_my_threads: boolean;
  on_new_post_in_joined_groups: boolean;
  on_invite: boolean;
  on_promote: boolean;
  channels: string[];
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  on_mention: true,
  on_reply_in_my_threads: true,
  on_new_post_in_joined_groups: false,
  on_invite: true,
  on_promote: true,
  channels: ["in_app"],
};

interface Props {
  userId: string;
  /**
   * If true (onboarding step 4), the component renders in a denser layout
   * suited for the wizard. Defaults to false (full settings card layout).
   */
  compact?: boolean;
  /**
   * Optional callback fired after a successful save, e.g. to advance the
   * onboarding wizard or surface a toast.
   */
  onSaved?: (prefs: NotificationPrefs) => void;
}

type RowKey = keyof Pick<
  NotificationPrefs,
  | "enabled"
  | "on_mention"
  | "on_reply_in_my_threads"
  | "on_new_post_in_joined_groups"
  | "on_promote"
>;

const ROWS: Array<{
  key: RowKey;
  label: string;
  description: string;
}> = [
  {
    key: "enabled",
    label: "Notifications enabled",
    description:
      "Master switch. Turn this off and we won't send you anything except invites you've accepted.",
  },
  {
    key: "on_mention",
    label: "Someone @mentions you",
    description:
      "Direct mentions in any thread or group you can see. We recommend keeping this on.",
  },
  {
    key: "on_reply_in_my_threads",
    label: "Replies in your threads",
    description: "When someone replies to a post you started.",
  },
  {
    key: "on_new_post_in_joined_groups",
    label: "New posts in groups you've joined",
    description:
      "Higher volume. Off by default — opt in if you want every new post in your groups.",
  },
  {
    key: "on_promote",
    label: "When a post gets promoted",
    description:
      "Editorial promoted your post to a wider feed, or a verifier signed off on a disputed entry.",
  },
];

export function NotificationPreferences({ userId, onSaved }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current row (or fall back to defaults if no row exists yet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select(
          "enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // Row missing is fine — we'll persist defaults on first toggle. Any
        // other error is surfaced.
        if (error.code !== "PGRST116") setError(error.message);
      }

      if (data) {
        setPrefs({
          enabled: data.enabled ?? true,
          on_mention: data.on_mention ?? true,
          on_reply_in_my_threads: data.on_reply_in_my_threads ?? true,
          on_new_post_in_joined_groups: data.on_new_post_in_joined_groups ?? false,
          on_invite: data.on_invite ?? true,
          on_promote: data.on_promote ?? true,
          channels: data.channels ?? ["in_app"],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  const persist = async (next: NotificationPrefs) => {
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          enabled: next.enabled,
          on_mention: next.on_mention,
          on_reply_in_my_threads: next.on_reply_in_my_threads,
          on_new_post_in_joined_groups: next.on_new_post_in_joined_groups,
          on_invite: next.on_invite,
          on_promote: next.on_promote,
          channels: next.channels,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      setError(error.message);
      setSaving(false);
      return false;
    }

    setSaving(false);
    setSaved(true);
    onSaved?.(next);
    return true;
  };

  const toggle = async (key: RowKey, nextValue: boolean) => {
    const next = { ...prefs, [key]: nextValue };
    setPrefs(next);
    await persist(next);
  };

  if (loading) {
    return (
      <div
        className="text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        Loading notification preferences…
      </div>
    );
  }

  return (
    <div>
      {ROWS.map((row) => (
        <NotifRow
          key={row.key}
          label={row.label}
          description={row.description}
          on={prefs[row.key]}
          onFlip={() => toggle(row.key, !prefs[row.key])}
        />
      ))}

      {/* Locked: on_invite. Always on — you must be reachable when invited. */}
      <NotifRow
        label="Workspace invitations"
        lockedSuffix="always on"
        description="Always on — you must be reachable when someone adds you to a group or workspace."
        on
        locked
        onFlip={() => {}}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 0" }}>
        {saving && <span style={{ fontSize: "10.5px", color: "var(--color-text-muted)" }}>Saving…</span>}
        {!saving && saved && (
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-success)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Check size={12} /> Saved
          </span>
        )}
        {error && <span style={{ fontSize: "10.5px", color: "var(--color-error)" }}>Couldn&apos;t save: {error}</span>}
        <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "var(--color-text-muted)" }}>Channel: in-app</span>
      </div>
    </div>
  );
}

function NotifRow({
  label,
  description,
  on,
  onFlip,
  locked = false,
  lockedSuffix,
}: {
  label: string;
  description: string;
  on: boolean;
  onFlip: () => void;
  locked?: boolean;
  lockedSuffix?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 14,
        padding: "11px 0",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "12.5px", fontWeight: 800, margin: 0, color: "var(--color-text-primary)" }}>
          {label}
          {lockedSuffix && (
            <span style={{ fontWeight: 700, color: "var(--color-text-muted)" }}> · {lockedSuffix}</span>
          )}
        </p>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>{description}</p>
      </div>
      <ToggleSwitch on={on} onFlip={onFlip} locked={locked} label={label} />
    </div>
  );
}
