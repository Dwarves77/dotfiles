// RD-37-charset-aware-decode: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-37-charset-aware-decode',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 22: Re-grounds never destroy (non-destructive-replace)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Raw HTTP response bytes are decoded to text with the source\'s DECLARED charset (Content-Type header > HTML <meta charset> > UTF-8 default), never a hardcoded UTF-8. A Latin-1 (ISO-8859-1 / windows-1252) government page decoded as UTF-8 corrupts every accented character to the replacement char U+FFFD (mojibake) — permanently, before the grounder sees it — so no original-language span matches and every fact drops to a GAP (Brazil Lei 12.305: 55 FACT -> 0). This is the paired root cause of the non-EN destruction: the extraction never failed on the model; the BYTES were wrong. Cured in the pipeline (the working-artifact fix), single decode site.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Raw response bytes are decoded with the source\'s declared charset, never a hardcoded UTF-8',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/charset-decode.test.mjs'],
    residual: 'charset-decode.mjs (pure: charsetFromContentType / charsetFromMeta / normalizeCharsetLabel / decodeHtmlBytes) is red-then-green goldened on the Brazil planalto.gov.br class — the SAME Latin-1 bytes decode to correct Portuguese with the declared charset and to mojibake as utf-8; header-charset, meta-charset, and correct-utf-8-stays-correct all covered. Wired at the single raw-bytes decode site (directFetchClean in canonical-pipeline.ts, the direct-HTTP transport), tsc-checked. NAMED RESIDUAL: the Browserless transport returns already-decoded UTF-8 (Browserless handles charset at render), so it needs no change; a mis-declared-charset page (header lies) is a rare residual a charset-sniff heuristic would close, deferred (declared charset is right for the gov-site class that caused the incident). Existing mojibake-corrupted holdings (Brazil) require a RE-FETCH under the fix — parked in the paid queue with the re-ground.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
