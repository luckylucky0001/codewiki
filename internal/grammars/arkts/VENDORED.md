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

## Local patches

1. **Trailing comma in ArkUI arguments** (`common/define-grammar.js`, rule `arkui_arguments`):
   `optional(',')` before `)`, so attribute calls such as `.tabBar(builder(),)` and
   `.gesture(GestureGroup(...),\n)` parse. Found while validating HarmonyOS-Cases and
   openharmony/applications_app_samples (all 4 ArkTS parse failures were this pattern;
   see docs/validation.md).
   Regenerated `src/parser.c`, `src/grammar.json` with **tree-sitter-cli 0.24.4**
   (ABI 14, same as upstream) and tree-sitter-javascript 0.23.1:
   ```
   npm install tree-sitter-cli@0.24.4 tree-sitter-javascript@0.23.1   # in a temp dir
   npx tree-sitter generate                                           # in a copy of this dir
   ```
   node_modules are not vendored.
2. After any regeneration, update `GrammarHash` in `grammar_hash.go` (TestGrammarHash
   enforces it). The C files live in sub directories that the Go build cache does not
   track; the constant forces a rebuild and changes the extractor fingerprint, so scan
   caches are invalidated.
