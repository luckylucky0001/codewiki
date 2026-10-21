# legacy-go — the original Go implementation (frozen)

This is the Go implementation of `kb` as of tag `go-final`, kept for reference and for
regenerating the parity goldens under `test/golden/`. The maintained implementation is the
TypeScript package at the repository root (`src/`, `npm i -g codewiki`).

Build: `cd legacy-go && CGO_CFLAGS=-w go build -o kb ./cmd/kb` (needs cgo + gcc).
`legacy-go/skills/` holds the four pre-merge skills the Go binary embeds; the shipped skill is
`skills/codewiki/`. Go tests that read `../../examples` expect the pre-move layout; run them
from a `go-final` checkout.
