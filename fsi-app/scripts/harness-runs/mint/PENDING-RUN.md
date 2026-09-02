# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed (2026-09-02, after population-turn run #9 — `mint-run-011`, 43/43 minted verified):**
`src/lib/intake/record-facts.mjs` delimits verbatim spans in claim text and the record brief with
guillemets («…») instead of straight quotes. The one payload of 44 that failed the kit did so on
`prose_unicode_substitution`: the template's straight `"` sat directly against a span that opens with the
source's own curly `“` (UK SI 2018/129), and the validator's unicode-integrity scan read the delimiter as
a transcription slip. Guillemets belong to no substitution class. `validate-mint-payload.mjs` is unchanged;
the change is to what a record payload's prose looks like, so it moves the family hash honestly.

**harness_version at write time:** `sha256:36ee951c38941943`

**The planned run that supersedes this marker:** the next `population-turn` apply dispatch, whose
artifact re-hashes to this value and lands as `mint-run-012.json`, at which point this marker is
stale-by-match and must be deleted per F28's reverse-audit.
