# forward-events family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`forward-events`, registered over `src/lib/forward-events/extract-forward-events.mjs` (moved there from
`scripts/forward-events/` in lane FIX, 2026-09-01, once the intake mint chokepoint needed to import it as
a runtime `src/lib` module): a family whose "runs" are neither a mint batch, a screen round, a fetch-drain
lane, nor a meta-harness wave, but a fifth shape of its own, one extraction pass over a defined corpus
slice, pulling forward-looking-obligation events (a date, a kind, a source span) out of source text;
never a mint (nothing is minted) and never a fetch (nothing is fetched).

**forward-events's standing metric** (build plan section 2's "measurement, not assertion," per family):
*extraction precision*, of the emitted events a human hand-checked against their source text, the
fraction whose date, kind, and span all match, over events checked, not over all events emitted, since a
run over a large corpus slice checks a sample, not the whole population (same "checked, not emitted"
honesty `screen`'s ambiguous rate and `mint`'s validator-pass rate already apply to their own
denominators), plus *coverage*: of the items in the run's corpus slice whose brief carries
forward-obligation language (a renewal date, a notice period, a sunset clause, whatever the family's own
extraction protocol defines as in-scope), the fraction with at least one extracted event. Precision
without coverage would hide a harness that only ever finds the easy events; coverage without precision
would hide one that emits noise to inflate its hit rate, the two are reported together for exactly that
reason, the same pairing `screen`'s ambiguous rate and operator-overturn rate serve for that family.
