/**
 * api-client.ts — typed fetch wrappers for COMMUNITY-A's guard-enforced Community API contract
 * (docs/plans/wave3-lanes-2026-09-03.md, "Interface contract with COMMUNITY-B"). COMMUNITY-A owns
 * `src/lib/community/**` and `src/app/api/community/**`; this lane (COMMUNITY-B, "the surface")
 * consumes that contract only through the shapes below, never by importing A's server modules.
 *
 * Every function is a pure fetch wrapper: no module-scope side effects (F34 — no filesystem/network
 * call at module scope under src/**), safe to import from a client OR server component. Each accepts
 * an optional `fetchImpl` so tests can inject a stub instead of touching the network — the `fixtures`
 * export below is the canned data those stubs return, and it doubles as the shape reference for the
 * REAL-component UX smoke spec `.discipline/rendering/smoke/community-smoke.mjs` (mounts PostList,
 * Post, and PeersDiscussingStrip against fixture data shaped from this same contract).
 *
 * A's routes did not exist in this worktree at write time (sibling lane, separate worktree) — these
 * wrappers are built strictly from the contract text in the wave3 plan, never from reading A's code.
 * Where the contract was silent, the gap is named at the call site with [INFERRED].
 */

// ── POST /api/community/posts ────────────────────────────────────────────────────────────────

export interface CreatePostInput {
  group_id: string;
  title?: string;
  body: string;
  /** Every thread binds to at least one spine entity (spec 05 §5 component 2, acceptance 6). */
  entity_ids: string[];
  /** Named commercially-sensitive field this post asserts a value for, if any (k-anonymity /
   * dominance / lag guard target — spec 05 §1). Omitted for posts that carry no sensitive figure. */
  sensitivity_field?: string;
}

/** The guard's refusal payload shape (spec 05 §1, acceptance 3): "refuse, explain, offer the
 * aggregate-only route" (spec 05 §5 component 12). `instrumentKey`/`pending` are the fields the
 * wave3 contract names explicitly; the route may carry more — surfaced as-is, never dropped. */
export interface GuardAggregateRoute {
  instrumentKey?: string;
  pending?: boolean;
  [key: string]: unknown;
}

export interface CreatePostSuccess {
  ok: true;
  post: Record<string, unknown>;
}

export interface CreatePostFailure {
  ok: false;
  /** 0 when the request never reached the network (local validation failure, e.g. no entity bound,
   * or a network error) — real HTTP status otherwise. */
  status: number;
  error: string;
  /** Present only on a 403 antitrust-guard refusal that named an aggregate route. */
  aggregateRoute?: GuardAggregateRoute;
}

export type CreatePostResult = CreatePostSuccess | CreatePostFailure;

/**
 * POST /api/community/posts. Refuses client-side (status 0) before the network round-trip when no
 * entity is bound — acceptance criterion 6 ("every thread binds to at least one spine entity") is
 * enforced at the UI boundary too, not only server-side, so the composer never sends a request the
 * guard is certain to reject on that ground.
 */
export async function createCommunityPost(
  input: CreatePostInput,
  fetchImpl: typeof fetch = fetch
): Promise<CreatePostResult> {
  if (!input.entity_ids || input.entity_ids.length === 0) {
    return {
      ok: false,
      status: 0,
      error:
        "Bind this post to at least one spine entity (corridor, jurisdiction, instrument, technology, or organisation) before posting.",
    };
  }

  let res: Response;
  try {
    res = await fetchImpl("/api/community/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  const json = await safeJson<{
    post?: Record<string, unknown>;
    error?: string;
    aggregate_route?: GuardAggregateRoute;
  }>(res);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json?.error || `Could not post (${res.status})`,
      aggregateRoute: res.status === 403 ? json?.aggregate_route : undefined,
    };
  }

  return { ok: true, post: json?.post ?? {} };
}

// ── GET /api/community/threads/[id]/corroboration ────────────────────────────────────────────

export interface ThreadCorroboration {
  thread_id: string;
  organisations: number;
  posts: number;
  consistent: boolean;
}

export async function getThreadCorroboration(
  threadId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ThreadCorroboration | null> {
  try {
    const res = await fetchImpl(
      `/api/community/threads/${encodeURIComponent(threadId)}/corroboration`
    );
    if (!res.ok) return null;
    return (await res.json()) as ThreadCorroboration;
  } catch {
    return null;
  }
}

// ── GET /api/community/entities/[entityId]/threads ───────────────────────────────────────────

/** Author identity projection (spec 05 §2, §5 component 1/11): org type + role + sector + region,
 * never name or company. The wave3 contract's entity-threads response shape (as written) carries
 * `author_user_id` rather than this projection — [INFERRED] this field is optional here so a caller
 * degrades gracefully (renders nothing identity-shaped) until the projection is threaded through,
 * rather than ever rendering the raw user id as a stand-in identity. See AuthorIdentityChip.tsx. */
export interface AuthorIdentityProjection {
  orgType?: string | null;
  role?: string | null;
  sector?: string | null;
  region?: string | null;
  verified?: boolean;
}

export interface EntityThread {
  id: string;
  group_id: string;
  title: string | null;
  body: string;
  author_user_id: string | null;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
  promotion_state: string;
  origin_class: string;
  entity_id: string;
  entity_kind: string;
  author_identity?: AuthorIdentityProjection | null;
  /** Time-decay chip text, given verbatim (spec 05 §4: "100% at 0-12mo, 50% at 12-24, 25% at
   * 24-36"), e.g. "this month" / "3 mo old · 80% weight". [INFERRED] optional — the contract's
   * corroboration/benchmark shapes name this field on evidence generally, not explicitly per-thread. */
  evidence_chip?: string | null;
}

export interface EntityThreadsResult {
  entity_id: string;
  threads: EntityThread[];
  next_cursor: string | null;
}

export async function getEntityThreads(
  entityId: string,
  opts: { limit?: number; before?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<EntityThreadsResult | null> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  const qs = params.toString();
  try {
    const res = await fetchImpl(
      `/api/community/entities/${encodeURIComponent(entityId)}/threads${qs ? `?${qs}` : ""}`
    );
    if (!res.ok) return null;
    return (await res.json()) as EntityThreadsResult;
  } catch {
    return null;
  }
}

// ── GET /api/community/benchmarks/current ─────────────────────────────────────────────────────

export interface BenchmarkAggregate {
  publishable: boolean;
  value: number | null;
  distinct_organisations: number;
  min_contributors: number;
  response_count: number;
  reason: string | null;
}

export interface Benchmark {
  key: string;
  title: string;
  question: string;
  field_key: string;
  unit: string;
  sector_profile: string[] | string | null;
  region: string | null;
  calendar_cycle: string;
  opens_at: string;
  closes_at: string;
  period_end: string;
  status: string;
  aggregate: BenchmarkAggregate;
}

export async function getCurrentBenchmarks(
  fetchImpl: typeof fetch = fetch
): Promise<Benchmark[] | null> {
  try {
    const res = await fetchImpl("/api/community/benchmarks/current");
    if (!res.ok) return null;
    const json = (await res.json()) as { benchmarks?: Benchmark[] };
    return json.benchmarks ?? [];
  } catch {
    return null;
  }
}

// ── shared ─────────────────────────────────────────────────────────────────────────────────────

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────
// Canned data for this lane's own tests and rendering-guard fixtures. NOT live data from A — built
// strictly from the contract shapes above so a fixture-driven render/test never silently drifts
// from what this file believes the contract to be.

export const fixtures = {
  guardRefusal: {
    error:
      "This field is commercially sensitive and has fewer than five contributors this quarter. Refused at write time.",
    aggregate_route: { instrumentKey: "saf-premium-eu-us-air-2026q3", pending: true },
  } satisfies { error: string; aggregate_route: GuardAggregateRoute },

  entityThreads: {
    entity_id: "cl:corridor:7f3a9c21b1044d6e",
    threads: [
      {
        id: "thread-1",
        group_id: "group-1",
        title: "SAF premium creeping up on this lane",
        body: "Seeing a step change on bunker pass-through this quarter.",
        author_user_id: "user-1",
        created_at: "2026-08-01T00:00:00.000Z",
        last_reply_at: "2026-08-20T00:00:00.000Z",
        reply_count: 4,
        promotion_state: "community-corroborated",
        origin_class: "community-corroborated",
        entity_id: "cl:corridor:7f3a9c21b1044d6e",
        entity_kind: "corridor",
        author_identity: {
          orgType: "Freight forwarder",
          role: "Trade lane manager",
          sector: "Apparel",
          region: "EU",
          verified: true,
        },
        evidence_chip: "3 mo old · 80% weight",
      },
    ] as EntityThread[],
    next_cursor: null,
  } satisfies EntityThreadsResult,

  benchmarks: [
    {
      key: "saf-premium-eu-us-air-2026q3",
      title: "SAF premium, EU–US air lanes",
      question: "What SAF premium are you seeing on EU-US air lanes this quarter?",
      field_key: "saf_premium_usd_per_kg",
      unit: "USD/kg",
      sector_profile: ["air-freight"],
      region: "EU-US",
      calendar_cycle: "quarterly",
      opens_at: "2026-07-01T00:00:00.000Z",
      closes_at: "2026-09-30T00:00:00.000Z",
      period_end: "2026-09-30T00:00:00.000Z",
      status: "open",
      aggregate: {
        publishable: false,
        value: null,
        distinct_organisations: 3,
        min_contributors: 5,
        response_count: 4,
        reason: "Fewer than 5 distinct contributing organisations this period.",
      },
    },
  ] as Benchmark[],
};
