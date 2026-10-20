package facts_test

import (
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
)

// NetNewsWire / wikipedia-ios / kickstarter: UIKit view controllers are
// screens; push / present with a direct or locally assigned type, and
// storyboard segues / identifiers, are edges. Containers, base classes and
// tests are not screens.
func TestUIKitScreensAndEdges(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"App/Base.swift": "import UIKit\nclass BaseViewController: UIViewController {}\nclass ThemeableViewController: UIViewController {}\nclass RootTabBarController: UITabBarController {}\n",
		"App/Settings.swift": `import UIKit
final class SettingsViewController: ThemeableViewController {
    func openAccount() {
        let controller = AccountInspectorViewController.configured(with: 1)
        navigationController?.pushViewController(controller, animated: true)
    }
    func openAbout() {
        present(UINavigationController(rootViewController: AboutViewController()), animated: true)
    }
    func openHelp() {
        performSegue(withIdentifier: "showHelp", sender: nil)
    }
    func openFeeds() {
        let vc = UIStoryboard(name: "Main", bundle: nil).instantiateViewController(withIdentifier: "FeedsScene")
        show(vc, sender: nil)
    }
}
`,
		"App/Others.swift": `import UIKit
import SwiftUI
class AccountInspectorViewController: UITableViewController {
    static func configured(with id: Int) -> AccountInspectorViewController { AccountInspectorViewController() }
}
class AboutViewController: BaseViewController {}
class LicensesViewController: ThemeableViewController {}
class HelpViewController: UIViewController {}
class FeedsViewController: UICollectionViewController {}
final class HostingSettingsController<V: View>: UIHostingController<V> {}
`,
		"App/Main.storyboard": `<?xml version="1.0" encoding="UTF-8"?>
<document><scenes>
<scene sceneID="s1"><objects><viewController id="vc1" customClass="SettingsViewController" sceneMemberID="viewController">
  <connections><segue destination="vc2" kind="show" identifier="showHelp" id="sg1"/></connections>
</viewController></objects></scene>
<scene sceneID="s2"><objects><viewController id="vc2" customClass="HelpViewController" sceneMemberID="viewController"/></objects></scene>
<scene sceneID="s3"><objects><collectionViewController storyboardIdentifier="FeedsScene" id="vc3" customClass="FeedsViewController" sceneMemberID="viewController"/></objects></scene>
</scenes></document>`,
		"AppTests/SettingsViewControllerTests.swift": "import XCTest\nclass FakeViewController: UIViewController {}\n",
	})
	f := extractTree(t, dir, config.Platform{Name: "ios", Root: "."})
	rm := routeMap(f)
	for _, rid := range []string{"settings", "account_inspector", "about", "help", "feeds", "hosting_settings", "licenses"} {
		if _, ok := rm[rid]; !ok {
			t.Errorf("screen %s missing: %v", rid, rm)
		}
	}
	for _, rid := range []string{"base", "root_tab_bar", "fake", "themeable"} {
		if _, ok := rm[rid]; ok {
			t.Errorf("%s is not a screen", rid)
		}
	}
	edges := map[string]string{}
	for _, e := range f.Navigation {
		edges[e.From+"->"+e.To] = e.Kind
	}
	want := map[string]string{"settings->account_inspector": "push", "settings->about": "present", "settings->help": "segue", "settings->feeds": "storyboard"}
	for k, kind := range want {
		if edges[k] != kind {
			t.Errorf("edge %s = %q, want %q (all %v)", k, edges[k], kind, edges)
		}
	}
	if !strings.HasSuffix(rm["settings"].Symbol, "#SettingsViewController") {
		t.Errorf("settings anchor: %+v", rm["settings"])
	}
	// opt-out
	cfg := config.Default()
	off := false
	cfg.Facts.UIKit = &off
	if cfg.UIKitEnabled() {
		t.Fatal("facts.uikit: false must disable UIKit extraction")
	}
}
