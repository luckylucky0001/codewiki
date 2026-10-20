package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func layout(t *testing.T, files ...string) string {
	t.Helper()
	dir := t.TempDir()
	for _, f := range files {
		p := filepath.Join(dir, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// Layouts seen in real repos (element-x-android, wikipedia-ios, HarmonyOS
// NEXT single-app repos, kotlinconf-app / DroidconKotlin KMP).
func TestDetectRootMarkers(t *testing.T) {
	cases := []struct {
		name  string
		files []string
		want  []Platform
	}{
		{"gradle multi-module", []string{"settings.gradle.kts", "app/build.gradle.kts", "features/x/a.kt"}, []Platform{{Name: "android", Root: "."}}},
		{"app only", []string{"app/build.gradle"}, []Platform{{Name: "android", Root: "app"}}},
		{"xcodeproj at root", []string{"Wikipedia.xcodeproj/project.pbxproj", "Wikipedia/a.swift"}, []Platform{{Name: "ios", Root: "."}}},
		{"xcodeproj at root with iOS/ target dir", []string{"NetNewsWire.xcodeproj/project.pbxproj", "iOS/a.swift", "Shared/b.swift", "Mac/c.swift"}, []Platform{{Name: "ios", Root: "."}}},
		{"harmony app at root", []string{"build-profile.json5", "AppScope/app.json5", "entry/src/main/ets/pages/Index.ets"}, []Platform{{Name: "harmony", Root: "."}}},
		{"kmp", []string{"settings.gradle.kts", "shared/a.kt", "app/iosApp/a.swift"}, []Platform{{Name: "android", Root: "."}, {Name: "ios", Root: "app/iosApp"}}},
		{"conventional dirs", []string{"android/a.kt", "ios/a.swift", "harmony/a.ets", "src/a.js"}, []Platform{{Name: "android", Root: "android"}, {Name: "ios", Root: "ios"}, {Name: "harmony", Root: "harmony"}, {Name: "web", Root: "src"}}},
	}
	for _, c := range cases {
		if got := Detect(layout(t, c.files...)); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestShadowedOverlappingRoots(t *testing.T) {
	c := &Config{Platforms: []Platform{{Name: "android", Root: "."}, {Name: "ios", Root: "iosApp"}}}
	android, ios := c.Platforms[0], c.Platforms[1]
	if !c.Shadowed(android, "iosApp/iosApp/ContentView.swift") {
		t.Error("iosApp file must belong to ios, not android")
	}
	if c.Shadowed(ios, "iosApp/iosApp/ContentView.swift") || c.Shadowed(android, "shared/src/commonMain/a.kt") || c.Shadowed(android, "iosAppX/a.kt") {
		t.Error("unexpected shadowing")
	}
	same := &Config{Platforms: []Platform{{Name: "android", Root: "."}, {Name: "ios", Root: "./"}}}
	if same.Shadowed(same.Platforms[0], "a.swift") {
		t.Error("platforms with the same root (split by include) must not shadow each other")
	}
}
