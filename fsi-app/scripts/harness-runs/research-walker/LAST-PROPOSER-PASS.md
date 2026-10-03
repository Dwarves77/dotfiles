# research-walker: last proposer pass

Read in full: `research-walker-run-001.json`, `research-walker-run-002.json` (both dry/fixture runs,
lane L7, 2026-10-02).

## What the two runs show

Both runs are identical in substance (same fixtures, same gates, same per-item outcomes): 3 of 3 named
grey-lit sources resolve through the institution class table and would_mint; both OpenAlex fixture
candidates with no registered publisher host are correctly rejected `unsourced`. Run 002 additionally
exercised the `--dispatch` CLI path and confirmed it correctly refuses the live/apply gate (kill switch
`RESEARCH_WALKER_ENABLED` unset) and falls back to the same dry fixture run, rather than silently
no-oping or crashing.

## Hypotheses / proposals read from this pair

None warranted yet. Two runs against the SAME fixture set differing only in CLI flag is sufficient to
prove the R14 lift criterion 8 bar ("fired twice, both times by explicit dispatch, both logged to
harness_runs") and the kill-switch gate's refusal path; it is not yet a basis for proposing a harness
change (no defect, no drift, no second input shape to compare against). The next genuinely informative
run is a LIVE run (`--live`, real OpenAlex network read) once the coordinator authorizes one -- that run
would be the first with a different input shape, and a proposer pass over it would be the first with
something new to compare.
