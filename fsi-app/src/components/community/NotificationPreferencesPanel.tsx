"use client";

/**
 * NotificationPreferencesPanel — settings UI for notification toggles.
 *
 * Surfaces:
 *   1. Master "Notifications enabled" toggle.
 *   2. Per-kind grid (mention / reply / invite / promote / moderation)
 *      × per-channel columns (in_app / email / push). Email and push are
 *      flagged "coming soon" per Phase C scope (in-app only ships now).
 *
 * Soft-enforced rules surfaced inline:
 *   - on_invite cannot be truly disabled — the worker delivers invite
 *     notifications regardless. Toggle is shown read-only with a note.
 *
 * Wires to:
 *   GET  /api/community/notifications/preferences
 *   PUT  /api/community/notifications/preferences
 *
 * Light-first, no emojis.
 */

import { useEffect, useState, useCallback } from "react";
import { Loader2, Check } from "lucide-react";

const PATH = "/api/community/notifications/preferences";

type NotificationKind =
  | "mention"
  | "reply"
  | "invite"
  | "promote"
  | "moderation";

type Channel = "in_app" | "email" | "push";

interface PreferencesShape {
  enabled: boolean;
  kinds: Record<NotificationKind, boolean>;
  channels: Record<Channel, boolean>;
}

interface PrefsResponse {
  preferences: PreferencesShape;
  channel_status: Record<Channel, "live" | "coming_soon">;
}

const KINDS: Array<{ key: NotificationKind; label: string; desc: string }> = [
  {
    key: "mention",
    label: "Mentions",
    desc: "Someone @-mentions you in a post or reply.",
  },
  {
    key: "reply",
    label: "Replies in your threads",
    desc: "A reply lands in a thread you started or participated in.",
  },
  {
    key: "invite",
    label: "Group invitations",
    desc: "You receive an invitation to join a private group.",
  },
  {
    key: "promote",
    label: "Role changes",
    desc: "You're promoted or demoted in a group you belong to.",
  },
  {
    key: "moderation",
    label: "Moderation actions",
    desc: "A moderation report you filed or a post you authored is acted on.",
  },
];

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: "in_app", label: "In app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
];

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<PreferencesShape | null>(null);
  const [channelStatus, setChannelStatus] = useState<
    Record<Channel, "live" | "coming_soon">
  >({ in_app: "live", email: "coming_soon", push: "coming_soon" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(PATH, { cache: "no-store" });
        const json: PrefsResponse = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as unknown as { error?: string })?.error ||
              `HTTP ${res.status}`
          );
        }
        if (cancelled) return;
        setPrefs(json.preferences);
        setChannelStatus(json.channel_status);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: PreferencesShape) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(PATH, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: {
              enabled: next.enabled,
              kinds: next.kinds,
              channels: next.channels,
            },
          }),
        });
        const json: PrefsResponse = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as unknown as { error?: string })?.error ||
              `HTTP ${res.status}`
          );
        }
        setPrefs(json.preferences);
        setChannelStatus(json.channel_status);
        setSavedAt(Date.now());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  function setEnabled(v: boolean) {
    if (!prefs) return;
    const next: PreferencesShape = { ...prefs, enabled: v };
    setPrefs(next);
    void persist(next);
  }

  function setKind(kind: NotificationKind, v: boolean) {
    if (!prefs) return;
    // on_invite is soft-enforced: the worker ignores this for invites.
    // We let the user toggle it visually but warn inline.
    const next: PreferencesShape = {
      ...prefs,
      kinds: { ...prefs.kinds, [kind]: v },
    };
    setPrefs(next);
    void persist(next);
  }

  function setChannel(channel: Channel, v: boolean) {
    if (!prefs) return;
    if (channelStatus[channel] !== "live") return; // coming-soon: no-op
    const next: PreferencesShape = {
      ...prefs,
      channels: { ...prefs.channels, [channel]: v },
    };
    setPrefs(next);
    void persist(next);
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 16,
          color: "var(--color-text-muted)",
          fontSize: 12,
        }}
      >
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Loading preferences…
      </div>
    );
  }

  if (!prefs) {
    return (
      <div
        role="alert"
        style={{
          padding: 16,
          fontSize: 12,
          color: "var(--color-error, #c0392b)",
        }}
      >
        {error ?? "Could not load preferences."}
      </div>
    );
  }

  return (
    <section
      aria-label="Notification preferences"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Notification preferences
          </h3>
          <p
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
            }}
          >
            Control which community events generate notifications and how
            they reach you.
          </p>
        </div>
        <SaveStatus saving={saving} savedAt={savedAt} error={error} />
      </div>

      {/* Master toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Notifications enabled
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            When off, you receive no notifications other than mandatory
            invitations.
          </div>
        </div>
        <Toggle
          checked={prefs.enabled}
          onChange={setEnabled}
          label="Notifications enabled"
        />
      </div>

      {/* Channels */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-secondary)",
            marginBottom: 8,
          }}
        >
          Delivery channels
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 8,
          }}
        >
          {CHANNELS.map((ch) => {
            const live = channelStatus[ch.key] === "live";
            const checked = !!prefs.channels[ch.key];
            return (
              <div
                key={ch.key}
                style={{
                  padding: "10px 12px",
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  opacity: live ? 1 : 0.7,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {ch.label}
                  </span>
                  <Toggle
                    checked={checked}
                    onChange={(v) => setChannel(ch.key, v)}
                    label={`${ch.label} channel`}
                    disabled={!live}
                  />
                </div>
                {!live && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Coming soon
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Kinds grid */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-secondary)",
            marginBottom: 8,
          }}
        >
          Notification types
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {KINDS.map((k) => {
            const checked = !!prefs.kinds[k.key];
            const isInvite = k.key === "invite";
            return (
              <div
                key={k.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {k.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {k.desc}
                  </div>
                  {isInvite && (
                    <div
                      style={{
                        fontSize: 10,
                        marginTop: 4,
                        color: "var(--color-text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      Note: invitations are always delivered regardless of
                      this toggle.
                    </div>
                  )}
                </div>
                <Toggle
                  checked={checked}
                  onChange={(v) => setKind(k.key, v)}
                  label={k.label}
                  disabled={!prefs.enabled}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Building blocks ────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: checked
          ? "var(--color-primary)"
          : "var(--color-bg-surface)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        transition: "background 120ms ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 1,
          left: checked ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left 120ms ease",
        }}
      />
    </button>
  );
}

function SaveStatus({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  if (saving) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--color-text-muted)",
        }}
      >
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (error) {
    return (
      <span
        role="alert"
        style={{
          fontSize: 11,
          color: "var(--color-error, #c0392b)",
        }}
      >
        {error}
      </span>
    );
  }
  if (savedAt && Date.now() - savedAt < 4000) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--color-success, #2c8a4a)",
        }}
      >
        <Check size={12} aria-hidden="true" />
        Saved
      </span>
    );
  }
  return null;
}
