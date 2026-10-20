package facts_test

import (
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
)

// Second validation round (docs/validation.md): compose-samples, architecture-
// components-samples, sunflower, element-x, NextE, SweetVideo, fishpi-harmony,
// Wechat_HarmonyOS. Minimal snippets only, no third-party code.

func TestAndroidNavGraphXML(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"app/src/main/res/navigation/nav_graph.xml": `<?xml version="1.0" encoding="utf-8"?>
<navigation xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto" app:startDestination="@id/titleScreen">
    <fragment android:id="@+id/titleScreen" android:name="com.example.TitleScreen">
        <action android:id="@+id/action_title_to_register" app:destination="@id/register" />
    </fragment>
    <fragment android:id="@+id/register" android:name="com.example.Register" />
    <dialog android:id="@+id/donutEntry" android:name="com.example.DonutEntryDialogFragment">
        <deepLink app:uri="myapp://navdonutcreator.com/donutcreator" />
        <argument android:name="itemId" app:argType="long" />
    </dialog>
</navigation>`,
		"app/src/main/java/com/example/Screens.kt": "package com.example\n\nclass TitleScreen : Fragment()\nclass Register : Fragment()\nclass DonutEntryDialogFragment : DialogFragment()\n",
	})
	f := extractTree(t, dir, config.Platform{Name: "android", Root: "."})
	rm := routeMap(f)
	if r := rm["title_screen"]; !strings.HasSuffix(r.Symbol, "#TitleScreen") || r.Pattern != "title_screen" {
		t.Errorf("title_screen: %+v", r)
	}
	if _, ok := rm["register"]; !ok {
		t.Errorf("register missing: %v", rm)
	}
	if r := rm["donut_entry"]; r.Pattern != "donut_entry/{itemId}" || r.Deeplink != "myapp://navdonutcreator.com/donutcreator" || !strings.HasSuffix(r.Symbol, "#DonutEntryDialogFragment") {
		t.Errorf("donut_entry: %+v", r)
	}
	if s := f.Schemes["android"]; len(s) != 1 || s[0] != "myapp" {
		t.Errorf("schemes: %v", s)
	}
}

func TestComposeRouteReferences(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"a/Nav.kt": `package a

sealed class Screen(val route: String) {
    object Discover : Screen("discover")
    object Library : Screen(buildRoute("library"))
}

sealed interface Route {
    @Serializable data object Inbox : Route
}

fun NavGraphBuilder.app() {
    composable(Screen.Discover.route) { DiscoverScreen() }
    composable(Screen.Library.route) { LibraryScreen() }
    composable<Route.Inbox> { InboxScreen() }
    composable(route = HomeSections.FEED.route) { FeedScreen() }
}

fun NavGraphBuilder.composableWithLocals(route: String, content: () -> Unit) {
    composable(route) { content() }
}
`,
		"a/Screens.kt": "package a\n\n@Composable fun DiscoverScreen() {}\n@Composable fun LibraryScreen() {}\n@Composable fun InboxScreen() {}\n@Composable fun FeedScreen() {}\n",
	})
	rm := routeMap(extractTree(t, dir, config.Platform{Name: "android", Root: "."}))
	for _, rid := range []string{"discover", "library", "inbox", "feed"} {
		if r, ok := rm[rid]; !ok || !strings.HasSuffix(r.Symbol, "Screen") {
			t.Errorf("%s: %+v (all %v)", rid, r, rm)
		}
	}
	if _, ok := rm["route"]; ok {
		t.Errorf("a wrapper's own `route` parameter is not a route: %v", rm)
	}
}

func TestAndroidManifestStringScheme(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"app/src/main/AndroidManifest.xml": `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>
<activity android:name=".MainActivity"><intent-filter>
  <data android:scheme="@string/login_redirect_scheme" android:host="connect" />
  <data android:scheme="element" />
  <data android:scheme="@string/missing" />
</intent-filter></activity></application></manifest>`,
		"app/src/main/res/values/strings.xml": `<resources><string name="login_redirect_scheme" translatable="false">io.element.android</string></resources>`,
		"app/src/main/java/a/A.kt":            "package a\nclass MainActivity\n",
	})
	f := extractTree(t, dir, config.Platform{Name: "android", Root: "."})
	if s := strings.Join(f.Schemes["android"], ","); s != "element,io.element.android" {
		t.Fatalf("schemes = %q", s)
	}
}

func TestHarmonyProfileRouteMapMainPagesAndPushPathByName(t *testing.T) {
	dir := writeTree(t, map[string]string{
		// "routerMap": "$profile:route_map" — not named router_map.json
		"entry/src/main/module.json5":                           `{ "module": { "name": "entry", "routerMap": "$profile:route_map", "pages": "$profile:main_pages" } }`,
		"entry/src/main/resources/base/profile/route_map.json":  `{"routerMap":[{"name":"ChatRoom","pageSourceFile":"src/main/ets/pages/ChatRoom.ets","buildFunction":"ChatRoomBuilder"}]}`,
		"entry/src/main/resources/base/profile/main_pages.json": `{"src":["pages/Index","pages/chat/ChatPage"]}`,
		"entry/src/main/ets/pages/ChatRoom.ets":                 "@Builder\nexport function ChatRoomBuilder() {\n  ChatRoom()\n}\n@Component\nstruct ChatRoom {\n  build() {}\n}\n",
		"entry/src/main/ets/pages/Index.ets": `@Entry
@Component
struct Index {
  stack: NavPathStack = new NavPathStack()
  build() {
    Navigation(this.stack) {}
  }
  open(name: string) {
    this.stack.pushPathByName('Settings', null)
    this.stack.pushPathByName(name, null)
  }
}
`,
		"entry/src/main/ets/pages/chat/ChatPage.ets": "@Entry\n@Component\nstruct ChatPage {\n  build() {\n    Text('x').id('chat_title')\n  }\n}\n",
		"entry/src/main/ets/pages/SettingsPage.ets":  "@Component\nexport struct SettingsPage {\n  build() {}\n}\n",
	})
	f := extractTree(t, dir, config.Platform{Name: "harmony", Root: "."})
	rm := routeMap(f)
	if r := rm["ChatRoom"]; !strings.HasSuffix(r.Symbol, "#ChatRoomBuilder") {
		t.Errorf("route_map.json via $profile: %+v", r)
	}
	if r := rm["chat_chat_page"]; r.Pattern != "pages/chat/ChatPage" || !strings.HasSuffix(r.Symbol, "#ChatPage") {
		t.Errorf("main_pages route: %+v (all %v)", r, rm)
	}
	if _, ok := rm["index"]; ok {
		t.Errorf("the Navigation() host page is a container, not a route: %v", rm)
	}
	if r := rm["Settings"]; !strings.HasSuffix(r.Symbol, "#SettingsPage") {
		t.Errorf("pushPathByName('Settings'): %+v", r)
	}
	if len(rm) != 3 {
		t.Errorf("routes = %v, want ChatRoom, chat_chat_page, Settings (pushPathByName(name) is a variable)", rm)
	}
	for _, tid := range f.TestIDs {
		if tid.Tid == "chat_title" && tid.RouteID != "chat_chat_page" {
			t.Errorf("testID not attributed to its main page route: %+v", tid)
		}
	}
}

// apple/sample-food-truck, nalexn/clean-architecture-swiftui: SwiftUI
// NavigationStack with value-type destinations, NavigationLink(value: Enum.case)
// sidebars and NavigationLink(destination:).
func TestSwiftUINavigationStackVariants(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"Panel.swift": "enum Panel: Hashable {\n  case truck\n  case salesHistory\n}\n",
		"Views.swift": `import SwiftUI
struct TruckView: View { var body: some View { Text("t") } }
struct SalesHistoryView: View { var body: some View { Text("s") } }
struct OrderDetailView: View { var id: String; var body: some View { Text("o") } }
struct CountryDetailsView: View { var body: some View { Text("c") } }
struct Sidebar: View {
  var body: some View {
    List {
      NavigationLink(value: Panel.truck) { Label("Truck", systemImage: "box.truck") }
      NavigationLink(value: Panel.salesHistory) { Label("Sales", systemImage: "chart") }
      NavigationLink(destination: CountryDetailsView()) { Text("c") }
    }
  }
}
struct OrdersView: View {
  var body: some View {
    NavigationStack {
      List { Text("x") }
        .navigationDestination(for: Order.ID.self) { id in
          OrderDetailView(id: id)
        }
    }
  }
}
`,
	})
	rm := routeMap(extractTree(t, dir, config.Platform{Name: "ios", Root: "."}))
	want := map[string]string{"truck": "#TruckView", "sales_history": "#SalesHistoryView", "order": "#OrderDetailView", "country_details": "#CountryDetailsView"}
	for rid, sym := range want {
		if r, ok := rm[rid]; !ok || !strings.HasSuffix(r.Symbol, sym) {
			t.Errorf("%s: %+v (all %v)", rid, r, rm)
		}
	}
	if rm["order"].Pattern != "order/{order}" {
		t.Errorf("order pattern: %+v", rm["order"])
	}
}

// compose-samples: Jetcaster tv and wear both register "episode" and both
// have an EpisodeScreen; each NavHost must keep its own route anchored on its
// own module's screen.
func TestSameRouteInTwoModules(t *testing.T) {
	nav := func(pkg string) string {
		return "package " + pkg + "\n\nobject Screen {\n    const val EPISODE = \"episode\"\n}\n\nfun NavGraphBuilder.app() {\n    composable(Screen.EPISODE) {\n        EpisodeScreen()\n    }\n}\n"
	}
	dir := writeTree(t, map[string]string{
		"tv/src/main/java/a/App.kt":       nav("a"),
		"tv/src/main/java/a/Episode.kt":   "package a\n\n@Composable\nfun EpisodeScreen() {}\n",
		"wear/src/main/java/b/App.kt":     nav("b"),
		"wear/src/main/java/b/Episode.kt": "package b\n\n@Composable\nfun EpisodeScreen() {}\n",
	})
	f := extractTree(t, dir, config.Platform{Name: "android", Root: "."})
	got := map[string]bool{}
	for _, r := range f.Routes {
		if r.RouteID == "episode" {
			got[r.Symbol] = true
		}
	}
	if len(got) != 2 || !got["android://tv/src/main/java/a/Episode.kt#EpisodeScreen"] || !got["android://wear/src/main/java/b/Episode.kt#EpisodeScreen"] {
		t.Fatalf("episode routes: %v (all %+v)", got, f.Routes)
	}
}
