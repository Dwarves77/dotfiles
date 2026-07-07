# E2E Verification — PRs #20–#23

**Ran:** 2026-05-06T01:49:11.319Z
**Base URL:** http://localhost:3000
**Admin user:** a0764ff3-bba8-4442-b0a6-65f054796798

## Summary

- Total: **27**
- Passed: **20**
- Failed: **5**
- Skipped: **2**
- Fail rate: **18.5%**

## Group A: Polish wave fixes (audit verification)

| ID | Test | Verdict | Expected | Actual |
|----|------|---------|----------|--------|
| A1 | UUID slug coverage — every materialized item has legacy_id | PASS | 0 | 0 |
| A2 | ACF dedup — orphan ACF UUID deleted | PASS | 0 | 0 |
| A3 | r10 archived with reason | PASS | is_archived=true AND archive_reason is non-null | is_archived=true, archive_reason="source_url_unverifiable_no_replacement_found" |
| A4 | UUID → slug redirect for live item | FAIL | 307 → /regulations/w4_ca_sb253 | 200 → (no location) |
| A5 | Jurisdiction display shows 'California' on SB 253 | PASS | 'California' present, no 'Jurisdiction: United States' label | California=true, USmislabel=false |
| A6 | Priority vocab — 'IMMEDIATE ACTION' editorial label rendered | PASS | 'IMMEDIATE ACTION' present (CRITICAL not in user-visible <span>) | editorial=true, raw_critical_span=false |
| A7 | Filter chip toggle-to-isolate (browser-only) | SKIP | interactive JS behavior | skipped |
| A8 | Sector-match tooltip text present | PASS | 'matching your sector profile' string present | present |
| A9 | Empty effective-date hidden | PASS | no '—' placeholder paired with EFFECTIVE label | no empty card |
| A10 | AI Ask bar mounted on dashboard | FAIL | 'Ask AI' control text present in DOM | absent |

## Group B: Block C community features (E2E)

| ID | Test | Verdict | Expected | Actual |
|----|------|---------|----------|--------|
| B1 | Create test community group | PASS | group + owner row created | group_id=b33324e3-791a-40a0-a7f3-b69cfc0d7cec |
| B2 | POST /api/community/posts — create top-level post | FAIL | 201 + post.id present | 201; post_id=077f9a59-1f01-4cad-a7ca-bc2a10779059 |
| B3 | GET /api/community/posts — read post back | PASS | 200 + posts[] contains created post | 200; 1 posts; found=true |
| B4 | PATCH /api/community/posts/{id} — edit body | PASS | 200 + body updated to 'Edited test post body' | 200; readback body="Edited test post body" |
| B5 | POST /api/community/posts/{id}/replies — create reply | FAIL | 201 + reply.id present | 201; reply_id=760b53d0-1f4e-47dc-aa5b-fa9495590be7 |
| B6 | GET /api/community/posts/{id}/replies — list replies | PASS | 200 + replies[] contains created reply | 200; 1 replies; found=true |
| B7 | POST /api/community/posts/{id}/reactions — expected 501 | PASS | 501 Not Implemented (documented stub per C5 spec) | 501 |
| B8 | GET /api/community/notifications — list | PASS | 200 + { notifications:[], unread_count:number } | 200; notifications=0; unread=0 |
| B9 | GET /api/community/notifications/preferences | PASS | 200 + prefs object | 200; keys=preferences,channel_status |
| B10 | POST /api/community/moderation/reports — file report | FAIL | 201/200 + report_id present | 200; report_id=19f7d75d-c543-4011-a51b-6cf4684bf28e |
| B11 | GET /api/community/moderation/reports?status=open — list | PASS | 200 + reports[] contains filed report | 200; 1 reports; found=true |
| B12 | POST /api/community/moderation/reports/{id} — dismiss | PASS | 200 + status flipped to 'dismissed' | 200; readback status=dismissed |
| B13 | POST /api/community/posts/{id}/promote — staged kind | PASS | 201 + promotion_id + staged_update_id; staged row in DB | 201; promotion_id=851e8d60-7ff9-410e-85a7-bb77a00107e5, staged_id=e2dc44a1-d69e-42ca-9d98-cd3a85156738, db_row=true |
| B14 | Realtime hook (browser-only) | SKIP | subscribe to realtime channel | skipped |

## Group C: Sanity checks on merged work

| ID | Test | Verdict | Expected | Actual |
|----|------|---------|----------|--------|
| C1 | Migration 044 — integrity-flag retune (≤ 5 unresolved) | PASS | ≤ 5 (was 57; should be ~2 post-retune) | 1 |
| C2 | Migration 045 + EU inserts — 3 EU items present | PASS | 3 | 3 |
| C3 | Community DB has data — group + post counts | PASS | any data (informational) | groups=1, posts=2 |

## Failures

### A4 — UUID → slug redirect for live item

- **Expected:** 307 → /regulations/w4_ca_sb253
- **Actual:** 200 → (no location)
- **Details:** Looked up id=42b8bfee-92ea-4cde-bfe9-a25eb7cb49d9 for legacy_id=w4_ca_sb253

### A10 — AI Ask bar mounted on dashboard

- **Expected:** 'Ask AI' control text present in DOM
- **Actual:** absent
- **Details:** Interactive chat behavior is browser-only; this verifies the component is mounted.

### B2 — POST /api/community/posts — create top-level post

- **Expected:** 201 + post.id present
- **Actual:** 201; post_id=077f9a59-1f01-4cad-a7ca-bc2a10779059

### B5 — POST /api/community/posts/{id}/replies — create reply

- **Expected:** 201 + reply.id present
- **Actual:** 201; reply_id=760b53d0-1f4e-47dc-aa5b-fa9495590be7

### B10 — POST /api/community/moderation/reports — file report

- **Expected:** 201/200 + report_id present
- **Actual:** 200; report_id=19f7d75d-c543-4011-a51b-6cf4684bf28e

## Skipped

- **A7 Filter chip toggle-to-isolate (browser-only)** — Requires browser test (filter chip click handler).
- **B14 Realtime hook (browser-only)** — Requires browser-based realtime channel test. Hooks themselves are pure module imports verified at compile time.
