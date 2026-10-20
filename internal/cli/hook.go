package cli

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func init() {
	register(&command{name: "hook", usage: "install --mode post-receive|post-merge [--repo <git dir>] [--kb <path>] [--llm template|claude] [--branches master,main] [--dry-run]",
		summary: "install a git hook that runs kb compound on every push/merge to master (self-hosted git, GitLab, Gerrit)",
		help: `post-receive (server side, bare repo): on pushes to the given branches the hook
  serializes on a lock, checks out the pushed head into <git-dir>/codewiki/src (git
  worktree), and runs kb compound + kb verify with the wiki kept in
  <git-dir>/codewiki/wiki. It always compounds the branch head, so pushes that queue up
  behind the lock are caught up in one run from last_sha. Output goes to the pusher and
  to <git-dir>/codewiki/hook.log.
post-merge (client side, working clone): after git merge/pull on master/main runs
  kb compound in the working tree (cannot block the merge; failures are reported).
Without --repo the script is printed to stdout.`,
		flags: func(fs *flag.FlagSet) {
			fs.String("mode", "post-receive", "post-receive | post-merge")
			fs.String("repo", "", "git directory (bare repo for post-receive, working clone for post-merge); empty = print")
			fs.String("kb", "", "path to the kb binary used by the hook (default: this binary)")
			fs.String("llm", "template", "writer used by the hook: template | claude")
			fs.String("branches", "master,main", "branches that trigger compound")
			fs.Bool("dry-run", false, "print the target path and script without writing")
		},
		run: cmdHook})
}

func cmdHook(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) != 1 || args[0] != "install" {
		return a.fail(ExitUsage, usageError{"usage: kb hook install --mode post-receive|post-merge [--repo <git dir>]"})
	}
	mode := strFlag(fs, "mode")
	kb := strFlag(fs, "kb")
	if kb == "" {
		kb = kbPath()
	}
	llm := strFlag(fs, "llm")
	if _, err := llmMode(llm); err != nil {
		return a.fail(ExitUsage, err)
	}
	branches := strings.Join(strings.Split(strFlag(fs, "branches"), ","), " ")
	var script string
	switch mode {
	case "post-receive":
		script = postReceiveScript(kb, llm, branches)
	case "post-merge":
		script = postMergeScript(kb, llm, branches)
	default:
		return a.fail(ExitUsage, usageError{"--mode must be post-receive or post-merge"})
	}
	repo := strFlag(fs, "repo")
	if repo == "" {
		fmt.Fprint(a.stdout, script)
		return ExitOK
	}
	hooks := filepath.Join(repo, "hooks")
	if st, err := os.Stat(filepath.Join(repo, ".git")); err == nil && st.IsDir() {
		hooks = filepath.Join(repo, ".git", "hooks")
	}
	target := filepath.Join(hooks, mode)
	if boolFlag(fs, "dry-run") {
		a.emit(map[string]any{"ok": true, "dry_run": true, "path": target, "script": script}, func(w io.Writer) {
			fmt.Fprintf(w, "# would write %s\n%s", target, script)
		})
		return ExitOK
	}
	if err := os.MkdirAll(hooks, 0o755); err != nil {
		return a.fail(ExitInternal, err)
	}
	if err := os.WriteFile(target, []byte(script), 0o755); err != nil {
		return a.fail(ExitInternal, err)
	}
	a.emit(map[string]any{"ok": true, "path": target, "mode": mode}, func(w io.Writer) { fmt.Fprintf(w, "installed %s\n", target) })
	return ExitOK
}

func postReceiveScript(kb, llm, branches string) string {
	return `#!/bin/sh
# codewiki post-receive hook — installed by: kb hook install --mode post-receive
# Runs kb compound (+ verify) for every push to: ` + branches + `
# Pushes are serialized with a lock; the branch HEAD is compounded each time, so
# pushes that queue up behind a running compound are caught up from last_sha.
KB="${KB:-` + kb + `}"
LLM="${KB_HOOK_LLM:-` + llm + `}"
BRANCHES="` + branches + `"
GIT_DIR=$(cd "${GIT_DIR:-.}" && pwd)
export GIT_DIR
STATE="$GIT_DIR/codewiki"
mkdir -p "$STATE"
LOG="$STATE/hook.log"
ZERO=0000000000000000000000000000000000000000
branch=""
while read -r old new ref; do
  for b in $BRANCHES; do
    if [ "$ref" = "refs/heads/$b" ] && [ "$new" != "$ZERO" ]; then branch=$b; fi
  done
done
[ -n "$branch" ] || exit 0

(
  # one compound at a time (mkdir is atomic); wait up to 10 minutes
  n=0
  until mkdir "$STATE/lock" 2>/dev/null; do
    n=$((n + 1))
    if [ $n -gt 600 ]; then echo "[codewiki] lock timeout"; exit 1; fi
    sleep 1
  done
  trap 'rmdir "$STATE/lock"' EXIT
  head=$(git rev-parse "refs/heads/$branch")
  last=$(sed -n 's/.*"last_sha": *"\([0-9a-f]*\)".*/\1/p' "$STATE/wiki/.kb/state.json" 2>/dev/null)
  ts=$(date -u +%H:%M:%S)
  if [ "$head" = "$last" ]; then
    echo "[codewiki $ts] $branch@$(echo "$head" | cut -c1-7) already compounded (caught up by an earlier run)"
    exit 0
  fi
  src="$STATE/src"
  if [ -d "$src" ]; then
    (unset GIT_DIR; git -C "$src" checkout -q --detach -f "$head" && git -C "$src" clean -qfdx)
  else
    git worktree add -q --detach "$src" "$head"
  fi
  behind=$( [ -n "$last" ] && git rev-list --count "$last..$head" 2>/dev/null || echo all)
  echo "[codewiki $ts] compound $branch $(echo "${last:-none}" | cut -c1-7)..$(echo "$head" | cut -c1-7) ($behind new commit(s))"
  unset GIT_DIR
  [ -d "$STATE/wiki" ] || "$KB" init --root "$src" --wiki-dir "$STATE/wiki" --quiet >/dev/null
  "$KB" compound --root "$src" --wiki-dir "$STATE/wiki" --llm "$LLM" --fallback --quiet >"$STATE/last-compound.txt"
  rc=$?
  grep -E '^mode |^  task |^(published|noop|verify failed)' "$STATE/last-compound.txt"
  "$KB" verify --root "$src" --wiki-dir "$STATE/wiki" | head -1
  exit $rc
) 2>&1 | tee -a "$LOG"
exit 0
`
}

func postMergeScript(kb, llm, branches string) string {
	return `#!/bin/sh
# codewiki post-merge hook — installed by: kb hook install --mode post-merge
# After git merge / git pull on: ` + branches + ` — run kb compound in this clone.
KB="${KB:-` + kb + `}"
LLM="${KB_HOOK_LLM:-` + llm + `}"
branch=$(git rev-parse --abbrev-ref HEAD)
for b in ` + branches + `; do
  if [ "$branch" = "$b" ]; then
    "$KB" compound --llm "$LLM" --fallback --quiet || echo "[codewiki] kb compound failed (merge kept); run kb status"
    exit 0
  fi
done
exit 0
`
}
