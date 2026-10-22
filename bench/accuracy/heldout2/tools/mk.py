import json, os, sys
OUT = os.path.join(os.path.dirname(__file__), '..', 'labels')
def S(platform, rid, file, kind, symbol=None, **kw):
    d = {"platform": platform, "route_id": rid, "symbol": symbol or rid, "file": file, "kind": kind}; d.update(kw); return d
def N(platform, symbol, file, reason, **kw):
    d = {"platform": platform, "symbol": symbol, "file": file, "reason": reason}; d.update(kw); return d
def D(platform, scheme, host, path, file, source, **kw):
    d = {"platform": platform, "scheme": scheme, "host": host, "path": path, "file": file, "source": source}; d.update(kw); return d
def T(platform, tid, file, line, **kw):
    d = {"platform": platform, "tid": tid, "file": file, "line": line}; d.update(kw); return d
def A(method, path, file, **kw):
    d = {"method": method, "path": path, "file": file}; d.update(kw); return d
def C(i, text, source, label, evidence, **kw):
    d = {"id": i, "text": text, "source": source, "label": label, "evidence": evidence}; d.update(kw); return d
def write(name, **d):
    for k in ["screens","not_screens","deeplinks","testids","apis","claims"]: d.setdefault(k, [])
    order = ["repo","url","commit","platform_roots","screens","not_screens","deeplinks","testids","apis","claims","notes"]
    out = {k: d[k] for k in order if k in d}; out.update({k: v for k, v in d.items() if k not in out})
    json.dump(out, open(os.path.join(OUT, name + '.json'), 'w'), indent=1, ensure_ascii=False)
    print(name, {k: len(out[k]) for k in ["screens","not_screens","deeplinks","testids","apis","claims"]})

REPOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'repos')
def check(dirname, d):
    """verify every referenced file exists in the clone"""
    root = os.path.join(REPOS, dirname); bad = []
    for k in ["screens","not_screens","deeplinks","testids","apis"]:
        for e in d.get(k, []):
            for f in [e.get('file')] + list(e.get('alt_files', [])):
                if f and not os.path.exists(os.path.join(root, f)): bad.append((k, f))
    if bad: print('MISSING FILES', dirname, bad)
