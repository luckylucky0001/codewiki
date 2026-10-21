#!/usr/bin/env python3
"""Ground truth for questions-elementx-arch.json, computed from the raw Gradle build
files of element-x-android (independent of kb's extractors).

    python3 -I bench/agent-qa/elementx-groundtruth.py <element-x-android checkout>
"""
import os, re, sys
from collections import defaultdict

root = sys.argv[1]
norm = lambda s: s.replace('-', '').replace('_', '').lower()
mods = {}  # ':a:b' -> dir
for d, sub, files in os.walk(root):
    sub[:] = [s for s in sub if not s.startswith('.') and s not in ('build', 'node_modules')]
    if 'build.gradle.kts' in files and d != root:
        rel = os.path.relpath(d, root)
        if rel.startswith(('plugins', 'tools')):
            continue
        mods[':' + rel.replace(os.sep, ':')] = d
by_norm = {norm(m): m for m in mods}
deps = {}
for m, d in mods.items():
    txt = open(os.path.join(d, 'build.gradle.kts'), encoding='utf-8').read()
    out = set()
    for acc in re.findall(r'\bprojects((?:\.[A-Za-z0-9]+)+)', txt):
        key = norm(':' + acc[1:].replace('.', ':'))
        if key in by_norm:
            out.add(by_norm[key])
    for p in re.findall(r'project\("(:[^"]+)"\)', txt):
        if p in mods:
            out.add(p)
    out.discard(m)
    deps[m] = out
rev = defaultdict(set)
for m, ds in deps.items():
    for x in ds:
        rev[x].add(m)

print('modules', len(mods))
print('E1 :features:login:impl deps', len(deps[':features:login:impl']), sorted(deps[':features:login:impl']))
print('E2 dependents of :libraries:qrcode', sorted(rev[':libraries:qrcode']))
impl = {m: len(ds) for m, ds in deps.items() if m.startswith(':features:') and m.endswith(':impl')}
top = sorted(impl.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
print('E4 feature impl with most project deps', top)
print('E5 dependents of :libraries:matrix:api', len(rev[':libraries:matrix:api']))
call = mods.get(':features:call:impl')
print('E3 :features:call:impl kotlin files', sum(len([f for f in fs if f.endswith('.kt')]) for _, _, fs in os.walk(os.path.join(call, 'src/main'))))
