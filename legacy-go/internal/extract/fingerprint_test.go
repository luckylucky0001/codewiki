package extract

import (
	"testing"
	"testing/fstest"
)

func TestFingerprintChangesWithExtractor(t *testing.T) {
	a := Fingerprint()
	if a == "" || a != Fingerprint() {
		t.Fatal("fingerprint must be stable within a build")
	}
	src := fstest.MapFS{"x.go": {Data: []byte("package extract // v1")}}
	f1 := fingerprint(src, specs)
	src["x.go"] = &fstest.MapFile{Data: []byte("package extract // v2")}
	if f2 := fingerprint(src, specs); f1 == f2 {
		t.Fatal("source change must change the fingerprint")
	}
	// a node-table change (e.g. a new call kind) must change it too
	k := *specs["kotlin"]
	calls := set{}
	for c := range k.calls {
		calls[c] = true
	}
	calls["new_call_kind"] = true
	k.calls = calls
	mod := map[string]*langSpec{}
	for l, s := range specs {
		mod[l] = s
	}
	mod["kotlin"] = &k
	if fingerprint(src, mod) == f1 && fingerprint(src, specs) == f1 {
		t.Fatal("spec change must change the fingerprint")
	}
	if fingerprint(src, mod) == fingerprint(src, specs) {
		t.Fatal("spec change must change the fingerprint")
	}
}
