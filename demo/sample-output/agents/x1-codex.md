# Codex (not executed against a model)

Backend command kb would run for each compound task (prompt on stdin, cwd = staging wiki):

```
codex exec --sandbox workspace-write -c 'approval_policy="never"' --skip-git-repo-check --ephemeral --color never --json -
```

codex version: codex-cli 0.163.0

## codex mcp list (project .codex/config.toml, project trusted)

```
Name      Command  Args                                     Env  Cwd  Status   Auth       
codewiki  kb       mcp --root <repo>  -    -    enabled  Unsupported
```

## What the Codex model would see (codex debug prompt-input)

- AGENTS.md codewiki block present: 1 time(s)
- kb skills listed:
  - kb-compound: Incrementally update the code-anchored LLM Wiki after code c
  - kb-ingest: Discover and ingest existing spec and design documents 
  - kb-lint: Lint and gate the codewiki LLM Wiki, outdated docs and cross
  - kb-query: Answer questions about the app from the code-anchored codewi
