#!/usr/bin/env python3
"""Structurally union an audit spec that two lanes both appended rows to.

A design spec is a tree of named check objects. Git conflicts on it are textual (both lanes
appended at the same anchor, or one lane rewrote the file's whitespace), never semantic, so this
merges by NAME: every child / forbid entry the incoming side has and the current side lacks is
appended, matching entries recurse, and notes are unioned. Nothing is ever dropped or overwritten,
so a row one lane added cannot be silently lost to the other lane's formatting.

usage: specmerge.py <incoming-rev> <spec path> [<spec path> ...]
"""
import json, subprocess, sys

def show(rev, path):
    r = subprocess.run(["git", "show", f"{rev}:{path}"], capture_output=True, text=True)
    r.check_returncode()
    return json.loads(r.stdout)

def merge(a, b):
    for key in ("children", "forbid"):
        bl = b.get(key) or []
        if not bl:
            continue
        al = a.setdefault(key, [])
        byname = {c.get("name"): c for c in al if isinstance(c, dict)}
        for c in bl:
            n = c.get("name")
            if n in byname:
                merge(byname[n], c)
            else:
                al.append(c)
    for n in b.get("notes", []) or []:
        if n not in (a.get("notes") or []):
            a.setdefault("notes", []).append(n)
    return a

def count(d):
    n = len(d.get("children") or []) + len(d.get("forbid") or [])
    for c in (d.get("children") or []):
        n += count(c)
    return n

if __name__ == "__main__":
    rev, paths = sys.argv[1], sys.argv[2:]
    for path in paths:
        ours = show("HEAD", path)
        before = count(ours)
        merged = merge(ours, show(rev, path))
        open(path, "w").write(json.dumps(merged, indent=2, ensure_ascii=True))
        print(f"{path}: {before} -> {count(merged)} checks")
