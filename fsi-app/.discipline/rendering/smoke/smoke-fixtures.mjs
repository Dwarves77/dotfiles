// Fixture data builders for the SM smoke specs (Lane GATES-1, 2026-09-02). Pure data, no DOM/esbuild/
// Playwright — kept separate from harness.mjs so a future spec can reuse a builder without pulling in
// esbuild, and so this file's shapes are directly node-`--test`-able (see harness.test.mjs).
//
// Each builder returns the THREE states every smoke spec renders (empty / one-row / extreme-data),
// named to match the brief: "the component in its empty, one-row, extreme-data states."

const LONG = (n, word = "extremely-long-token") =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(" ");

// ── Watchlist (team) — WatchlistSurface({ items, limit }) ──────────────────────────────────────
export function watchlistFixtures() {
  const empty = { items: [], limit: 50 };

  const oneRow = {
    items: [
      {
        id: "w1",
        type: "reg",
        title: "EU Packaging and Packaging Waste Regulation",
        source: "Official Journal of the EU",
        jurisdiction: "EU",
        lastChangedAt: "2026-08-01T00:00:00Z",
        scope: "team",
        note: "Flagged for the compliance review ahead of the Q4 filing.",
        addedBy: "Alice Chen",
      },
    ],
    limit: 50,
  };

  const TYPES = ["source", "reg", "signal", "research", "operations", "market_series"];
  const extreme = {
    items: Array.from({ length: 24 }, (_, i) => ({
      id: `w${i}`,
      type: TYPES[i % TYPES.length],
      title: `${LONG(6, "Extremely long watched item title token")} #${i}`,
      source: `${LONG(4, "Very-long-source-name-segment")}`,
      jurisdiction: i % 3 === 0 ? "EU" : i % 3 === 1 ? "US-CA" : undefined,
      lastChangedAt: `2026-0${(i % 8) + 1}-01T00:00:00Z`,
      scope: i % 2 === 0 ? "team" : "personal",
      note: i % 2 === 0 ? LONG(20, "long-team-note-word") : undefined,
      addedBy: i % 2 === 0 ? "Priya Patel" : undefined,
    })),
    // limit === items.length: exercises the "standing at the read cap" honest banner (§4).
    limit: 24,
  };

  return { empty, oneRow, extreme };
}

// ── Personal archive — ArchiveViewer() reads useResourceStore, so this returns STORE STATE, not
//    props. `resources` backs a personal row's stub-fallback lookup when the corpus is loaded. ────
export function archiveFixtures() {
  const empty = { archived: [], resources: [], personalState: new Map() };

  const oneRow = {
    archived: [],
    resources: [{ id: "p1", title: "Personal Archived Regulation", note: "", tags: [] }],
    personalState: new Map([
      ["p1", { itemId: "p1", isArchived: true, archiveNote: "Superseded by the 2026 revision.", archivedAt: "2026-08-01T00:00:00Z" }],
    ]),
  };

  const REASONS = ["superseded", "expired", "out-of-scope", "duplicate"];
  const teamCount = 10;
  const personalCount = 10;
  const archived = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i}`,
    title: `${LONG(5, "Extremely long team archive title token")} #${i}`,
    note: LONG(6, "team-archive-note-word"),
    tags: ["reg", "compliance"],
    archiveReason: REASONS[i % REASONS.length],
    archivedDate: `2026-0${(i % 8) + 1}-15`,
    replacedBy: i % 4 === 0 ? `t${i + 1}` : undefined,
  }));
  const resources = archived.map((r) => ({ ...r, isArchived: false }));
  const personalEntries = Array.from({ length: personalCount }, (_, i) => [
    `pp${i}`,
    {
      itemId: `pp${i}`,
      isArchived: true,
      archiveNote: LONG(8, "personal-archive-note-word"),
      archivedAt: `2026-0${(i % 8) + 1}-20T00:00:00Z`,
    },
  ]);
  const extreme = {
    archived,
    resources: [
      ...resources,
      ...Array.from({ length: personalCount }, (_, i) => ({
        id: `pp${i}`,
        title: `${LONG(5, "Extremely long personal archive title token")} #${i}`,
        note: "",
        tags: [],
        archiveReason: REASONS[i % REASONS.length],
      })),
    ],
    personalState: new Map(personalEntries),
  };

  return { empty, oneRow, extreme };
}

// ── List order — DashboardTopPriority({ resources, jurisdictionsCount }) ───────────────────────
export function listOrderFixtures() {
  const empty = { resources: [], jurisdictionsCount: 0 };

  const oneRow = {
    resources: [
      {
        id: "r1",
        title: "Corporate Sustainability Reporting Directive",
        priority: "CRITICAL",
        urgencyScore: 95,
        jurisdiction: "EU",
        jurisdictionIso: ["EU"],
        sourceTier: 1,
        whyMatters: "Binding disclosure obligations begin next fiscal year.",
        actionOwner: "Jane Doe",
        complianceDeadline: "2027-01-01",
      },
    ],
    jurisdictionsCount: 1,
  };

  const extreme = {
    resources: Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      title: `${LONG(7, "Extremely long regulation title token")} #${i}`,
      priority: "CRITICAL",
      urgencyScore: 100 - i,
      jurisdiction: i % 2 === 0 ? "EU" : "US-CA",
      jurisdictionIso: [i % 2 === 0 ? "EU" : "US"],
      sourceTier: (i % 7) + 1,
      whyMatters: LONG(30, "long-analysis-word"),
      actionOwner: `${LONG(3, "Very-Long-Owner-Name-Segment")}`,
      complianceDeadline: i % 3 === 0 ? undefined : `2027-0${(i % 9) + 1}-01`,
    })),
    jurisdictionsCount: 6,
  };

  return { empty, oneRow, extreme };
}

// ── Notifications — bell unread badge + NotificationsList body, keyed by unread volume. ────────
function notification(i, { long = false } = {}) {
  return {
    id: `n${i}`,
    kind: ["mention", "reply", "invite", "promote", "moderation", "archive"][i % 6],
    payload: {
      title: long ? `${LONG(6, "Extremely long notification title token")} #${i}` : `Notification #${i}`,
      body: long ? LONG(15, "long-notification-body-word") : `Body text ${i}`,
    },
    read_at: null,
    created_at: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  };
}

export function notificationsFixtures() {
  const empty = { unreadCount: 0, notifications: [], totalMatching: 0 };
  const oneRow = { unreadCount: 1, notifications: [notification(0)], totalMatching: 1 };
  const extreme = {
    unreadCount: 150, // > 99 -> the bell's "99+" truncation
    notifications: Array.from({ length: 20 }, (_, i) => notification(i, { long: true })),
    totalMatching: 150,
  };
  return { empty, oneRow, extreme };
}
