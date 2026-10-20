---
name: kb-compound
description: Incrementally update the code-anchored LLM Wiki after code changes (a merge to master, a finished feature branch, or when `kb status` reports stale pages). Runs `kb compound` (scan → graph diff → plan → write pages within an explicit write set → verify → atomic publish) and, when invoked as the per-task writer, writes one wiki page whose frontmatter anchors (symbol id + hash) match the current code. Use for Android Kotlin/Java, iOS Swift and HarmonyOS ArkTS monorepos managed with codewiki.
---

# kb-compound

Keep `wiki/` provably in sync with the code. The CLI does everything deterministic
(parsing, diffing, planning, verification, publishing); you only write prose inside
the write set you are given.

## When to use

- After a merge to `master`/`main` (CI does this automatically, see `.github/workflows/compound.yml`).
- `kb status` exits 1 (stale pages) or `kb verify` fails with `E_ANCHOR_STALE`.
- You are invoked by `kb compound --llm claude` with a task prompt (cwd = staging wiki).

## Orchestrator mode (you run the pipeline)

```bash
kb status --json                     # what is stale?
kb plan --json                       # affected pages, reasons, write sets (also wiki/.kb/plan.json)
kb compound --llm claude --fallback  # or --llm template for an offline, deterministic run
kb verify                            # exit 0 = wiki matches HEAD
```

- Prefer `--max-llm-tasks N` to bound cost; remaining tasks use the template writer.
- Never edit `wiki/` directly in orchestrator mode — always go through `kb compound`
  so the change is verified on a staging copy and published atomically.
- If verify fails, read `.kb-work/<run>/tasks/*.log` (with `--keep-work`) and fix the cause;
  do not "fix" anchors by hand.

## Writer mode (you received a `# codewiki 任务 tNN-...` prompt)

1. Only create/modify files listed under **可写集合 (write set)**. Anything else is reverted
   and the task is marked `violation`.
2. Use the frontmatter block from the prompt verbatim (`id`, `kind`, `routes`, `sources`,
   `source_commit`, `status: current`). You may drop sources that are irrelevant; never
   add symbol ids that are not in the prompt. If unsure about a hash: `kb anchor <id>`.
3. Write Chinese prose, keep identifiers in English. Reference symbols with their full id in
   backticks (e.g. `` `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem` ``).
4. Facts beat prose: routes / deep links / testIDs / APIs must match the facts in the prompt.
   When legacy docs disagree with code, code wins.
5. Links must be relative and resolve (`../overview.md`, `../../facts/android/routes.md`).
6. Finish with the Write tool; then reply with one sentence. Do not ask questions.

See [references/page-contract.md](references/page-contract.md) for the page template and
frontmatter contract.
