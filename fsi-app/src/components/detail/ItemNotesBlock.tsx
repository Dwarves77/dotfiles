"use client";

/**
 * ItemNotesBlock: private-per-workspace notes at the foot of every detail page (lane S8-A, 2026-10-07; plan
 * Stage 8 bullet 1; migration 358, /api/workspace/items/[id]/notes). Mounted ONCE, by DetailShell's item
 * collaboration slot, so the four detail surfaces pass nothing new (PI-1: no new surface).
 *
 * A note is workspace commentary: visible to the caller's own workspace, never to another organisation, never
 * analysed, never read by any other page or by the flywheel (ADR-042, ADR-043).
 *
 * UX contract (docs/design/ux-laws.md):
 *   - Goal: leave the team a note about this item. Path: type, then "Add note" (the one primary action). The
 *     composer sits ABOVE the list so adding never needs a scroll past a long thread.
 *   - Every async action acknowledges at once (button label changes and disables) and ends on a stated result
 *     ("Note added.", "Note saved.", "Note deleted."); a failure keeps the typed text and says how to fix it.
 *   - Delete warns first with a two-step inline confirm; it is offered on your own notes and, to a workspace
 *     owner or admin, on every note (the server says which, per note, in `can_delete`).
 *   - Edit is offered on your own notes only. Every control is a 44 px target.
 */

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/ActionRow";
import { formatRelativeCompact } from "@/lib/relative-time";
import { formatNumber } from "@/lib/format";
import { NOTE_MAX_LENGTH } from "@/lib/workspace/item-collab-shared.mjs";
import { captionStyle, collabPath, collabRequest, fieldStyle, wrapText } from "@/components/detail/item-collab-client";

export interface ItemNote {
  id: string;
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  mine: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ListPayload {
  notes: ItemNote[];
  viewer: { role: string; can_write: boolean; can_delete: boolean };
}

export function ItemNotesBlock({ itemId }: { itemId: string }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ItemNote[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // The load runs inside the effect's own async callback and sets state only after the fetch resolves (the phase
  // starts as "loading"), so mounting causes no synchronous state write. Retry bumps `attempt` to run it again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await collabRequest<ListPayload>(collabPath(itemId, "notes"));
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        setPhase("error");
        return;
      }
      setNotes(res.data.notes);
      setCanWrite(res.data.viewer.can_write);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, attempt]);

  async function addNote() {
    const body = draft.trim();
    if (!body || adding) return;
    setAdding(true);
    setAddError(null);
    setFlash(null);
    const res = await collabRequest<{ note: ItemNote }>(collabPath(itemId, "notes"), { method: "POST", body: JSON.stringify({ body }) });
    setAdding(false);
    if (!res.ok) {
      setAddError(res.error);
      return;
    }
    setNotes((prev) => [res.data.note, ...prev]);
    setDraft("");
    setFlash("Note added.");
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body || rowBusy) return;
    setRowBusy(id);
    setRowError(null);
    setFlash(null);
    const res = await collabRequest<{ note: ItemNote }>(collabPath(itemId, "notes"), { method: "PATCH", body: JSON.stringify({ noteId: id, body }) });
    setRowBusy(null);
    if (!res.ok) {
      setRowError({ id, message: res.error });
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === id ? res.data.note : n)));
    setEditingId(null);
    setFlash("Note saved.");
  }

  async function removeNote(id: string) {
    if (rowBusy) return;
    setRowBusy(id);
    setRowError(null);
    setFlash(null);
    const res = await collabRequest<{ success: boolean }>(`${collabPath(itemId, "notes")}?noteId=${encodeURIComponent(id)}`, { method: "DELETE" });
    setRowBusy(null);
    if (!res.ok) {
      setRowError({ id, message: res.error });
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setConfirmId(null);
    setFlash("Note deleted.");
  }

  if (phase === "loading") {
    return <p style={captionStyle}>Loading notes…</p>;
  }
  if (phase === "error") {
    return (
      <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <p style={{ ...captionStyle, color: "var(--immediate)" }}>{loadError ?? "Notes could not be loaded."}</p>
        <ActionButton
          onClick={() => {
            setPhase("loading");
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </ActionButton>
      </div>
    );
  }

  const over = draft.length > NOTE_MAX_LENGTH;

  return (
    <div data-part="item-notes" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {canWrite ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor={`note-draft-${itemId}`} style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink-2)" }}>
            Add a note for your workspace
          </label>
          <textarea
            id={`note-draft-${itemId}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setAddError(null);
            }}
            placeholder="Which lanes or clients this touches, who is on it, what was decided"
            rows={3}
            style={{ ...fieldStyle, resize: "vertical", minHeight: 88 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ActionButton variant="primary" onClick={() => void addNote()} disabled={adding || !draft.trim() || over}>
              {adding ? "Adding…" : "Add note"}
            </ActionButton>
            <span style={{ ...captionStyle, color: over ? "var(--immediate)" : "var(--ink-3)" }}>
              {formatNumber(draft.length)} / {formatNumber(NOTE_MAX_LENGTH)}
            </span>
          </div>
          {addError && (
            <p role="alert" style={{ ...captionStyle, color: "var(--immediate)" }}>
              {addError}
            </p>
          )}
        </div>
      ) : (
        <p style={captionStyle}>Your role in this workspace can read notes but not add them.</p>
      )}

      <p role="status" aria-live="polite" style={captionStyle}>
        {flash}
      </p>

      {notes.length === 0 ? (
        <p style={captionStyle}>No notes on this item yet. Notes are visible to your workspace only, never to other organisations.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {notes.map((n) => {
            const busy = rowBusy === n.id;
            const editing = editingId === n.id;
            const confirming = confirmId === n.id;
            return (
              <li key={n.id} style={{ borderTop: "1px solid var(--line-1)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2 }}>
                  <span data-guard-title style={{ ...wrapText, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink)", flex: "1 1 auto" }}>
                    {n.author_name ?? "Earlier workspace note"}
                  </span>
                  <span style={captionStyle}>
                    {formatRelativeCompact(n.created_at)}
                    {n.edited_at ? " · edited" : ""}
                  </span>
                </div>

                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label htmlFor={`note-edit-${n.id}`} style={{ ...captionStyle, fontWeight: 700 }}>
                      Edit your note
                    </label>
                    <textarea
                      id={`note-edit-${n.id}`}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      style={{ ...fieldStyle, resize: "vertical", minHeight: 88 }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton variant="primary" onClick={() => void saveEdit(n.id)} disabled={busy || !editDraft.trim() || editDraft.length > NOTE_MAX_LENGTH}>
                        {busy ? "Saving…" : "Save"}
                      </ActionButton>
                      <ActionButton
                        onClick={() => {
                          setEditingId(null);
                          setRowError(null);
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <p style={{ ...wrapText, margin: 0, fontSize: "var(--fs-12)", lineHeight: 1.6, color: "var(--ink)", whiteSpace: "pre-wrap" }}>{n.body}</p>
                )}

                {rowError?.id === n.id && (
                  <p role="alert" style={{ ...captionStyle, color: "var(--immediate)" }}>
                    {rowError.message}
                  </p>
                )}

                {!editing && confirming && (
                  <div role="alertdialog" aria-label="Confirm delete" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ ...captionStyle, color: "var(--ink)" }}>Delete this note? It disappears for everyone in your workspace.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton variant="primary" onClick={() => void removeNote(n.id)} disabled={busy}>
                        {busy ? "Deleting…" : "Delete note"}
                      </ActionButton>
                      <ActionButton onClick={() => setConfirmId(null)} disabled={busy}>
                        Keep it
                      </ActionButton>
                    </div>
                  </div>
                )}

                {!editing && !confirming && (n.can_edit || n.can_delete) && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {n.can_edit && (
                      <ActionButton
                        onClick={() => {
                          setEditingId(n.id);
                          setEditDraft(n.body);
                          setRowError(null);
                          setConfirmId(null);
                        }}
                      >
                        Edit
                      </ActionButton>
                    )}
                    {n.can_delete && (
                      <ActionButton
                        onClick={() => {
                          setConfirmId(n.id);
                          setRowError(null);
                        }}
                      >
                        Delete
                      </ActionButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
