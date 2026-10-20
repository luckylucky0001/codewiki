# CI 接入（examples/ci）

`kb compound` 的设计目标是：**每次 merge 到 master 都触发一次增量 compound，且只有在 `kb verify` 通过后才发布**。
仓库根目录的 [`.github/workflows/compound.yml`](../../.github/workflows/compound.yml) 是可直接复制的模板，要点：

| 要点 | 做法 |
|---|---|
| 串行 | `concurrency.group: codewiki-compound-<ref>` + `cancel-in-progress: false`；积压时下一次运行从 `wiki/.kb/state.json` 的 `last_sha`（实际是 `.kb/graph.json` 快照）一次追到 HEAD |
| squash / rebase | 基线是符号图快照而不是 commit 链，因此 squash 不影响；也可显式 `kb diff --base <sha>` |
| 无 key 的 CI | 没有 `ANTHROPIC_API_KEY` 时自动使用 `--llm template`（确定性、零成本），页面锚点同样可验证 |
| 成本控制 | `--max-llm-tasks N`：超过 N 的任务改用 template；`--fallback`：LLM 失败时回退 template |
| 门禁 | `kb verify` 退出码 1 → job 失败；`kb compound` 自身在 staging 上 verify 失败时不会发布 |
| 防循环 | `paths-ignore: wiki/**` + 提交信息带 `[skip ci]` |
| 缓存 | `actions/setup-go` 缓存模块；`kb` 二进制按版本缓存（cgo 编译 tree-sitter 语法较慢） |

## 方案 A：wiki 与代码同仓（默认）

`codewiki.yaml` 中 `wiki_dir: wiki`。workflow 在 master 上直接提交 `wiki/` 的变更。适合中小团队，PR 评审时可以同时看到代码与知识的变化。

## 方案 B：独立 wiki 仓库

代码仓只负责触发，wiki 存放在 `org/app-wiki`：

```yaml
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/checkout@v4
        with:
          repository: org/app-wiki
          token: ${{ secrets.WIKI_PUSH_TOKEN }}
          path: _wiki
      - run: |
          # codewiki.yaml: wiki_dir: _wiki/wiki   (相对仓库根目录)
          kb compound --llm template --json > compound.json
          kb verify
          cd _wiki && git add -A && git commit -m "compound ${GITHUB_SHA::7}" && git push
```

`.kb/graph.json` 与 `state.json` 存在 wiki 仓库内，因此即使代码仓 CI 缓存丢失也能正确增量。

## 方案 C：同仓 `kb` 分支

把 wiki 发布到孤立分支（类似 `gh-pages`），master 历史保持干净：

```yaml
      - run: |
          git fetch origin kb:kb || git branch kb $(git commit-tree -m init $(git hash-object -t tree /dev/null))
          git worktree add _kb kb
          rm -rf wiki && cp -R _kb/wiki wiki 2>/dev/null || true
          kb compound --llm template && kb verify
          rsync -a --delete wiki/ _kb/wiki/
          cd _kb && git add -A && git commit -m "compound ${GITHUB_SHA::7}" && git push origin kb
```

## 本地 / pre-push 钩子

```bash
kb status || kb compound --llm template   # 开发机上快速对齐
kb verify                                 # pre-push 门禁
```

## 退出码约定

| code | 含义 | CI 行为 |
|---|---|---|
| 0 | 成功 / 已是最新 | 通过 |
| 1 | 存在 stale 页面或 verify 失败（未发布） | 失败，查看 artifact 中的 `compound.json` 与 `.kb-work/<run>/tasks/*.log` |
| 2 | 用法错误（缺少 codewiki.yaml 等） | 失败 |
| 3 | 内部错误 | 失败 |
