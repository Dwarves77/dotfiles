# 2026-10-01, Lane R2 (OFFICIALNESS-MOAT)

## Scope

Remediation plan `docs/plans/remediation-plan-2026-09-30.md` (on `origin/audit/consolidation` at the
time of this lane, not yet merged to master) section "2. Fix the anti-fabrication moat no-op", closing
finding CF-BROKEN-1 / A3B-07 (`src/lib/sources/officialness.mjs`, `splitBlocks()`). Write set:
`officialness.mjs`, `officialness.test.mjs`, this file.

## Finding status: [REFUTED]

The dispatch, A3B-07, and CF-BROKEN-1 all state that `splitBlocks()` ends in `.split("")`, splitting the
string into individual characters, which would make STEP 2's link/text-density drop a structural no-op.

Read the file in full first (full-read rule, lane-common-contract). The committed source at
`origin/master` (`db4c14d9`, and at the dispatch's own HEAD) does **not** contain a literal empty-string
split. It contains:

```js
.replace(/<\/(p|li|ul|ol|div|section|article|main|tr|table|h[1-6]|blockquote|dd|dt|figcaption)\s*>/gi, "\u0001")
.replace(/<br\s*\/?>/gi, "\u0001")
.split("\u0001");
```

`\u0001` (a control character that cannot occur in html text) is the delimiter, exactly the shape of fix
the dispatch asked for ("insert a delimiter before the closing-tag replace ... so STEP 2's ... drop can
fire on multi-character content"). The delimiter is invisible in a terminal/editor and in the Read tool's
rendering, which is almost certainly how the audit's own review produced the `.split("")` transcription:
a visual read of the file (or a copy/paste through a tool that drops control bytes) shows empty quotes
where a `\u0001` byte actually sits.

Verified three independent ways, [CONFIRMED] by each:

1. **Byte-level read of the git blob**, not a rendered view: `git show HEAD:fsi-app/src/lib/sources/officialness.mjs`
   piped through `JSON.stringify` in Node shows `\u0001` between the quotes, not an empty string. Checked
   at `HEAD` (`db4c14d9`) and at both commits that ever touched this function, `8c8d4c1a` and `cd4ff48e`
   from 2026-07-06: the delimiter has been there since the function's introduction, it was never "fixed"
   mid-flight, it was simply always correct and mis-transcribed by the audit.
2. **Direct execution**: `officialnessOf()` run against a crafted `<ul class="quick-links">` block (a
   class that does not match `structuralStrip()`'s menu/breadcrumb/cookie/banner/sidebar/footer/skip-link
   keyword regex, so it reaches STEP 2 unstripped) drops the link-list anchor text from `cleanBody` and
   keeps the surrounding prose: the correct, already-working behavior.
3. **Attack, by the operator's own standard (CLAUDE.md rule 15, "a guard is proven by attack, not by
   presence")**: wrote a throwaway copy of the module (never the tracked file) with `splitBlocks()`
   reverted to the literal `.split("")` the audit described, pointed a throwaway copy of the test file at
   it, and ran `node --test`. Result: 5 of 8 tests fail, including both new fixtures below, with
   `cleanBody` showing the exact character-spaced corruption the audit's own `node -e` repro described
   (reproduced verbatim as `"< ! d o c t y p e ... < u l c l a s s = \" q u i c k - l i n k s \" > ..."`).
   This proves two things at once: the audited defect shape is real and would break the moat if it
   existed, and the tracked module does not have that shape today. Both throwaway files were deleted
   after the run; `git status --short` before and after shows only `officialness.test.mjs` modified,
   `officialness.mjs` untouched throughout.

**Correction recorded in place (CLAUDE.md rule 13 corollary):** CF-BROKEN-1 (consolidated audit) and
A3B-07 (`docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md`, both on `origin/audit/consolidation`) should be
amended from `[CONFIRMED, by repro]` to `[REFUTED]` with this entry cited as the re-verification. This
lane's write set does not include the audit files (lane-common-contract: "a lane never edits a file under
`docs/audits/`"), so the correction is recorded here for the coordinator to fold back, per that same
contract clause ("the coordinator's close lane folds the recorded statuses into the audit").

## What was still built: the regression coverage the finding asked for

Even though no production fix was needed, the dispatch's acceptance test asked for fixture coverage this
module genuinely lacked (A3B-07's own text: "`officialness.test.mjs`'s RED-1/RED-2/GREEN fixtures all
wrap chrome in `<nav>`/`<header>`/`<footer>` ... no shipped test exercises a link-list/menu block outside
those containers"). That observation about missing COVERAGE is correct independent of the splitBlocks
misreading, so two fixtures were added to `officialness.test.mjs`:

1. **"A3B-07 regression: un-wrapped quick-links list (non-keyword class) dropped by STEP 2 density
   gate"**: a `<ul class="quick-links">` block (not caught by `structuralStrip()`'s keyword regex)
   between two real `Article N` paragraphs. Asserts the link-list anchor text is absent from `cleanBody`
   and both paragraphs survive. This is the exact fixture class the audit named and the dispatch asked
   for, now present and green against the real module.
2. **"legitimate paragraph with one inline link is NOT dropped by STEP 2"**: one `<a>` inside a long
   obligation paragraph. Asserts the link text and the surrounding sentence both survive, proving STEP 2's
   density gate does not over-fire on ordinary prose that happens to carry one citation link.

No change to `officialness.mjs` itself. `splitBlocks()`'s header comment was left as-is (no bug-history
note added, since there is no bug in this history to document: the function has always used the
`\u0001` delimiter).

## Consumers traced (`grep officialnessOf cleanBodyOf` across `fsi-app/src` and `fsi-app/scripts`)

- `fsi-app/src/lib/agent/canonical-pipeline.ts:88,1822`: imports `officialnessOf`; calls it at line 1822
  (`officialnessOf(s.text, hostOf(s.url), { hostTier: s.tier, floorTier: itemFloor })`) inside the 4d gate
  integration the module's own header describes.
- `fsi-app/src/lib/sources/target-match.mjs`: comment-only reference, no call.
- `fsi-app/scripts/lib/free-pass.mjs:22,61`: imports and calls `officialnessOf` as the second leg of the
  free-pass primary-instrument check.
- `fsi-app/scripts/sources/inaccessible-triage.mjs:73,268,319`: imports `officialnessOf`, dependency-
  injects it as `officialnessOfFn` (default `officialnessOf`) into the triage pipeline, called at line 319.
- `cleanBodyOf()` is not exported; its only caller is `officialnessOf()` in the same file. No external
  consumers.

None of these call sites needed any change, since the module's behavior is unchanged (because it was
never broken).

## Tests run (CI-parity: no-npm resolver glob, `SUPABASE_*` unset)

```
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_ANON_KEY= node --test src/lib/sources/officialness.test.mjs
```

```
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

Attack run (throwaway files, deleted after, never committed): 5 of 8 fail against the audited defect
shape, including both new fixtures, proof the new coverage is load-bearing, and proof the real module
does not have the defect.

## UX compliance

Not applicable. No `.tsx`/`.css` touched; this lane is a pure `.mjs` library fix/verification plus its
colocated `node --test` file.

## Open items

- The coordinator should amend CF-BROKEN-1 and A3B-07 in place to `[REFUTED]` (rule 13 corollary), citing
  this file, in `docs/audits/audit-consolidated-2026-09-30.md` and
  `docs/audits/app-audit-a3b-lib-n-z-2026-09-30.md` (both on `origin/audit/consolidation`, outside this
  lane's write set). [CLOSED: PR 872]
- Lane 2 of the remediation plan can close with "no code change required; finding refuted; regression
  coverage added" rather than "fixed." [NOT-WORK: fact, no action]
