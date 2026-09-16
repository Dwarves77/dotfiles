// static-params-fallback.mjs - D32 (defect-fix-plan-2026-09-12.md, lane L21), part (d): "the build stops
// depending on a live read." On 2026-09-13, /regulations/[slug]'s generateStaticParams awaited
// getPublicSurfaceSlugs("regulations") with no guard - when the database hung (the disk-IO-budget
// exhaustion this whole defect is about), every Vercel build since 07:24 failed at exactly this call, even
// though the route itself already renders fine on demand (dynamicParams stays at its Next.js default
// `true` - see regulations/[slug]/page.tsx's own generateStaticParams comment). A slow or unreachable
// database should degrade the BUILD-TIME caching optimization, never the deploy.
//
// slugsOrEmpty races `read()` against a timeout and returns [] on either a rejection or a timeout,
// logging once so the degradation is visible in build output rather than silent. [] is always a SAFE
// return for generateStaticParams here specifically because every one of the four `[slug]` routes that
// call it (regulations/market/operations/research) keeps dynamicParams at its default `true` - an empty
// enumeration just means every slug renders on-demand on first request instead of being pre-baked, exactly
// the same fallback path a route with NO generateStaticParams at all already takes.

const TIMED_OUT = Symbol("static-params-fallback:timed-out");

/**
 * @param {() => Promise<string[]>} read the live slug read (e.g. `() => getPublicSurfaceSlugs("regulations")`)
 * @param {{timeoutMs?: number, warn?: (msg: string) => void, route?: string}} [opts]
 * @returns {Promise<string[]>}
 */
export async function slugsOrEmpty(read, { timeoutMs = 10000, warn = console.warn, route } = {}) {
  const routeLabel = route ?? "(unnamed route)";
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  // Wrapped in Promise.resolve().then(read) (not called bare) so a SYNCHRONOUSLY-throwing `read` is caught
  // by the same try/catch below as a rejected one, never an uncaught throw before Promise.race is reached.
  const readPromise = Promise.resolve().then(read);
  // If `read()` rejects AFTER the timeout has already won the race, nothing else ever awaits readPromise's
  // own outcome - without this, that would surface as an unhandled-rejection warning even though this
  // function already handled the (slower) failure via the timeout branch below.
  readPromise.catch(() => {});

  try {
    const result = await Promise.race([readPromise, timeoutPromise]);
    if (result === TIMED_OUT) {
      warn(
        `generateStaticParams for ${routeLabel}: slug read exceeded ${timeoutMs}ms - falling back to [] for ` +
          `this build. The route still renders on demand via dynamicParams; only build-time pre-baking is skipped.`,
      );
      return [];
    }
    return Array.isArray(result) ? result : [];
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    warn(
      `generateStaticParams for ${routeLabel}: slug read failed (${cause}) - falling back to [] for this build. ` +
        `The route still renders on demand via dynamicParams; only build-time pre-baking is skipped.`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}
