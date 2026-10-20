#!/usr/bin/env python3
"""Ground truth for questions-cases-agg.json, computed from the raw HarmonyOS
Cases source (not from kb facts). Usage: python3 -I cases-groundtruth.py <Cases checkout>"""
import collections, glob, json, os, re, sys

root = sys.argv[1]
os.chdir(root)
skip = lambda p: any(x in p for x in ("/build/", "oh_modules", "node_modules"))
load = lambda p: json.loads(re.sub(r"//[^\n]*", "", open(p, encoding="utf-8", errors="ignore").read()))
rmaps = [p for p in glob.glob("**/router_map.json", recursive=True) if not skip(p)]
per, dangling, with_tid = {}, [], []
for p in rmaps:
    base = p.split("/src/main/")[0]
    entries = load(p).get("routerMap", [])
    per[p] = len(entries)
    for e in entries:
        src = os.path.join(base, e.get("pageSourceFile", ""))
        text = open(src, encoding="utf-8", errors="ignore").read() if os.path.isfile(src) else ""
        if not re.search(r"function\s+" + re.escape(e.get("buildFunction", "")) + r"\b", text):
            dangling.append((e.get("name"), e.get("buildFunction"), src))
        if re.search(r"\.id\(\s*['\"`]", text):
            with_tid.append(e.get("name"))
print("G1 router_map files:", len(rmaps), "entries:", sum(per.values()))
for p, n in sorted(per.items(), key=lambda x: -x[1]):
    print("   ", n, p)
print("G2 dangling buildFunction:", dangling)
print("G3 pages whose source sets a literal testID:", with_tid)
req = sorted(p for p in glob.glob("**/*.ets", recursive=True) + glob.glob("**/*.ts", recursive=True)
             if not skip(p) and ".request(" in open(p, encoding="utf-8", errors="ignore").read())
print("G4 files calling .request(:", len(req))
for p in req:
    print("   ", p)
cnt = collections.Counter()
for p in glob.glob("**/*.ets", recursive=True):
    if not skip(p):
        cnt.update(re.findall(r"\.id\(\s*['\"]([^'\"]+)['\"]\s*\)", open(p, encoding="utf-8", errors="ignore").read()))
print("G5 most used literal testIDs:", cnt.most_common(3))
