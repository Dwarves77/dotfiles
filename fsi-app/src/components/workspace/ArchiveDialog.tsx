"use client";

// ArchiveDialog — the scope choice for the dual-scope archive (migration 235).
//
// Operator ruling: "archiving should be an option for group or individual."
// So archiving is never a single unlabelled button. The dialog makes the scope
// an explicit choice between:
//
//   JUST ME  — user_item_state via /api/workspace/personal-state. Ungated:
//              no role, no required reason, no notifications. Hides the item
//              for this user only. This is the DEFAULT, because the narrower
//              scope is the safer thing to do by accident.
//   MY TEAM  — workspace_item_overrides via /api/workspace/overrides. Team-wide,
//              so it carries the approved protection layers: admin/owner role
//              gate, required reason, attribution, watcher/owner notification
//              fan-out, and an ungated one-click restore for any member.
//
// Before the team option can be submitted the dialog shows what the archive
// will actually do — watchers by name, the assigned owner, CRITICAL status —
// read live from /api/workspace/archive-impact. A warning that guesses trains
// people to ignore warnings.
//
// The role check shown here is ADVISORY. Enforcement is the server-side gate in
// /api/workspace/overrides; if the two ever disagree, the server wins and its
// message is what this dialog displays.
//
// Light-first, semantic tokens only, no emojis.

import { useCallback, useEffect, useState } from "react";
import { X, Users, User, AlertTriangle, Eye, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useResourceStore } from "@/stores/resourceStore";

export interface ArchiveImpact {
  itemId: string;
  title: string | null;
  priority: string | null;
  isCritical: boolean;
  role: string | null;
  canArchiveWorkspace: boolean;
  watcherCount: number;
  watcherNames: string[];
  /** The item sits on the workspace watchlist (org_watchlist), surfaced to
   *  every member. Distinct from watcherCount, which counts personal watches. */
  onTeamWatchlist: boolean;
  ownerName: string | null;
  alreadyWorkspaceArchived: boolean;
  alreadyPersonallyArchived: boolean;
}

interface ArchiveDialogProps {
  itemId: string;
  title: string;
  onClose: () => void;
  onArchived?: (scope: "personal" | "workspace") => void;
}

type Scope = "personal" | "workspace";

const REASONS = [
  { value: "superseded", label: "Superseded by a newer instrument" },
  { value: "not_applicable", label: "Not applicable to us" },
  { value: "expired", label: "Expired or repealed" },
  { value: "duplicate", label: "Duplicate of another item" },
  { value: "resolved", label: "Handled — no further action" },
  { value: "other", label: "Other" },
] as const;

export function ArchiveDialog({
  itemId,
  title,
  onClose,
  onArchived,
}: ArchiveDialogProps) {
  const archiveResource = useResourceStore((s) => s.archiveResource);
  const archivePersonal = useResourceStore((s) => s.archivePersonal);

  const [scope, setScope] = useState<Scope>("personal");
  const [reason, setReason] = useState<string>("superseded");
  const [note, setNote] = useState("");
  const [impact, setImpact] = useState<ArchiveImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/workspace/archive-impact?itemId=${encodeURIComponent(itemId)}`,
          { headers: { Authorization: `Bearer ${session?.access_token || ""}` } }
        );
        if (cancelled) return;
        if (!res.ok) {
          setImpactError(
            "Could not load who this affects. The team option stays available; the server re-checks permissions on save."
          );
          return;
        }
        setImpact((await res.json()) as ArchiveImpact);
      } catch {
        if (!cancelled) {
          setImpactError(
            "Could not load who this affects. The team option stays available; the server re-checks permissions on save."
          );
        }
      } finally {
        if (!cancelled) setLoadingImpact(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Advisory only — a false here disables the radio with a reason, it does not
  // secure anything. The 403 from the write path is the real gate.
  const canTeam = impact ? impact.canArchiveWorkspace : true;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);
      setSubmitting(true);

      const failure =
        scope === "workspace"
          ? await archiveResource(itemId, reason, note.trim())
          : await archivePersonal(itemId, note.trim());

      if (failure) {
        setError(failure);
        setSubmitting(false);
        return;
      }
      onArchived?.(scope);
      onClose();
    },
    [
      submitting,
      scope,
      archiveResource,
      archivePersonal,
      itemId,
      reason,
      note,
      onArchived,
      onClose,
    ]
  );

  const showsImpact =
    scope === "workspace" &&
    impact !== null &&
    (impact.watcherCount > 0 ||
      impact.onTeamWatchlist ||
      !!impact.ownerName ||
      impact.isCritical);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(0_0_0_/_0.4)] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <h2
              id="archive-dialog-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              Archive this item
            </h2>
            <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label="Close dialog"
            disabled={submitting}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 px-5 py-4 text-sm text-[var(--color-text-primary)]"
        >
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-[var(--color-text-secondary)]">
              Who should this be archived for?
            </legend>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${
                scope === "personal"
                  ? "border-[var(--color-primary)] bg-[color:rgb(0_0_0_/_0.02)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <input
                type="radio"
                name="archive-scope"
                value="personal"
                checked={scope === "personal"}
                onChange={() => setScope("personal")}
                className="mt-0.5"
                disabled={submitting}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  Just me
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">
                  Hides it from your views only. Your teammates are not affected
                  and are not notified. You can undo this at any time.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
                !canTeam
                  ? "cursor-not-allowed opacity-60 border-[var(--color-border)]"
                  : scope === "workspace"
                    ? "cursor-pointer border-[var(--color-primary)] bg-[color:rgb(0_0_0_/_0.02)]"
                    : "cursor-pointer border-[var(--color-border)]"
              }`}
            >
              <input
                type="radio"
                name="archive-scope"
                value="workspace"
                checked={scope === "workspace"}
                onChange={() => setScope("workspace")}
                className="mt-0.5"
                disabled={submitting || !canTeam}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  My whole team
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">
                  {canTeam
                    ? "Hides it for everyone in your workspace. Watchers and the assigned owner are notified, and any member can restore it."
                    : "Only an admin or owner can archive for the whole team. You can still archive it just for yourself."}
                </span>
              </span>
            </label>
          </fieldset>

          {loadingImpact && scope === "workspace" && (
            <p className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Checking who this affects…
            </p>
          )}

          {impactError && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              {impactError}
            </p>
          )}

          {showsImpact && impact && (
            <div
              role="status"
              className="space-y-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2.5 text-xs"
            >
              <p className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                What this will do
              </p>
              {impact.isCritical && (
                <p className="text-[var(--color-text-primary)]">
                  This item is marked <strong>CRITICAL</strong>. Archiving
                  removes it from everyone&apos;s active views.
                </p>
              )}
              {impact.ownerName && (
                <p className="text-[var(--color-text-secondary)]">
                  Assigned to <strong>{impact.ownerName}</strong>, who will be
                  notified.
                </p>
              )}
              {impact.watcherCount > 0 && (
                <p className="flex items-start gap-1.5 text-[var(--color-text-secondary)]">
                  <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>
                    {impact.watcherCount === 1
                      ? "1 teammate is watching"
                      : `${impact.watcherCount} teammates are watching`}
                    {impact.watcherNames.length > 0 && (
                      <>
                        {": "}
                        {impact.watcherNames.join(", ")}
                        {impact.watcherCount > impact.watcherNames.length &&
                          ` and ${impact.watcherCount - impact.watcherNames.length} more`}
                      </>
                    )}
                    . They will be notified.
                  </span>
                </p>
              )}
              {impact.onTeamWatchlist && (
                <p className="flex items-start gap-1.5 text-[var(--color-text-secondary)]">
                  <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>
                    This item is on the <strong>workspace watchlist</strong>, so
                    it is surfaced to every member. Archiving removes it from
                    their active views while it stays on the watchlist.
                  </span>
                </p>
              )}
            </div>
          )}

          {scope === "workspace" && (
            <div>
              <label
                htmlFor="archive-reason"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Reason <span className="text-[var(--color-danger,#b91c1c)]">*</span>
              </label>
              <select
                id="archive-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                Everyone who is notified sees this reason.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="archive-note"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Note (optional)
            </label>
            <textarea
              id="archive-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              placeholder={
                scope === "workspace"
                  ? "Anything the team should know."
                  : "Just for your own reference."
              }
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-[var(--color-danger,#fca5a5)] bg-[color:rgb(239_68_68_/_0.08)] px-3 py-2 text-xs text-[var(--color-danger,#b91c1c)]"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-primary,white)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
              disabled={submitting}
            >
              {submitting
                ? "Archiving…"
                : scope === "workspace"
                  ? "Archive for the team"
                  : "Archive for me"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
