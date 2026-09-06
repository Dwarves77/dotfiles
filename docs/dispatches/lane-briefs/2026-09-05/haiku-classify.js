export const meta = {
  name: 'haiku-classify',
  description: 'Two Haiku lanes classify portal_link_candidates batches offline ($0 session path) into ledger-consume verdict entries using the exported first-fetch prompt verbatim',
  phases: [{ title: 'Classify' }],
}
phase('Classify')
const P = (n) => `You are Haiku classification lane LEDGER-HAIKU-${n} on Caro's Ledge. Your job is $0 offline classification of portal_link_candidates rows for the ledger-consume runtime (operator ruling 2026-09-04: "stop offering API when you have a free option with Haiku"). You write ONLY two files: /root/work/ledger/verdicts/batch-${n}.json and /root/work/ledger/verdicts/unfetched-${n}.json. Touch nothing else, no git.

INPUT: /root/work/ledger/batch-${n}.json — a JSON array of candidates {candidate_id, url, source_id, anchor_text, first_seen_at, source_name, source_category, source_tier}. Read it with the Read tool.

THE PROMPT YOU MUST APPLY, VERBATIM: read /root/work/ledger/system-prompt.txt in full (it is FIRST_FETCH_HAIKU_SYSTEM_PROMPT exported from fsi-app/src/lib/llm/first-fetch-classify.ts; its content hash is prompt_version "sha256:70ca104246d8bb95"). For each candidate you build the exact user message the live classifier builds:
Source URL: <url>
Source id: <source_id>
Source tier: <source_tier or "unknown">
Source category: <source_category or "unknown">
Content excerpt:
---
<page text, first 6000 characters>
---
Output the JSON object only.
and you answer it yourself as the classifier, following the system prompt's rules exactly (entity_verdict FIRST; "portal" for navigational/institution-landing/index/listing pages; "specific_document" only when the excerpt is one specific instrument or finding; "uncertain" when you cannot tell; NEVER guess specific_document to be safe; item_type null unless specific_document; the domain routing table; surface_tags rules).

FETCHING: for each candidate call WebFetch on the url with the prompt "Return the page's <title> and then the main body text verbatim (not a summary), up to 6000 characters. If the page is a listing/index/navigation page, say so and return the visible headings and link texts verbatim." Process candidates one at a time in file order. A fetch that fails, returns an error page, or yields fewer than 200 characters of content is NOT classified: append {candidate_id, url, reason} to unfetched-${n}.json and move on (the driver leaves such rows as candidates for a later batch; never invent a verdict for a page you could not read). Do not retry more than once. Do not fetch anything other than the candidate URLs.

OUTPUT batch-${n}.json: a JSON array, one entry per classified candidate, each exactly:
{"candidate_id": "<from input>", "url": "<from input, unchanged>", "entity_verdict": "specific_document"|"portal"|"uncertain", "item_type": <string or null>, "domain": <integer or null>, "surface_tags": [...], "relevance": <integer 0-100 or null>, "severity": <string or null>, "priority": <string or null>, "urgency_tier": <string or null>, "topic_tags": [...], "jurisdictions": [...], "title_candidate": "<string>", "summary": "<string>", "rationale": "<one or two sentences: what on the page decided entity_verdict>", "confidence": <number 0-1>, "classified_by": "session-haiku", "classified_at": "<ISO 8601 UTC now>", "prompt_version": "sha256:70ca104246d8bb95", "fetched_chars": <integer>}
Write the file incrementally (every ~20 candidates, rewrite the whole array so far) so an interruption loses little; write valid JSON only (use the Write tool; verify at the end with: node -e 'JSON.parse(require("fs").readFileSync("/root/work/ledger/verdicts/batch-${n}.json","utf8"))' and the same for unfetched). Every candidate in the input must end up in exactly one of the two files.

REPORT (short): counts by entity_verdict, count unfetched with the top three reasons, the hosts you saw, and anything that looked like it needed a human ruling.`
const [a, b] = args
const A = agent(P(a), { label: `LEDGER-HAIKU-${a}`, phase: 'Classify', model: 'haiku' })
const B = agent(P(b), { label: `LEDGER-HAIKU-${b}`, phase: 'Classify', model: 'haiku' })
const [ra, rb] = await Promise.all([A, B])
return { [a]: ra, [b]: rb }
