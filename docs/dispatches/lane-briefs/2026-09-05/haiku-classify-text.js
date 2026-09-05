export const meta = {
  name: 'haiku-classify-text',
  description: 'Two Haiku lanes classify exported portal_link_candidates batches OFFLINE from the page text the runtime already fetched (ledger-consume --export-candidates --with-text): no fetching, the exact first-fetch prompt, verdict entries per the ledger-verdicts schema',
  phases: [{ title: 'Classify' }],
}
phase('Classify')
const P = (n) => `You are Haiku classification lane LEDGER-HAIKU-${n} on Caro's Ledge. You classify portal_link_candidates rows OFFLINE for the ledger-consume runtime ($0; operator ruling 2026-09-04: "stop offering API when you have a free option with Haiku"). You write ONLY /root/work/ledger/verdicts/batch-${n}.json. No fetching of any kind (no WebFetch, no curl, no browser): the page text is already in the input, fetched by the runtime's own fetcher. Touch nothing else, no git.

INPUT: /root/work/ledger/text/batch-${n}.json (Read tool) — a JSON array of candidates, each {candidate_id, url, source_id, anchor_text, first_seen_at, source_name, source_category, source_tier, text, fetched_chars, fetch_ok:true}. "text" is the page's extracted text (up to 6,000 chars), the same excerpt the live classifier receives.

THE PROMPT YOU APPLY, VERBATIM: read /root/work/ledger/system-prompt.txt in full (FIRST_FETCH_HAIKU_SYSTEM_PROMPT from fsi-app/src/lib/llm/first-fetch-classify.ts, prompt_version "sha256:70ca104246d8bb95"). For each candidate you build exactly the live user message:
Source URL: <url>
Source id: <source_id>
Source tier: <source_tier or "unknown">
Source category: <source_category or "unknown">
Content excerpt:
---
<text>
---
Output the JSON object only.
and you answer as the classifier, following the system prompt exactly: entity_verdict FIRST ("portal" for navigational / institution landing / index / listing / "latest news" hubs and cookie-wall/login shells; "specific_document" only when the excerpt is one specific instrument or finding; "uncertain" when you cannot tell; NEVER guess specific_document to be safe); item_type null unless specific_document; the domain routing table; surface_tags rules; empty arrays for portal/uncertain. Read the text, do not classify from the URL pattern alone; if the text is a cookie banner / login wall / "browser not supported" shell with no content behind it, that is "uncertain" with rationale saying so.

OUTPUT batch-${n}.json: a JSON array, one entry per input candidate (all of them), each exactly:
{"candidate_id": "<from input>", "url": "<from input, unchanged>", "entity_verdict": "specific_document"|"portal"|"uncertain", "item_type": <string or null>, "domain": <integer or null>, "surface_tags": [...], "relevance": <integer 0-100 or null>, "severity": <string or null>, "priority": <string or null>, "urgency_tier": <string or null>, "topic_tags": [...], "jurisdictions": [...], "title_candidate": "<string>", "summary": "<string>", "rationale": "<one or two sentences naming what in the text decided entity_verdict>", "confidence": <number 0-1>, "classified_by": "session-haiku", "classified_at": "<ISO 8601 UTC now>", "prompt_version": "sha256:70ca104246d8bb95"}
Write with the Write tool every ~15 candidates (rewrite the whole array so far), valid JSON only; at the end verify: node -e 'const a=JSON.parse(require("fs").readFileSync("/root/work/ledger/verdicts/batch-${n}.json","utf8")); console.log(a.length)' and the count must equal the input count. REPORT (short): counts by entity_verdict, by item_type, the hosts, and anything that looked like it needed a human ruling.`
const [a, b] = args
const A = agent(P(a), { label: `LEDGER-HAIKU-${a}`, phase: 'Classify', model: 'haiku' })
const B = b ? agent(P(b), { label: `LEDGER-HAIKU-${b}`, phase: 'Classify', model: 'haiku' }) : Promise.resolve(null)
const [ra, rb] = await Promise.all([A, B])
return { [a]: ra, [b || 'none']: rb }
