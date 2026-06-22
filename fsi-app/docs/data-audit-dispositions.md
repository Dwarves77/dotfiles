# Data-audit lane — disposition ledger (Layer C)

**Purpose.** The nightly data-audit lane checks the cross-item / corpus invariants. Before this ledger,
a RED lane was a notification with no consequence — it went red on 7 consecutive nights (2026-06-15 →
06-21) and nothing acted on it; a human was the only catch. That is the enforcement defect this ledger
closes.

**The rule (teeth).** When the lane is RED it reflects the verdict into ONE open `integrity_flags` block
row (`category=data_integrity`, `subject_ref=data-audit-lane`). **Generation preflight HALTS while that
block is open and carries no current dated waiver** (`src/workflows/generate-brief.ts` →
`preflightStep`). Red is cleared in exactly two ways:

1. **Fix → green.** The next lane run passes; the runner resolves the block automatically. (Preferred.)
2. **Dated waiver.** An explicit, expiring acknowledgment recorded BOTH here and on the flag's
   `recommended_actions` as `{ "action": "waiver", "until": "YYYY-MM-DD" }`. A waiver allows generation
   to proceed only until its date; an expired waiver blocks again.

**Time never clears red.** Waking up the next day does nothing. Only a fix or a dated waiver disposes a
red. There is no skip flag and no escape hatch — the only way past is a recorded disposition (so the human
is no longer the catch, and bad corpus state cannot compound under batch pressure).

A waiver is an honest "known red, working on it, until DATE" — not a dismissal. Recurring waivers on the
same check signal a deeper issue to escalate, not to keep waiving.

## Ledger format

Each disposition: the date opened, the failing check(s), the disposition type, the owner, the expiry (for
waivers), and the rationale. Keep newest first.

| Opened | Failing check(s) | Disposition | Until | Owner | Rationale |
|---|---|---|---|---|---|
| 2026-06-21 | unregistered-span-host (1060 vs 841 floor) | waiver | 2026-07-15 | Jason | Pre-existing standing drift, not new. Layer B now stops NEW regressions; this backlog is being cleaned by re-grounding through the gated runner (CSRD first). Waiver covers the cleanup window; revisit at expiry. |

## Notes

- The existing 1060-vs-841 red is **pre-existing drift** the Layer B write-path gate does NOT retroactively
  fix — Layer B only stops *new* regressions. The cleanup (re-ground the null-tier-FACT items through the
  now-gated runner) reduces the standing count honestly; the waiver above covers that window.
- When the cleanup brings the count back to the floor and the lane goes green, the block auto-resolves and
  the waiver is moot — remove it here at that point.
