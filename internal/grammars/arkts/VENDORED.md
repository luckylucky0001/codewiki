# Vendored: harmony-contrib/tree-sitter-arkts

- Upstream: https://github.com/harmony-contrib/tree-sitter-arkts
- Commit: 9a97c1e6ac93bc07732c15050a0e560bc63c8d78 (2026-09-14)
- License: MIT (see LICENSE)
- Kept: LICENSE, README.md, grammar.js, common/, src/ (generated parser), queries/.
- Removed: upstream go.mod/go.sum and bindings/ (a nested module would be excluded from `go install`).
- The cgo binding lives in `binding.go` (package `arkts`, import path
  `github.com/luckylucky0001/codewiki/internal/grammars/arkts`); it `#include`s `src/parser.c` and
  `src/scanner.c`, exactly like the upstream Go binding.
- To update: copy upstream `src/`, `common/`, `grammar.js`, `queries/` over this directory and run `go test ./...`.
