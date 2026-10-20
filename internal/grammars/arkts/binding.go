// Package arkts is the vendored harmony-contrib/tree-sitter-arkts grammar
// (MIT, see LICENSE and VENDORED.md) compiled into the codewiki module, so
// `go install github.com/luckylucky0001/codewiki/cmd/kb@latest` works without
// a go.mod replace directive.
package arkts

// #cgo CPPFLAGS: -I${SRCDIR}/src
// #cgo CFLAGS: -std=c11 -fPIC
// #include "src/parser.c"
// #include "src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language pointer for ArkTS.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_arkts())
}
