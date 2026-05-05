"use client";

/**
 * ModerationActions — action buttons for a single moderation report,
 * rendered inside ModerationQueue.
 *
 * Each button posts to /api/community/moderation/reports/[id]. The
 * three destructive actions (remove_post, mute_user, ban_user) prompt
 * for confirmation. mute_user and ban_user surface a Phase D notice in
 * the confirm dialog where the schema does not yet support the action.
 *
 * Light-first design — neutral row, action-coloured borders.
 */

import { useState } from "react";
import {
  Check,
  Trash2,
  AlertTriangle,
  VolumeX,
  UserMinus,
  X,
} from "lucide-react";

export type ModerationAction =
  | "dismiss"
  | "remove_post"
  | "warn_user"
  | "mute_user"
  | "ban_user";

interface ModerationActionsProps {
  reportId: string;
  /** When the action completes successfully — parent should refresh
   *  the queue or remove the row optimistically. The callback receives
   *  the action that ran (which may differ from a Phase D fallback). */
  onResolved: (action: ModerationAction, phaseDStub: boolean) => void;
  onToast?: (message: string, variant?: "success" | "error") => void;
  /** Hide the destructive ban_user button when the reviewer is not a
   *  group admin — moderators can warn/dismiss/remove but not ban. */
  canBan?: boolean;
}

interface ConfirmState {
  action: Exclude<ModerationAction, "dismiss" | "warn_user">;
  phaseD: boolean;
  copy: string;
}

const PHASE_D_NOTE_MUTE =
  "Mute is not yet wired to a schema field; the action will fall back " +
  "to a warning notification. Migration coming in Phase D.";

export function ModerationActions({
  reportId,
  onResolved,
  onToast,
  canBan = true,
}: ModerationActionsProps) {
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notes, setNotes] = useState("");

  const run = async (action: ModerationAction) => {
    setBusy(action);
    try {
      const res = await fetch(
        `/api/community/moderation/reports/${reportId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            notes: notes.trim() || undefined,
          }),
        }
      );
      const j = await safeJson(res);
      if (!res.ok) {
        const msg = j?.error || `Action failed (${res.status})`;
        onToast?.(msg, "error");
        return;
      }
      const phaseD = Boolean(j?.phase_d_stub);
      const taken = (j?.action_taken as ModerationAction) || action;
      const errs = Array.isArray(j?.side_effect_errors)
        ? j.side_effect_errors
        : [];
      if (errs.length > 0) {
        onToast?.(
          `${labelFor(taken)} recorded with warnings: ${errs.join("; ")}`,
          "error"
        );
      } else if (phaseD) {
        onToast?.(`${labelFor(taken)} recorded (Phase D fallback applied)`);
      } else {
        onToast?.(`${labelFor(taken)} recorded`);
      }
      onResolved(taken, phaseD);
      setConfirm(null);
      setNotes("");
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Network error",
        "error"
      );
    } finally {
      setBusy(null);
    }
  };

  const promptConfirm = (
    action: Exclude<ModerationAction, "dismiss" | "warn_user">
  ) => {
    if (action === "remove_post") {
      setConfirm({
        action,
        phaseD: false,
        copy:
          "Remove the reported post? This cannot be undone — the post will be deleted from the group.",
      });
    } else if (action === "mute_user") {
      setConfirm({ action, phaseD: true, copy: PHASE_D_NOTE_MUTE });
    } else if (action === "ban_user") {
      setConfirm({
        action,
        phaseD: false,
        copy:
          "Ban the post author from this group? They will be removed from the member list and can only rejoin via a new invitation.",
      });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        <ActionButton
          label="Dismiss"
          icon={<Check size={12} />}
          onClick={() => run("dismiss")}
          disabled={busy !== null}
          loading={busy === "dismiss"}
          tone="neutral"
        />
        <ActionButton
          label="Warn author"
          icon={<AlertTriangle size={12} />}
          onClick={() => run("warn_user")}
          disabled={busy !== null}
          loading={busy === "warn_user"}
          tone="warn"
        />
        <ActionButton
          label="Remove post"
          icon={<Trash2 size={12} />}
          onClick={() => promptConfirm("remove_post")}
          disabled={busy !== null}
          loading={busy === "remove_post"}
          tone="destructive"
        />
        <ActionButton
          label="Mute author"
          icon={<VolumeX size={12} />}
          onClick={() => promptConfirm("mute_user")}
          disabled={busy !== null}
          loading={busy === "mute_user"}
          tone="warn"
        />
        {canBan && (
          <ActionButton
            label="Ban from group"
            icon={<UserMinus size={12} />}
            onClick={() => promptConfirm("ban_user")}
            disabled={busy !== null}
            loading={busy === "ban_user"}
            tone="destructive"
          />
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional reviewer notes (recorded with the decision)."
        rows={2}
        maxLength={1000}
        style={{
          width: "100%",
          fontSize: 12,
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-base)",
          color: "var(--color-text-primary)",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Confirm ${labelFor(confirm.action)}`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.32)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && busy === null) setConfirm(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              boxShadow: "0 12px 40px rgba(15, 23, 42, 0.18)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--color-text-primary)",
                }}
              >
                {confirm.phaseD ? "Phase D fallback" : "Confirm action"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setConfirm(null)}
                disabled={busy !== null}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  cursor: busy ? "wait" : "pointer",
                  padding: 4,
                  display: "inline-flex",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                margin: 0,
                color: "var(--color-text-secondary)",
              }}
            >
              {confirm.copy}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={busy !== null}
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                  borderRadius: 4,
                  padding: "8px 14px",
                  fontSize: 12,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => run(confirm.action)}
                disabled={busy !== null}
                style={{
                  background:
                    confirm.action === "remove_post" ||
                    confirm.action === "ban_user"
                      ? "var(--color-error, #b91c1c)"
                      : "var(--color-text-primary)",
                  color: "var(--color-bg-base)",
                  border: "1px solid transparent",
                  borderRadius: 4,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy !== null ? 0.6 : 1,
                }}
              >
                {busy ? "Working…" : `Yes, ${labelFor(confirm.action)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────────

function labelFor(action: ModerationAction): string {
  switch (action) {
    case "dismiss":
      return "Dismiss";
    case "remove_post":
      return "Remove post";
    case "warn_user":
      return "Warn author";
    case "mute_user":
      return "Mute author";
    case "ban_user":
      return "Ban from group";
  }
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone: "neutral" | "warn" | "destructive";
}) {
  const palette =
    tone === "destructive"
      ? {
          color: "var(--color-error, #b91c1c)",
          border: "var(--color-error-border, #fecaca)",
          bgHover: "var(--color-error-bg, #fef2f2)",
        }
      : tone === "warn"
      ? {
          color: "var(--color-warning, #b45309)",
          border: "var(--color-high-border, #fed7aa)",
          bgHover: "var(--color-high-bg, #fff7ed)",
        }
      : {
          color: "var(--color-text-secondary)",
          border: "var(--color-border)",
          bgHover: "var(--color-bg-base)",
        };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        padding: "5px 9px",
        background: "transparent",
        border: `1px solid ${palette.border}`,
        color: palette.color,
        borderRadius: 4,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon}
      {loading ? "…" : label}
    </button>
  );
}

async function safeJson(res: Response): Promise<{
  error?: string;
  phase_d_stub?: boolean;
  action_taken?: string;
  side_effect_errors?: string[];
} | null> {
  try {
    return (await res.json()) as {
      error?: string;
      phase_d_stub?: boolean;
      action_taken?: string;
      side_effect_errors?: string[];
    };
  } catch {
    return null;
  }
}
