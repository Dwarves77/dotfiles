// changed-since.ts — server data + pure selection for the Dashboard ChangedSinceStrip (Task 3, lane CD,
// change-detection chain repair, 2026-09-01). Two independent, honestly-scoped change signals:
//
//   1. SOURCE-changed items — intelligence_changes (written by src/lib/sources/reconcile.ts's
//      recordSourceChangeTrigger/recordItemChange, now reachable in-process from check-sources, see that
//      file's header) joined to LIVE intelligence_items (is_archived = false), within the last N days.
//   2. THEME-membership-changed items — connection_theme_runs.theme_delta (migration 276) of the LATEST
//      completed run: added/removed member ids from persisted/renamed themes, plus the current
//      member_ids of any theme that appeared this run (looked up in connection_themes — the only place
//      membership for an appeared theme still exists). A DISSOLVED theme's members are never claimed
//      here: connection_themes is fully replaced every analyze-corpus pass (migration 253's own header:
//      "not append-only"), so a dissolved theme's membership is not recoverable — this module says
//      nothing about it rather than guessing.
//
// PRECISION-HONEST DATES: every emitted row carries the SOURCE timestamp it was computed from
// (`detectedAt` = intelligence_changes.detected_at; `runFinishedAt` = the analyze-corpus run's own
// finished_at) — never a re-derived "now", and never implies continuous/live detection: both signals are
// produced by a dispatch/schedule pass (check-sources -> reconcile, analyze-corpus.mjs), not a live feed.

import { createClient } from "@supabase/supabase-js";

export interface SourceChangedRow {
  itemId: string;
  title: string;
  itemType: string | null;
  domain: number | null;
  changeType: string;
  changeSeverity: string;
  changeSummary: string | null;
  detectedAt: string;
}

export interface ThemeChangedRow {
  itemId: string;
  title: string;
  itemType: string | null;
  domain: number | null;
  themeId: string;
  reason: "added" | "removed" | "appeared";
  runFinishedAt: string | null;
}

export interface ChangedSinceData {
  sourceChanged: SourceChangedRow[];
  themeChanged: ThemeChangedRow[];
  windowDays: number;
}

interface RawChangeRow {
  item_id: string | null;
  change_type: string;
  change_severity: string;
  change_summary: string | null;
  detected_at: string;
}

interface LiveItem {
  title: string;
  itemType: string | null;
  domain: number | null;
}

// ── PURE selection (node-testable, no I/O) ───────────────────────────────────────────────────────────

/**
 * Select + shape the source-changed rows: intelligence_changes rows gated to a LIVE item set, within the
 * last `windowDays` of `now`, one row per item (the most recent, when an item accumulated several),
 * newest first.
 */
export function selectSourceChanged(
  changeRows: RawChangeRow[] | null | undefined,
  liveItemsById: Map<string, LiveItem>,
  windowDays: number,
  now: Date = new Date()
): SourceChangedRow[] {
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const latestByItem = new Map<string, RawChangeRow>();
  for (const r of changeRows ?? []) {
    if (!r?.item_id || !liveItemsById.has(r.item_id) || !r.detected_at) continue;
    const t = new Date(r.detected_at).getTime();
    if (Number.isNaN(t) || t < cutoffMs) continue;
    const existing = latestByItem.get(r.item_id);
    if (!existing || t > new Date(existing.detected_at).getTime()) latestByItem.set(r.item_id, r);
  }
  const out: SourceChangedRow[] = [];
  for (const [itemId, r] of latestByItem) {
    const live = liveItemsById.get(itemId);
    out.push({
      itemId,
      title: live?.title ?? "(untitled)",
      itemType: live?.itemType ?? null,
      domain: live?.domain ?? null,
      changeType: r.change_type,
      changeSeverity: r.change_severity,
      changeSummary: r.change_summary ?? null,
      detectedAt: r.detected_at,
    });
  }
  out.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : a.detectedAt > b.detectedAt ? -1 : 0));
  return out;
}

interface ThemeDeltaMembershipRow {
  new_id?: string;
  prior_id?: string;
  added?: string[];
  removed?: string[];
}
interface ThemeDelta {
  persisted?: ThemeDeltaMembershipRow[];
  renamed?: ThemeDeltaMembershipRow[];
  appeared?: string[];
}

/**
 * PURE: derive theme-membership-changed (itemId, themeId, reason) rows from ONE run's `theme_delta`
 * (migration 276 shape — src/lib/connections/theme-delta.mjs `diffThemes` output) plus the CURRENT
 * connection_themes rows (needed only for `appeared` themes' membership — every other bucket already
 * carries added/removed member ids in the delta itself). Titles/liveness are NOT applied here — the
 * caller gates against a live-item set, same as selectSourceChanged, so this stays pure of any I/O shape.
 */
export function selectThemeChanged(
  themeDelta: ThemeDelta | null | undefined,
  currentThemesById: Map<string, { member_ids?: string[] }>,
  runFinishedAt: string | null
): Array<{ itemId: string; themeId: string; reason: "added" | "removed" | "appeared" }> {
  if (!themeDelta || typeof themeDelta !== "object") return [];
  const out: Array<{ itemId: string; themeId: string; reason: "added" | "removed" | "appeared" }> = [];
  const seen = new Set<string>();
  const push = (itemId: string, themeId: string, reason: "added" | "removed" | "appeared") => {
    const key = `${itemId}|${themeId}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ itemId, themeId, reason });
  };
  for (const bucket of [...(themeDelta.persisted ?? []), ...(themeDelta.renamed ?? [])]) {
    const themeId = bucket.new_id ?? bucket.prior_id;
    if (!themeId) continue;
    for (const itemId of bucket.added ?? []) push(itemId, themeId, "added");
    for (const itemId of bucket.removed ?? []) push(itemId, themeId, "removed");
  }
  for (const themeId of themeDelta.appeared ?? []) {
    const theme = currentThemesById.get(themeId);
    for (const itemId of theme?.member_ids ?? []) push(itemId, themeId, "appeared");
  }
  return out;
}

// ── Server-side fetch (I/O) ──────────────────────────────────────────────────────────────────────────

/**
 * Server-rendered, request-scoped: a fresh anon-key client per call (matches the codebase's own
 * request-scoped `getSupabase()` convention in supabase-server.ts — not service-role, so RLS is actually
 * exercised on every render, same as any other customer-facing surface). Fail-soft: any read error warns
 * and degrades to an empty slice for that signal rather than throwing and breaking the Dashboard render.
 */
export async function getChangedSinceData(windowDays = 14): Promise<ChangedSinceData> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { sourceChanged: [], themeChanged: [], windowDays };
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [changesRes, runRes] = await Promise.all([
    supabase
      .from("intelligence_changes")
      .select("item_id, change_type, change_severity, change_summary, detected_at")
      .gte("detected_at", cutoffIso)
      .order("detected_at", { ascending: false })
      .limit(200),
    supabase
      .from("connection_theme_runs")
      .select("finished_at, theme_delta")
      .eq("status", "ok")
      .not("theme_delta", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (changesRes.error) {
    console.warn(`[changed-since] intelligence_changes read failed: ${changesRes.error.message}`);
  }
  if (runRes.error) {
    console.warn(`[changed-since] connection_theme_runs read failed: ${runRes.error.message}`);
  }
  const changeRows = (changesRes.data ?? []) as RawChangeRow[];
  const run = runRes.data as { finished_at: string | null; theme_delta: ThemeDelta } | null;

  let currentThemesById = new Map<string, { member_ids?: string[] }>();
  if (run?.theme_delta) {
    const { data: themes, error: themesErr } = await supabase.from("connection_themes").select("id, member_ids");
    if (themesErr) console.warn(`[changed-since] connection_themes read failed: ${themesErr.message}`);
    currentThemesById = new Map((themes ?? []).map((t: { id: string; member_ids?: string[] }) => [t.id, t]));
  }
  const rawThemeChanged = run?.theme_delta
    ? selectThemeChanged(run.theme_delta, currentThemesById, run.finished_at ?? null)
    : [];

  const candidateIds = new Set<string>([
    ...changeRows.map((r) => r.item_id).filter((id): id is string => !!id),
    ...rawThemeChanged.map((r) => r.itemId),
  ]);
  let liveItemsById = new Map<string, LiveItem>();
  if (candidateIds.size) {
    const { data: liveItems, error: liveErr } = await supabase
      .from("intelligence_items")
      .select("id, title, item_type, domain")
      .in("id", [...candidateIds])
      .eq("is_archived", false);
    if (liveErr) console.warn(`[changed-since] live-item read failed: ${liveErr.message}`);
    liveItemsById = new Map(
      (liveItems ?? []).map((i: { id: string; title: string; item_type: string | null; domain: number | null }) => [
        i.id,
        { title: i.title, itemType: i.item_type ?? null, domain: i.domain ?? null },
      ])
    );
  }

  const sourceChanged = selectSourceChanged(changeRows, liveItemsById, windowDays);
  const themeChanged: ThemeChangedRow[] = rawThemeChanged
    .filter((r) => liveItemsById.has(r.itemId))
    .map((r) => {
      const live = liveItemsById.get(r.itemId)!;
      return {
        itemId: r.itemId,
        title: live.title,
        itemType: live.itemType,
        domain: live.domain,
        themeId: r.themeId,
        reason: r.reason,
        runFinishedAt: run?.finished_at ?? null,
      };
    });

  return { sourceChanged, themeChanged, windowDays };
}
