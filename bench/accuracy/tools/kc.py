import sys; sys.path.insert(0,'.')
from mk import *
R='app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/navigation/Routes.kt'
pairs="""Schedule ScheduleScreen
Speakers SpeakersScreen
Map MapScreen
GoldenKodee GoldenKodeeScreen
Info InfoScreen
AboutConference AboutConferenceScreen
CodeOfConduct CodeOfConductScreen
AboutApp AboutAppScreen
WelcomePrivacyNotice StartPrivacyNoticeScreen
WelcomeSetupNotifications StartNotificationsScreen
Settings SettingsScreen
VisitorPrivacyNotice VisitorPrivacyNoticeScreen
AppPrivacyNotice AppPrivacyNoticeScreen
TermsOfUse TermsOfUseScreen
Licenses LicensesScreen
License SingleLicenseScreen
Partners PartnersScreen
Partner PartnerDetailScreen
Session SessionScreen
Speaker SpeakerDetailScreen
MapDetail NestedMapScreen
GoldenKodeeFinalist GoldenKodeeFinalistScreen
DeveloperMenu DeveloperMenuScreen
AppPrivacyNoticePrompt AppPrivacyNoticePrompt"""
scr=[S('kmp',cls,R,'compose-route',symbol=cls,serial_name=sn,aliases=[sn],note='@Serializable @SerialName(%r) route : AppRoute (Navigation3/typed nav)'%sn) for sn,cls in (l.split() for l in pairs.splitlines())]
ns=[N('kmp','AppRoute',R,'sealed base interface'),N('kmp','TopLevelRoute',R,'marker interface'),
N('kmp','DaySeparatorItem','app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/screens/ScheduleViewModel.kt','list item model'),
N('kmp','PrivacyNoticeState.Idle','app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/screens/PrivacyNoticeViewModel.kt','UI state object'),
N('web','Screen.Overview','app/adminApp/src/jsMain/kotlin/org/jetbrains/kotlinconf/admin/Main.kt','admin web app (JS) screen enum, not part of mobile app',borderline=True),
N('server','AdminVoteInfo','backend/src/main/kotlin/org/jetbrains/kotlinconf/backend/routes/AdminDtos.kt','backend DTO in a routes/ folder')]
A1='app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/network/ApplicationApi.kt'; Y='app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/network/YearlyApi.kt'
apis=[A('GET','/time',A1),A('GET','/config',A1),A('GET','/{year}/conference',Y),A('GET','/{year}/conference-info',Y),A('GET','/{year}/golden-kodee',Y),A('POST','/{year}/sign',Y),A('GET','/{year}/sign',Y),A('POST','/{year}/vote',Y),A('GET','/{year}/vote',Y),A('POST','/{year}/feedback',Y),A('GET','{path}',Y,dynamic=True,expect=False,note='apiUrl(path) with variable path')]
for a in apis: a.setdefault('note','client.get { apiUrl("x") } where apiUrl sets encodedPath = "$year/$path" (Yearly) ; backend mirrors in backend/src/main/kotlin/.../routes/*.kt under route("/{year}")')
apis+=[A('GET','/{year}/conference','backend/src/main/kotlin/org/jetbrains/kotlinconf/backend/routes/ScheduleRoutes.kt',side='server',note='Ktor server route; extractor may or may not index server routes'),A('POST','/{year}/sessionizeSync','backend/src/main/kotlin/org/jetbrains/kotlinconf/backend/routes/AdminRoutes.kt',side='server',optional=True)]
C_='CLAUDE.md'
cl=[C('C1','a Kotlin Multiplatform project serving Android, iOS, JVM desktop, and WebAssembly clients, backed by a Ktor server',C_,'verified','app/shared/build.gradle.kts; backend/build.gradle.kts'),
C('C2','The app uses Metro (not Koin) for DI on the client',C_,'verified','gradle/libs.versions.toml:32 metro; koin only used by backend (backend/build.gradle.kts:53)'),
C('C3',':app:shared targets: android, jvm, iosArm64, iosSimulatorArm64, wasmJs, js',C_,'verified','app/shared/build.gradle.kts:25-41'),
C('C4',':backend — Ktor/Netty server',C_,'verified','backend/build.gradle.kts:12 io.ktor.server.netty.EngineMain'),
C('C5','YearGraph — a scoped sub-graph created per active conference year; holds YearlyApi',C_,'verified','app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/di/YearGraph.kt:11'),
C('C6','ViewModels are registered into Metro map multibinding with @ContributesIntoMap(AppScope::class)',C_,'verified','app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/screens/InfoViewModel.kt:15'),
C('C7','Bump version across all platforms: ./gradlew prepareRelease',C_,'verified','gradle/releases.gradle.kts:24'),
C('C8','ConferenceService is the central app singleton; fetches AppConfig from the backend on startup',C_,'verified','app/shared/src/commonMain/kotlin/org/jetbrains/kotlinconf/ConferenceService.kt; network/ApplicationApi.kt:41 apiUrl("config")'),
C('C9','Platform-specific graph (e.g. AndroidAppGraph) — annotated @DependencyGraph(AppScope::class)',C_,'verified','app/androidApp/src/main/kotlin/org/jetbrains/kotlinconf/android/AndroidAppGraph.kt:12'),
C('C10',':app:ui-components has its own resource class (UiRes) separate from the main app',C_,'unverifiable','app/ui-components/build.gradle.kts',note='generated resource class name; not verified by labeller')]
write('JetBrains_kotlinconf-app',repo='JetBrains/kotlinconf-app',url='https://github.com/JetBrains/kotlinconf-app',commit='907ce238e1ffe2472991eeb2d2bfa386bdb4ea8f',
platform_roots={'kmp':['app/shared','core'],'android':['app/androidApp'],'ios':['app/iosApp'],'desktop':['app/desktopApp'],'web':['app/webApp','app/adminApp'],'server':['backend']},screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,claims=cl,
notes='All routes in one Routes.kt; each has a class name AND a @SerialName (route_id may be either; listed in aliases). Route data object ScheduleScreen collides with composable fun ScheduleScreen in screens/ScheduleScreen.kt (same name, different symbol). No testTag in app; no deep links (only LAUNCHER intent-filter, no CFBundleURLTypes). Client API paths are relative ("$year/$path") - labelled with {year} placeholder. Platform kmp: scorer treats kmp/android/ios/common as equivalent for this repo (platform_aliases).',
platform_aliases={'kmp':['kmp','common','android','ios','desktop','jvm','wasm','web']})
