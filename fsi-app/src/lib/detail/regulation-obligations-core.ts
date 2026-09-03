// regulation-obligations-core.ts — pure control-flow core for the two extra reads
// /regulations/[slug]/page.tsx makes beyond loadDetail's shared bundle (PERF-2 lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §8 "(A)").
//
// WHAT (A) FOUND, BY READING (not by guessing): after the PERF lane's loadDetail() fix (#540,
// load-detail-core.ts), /regulations/[slug]/page.tsx still awaits TWO MORE async Server Components after
// `await loadDetail(...)` resolves — <ObligationRegister itemId variant="detail" /> (its own
// section, mounted as a sibling below RegulationDetailSurface) and <UpcomingObligationsStrip
// variant="detail" itemId /> (passed as RegulationDetailSurface's `upcomingObligations` prop). Neither
// exists on /market, /operations, or /research's detail pages (confirmed: `grep -n
// "ObligationRegister|UpcomingObligationsStrip" src/app/{market,operations,research}/[slug]/page.tsx`
// finds neither import in any of the three) — this pair is why regulations stayed slower than the other
// three surfaces even after the shared loader was parallelized.
//
// THE MECHANISM THIS FIXES: page.tsx's exported function is itself `async`. Its body does
// `const result = await loadDetail(...)` BEFORE it constructs and returns the JSX tree that contains
// those two components — a plain JS fact, not a React scheduling nuance: the function literally cannot
// reach the `return (<>...</>)` statement, and therefore cannot even INSTANTIATE the
// `<ObligationRegister>`/`<UpcomingObligationsStrip>` elements, until the `await` above it resolves. So
// every render pays loadDetail's own cost, THEN pays these two components' cost — sequentially, not
// overlapped — even though neither depends on loadDetail's result (both take only the route's `id`).
// regulation-obligations-core.test.mjs's timeline proof demonstrates this mechanically: composing two
// async stages as "await A, then await B" versus "Promise.all([A, B])" and printing the ordered call log
// for both.
//
// THE FIX: loadRegulationObligations below is called via Promise.all ALONGSIDE loadDetail() in page.tsx
// (see regulation-obligations.ts and page.tsx's own comment), collapsing the "loadDetail then obligations"
// serial chain into one round-trip width. It replaces the two async Server Component wrappers for the
// DETAIL page only — ObligationRegister.tsx and UpcomingObligationsStrip.tsx are UNCHANGED and still serve
// the regulations LIST page (their `variant="list"` shape, out of this lane's write set) exactly as
// before; this module calls their underlying plain-function reads (fetchObligationRegister,
// fetchUpcomingObligations) directly instead.
//
// WHY THE REQUEST-SCOPED CLIENT IS KEPT, NOT SWAPPED FOR THE SERVICE-ROLE ONE: read-register.mjs and
// read-upcoming.mjs's own headers state, repeatedly and in capital letters, that these two reads "MUST
// always be called with the REQUEST-SCOPED client... never a service-role client" — RLS is the actual
// authorization boundary for this data, not merely defense in depth. That rules out folding these two
// reads into loadDetail's cached, service-role-client `loadItemScoped` bundle (unstable_cache also
// forbids reading cookies() inside its wrapped function, which the request-scoped client needs). So the
// fix here is "parallel, uncached" — the shape this lane's brief calls for when a read is viewer/request-
// scoped rather than org-independent-and-cacheable — not "moved into the cache".
//
// Split into core/wiring exactly like load-detail-core.ts/load-detail.ts: this file imports NOTHING from
// next/* or @supabase/supabase-js at runtime (only `import type`, fully erased), so it — and only it —
// can be exercised by a plain `node --test` process (regulation-obligations-core.test.mjs).
// regulation-obligations.ts is the thin wiring layer that supplies the real Supabase/Next bindings.

export interface RegulationObligationsDeps<RegisterRow, UpcomingEvent> {
  /** Resolve the route's `id` (a uuid or a legacy_id) to the item's real uuid — read-register.mjs /
   *  read-upcoming.mjs's FK is a uuid, same resolution ObligationRegister.tsx/UpcomingObligationsStrip.tsx
   *  each already performed inline. Returns null when the id does not resolve (honest omission, not an
   *  error — mirrors both components' existing behavior exactly). */
  resolveItemId: (id: string) => Promise<string | null>;
  fetchRegisterRows: (itemUuid: string) => Promise<RegisterRow[]>;
  fetchUpcomingEvents: (itemUuid: string) => Promise<UpcomingEvent[]>;
}

export interface RegulationObligationsResult<RegisterRow, UpcomingEvent> {
  registerRows: RegisterRow[];
  upcomingEvents: UpcomingEvent[];
}

/**
 * Resolve the item id once, then run the register read and the upcoming-events read IN PARALLEL
 * (Promise.all) — this function's own body is the "after" shape the timeline test proves is faster than
 * the "await register, then await upcoming" shape it replaced inside the two former Server Components.
 * SOFT-FAIL: any thrown error (resolution failure, either read failing) returns empty arrays rather than
 * throwing — matches ObligationRegister.tsx's and UpcomingObligationsStrip.tsx's existing try/catch
 * postures exactly (an obligations-read failure must never break the surrounding detail page).
 */
export async function loadRegulationObligations<RegisterRow, UpcomingEvent>(
  id: string,
  deps: RegulationObligationsDeps<RegisterRow, UpcomingEvent>
): Promise<RegulationObligationsResult<RegisterRow, UpcomingEvent>> {
  const empty = { registerRows: [] as RegisterRow[], upcomingEvents: [] as UpcomingEvent[] };
  try {
    const itemUuid = await deps.resolveItemId(id);
    if (!itemUuid) return empty;

    const [registerRows, upcomingEvents] = await Promise.all([
      deps.fetchRegisterRows(itemUuid),
      deps.fetchUpcomingEvents(itemUuid),
    ]);
    return { registerRows, upcomingEvents };
  } catch {
    return empty;
  }
}
