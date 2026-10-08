"use client";

/**
 * ItemAssignBlock: assign an item to one or more members of the caller's workspace, with notification (lane
 * S8-A, 2026-10-07; plan Stage 8 bullet 1; migration 359, /api/workspace/items/[id]/assignments). Mounted ONCE,
 * by DetailShell's item collaboration slot, so the four detail surfaces pass nothing new (PI-1).
 *
 * Distinct from OwnerTeamCard's single "Assignee" select (migration 234, one owner per item): this block holds
 * several people, an optional due date and an open or done state. Each new assignee gets one notification of kind
 * `assignment` in the Community notification bell, linking back here. Coordination metadata only: never
 * analysed, never read by another page or the flywheel (ADR-042, ADR-043).
 *
 * UX contract (docs/design/ux-laws.md):
 *   - A viewer is readable-only and is not assignable: the picker lists members, admins and owners only (the
 *     server filters the roster and refuses a viewer id).
 *   - Goal: make sure the right people own acting on this item. Path: pick people, optionally a due date, then
 *     "Assign" (the one primary action, whose label counts the people picked). The picker lists only members
 *     who are not already assigned, so an impossible choice is not offered.
 *   - Current assignees are chips: name, due date, state, a state toggle and Remove, each a 44 px target.
 *   - Every async action acknowledges at once and ends on a stated result ("Assigned 2 people. 2 notified.");
 *     a failure keeps the picked people and the date and says how to fix it.
 */

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/ActionRow";
import { formatDate } from "@/lib/format";
import { captionStyle, collabPath, collabRequest, fieldStyle, wrapText } from "@/components/detail/item-collab-client";

export interface ItemAssignment {
  id: string;
  assignee_user_id: string;
  assignee_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  due_on: string | null;
  state: "open" | "done";
  created_at: string;
  can_change: boolean;
}

interface Member {
  user_id: string;
  display_name: string;
}

interface ListPayload {
  assignments: ItemAssignment[];
  members: Member[];
  viewer: { role: string; can_write: boolean };
}

interface AssignPayload {
  assignments: ItemAssignment[];
  already_assigned: string[];
  notified: number;
  notify_failed: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ItemAssignBlock({ itemId }: { itemId: string }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ItemAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [dueOn, setDueOn] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  // The load runs inside the effect's own async callback and sets state only after the fetch resolves (the phase
  // starts as "loading"), so mounting causes no synchronous state write. Retry bumps `attempt` to run it again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await collabRequest<ListPayload>(collabPath(itemId, "assignments"));
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        setPhase("error");
        return;
      }
      setAssignments(res.data.assignments);
      setMembers(res.data.members);
      setCanWrite(res.data.viewer.can_write);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, attempt]);

  const assignedIds = new Set(assignments.map((a) => a.assignee_user_id));
  const available = members.filter((m) => !assignedIds.has(m.user_id));

  function toggle(userId: string) {
    setAssignError(null);
    setPicked((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function assign() {
    if (picked.length === 0 || assigning) return;
    // clock-ok: read inside the click handler, never the render path (the reader's own local calendar day).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (dueOn && dueOn < today) {
      setAssignError("The due date is in the past. Choose today or a later date, or clear it.");
      return;
    }
    setAssigning(true);
    setAssignError(null);
    setFlash(null);
    const res = await collabRequest<AssignPayload>(collabPath(itemId, "assignments"), {
      method: "POST",
      body: JSON.stringify({ assignees: picked, dueOn: dueOn || null }),
    });
    setAssigning(false);
    if (!res.ok) {
      setAssignError(res.error);
      return;
    }
    const made = res.data.assignments;
    setAssignments((prev) => [...prev, ...made]);
    setPicked([]);
    setDueOn("");
    const told = res.data.notify_failed > 0 ? `${res.data.notified} notified, ${res.data.notify_failed} could not be notified` : `${res.data.notified} notified`;
    setFlash(made.length === 0 ? "Those people were already assigned." : `Assigned ${plural(made.length, "person", "people")}. ${told}.`);
  }

  async function setState(a: ItemAssignment, state: "open" | "done") {
    if (busyId) return;
    setBusyId(a.id);
    setRowError(null);
    setFlash(null);
    const res = await collabRequest<{ assignment: ItemAssignment }>(collabPath(itemId, "assignments"), {
      method: "PATCH",
      body: JSON.stringify({ assignee: a.assignee_user_id, state }),
    });
    setBusyId(null);
    if (!res.ok) {
      setRowError({ id: a.id, message: res.error });
      return;
    }
    setAssignments((prev) => prev.map((x) => (x.id === a.id ? res.data.assignment : x)));
    setFlash(state === "done" ? "Marked done." : "Reopened.");
  }

  async function remove(a: ItemAssignment) {
    if (busyId) return;
    setBusyId(a.id);
    setRowError(null);
    setFlash(null);
    const res = await collabRequest<{ success: boolean }>(`${collabPath(itemId, "assignments")}?assignee=${encodeURIComponent(a.assignee_user_id)}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setRowError({ id: a.id, message: res.error });
      return;
    }
    setAssignments((prev) => prev.filter((x) => x.id !== a.id));
    setFlash(`Removed ${a.assignee_name ?? "the assignee"}.`);
  }

  if (phase === "loading") {
    return <p style={captionStyle}>Loading assignments…</p>;
  }
  if (phase === "error") {
    return (
      <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <p style={{ ...captionStyle, color: "var(--immediate)" }}>{loadError ?? "Assignments could not be loaded."}</p>
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

  return (
    <div data-part="item-assignments" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {assignments.length === 0 ? (
        <p style={captionStyle}>Nobody is assigned to this item yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {assignments.map((a) => {
            const busy = busyId === a.id;
            return (
              <li
                key={a.id}
                aria-label={`${a.assignee_name ?? "Assignee"}, ${a.state}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "10px 12px",
                  border: "1px solid var(--line-1)",
                  borderRadius: "var(--radius-control)",
                  background: a.state === "done" ? "var(--page)" : "var(--card)",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span data-guard-title style={{ ...wrapText, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink)" }}>
                    {a.assignee_name ?? "Former member"}
                  </span>
                  <span style={captionStyle}>
                    {a.state === "done" ? "Done" : "Open"}
                    {a.due_on ? ` · due ${formatDate(a.due_on)}` : " · no due date"}
                  </span>
                </div>
                {a.can_change && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <ActionButton onClick={() => void setState(a, a.state === "done" ? "open" : "done")} disabled={busy}>
                      {busy ? "Saving…" : a.state === "done" ? "Reopen" : "Mark done"}
                    </ActionButton>
                    <ActionButton onClick={() => void remove(a)} disabled={busy}>
                      Remove
                    </ActionButton>
                  </div>
                )}
                {rowError?.id === a.id && (
                  <p role="alert" style={{ ...captionStyle, color: "var(--immediate)", maxWidth: "36ch" }}>
                    {rowError.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p role="status" aria-live="polite" style={captionStyle}>
        {flash}
      </p>

      {canWrite ? (
        available.length === 0 ? (
          <p style={captionStyle}>Everyone who can be assigned is already assigned.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <legend style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink-2)", padding: 0, marginBottom: 8 }}>Assign to</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {available.map((m) => {
                  const on = picked.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(m.user_id)}
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--fs-12)",
                        fontWeight: 700,
                        minHeight: 44,
                        maxWidth: "100%",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-control)",
                        border: on ? "1px solid var(--brand)" : "1px solid rgba(0,0,0,.25)",
                        background: on ? "var(--brand)" : "var(--card)",
                        color: on ? "#fff" : "var(--ink)",
                        cursor: "pointer",
                        overflowWrap: "anywhere",
                        textAlign: "left",
                      }}
                    >
                      {m.display_name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink-2)", maxWidth: 260 }}>
              Due date (optional)
              <input
                type="date"
                value={dueOn}
                onChange={(e) => {
                  setDueOn(e.target.value);
                  setAssignError(null);
                }}
                style={fieldStyle}
              />
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <ActionButton variant="primary" onClick={() => void assign()} disabled={assigning || picked.length === 0}>
                {assigning ? "Assigning…" : picked.length === 0 ? "Assign" : `Assign ${plural(picked.length, "person", "people")}`}
              </ActionButton>
              {picked.length === 0 && <span style={captionStyle}>Pick at least one person.</span>}
            </div>
            {assignError && (
              <p role="alert" style={{ ...captionStyle, color: "var(--immediate)" }}>
                {assignError}
              </p>
            )}
          </div>
        )
      ) : (
        <p style={captionStyle}>Your role in this workspace can see assignments but not make them.</p>
      )}
    </div>
  );
}
