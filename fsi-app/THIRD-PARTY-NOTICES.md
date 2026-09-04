# Third-party notices

This file records third-party code vendored (in modified/ported form) into `fsi-app/`, per license
requirement. It is additive: append a new section per vendored source; never remove an existing one
while its ported code remains in the tree.

---

## mreflow/control-center — `lib/sitemap.ts`, `lib/feed-discovery.ts`

**Where used:** `src/lib/sources/sitemap-walk.mjs`, `src/lib/sources/feed-discovery.mjs` (lane SITEMAP,
2026-09-04). Ported behaviors are cited function-by-function in each file's own header comment: response-
byte bounding, the document/entry fetch budgets, source-path scoping (`sourceContentPath` /
`isUrlWithinSourcePath` / `filterSitemapEntriesForSource`), the deferred-baseline-on-partial-coverage
snapshot rule, and feed-document/feed-link detection (`isFeedDocument`, `discoveredFeedLinks`). Converted
from TypeScript to dependency-free, pure, dependency-injected `.mjs` (no `fast-xml-parser`, no Next.js/
server/file-store code) to match this repo's existing walker modules (`register-walk.mjs`, `feed-walk.mjs`).
Not ported: `parseFeed`/`observeUndatedFeedStories` (this repo's own idempotent candidate ledger already
absorbs what that logic exists to prevent — see `feed-discovery.mjs`'s header) and every Next.js/server/
local-file-store part of `lib/server/rss.ts` and `writeFileAtomically`.

**License:** MIT

```
MIT License

Copyright (c) 2026 Matt Wolfe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
