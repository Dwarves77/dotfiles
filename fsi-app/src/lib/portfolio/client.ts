"use client";

// Portfolio client calls (lane S8-D, 2026-10-07). Every request to /api/workspace/portfolios goes through
// authedFetch, the one place the session bearer token is attached (F40). Each call answers a small
// { ok, error?, body? } so a view shows a plain-language failure and keeps what the reader typed.

import { authedFetch } from "@/lib/api/authed-fetch";

export interface PortfolioCallResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  error?: string;
  body?: T;
}

async function call<T>(path: string, method: string, payload?: Record<string, unknown>): Promise<PortfolioCallResult<T>> {
  try {
    const res = await authedFetch(path, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null;
      return {
        ok: false,
        status: res.status,
        error: res.status === 401 ? "Sign in again to continue." : message ?? "That did not go through. Try again.",
      };
    }
    return { ok: true, status: res.status, body: (body ?? undefined) as T | undefined };
  } catch {
    return { ok: false, status: 0, error: "The network request failed. Check your connection and try again." };
  }
}

const BASE = "/api/workspace/portfolios";

export const createPortfolioRequest = (name: string) =>
  call<{ portfolio: { id: string; name: string }; existed: boolean }>(BASE, "POST", { name });

export const renamePortfolioRequest = (id: string, name: string) => call(`${BASE}/${encodeURIComponent(id)}`, "PATCH", { name });

export const deletePortfolioRequest = (id: string) => call(`${BASE}/${encodeURIComponent(id)}`, "DELETE");

export const addMemberRequest = (id: string, member: { itemId?: string; entityId?: string }) =>
  call<{ existed: boolean }>(`${BASE}/${encodeURIComponent(id)}/members`, "POST", member);

export const removeMemberRequest = (id: string, member: { itemId?: string; entityId?: string }) =>
  call(`${BASE}/${encodeURIComponent(id)}/members`, "DELETE", member);
