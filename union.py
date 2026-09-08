#!/usr/bin/env python3
"""Resolve conflict markers in an append-only document as a UNION: both sides kept whole,
HEAD first then the incoming side. Used for DEVIATION-LOG.md, session-log.md, package.json
and every other additive-union file in a fold. Prints how many hunks it unioned per file."""
import re, sys

for path in sys.argv[1:]:
    t = open(path).read()
    n = 0
    def rep(m):
        global n
        n += 1
        ours, theirs = m.group(1), m.group(2)
        if ours.strip() and theirs.strip() and ours.strip() == theirs.strip():
            return ours
        return ours + theirs
    t2 = re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", rep, t, flags=re.S)
    open(path, "w").write(t2)
    print(f"{path}: {n} hunks unioned")
