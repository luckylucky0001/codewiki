# codewiki · ingest

Docs are low-trust raw sources. Nothing from a doc becomes wiki knowledge until a claim is
checked against the code and anchored to symbols.

## Prerequisite: is the repo initialized?

- No `codewiki.yaml` at the repo root: run `kb init` once. It auto-detects the android/ios/harmony
  roots (also root-level Gradle/Xcode/HarmonyOS projects and KMP); nothing needs hand-editing.
- Source queries (`kb routes`, `kb lint-tid`, `kb parity`, `kb scan`, `kb anchor`) also work without it
  (zero-config mode, noted on stderr, writes nothing). Wiki commands (`compound`, `ingest`, `verify`,
  `status`, `search`, `get`, `context`, `conflicts`) need the wiki: if `wiki/` is missing, build it once with
  `kb init`, then `kb compound --llm template` (deterministic, no LLM cost, seconds) and continue.

## Steps

```bash
kb discover-docs --json > /tmp/docs.json      # classify: spec|design|tasks|adr|agent-guide|readme|doc
kb ingest --manifest /tmp/docs.json --kinds spec,adr,agent-guide,doc --llm template
kb ingest --manifest /tmp/docs.json --llm claude --fallback   # semantic check (costs tokens)
kb get _conflicts                              # read the result
```

- `kb ingest <files...>` also works for ad-hoc legacy docs (copied to `wiki/raw/docs/`).
- `--dry-run` lists extracted claims (ids are stable: `FR-001`, `LOGIN-R1.2`, `<DOC>-<hash6>`).

## Claim statuses

| status | meaning | promoted? |
|---|---|---|
| verified | code supports it; anchors recorded | yes (requirements.json + page) |
| conflict | code disagrees → **code wins**, listed in `pages/_conflicts.md` | as a warning |
| unverifiable | no evidence either way | no |

## Writer mode (`codewiki 任务 ... kind: conflicts`)

Write only `.kb/ingest/verdicts.json`:

```json
{"version":1,"claims":[{"id":"FR-002","status":"conflict","anchors":["ios://...#CartViewModel.maxCartItems"],"route_ids":["cart"],"evidence":["代码上限 99，文档写 10"]}]}
```

- `verified` requires at least one anchor from the prompt; otherwise use `unverifiable`.
- Judge semantics (e.g. "login uses SMS code" vs. a username/password `login()`), not just names.
- The CLI renders `pages/_conflicts.md` and `facts/requirements.json`; do not write them.

See [conventions.md](conventions.md) for the discovery rules.
