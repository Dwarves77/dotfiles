import { NextResponse } from "next/server";

/**
 * In-memory rate limiter.
 * 60 requests per minute per authenticated user.
 *
 * Uses a sliding window counter stored in a Map.
 * In production with multiple instances, replace with
 * Redis or Supabase-backed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

// In-memory store — keyed by user ID
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries (every 5 minutes)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

/**
 * Check rate limit for a user. Returns null if allowed,
 * or a 429 response if the limit is exceeded.
 */
export function checkRateLimit(userId: string): NextResponse | null {
  cleanup();

  const now = Date.now();
  const entry = store.get(userId);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    console.warn(
      `[RATE LIMIT] User ${userId} exceeded ${MAX_REQUESTS} requests/min. ` +
      `Count: ${entry.count}. Retry after: ${retryAfter}s.`
    );

    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        limit: MAX_REQUESTS,
        window: "60s",
        retry_after: retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Get rate limit headers for a successful response.
 */
export function rateLimitHeaders(userId: string): Record<string, string> {
  const entry = store.get(userId);
  if (!entry) return {};
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS),
    "X-RateLimit-Remaining": String(Math.max(0, MAX_REQUESTS - entry.count)),
    "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
  };
}
