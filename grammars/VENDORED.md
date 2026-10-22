# Prebuilt tree-sitter grammars (WASM)

Built with `tree-sitter-cli` 0.27.1 (`tree-sitter build --wasm`, wasi-sdk downloaded by the CLI;
no emscripten/docker needed) from the *same grammar sources the Go implementation linked*,
so parse trees — and therefore symbol ids and hashes — are identical:

| file | source |
|---|---|
| tree-sitter-kotlin.wasm | github.com/tree-sitter-grammars/tree-sitter-kotlin v1.1.0 (MIT) |
| tree-sitter-java.wasm | github.com/tree-sitter/tree-sitter-java v0.23.5 (MIT) |
| tree-sitter-swift.wasm | github.com/alex-pinkus/tree-sitter-swift 82bb3a533e08 (MIT); one `fprintf(stderr, …)` OOM message removed from scanner.c because web-tree-sitter does not export `stderr` |
| tree-sitter-javascript.wasm | github.com/tree-sitter/tree-sitter-javascript v0.25.0 (MIT) |
| tree-sitter-typescript.wasm / tree-sitter-tsx.wasm | github.com/tree-sitter/tree-sitter-typescript v0.23.2 (MIT) |
| tree-sitter-arkts.wasm | vendored grammar in legacy-go/internal/grammars/arkts (MIT, with the local trailing-comma patch; see its VENDORED.md) |

Rebuild: `scripts/build-grammars.sh` (needs Go module cache sources or a grammar checkout).
All grammars are MIT licensed; see each upstream repository for the full LICENSE text.
