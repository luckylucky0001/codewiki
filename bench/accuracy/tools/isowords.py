import sys; sys.path.insert(0,'.')
from mk import *
s=lambda v,f,k,**kw: S('ios',v,'Sources/'+f,k,**kw)
scr=[s('AppView','AppFeature/AppView.swift','swiftui-root',note='TCA root; Destination{game,onboarding}'),
s('HomeView','HomeFeature/Home.swift','swiftui-destination'),
s('GameView','GameCore/Views/GameView.swift','swiftui-destination',note='AppView.Destination.game'),
s('OnboardingView','OnboardingFeature/OnboardingView.swift','swiftui-destination',note='AppView.Destination.onboarding'),
s('ChangelogView','ChangelogFeature/ChangelogView.swift','swiftui-destination',note='Home.Destination.changelog'),
s('DailyChallengeView','DailyChallengeFeature/DailyChallengeView.swift','swiftui-destination',note='Home.Destination.dailyChallenge'),
s('LeaderboardView','LeaderboardFeature/Leaderboard.swift','swiftui-destination',note='Home.Destination.leaderboard'),
s('MultiplayerView','MultiplayerFeature/MultiplayerView.swift','swiftui-destination',note='Home.Destination.multiplayer'),
s('SettingsView','SettingsFeature/SettingsView.swift','swiftui-destination',note='Home.Destination.settings / GameCore.Destination.settings'),
s('SoloView','SoloFeature/SoloView.swift','swiftui-destination',note='Home.Destination.solo'),
s('GameOverView','GameOverFeature/GameOverView.swift','swiftui-destination',note='GameCore.Destination.gameOver'),
s('CubePreviewView','CubePreview/CubePreviewView.swift','swiftui-destination',note='Leaderboard.Destination.cubePreview'),
s('DailyChallengeResultsView','DailyChallengeFeature/DailyChallengeResults.swift','swiftui-destination',note='DailyChallenge.Destination.results'),
s('VocabView','VocabFeature/Vocab.swift','swiftui-destination',note='Stats.Destination.vocab'),
s('StatsView','StatsFeature/StatsFeature.swift','swiftui-destination',note='SettingsNavigationLink destination'),
s('UpgradeInterstitialView','UpgradeInterstitialFeature/UpgradeInterstitialView.swift','swiftui-destination',note='GameOver.Destination.upgradeInterstitial'),
s('NotificationsSettingsView','SettingsFeature/NotificationsSettingsView.swift','swiftui-destination',note='SettingsNavigationLink'),
s('SoundsSettingsView','SettingsFeature/SoundsSettingsView.swift','swiftui-destination'),
s('AppearanceSettingsView','SettingsFeature/AppearanceSettingsView.swift','swiftui-destination'),
s('AccessibilitySettingsView','SettingsFeature/AccessibilitySettingsView.swift','swiftui-destination'),
s('PurchasesSettingsView','SettingsFeature/PurchasesSettingsView.swift','swiftui-destination')]
ns=[N('ios','HomeView_Previews','Sources/HomeFeature/Home.swift','PreviewProvider'),
N('ios','LeaderboardLinkView_Previews','Sources/HomeFeature/LeaderboardLinkView.swift','PreviewProvider'),
N('ios','OnboardingPreviewApp','App/Previews/OnboardingPreview/OnboardingPreviewApp.swift','@main mini preview app, not part of shipped app navigation'),
N('ios','SettingsNavigationLink','Sources/SettingsFeature/SettingsView.swift','row/link component'),
N('ios','NotificationsAuthAlertView','Sources/NotificationsAuthAlert/NotificationsAuthAlert.swift','modal alert overlay (Destination case but an alert, not a screen) - borderline',borderline=True),
N('ios','ActiveGamesView','Sources/ActiveGamesFeature/ActiveGamesView.swift','horizontal carousel embedded in HomeView')]
dl=[D('ios','isowords','','','App/iOS/Info.plist','CFBundleURLSchemes'),
D('ios','https','isowords.xyz','','App/iOS/iOS.entitlements','applinks'),
D('ios','https','www.isowords.xyz','','App/iOS/iOS.entitlements','applinks'),
D('ios','https','isowords-staging.herokuapp.com','','App/iOS/iOS.entitlements','applinks',optional=True),
D('ios','https','pointfreeco-localhost.ngrok.io','','App/iOS/iOS.entitlements','applinks (dev)',optional=True),
D('ios','isowords','sharedGames','/{code}','Sources/ServerRouter/Router.swift','ServerRoute.sharedGame.show (router printed with baseURL isowords:// in ShareGameMiddleware)',optional=True,note='path-grammar via swift-url-routing; also shared-games')]
R='Sources/ServerRouter/Router.swift'
apis=[A('POST','/api/authenticate',R),A('GET','/api/current-player',R),A('GET','/api/config',R),A('GET','/api/changelog',R),
A('GET','/api/daily-challenges/today',R),A('GET','/api/daily-challenges/results/history',R),A('POST','/api/games',R),
A('POST','/api/push-tokens',R),A('POST','/api/push-settings',R),A('POST','/api/verify-receipt',R),A('GET','/api/leaderboard-scores/vocab',R),A('POST','/demo/games',R)]
for a in apis: a['note']='declared via swift-url-routing parser DSL (Path{..}/Method.post), shared by server and ApiClientLive; no URL string literals -> very hard case'
cl=[C('C1',"The iOS client's logic is built in the Composable Architecture",'README.md','verified','Package.swift swift-composable-architecture'),
C('C2','the UI is built mostly in SwiftUI with a little bit in SceneKit','README.md','verified','Sources/CubeCore/Geometries.swift (SceneKit)'),
C('C3','the client and server are split into 86 modules','README.md','conflict','Package.swift has 90 non-test targets + 34 test targets',note='hedged "at the time of writing"; stale count'),
C('C4','The router used for handling requests on the server is the exact same code the iOS client uses to make API requests','README.md','verified','Sources/ApiClientLive/*.swift imports ServerRouter'),
C('C5','The screenshots are generated by a test suite (AppStoreSnapshotTests)','README.md','verified','Tests/AppStoreSnapshotTests/01-Solo.swift'),
C('C6','we create mini-applications (App/Previews) e.g. OnboardingPreviewApp','README.md','verified','App/Previews/OnboardingPreview/OnboardingPreviewApp.swift'),
C('C7','The preview video is generated from a slimmed-down version (TrailerFeature)','README.md','verified','Sources/TrailerFeature'),
C('C8','The entire app state is held in a single source of truth, called a Store','README.md','verified','App/iOS/App.swift AppView(store: appDelegate.store)'),
C('C9','The code for both the iOS client and server are included in this single repository','README.md','verified','Sources/ServerBootstrap, Sources/SiteMiddleware'),
C('C10','We test very detailed user flows ... integration tests that simultaneously test the server and iOS client','README.md','verified','Sources/IntegrationTestHelpers')]
write('pointfreeco_isowords',repo='pointfreeco/isowords',url='https://github.com/pointfreeco/isowords',commit='c727d3a7c49cf0c98f2fa4f24c562f81e30165f7',
platform_roots={'ios':['App/iOS','Sources'],'server':['Sources/Server*','Sources/*Middleware']},screens=scr,not_screens=ns,deeplinks=dl,testids=[],apis=apis,claims=cl,
notes='TCA app: navigation is via @Reducer enum Destination cases + .sheet/.navigationDestination(item:) store scoping; route_id = SwiftUI View struct. No accessibilityIdentifier in Sources -> testids empty (false-positive probe). APIs are defined with swift-url-routing parsers (no string URLs); expecting extraction is aspirational -> report separately. Server (Swift on Linux) routes are the same as client API.')
