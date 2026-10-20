# 不依赖 GitHub：每次 merge 到 master 触发 compound（git server hook）

复现：`demo/hook-demo.sh [outdir]`

## 流程

1. 新建一个本地 bare 仓库 `remote.git` 作为“服务器”。在上面执行 `kb hook install --mode post-receive --repo remote.git` 安装钩子，脚本见 [post-receive.sh](post-receive.sh)。
2. 开发者 clone 下来，导入 minishop 后 push。钩子在服务端检出 `remote.git/codewiki/src`（git worktree），然后执行一次全量 compound。wiki 存放在服务端的 `remote.git/codewiki/wiki`，master 上只放代码。
3. 在本地依次 merge 三个变更集，然后背靠背 push：
   - 先 push 01；
   - 0.8 s 后 push 02，再过 0.3 s push 03。
   - demo 里用 `kb-slow` 包装 kb，每次 compound 前 sleep 3 s，模拟 LLM 耗时，让几次 push 在时间上重叠。

## 结果（[transcript.txt](transcript.txt)、[hook.log](hook.log)）

| push | 钩子输出（pusher 端看到的 `remote:` 行） |
|---|---|
| 01 | `compound master 73660c8..e6cff74 (2 new commit(s))`，incremental，verify PASS |
| 02 | 等锁结束后读到的分支头已经是 03，于是一次性追平：`compound master e6cff74..1c373e4 (4 new commit(s))`，verify PASS，23 页 / 198 锚点 |
| 03 | `master@1c373e4 already compounded (caught up by an earlier run)` |

结束时服务端 `remote master == wiki last_sha`（`wiki is caught up with master: YES`），`kb verify` 通过。

## 关键设计

- **串行**：钩子用 `mkdir "$STATE/lock"` 作为原子锁（最多等待 10 分钟）。`kb compound` 内部还有一把 `.kb-work/lock`。
- **追平**：钩子拿到锁后读取的是分支**当前的头**，而不是本次 push 的 sha。增量基线来自 `.kb/graph.json` 里的 last_sha，所以排队中的多次 push 会合并成一次 compound。没有符号变化的提交（文档、资源）也会推进 last_sha（noop 时同样推进基线）。
- **不回写 master**：wiki 放在服务端目录（通过 `--wiki-dir` 指定），不会因为 wiki 提交引发 non-fast-forward 冲突，也不会触发钩子递归。如需把 wiki 发布到别处（静态站点、`kb` 分支、独立仓库），在钩子末尾追加同步命令即可。
- **适用场景**：自建 git、GitLab（server hooks / `custom_hooks/post-receive`）、Gerrit（`hooks/ref-updated`，参数形式不同，需要把 `while read` 改成读取 `--refname/--newrev`）。
- **客户端**：`kb hook install --mode post-merge` 会在本地 `git merge` / `git pull` 到 master 后运行 compound。它不会阻断 merge，适合没有服务端权限的团队。
