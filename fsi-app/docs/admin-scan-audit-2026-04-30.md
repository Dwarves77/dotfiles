# `/api/admin/scan` Audit

Scope: confirm whether the route exists, was deleted, or was renamed. Identify drift between documented behavior and actual implementation.

## Existence

**Route exists** at `src/app/api/admin/scan/route.ts` (commit history shows it predates the redesign branch — last touched in commits prior to 2026-04-28). Not deleted, not renamed.

The next.js production build registers it as `ƒ /api/admin/scan` (server-side dynamic). Auth gate via `requireAuth()` + `checkRateLimit()` per the project's API security policy.

## Caller(s)

- `src/components/admin/AdminDashboard.tsx:145` — POST trigger from the admin panel UI. Single consumer.

## Documented vs actual behavior — three drifts

### Drift 1: `web_search` tool advertised but not enabled

**Docstring** (line 11):
> Admin-triggered regulatory scan. Uses Claude API with web_search to find new regulations relevant to freight sustainability.

**Code:** the request body to `https://api.anthropic.com/v1/messages` does **not** include a `tools: [{ type: "web_search_20250305", ... }]` parameter and does **not** send the `anthropic-beta: web-search-2025-03-05` header. Claude responds from training knowledge only, not from live web search.

The route name and docstring promise live regulatory monitoring; the implementation provides Claude's static regulatory knowledge. These are different products.

**Impact:** any "new regulation" the route surfaces is bounded by the model's training cutoff. The route cannot fulfill its stated purpose of finding new regulations after that cutoff. Staged updates flowing into `staged_updates` from this route are stale-by-construction.

### Drift 2: Comment says Haiku, code uses Sonnet

**Code** (line 54):
```ts
model: "claude-sonnet-4-6",  // Haiku for scanning — 12x cheaper than Sonnet, fast structured extraction
```

The comment claims Haiku for cost reasons; the model literal is Sonnet. ~$0.05–0.10 per scan instead of the claimed Haiku ~$0.005.

**Impact:** moderate. Cost is borne; correctness is unaffected. But anyone reading the comment to estimate scan cost will be wrong by ~12×.

### Drift 3: CLAUDE.md (pre-f0f7cdf) claimed 4h cooldown — code only has the global 60/min rate limit

**Old CLAUDE.md** said: "`/api/admin/scan` — admin triggered source scan, 4 hour cooldown minimum"

**Code:** only `checkRateLimit(auth.userId)` is invoked, which enforces the 60-requests-per-minute-per-user sliding window (see `src/lib/api/rate-limit.ts`). No 4h cooldown logic exists in the route.

**Impact:** a determined admin clicking Scan repeatedly can issue 60 Sonnet calls per minute (≈$3-6/min). The user-instruction-grade cooldown rule was documented but not implemented.

This drift is partially captured in commit `f0f7cdf` (this branch) — the new AGENT ARCHITECTURE table lists `/api/admin/scan` with rate limit "4h cooldown" still asserted in the column. That row is itself wrong because the cooldown is not implemented. **Self-correcting note for future edit:** change the rate-limit column for `/api/admin/scan` to "60/min standard rate limit; advertised 4h cooldown not yet implemented."

## Suggested resolution path (deferred per branch protocol)

A small set of fixes brings code, docstring, comment, and CLAUDE.md into agreement:

1. **Pick one model.** Either:
   - Switch to Haiku, lower max_tokens, accept faster/cheaper structured extraction (matches comment).
   - Keep Sonnet, fix the comment to say Sonnet (matches scan-quality).
2. **Pick one search posture.** Either:
   - Add `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]` and the `anthropic-beta` header so the route delivers what its name promises.
   - Rewrite the docstring + UI label to "regulatory scan from training knowledge" so users have correct expectations.
3. **Pick one cooldown.** Either:
   - Implement the 4h cooldown via a `last_scanned` row on a `system_state` or `admin_actions` table, gating the route at the top.
   - Drop the "4h cooldown" claim from CLAUDE.md (the f0f7cdf table needs the same edit).

None of these are agent-runtime files, so this branch could absorb the fix. Holding off because the user's instruction was "Audit /api/admin/scan reference. Determine if it exists, was deleted, or was renamed. Report." — Report-only intent.

## Summary

- Exists: yes.
- Deleted: no.
- Renamed: no.
- Three internal drifts (model comment, missing web_search tool, missing cooldown).
- Single UI consumer: `AdminDashboard.tsx`.
- One recently-introduced contradiction in `f0f7cdf` (this branch) — the CLAUDE.md table still claims a 4h cooldown that's not implemented; should be reworded next pass.
