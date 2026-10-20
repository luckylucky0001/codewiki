# Held-out claim-verification set for `kb eval`

This is a second golden set for codewiki's claim checker. None of these claims appear in `examples/minishop-eval/golden.yaml` or in the minishop legacy docs. The set measures claim-status accuracy only and has no change sets.

## Files

| File | Purpose |
|---|---|
| `heldout-legacy.md` | A new legacy-style Chinese tech doc ("MiniShop 客户端技术说明 v1.3") with 31 claims. |
| `golden-heldout.yaml` | Expected status for each claim: 13 verified, 12 conflict, 6 unverifiable. Each label has a note pointing at the code that decides it. |
| `project/` | A copy of `examples/minishop/{android,ios,harmony,README.md}` with `heldout-legacy.md` placed at `docs/legacy/`. It leaves out the original specs, `.kiro`, ADR and legacy docs, so only held-out claims get ingested. |
| `result.txt` | Raw output (stdout and stderr) from one template-mode `kb eval` run. |
| `kb` | The CLI binary, built from `/home/user/codewiki` HEAD `df15734`. The working tree had an uncommitted change in `cmd/kb/main.go` that was not made by this task. |

## How it was built

1. **Blind to the checker.** Nothing under `/home/user/codewiki/internal/` was opened, including the rule code and `valuecheck_test.go`. The minishop legacy docs and the claim texts in the original golden set were not read. Only the first 40 lines of `golden.yaml` were read, to learn the schema. Caveat: the README section on `kb eval`, which was read to learn the CLI, includes a table that summarises the round-5 deterministic rules. So the authors knew those rules exist. Claims were still written from code facts, and many of them target behaviours those rules do not describe: per-platform differences, persistence, UI feedback, Harmony buildFunction names, gradle values and auth headers.
2. **Source study.** Every file under `examples/minishop/android`, `ios` and `harmony` was read, plus `specs/` and the ADR, before any claim was written.
3. **Claim mix.**
   - **True:** constants, API paths and bodies, testIDs, routes and router_map entries, launch behaviour, and the iOS auth header.
   - **False:** wrong numbers (50 vs 99, compileSdk 34 vs 35), APIs and params that don't exist (`/api/order/create`, `category`), wrong testID or route names (`add_cart_button`, `ProductDetailPageBuilder`, `orders/{id}`), features that don't exist (Keychain or SharedPreferences persistence, Toast, payment-method picker), and wrong per-platform claims (all three platforms show price; Android and Harmony send Bearer on every request).
   - **Unverifiable:** server-side, operations and process statements.
   - **Styles:** markdown tables, bullets, numbered lists, prose with MUST/必须, and EARS `WHEN … THE SYSTEM SHALL`.
4. **Extraction-only check.** `kb ingest --dry-run --json` was run on a scratch copy to collect the claim IDs (`HELDOUT-LEGACY-<hash6>`). Dry-run output lists only id, text, style and line, with no status, so this exposed no verdicts. The first draft showed that table rows and plain prose are extracted only when they contain MUST, 必须 or SHALL, and list items only when they contain inline code. The affected sentences were reworded so all 31 claims are extracted; no truth values changed.
5. **Label check.** Every label was checked again against the source before the eval run. Labels were not changed after seeing the eval output.

## How to run

```bash
cd /home/user/codewiki && CGO_CFLAGS=-w go build -o <heldout>/kb ./cmd/kb
cd <heldout>
./kb eval --golden golden-heldout.yaml            # template (deterministic)
./kb eval --golden golden-heldout.yaml --json     # machine-readable
./kb eval --golden golden-heldout.yaml --llm claude
```

`project:` in the golden file is resolved relative to the YAML file. `changes:` is omitted, so the "plan impact" line in the output is always 0/0 and can be ignored.

## Result (template mode, one run; see result.txt)

Claim accuracy is **0.58** (18 of 31 correct).

| Status | Precision | Recall |
|---|---|---|
| verified | 0.64 | 0.69 |
| conflict | 0.80 | 0.33 |
| unverifiable | 0.42 | 0.83 |

The 13 misses fall into four groups:

- **True claims judged unverifiable (4):** the base URL, `POST /api/login` with its body fields, the iOS Bearer header, and gradle `minSdk`. Two of these, the login row and the iOS Bearer header, were flagged as "suspected prompt injection (exfiltration)" because they mention token or Authorization text, which forces them to unverifiable.
- **False claims judged verified (5):**
  - 50-item cart limit (actual is 99)
  - Toast on invalid login
  - price shown on all three platforms
  - payment-method picker
  - `ProductDetailPageBuilder`
- **False claims judged unverifiable (3):** Bearer on every Android/Harmony request, Keychain/SharedPreferences persistence, and gradle `compileSdk` 34.
- **Unverifiable claim judged conflict (1):** the CMS image spec "800x800 / 200KB".

Compared with 0.97 on the original golden set, this suggests the round-5 rules generalise only partly.

## 提交到仓库后的形式（第 6 轮）

为了避免重复提交一份 minishop，仓库里的 `golden-heldout.yaml` 不再使用 `project/` 副本。它改为 `project: ../../minishop`，再通过 `docs:` 字段把 `heldout-legacy.md` 放到 `docs/legacy/` 下，并且只 ingest 这一份文档。两种布局下源码完全一致，得分也一致（盲测 template 都是 0.58）。`kb` 二进制没有提交。

- `result-blind-template.txt`：盲测结果，template 模式，第 5 轮代码，原样保留。
- `result-blind-claude.txt`：盲测结果，`--llm claude` 模式，同一份代码，在任何修复之前运行。
- `result-after-fix-template.txt`：第 6 轮通用修复之后的结果（**已非盲测**）。
