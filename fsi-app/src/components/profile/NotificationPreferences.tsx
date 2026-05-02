"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Toggle } from "@/components/ui/Toggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { Bell, Lock, Check } from "lucide-react";

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

export function NotificationPreferences({ userId, compact = false, onSaved }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
    setSavedAt(Date.now());
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
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          You can change these any time from Settings.
        </p>
      )}

      <div
        className="rounded-lg border divide-y"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          // Tailwind divide colors are inconsistent with our token system on
          // some themes — use border on rows directly inside.
        }}
      >
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-4 px-4 py-3"
            style={{
              borderTop: "1px solid var(--color-border-subtle)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {row.label}
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {row.description}
              </p>
            </div>
            <div className="shrink-0 pt-0.5">
              <Toggle
                checked={prefs[row.key]}
                onChange={(v) => toggle(row.key, v)}
              />
            </div>
          </div>
        ))}

        {/* Locked: on_invite. Not toggleable. */}
        <LockedInviteRow />
      </div>

      <div className="flex items-center gap-3 text-xs">
        {saving && (
          <span style={{ color: "var(--color-text-muted)" }}>Saving…</span>
        )}
        {!saving && savedAt && (
          <span
            className="flex items-center gap-1"
            style={{ color: "var(--color-success)" }}
          >
            <Check size={12} /> Saved
          </span>
        )}
        {error && (
          <span style={{ color: "var(--color-error)" }}>
            Couldn&apos;t save: {error}
          </span>
        )}
        <span className="ml-auto" style={{ color: "var(--color-text-muted)" }}>
          <Bell size={12} className="inline-block mr-1" />
          Channel: in-app
        </span>
      </div>
    </div>
  );
}

function LockedInviteRow() {
  return (
    <div
      className="flex items-start justify-between gap-4 px-4 py-3"
      style={{ borderTop: "1px solid var(--color-border-subtle)" }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium flex items-center gap-1.5"
          style={{ color: "var(--color-text-primary)" }}
        >
          Workspace invitations
          <Tooltip content="Required for invitation flow. Without this, others can't add you to private groups.">
            <span
              className="inline-flex items-center justify-center"
              aria-label="Required for invitation flow"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Lock size={11} />
            </span>
          </Tooltip>
        </div>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Always on. We need to be able to tell you when someone adds you to a
          group or workspace.
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        {/* Locked toggle — visually "on" and disabled */}
        <button
          type="button"
          role="switch"
          aria-checked="true"
          aria-disabled="true"
          disabled
          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border cursor-not-allowed opacity-80"
          style={{
            borderColor: "var(--color-primary)",
            backgroundColor: "rgba(0,0,0,0)",
          }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{
              transform: "translateX(18px)",
              backgroundColor: "var(--color-primary)",
            }}
          />
        </button>
      </div>
    </div>
  );
}
