import sys; sys.path.insert(0,'.')
from mk import *
ios=[('ArticleViewController','iOS/Article/ArticleViewController.swift'),('SettingsViewController','iOS/Settings/SettingsViewController.swift'),('ArticleThemesTableViewController','iOS/Settings/ArticleThemesTableViewController.swift'),('MainFeedCollectionViewController','iOS/MainFeed/MainFeedCollectionViewController.swift'),('MainTimelineViewController','iOS/MainTimeline/MainTimelineViewController.swift'),('AccountInspectorViewController','iOS/Inspector/AccountInspectorViewController.swift'),('FeedInspectorViewController','iOS/Inspector/FeedInspectorViewController.swift'),('ImageViewController','iOS/Article/ImageViewController.swift'),('TimelineCustomizerCollectionViewController','iOS/Settings/TimelineCustomizerCollectionViewController.swift'),('ShareViewController','iOS/ShareExtension/ShareViewController.swift')]
scr=[S('ios',a,f,'uikit-vc') for a,f in ios]
scr+=[S('ios','AboutView','iOS/Settings/AboutView.swift','swiftui-destination'),S('ios','AddAccountView','iOS/Settings/AddAccountView.swift','swiftui-destination'),S('ios','ErrorLogView','iOS/Settings/ErrorLogView.swift','swiftui-destination'),S('ios','DinosaursView','iOS/Settings/DinosaursView.swift','swiftui-destination')]
mac=[('MainWindowController','Mac/MainWindow/MainWindowController.swift'),('PreferencesWindowController','Mac/Preferences/PreferencesWindowController.swift'),('AddFeedWindowController','Mac/MainWindow/AddFeed/AddFeedWindowController.swift'),('InspectorWindowController','Mac/Inspector/InspectorWindowController.swift'),('AboutWindowController','Mac/About/AboutWindowController.swift'),('ImportOPMLWindowController','Mac/MainWindow/OPML/ImportOPMLWindowController.swift'),('GeneralPreferencesViewController','Mac/Preferences/General/GeneralPrefencesViewController.swift'),('AccountsPreferencesViewController','Mac/Preferences/Accounts/AccountsPreferencesViewController.swift'),('AdvancedPreferencesViewController','Mac/Preferences/Advanced/AdvancedPreferencesViewController.swift')]
scr+=[S('macos',a,f,'appkit-window' if 'Window' in a else 'appkit-vc',note='macOS target; scorer maps macos to the Apple (ios) family') for a,f in mac]
ns=[N('ios','ContextMenuPreviewViewController','iOS/Article/ContextMenuPreviewViewController.swift','context-menu preview, not navigable'),
N('ios','WebViewController','iOS/Article/WebViewController.swift','child VC embedded inside ArticleViewController page view'),
N('ios','RootSplitViewController','iOS/RootSplitViewController.swift','container split VC',borderline=True),
N('ios','DinosaurRowView','iOS/Settings/DinosaurRowView.swift','row view'),
N('ios','AboutCreditView','iOS/Settings/AboutCreditView.swift','sub-view of AboutView'),
N('macos','SidebarViewController','Mac/MainWindow/Sidebar/SidebarViewController.swift','pane inside MainWindowController split view'),
N('macos','TimelineContainerViewController','Mac/MainWindow/Timeline/TimelineContainerViewController.swift','pane container'),
N('macos','DetailWebViewController','Mac/MainWindow/Detail/DetailWebViewController.swift','embedded web content of DetailViewController')]
dl=[D('ios','feed','','','iOS/Resources/Info.plist','CFBundleURLSchemes'),D('ios','feeds','','','iOS/Resources/Info.plist','CFBundleURLSchemes'),D('ios','netnewswire','','','iOS/Resources/Info.plist','CFBundleURLSchemes'),
D('ios','netnewswire','theme','?url=','iOS/SceneDelegate.swift','scene openURLContexts: scheme netnewswire host theme'),
D('macos','netnewswire','','','Mac/Resources/Info.plist','CFBundleURLSchemes'),D('macos','feed','','','Mac/Resources/Info.plist','CFBundleURLSchemes'),D('macos','feeds','','','Mac/Resources/Info.plist','CFBundleURLSchemes'),D('macos','x-netnewswire-feed','','','Mac/Resources/Info.plist','CFBundleURLSchemes'),
D('ios','nnw','showunread','','Shared/Widget/WidgetDeepLinks.swift','widgetURL (not registered in Info.plist; delivered by WidgetKit)',optional=True),D('ios','nnw','showtoday','','Shared/Widget/WidgetDeepLinks.swift','widgetURL',optional=True),D('ios','nnw','showstarred','','Shared/Widget/WidgetDeepLinks.swift','widgetURL',optional=True)]
F='Modules/Account/Sources/Account/Feedbin/FeedbinAPICaller.swift'
apis=[A('GET','/v2/authentication.json',F),A('POST','/v2/imports.json',F),A('GET','/v2/tags.json',F),A('GET','/v2/subscriptions.json',F),A('POST','/v2/subscriptions.json',F),A('DELETE','/v2/subscriptions/{subscriptionID}.json',F),A('POST','/v2/taggings.json',F),A('GET','/v2/unread_entries.json',F),A('DELETE','/v2/unread_entries.json',F),A('POST','/v2/starred_entries.json',F)]
for a in apis: a['note']='feedbinBaseURL https://api.feedbin.com/v2/ + appendingPathComponent; method from session.send(method:) (GET default)'
cl=[C('C1','NetNewsWire is a free and open-source feed reader for macOS and iOS','README.md','verified','Mac/, iOS/'),
C('C2','It supports RSS, Atom, JSON Feed, and RSS-in-JSON','README.md','verified','Modules/RSParser/Sources/RSParser/Feeds/JSON/RSSInJSONParser.swift'),
C('C3','You can do this using the included setup.sh script','README.md','verified','setup.sh'),
C('C4','Full build and test: ./buildscripts/build_and_test.sh','CLAUDE.md','verified','buildscripts/build_and_test.sh'),
C('C5','Quiet build and test: ./buildscripts/quiet_build_and_test.sh','CLAUDE.md','verified','buildscripts/quiet_build_and_test.sh'),
C('C6','RSDatabase: SQLite database abstraction layer using FMDB','CLAUDE.md','verified','Modules/RSDatabase/Sources/RSDatabaseObjC/FMDatabase.m'),
C('C7','Account: Account management (Local, Feedbin, Feedly, NewsBlur, Reader API, CloudKit)','CLAUDE.md','verified','Modules/Account/Sources/Account/{LocalAccount,Feedbin,Feedly,NewsBlur,ReaderAPI,CloudKit}'),
C('C8','Smart Feeds: Virtual feeds (Today, All Unread, Starred) implemented as PseudoFeed protocol','CLAUDE.md','verified','Shared/SmartFeeds/PseudoFeed.swift:16'),
C('C9','Run all tests: Use the NetNewsWire.xctestplan','CLAUDE.md','verified','NetNewsWire.xctestplan'),
C('C10','Key Modules include RSCore, RSParser, RSWeb, RSDatabase, Account, Articles, ArticlesDatabase, SyncDatabase, Secrets','CLAUDE.md','verified','Modules/')]
write('Ranchero-Software_NetNewsWire',repo='Ranchero-Software/NetNewsWire',url='https://github.com/Ranchero-Software/NetNewsWire',commit='94032d95fe04a05d44591450234c3c5da0a40842',
platform_roots={'ios':['iOS','Shared','Widget'],'macos':['Mac','Shared'],'modules':['Modules']},screens=scr,not_screens=ns,deeplinks=dl,testids=[],apis=apis,claims=cl,
notes='iOS UIKit + some SwiftUI settings views; macOS AppKit window/VCs. Platform "macos" is mapped to the Apple family (same as ios) by the scorer. No accessibilityIdentifier in Swift or storyboards -> testids empty. nnw:// widget URLs are handled but not registered in Info.plist (optional). Clone reused read-only from oss2.')
