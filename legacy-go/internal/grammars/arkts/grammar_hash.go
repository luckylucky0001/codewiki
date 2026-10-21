package arkts

// GrammarHash is sha256(src/parser.c + src/scanner.c + common/scanner.h).
//
// The C sources live in sub directories (#include'd by binding.go), which the Go
// build cache does not track. Updating this constant whenever the grammar is
// regenerated forces a rebuild and changes the extractor fingerprint (and thus
// invalidates scan caches). TestGrammarHash fails if it is out of date.
const GrammarHash = "5ecff4948eba913d2754d9b25f7f2b869c3953181075df3bd09d85753fbdacd8"
