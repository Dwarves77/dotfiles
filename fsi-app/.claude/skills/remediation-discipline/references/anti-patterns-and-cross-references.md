## Section 8: Anti-Patterns

Six anti-patterns that mean the principle is loaded but not applied:

1. **Instance patches that should have been class fixes.** The Q4 original framing ("just patch the script") before operator redirected to library extraction. Symptom: the patch fits the specific failure but doesn't address the class. The same patch is about to be made again on the next batch script when it fails the same way.

2. **Over-application.** Treating genuinely one-off issues as class problems when 0 signals fire. Creates over-engineering. Data anomalies, one-time migration artifacts, account-specific config edge cases, time-bounded issues do not warrant primitive extraction or rule codification. Use Section 9 boundaries.

3. **Codification before sufficient examples.** Making a rule with one recurrence; insufficient grounding. The rule may not generalize beyond the one case; future dispatches inherit an obligation that doesn't match their reality. Wait for the 2nd confirmed instance.

4. **Skill scope creep.** Adding categories to this skill beyond what worked examples justify. The skill's worked-example library grows with evidence, not speculation. Section 4.5 captures emerging patterns; promotion to Section 4 requires a full worked example demonstrating the class fix.

5. **Reinventing primitives (concrete).** Any time an agent writes retry logic, Pool configuration, progress reporting, or rate limiting inline in a new batch script, that is reinventing. Library reference goes in the dispatch brief at scoping time. If the primitive doesn't exist for the use case, the dispatch first extracts the primitive into the library, then consumes it. Same applies to URL canonicalization (helper exists at `src/lib/sources/url-canonicalize.ts`), compatibility shim patterns (migration 094 shape is the template), and any other primitive in this skill's example library.

6. **Premature primitive extraction (counterpart to anti-pattern 3).** Extracting a primitive into the library before the second instance exists. Same evidence threshold as codification: 2+ confirmed instances before extraction. Speculative primitive design often misses generalization needs because there is only one consumer to validate the abstraction against.

## Section 10: Cross-References

- **`sprint-followups-discipline`**: owns the binding rules; remediation-discipline rules land here as named rules (Remediation-discipline load-trigger as 6th named rule; Batch-script resilience rule as 7th). The Sweep-discipline rule (4th named) and Source-credibility-model load-trigger rule (5th named) are remediation-discipline class fixes from earlier in this session.
- **`source-credibility-model`**: domain-specific; remediation-discipline applies to credibility failures the same as anywhere else. Worked example 6 of this skill references the source-credibility-model encoding as a proactive class fix.
- **`caros-ledge-platform-intent`**: platform architecture; doesn't overlap. Value Delivery Check binding on remediation dispatches via this skill's load.
- **`environmental-policy-and-innovation`**: domain content; doesn't overlap. Integrity rule applies to remediation work (no invented worked examples; concrete instances only).
- **`fsi-app/scripts/lib/batch-primitives.mjs`**: the concrete library that implements Section 5's primitive extraction pattern for batch-script resilience. Reference implementation.
- **`docs/sprint-1/followups.md` OBS-51**: captures the Q4 sample-scale-validation discipline note; OBS-51 Resolution section points back at this skill.
