"use client";

// Client half of the workspace item notes and assignments (lane S8-A, 2026-10-07). The two blocks
// (ItemNotesBlock, ItemAssignBlock) make the same kind of call to the same family of routes, so the call, its
// error wording and its styles live here once. Every call goes through authedFetch (F40): the routes read the
// caller's identity from the bearer token only, and no session means no request.

import type { CSSProperties } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";

export type CollabResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** One call to /api/workspace/items/<id>/<kind>. Never throws: a refusal or a dropped connection comes back as
 *  { ok: false, error } in plain words, so the caller can show it beside the reader's preserved input. */
export async function collabRequest<T>(path: string, init?: RequestInit): Promise<CollabResult<T>> {
  try {
    const hasBody = typeof init?.body === "string";
    const res = await authedFetch(path, hasBody ? { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } } : init);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const said = (json as { error?: unknown } | null)?.error;
      if (typeof said === "string" && said) return { ok: false, status: res.status, error: said };
      if (res.status === 401) return { ok: false, status: 401, error: "Your session has ended. Sign in again, then retry; what you typed is kept." };
      if (res.status === 429) return { ok: false, status: 429, error: "Too many requests just now. Wait a moment, then retry; what you typed is kept." };
      return { ok: false, status: res.status, error: "That did not save. Retry in a moment; what you typed is kept." };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, error: "Could not reach the server. Check your connection and retry; what you typed is kept." };
  }
}

export function collabPath(itemId: string, kind: "notes" | "assignments"): string {
  return `/api/workspace/items/${encodeURIComponent(itemId)}/${kind}`;
}

/** The 44 px form control every field in the two blocks shares (ux-laws 2). */
export const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: "8px 10px",
  fontSize: "var(--fs-12)",
  fontFamily: "var(--font-sans)",
  lineHeight: 1.5,
  border: "1px solid var(--line-1)",
  borderRadius: "var(--radius-control)",
  background: "var(--page)",
  color: "var(--ink)",
};

export const captionStyle: CSSProperties = {
  fontSize: "var(--fs-105)",
  color: "var(--ink-3)",
  margin: 0,
};

export const wrapText: CSSProperties = { overflowWrap: "anywhere", minWidth: 0 };
