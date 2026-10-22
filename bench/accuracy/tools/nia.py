import sys; sys.path.insert(0,'.')
from mk import *
F='feature/%s/%s/src/main/kotlin/com/google/samples/apps/nowinandroid/feature/%s/%s/'
def fp(feat,mod,rest): return (F%(feat,mod,feat,mod))+rest
scr=[S('android','ForYouNavKey',fp('foryou','api','navigation/ForYouNavKey.kt'),'nav3-navkey',screen_fn='ForYouScreen',screen_file=fp('foryou','impl','ForYouScreen.kt')),
S('android','SearchNavKey',fp('search','api','navigation/SearchNavKey.kt'),'nav3-navkey',screen_fn='SearchScreen'),
S('android','BookmarksNavKey',fp('bookmarks','api','navigation/BookmarksNavKey.kt'),'nav3-navkey',screen_fn='BookmarksScreen'),
S('android','TopicNavKey',fp('topic','api','navigation/TopicNavKey.kt'),'nav3-navkey',screen_fn='TopicScreen',args=['id']),
S('android','InterestsNavKey',fp('interests','api','navigation/InterestsNavKey.kt'),'nav3-navkey',screen_fn='InterestsScreen'),
S('android','ForYouScreen',fp('foryou','impl','ForYouScreen.kt'),'compose-screen',alt_of='ForYouNavKey'),
S('android','SearchScreen',fp('search','impl','SearchScreen.kt'),'compose-screen',alt_of='SearchNavKey'),
S('android','BookmarksScreen',fp('bookmarks','impl','BookmarksScreen.kt'),'compose-screen',alt_of='BookmarksNavKey'),
S('android','TopicScreen',fp('topic','impl','TopicScreen.kt'),'compose-screen',alt_of='TopicNavKey'),
S('android','InterestsScreen',fp('interests','impl','InterestsScreen.kt'),'compose-screen',alt_of='InterestsNavKey'),
S('android','SettingsDialog',fp('settings','impl','SettingsDialog.kt'),'compose-dialog',note='shown as dialog from NiaApp, not a nav destination; counted as screen-ish',optional=True),
S('android','MainActivity','app/src/main/kotlin/com/google/samples/apps/nowinandroid/MainActivity.kt','activity')]
ns=[N('android','LoadingStatePreview',fp('bookmarks','impl','BookmarksScreen.kt'),'@Preview'),
N('android','EmptyStatePreview',fp('bookmarks','impl','BookmarksScreen.kt'),'@Preview'),
N('android','InterestsScreen (test helper)','feature/interests/impl/src/androidTest/kotlin/com/google/samples/apps/nowinandroid/feature/interests/impl/InterestsScreenTest.kt','private test helper composable with same name as real screen'),
N('android','NewsResourceCardExpanded','core/ui/src/main/kotlin/com/google/samples/apps/nowinandroid/core/ui/NewsResourceCard.kt','reusable card component'),
N('android','NiaTopAppBar','core/designsystem/src/main/kotlin/com/google/samples/apps/nowinandroid/core/designsystem/component/TopAppBar.kt','design-system component'),
N('android','SettingsDialogSectionTitle',fp('settings','impl','SettingsDialog.kt'),'private sub-composable')]
dl=[D('android','https','www.nowinandroid.apps.samples.google.com','','app/src/main/AndroidManifest.xml','MainActivity intent-filter'),
D('android','https','www.nowinandroid.apps.samples.google.com','/foryou/{linkedNewsResourceId}','core/notifications/src/main/kotlin/com/google/samples/apps/nowinandroid/core/notifications/SystemTrayNotifier.kt','DEEP_LINK_BASE_PATH used in notification PendingIntent',optional=True)]
t=lambda tid,f,l,**kw:T('android',tid,f,l,**kw)
tids=[t('forYou:feed',fp('foryou','impl','ForYouScreen.kt'),172),t('search:newsResources',fp('search','impl','SearchScreen.kt'),307),t('searchTextField',fp('search','impl','SearchScreen.kt'),532),
t('bookmarks:loading',fp('bookmarks','impl','BookmarksScreen.kt'),158),t('bookmarks:feed',fp('bookmarks','impl','BookmarksScreen.kt'),185),t('bookmarks:empty',fp('bookmarks','impl','BookmarksScreen.kt'),225),
t('loadingWheel','core/designsystem/src/main/kotlin/com/google/samples/apps/nowinandroid/core/designsystem/component/LoadingWheel.kt',116),
t('niaTopAppBar','core/designsystem/src/main/kotlin/com/google/samples/apps/nowinandroid/core/designsystem/component/TopAppBar.kt',73),
t('NiaNavItem','app/src/main/kotlin/com/google/samples/apps/nowinandroid/ui/NiaApp.kt',184),
t('topic:${viewModel.topicId}',fp('topic','impl','TopicScreen.kt'),89,dynamic=True),
t('newsResourceCard:${userNewsResource.id}','core/ui/src/main/kotlin/com/google/samples/apps/nowinandroid/core/ui/NewsResourceCard.kt',123,dynamic=True)]
R='core/network/src/main/kotlin/com/google/samples/apps/nowinandroid/core/network/retrofit/RetrofitNiaNetwork.kt'
apis=[A('GET','topics',R),A('GET','newsresources',R),A('GET','changelists/topics',R),A('GET','changelists/newsresources',R)]
AJ='docs/ArchitectureLearningJourney.md'
cl=[C('C1','On app startup, a WorkManager job to sync all repositories is enqueued',AJ,'verified','sync/work/src/main/kotlin/com/google/samples/apps/nowinandroid/sync/initializers/SyncInitializer.kt:30'),
C('C2','The user data repository obtains UserData from a local data source backed by Proto DataStore',AJ,'verified','core/datastore-proto'),
C('C3','OfflineFirstNewsRepository calls RetrofitNiaNetwork to execute the actual API request using Retrofit',AJ,'verified','core/data/src/main/kotlin/com/google/samples/apps/nowinandroid/core/data/repository/OfflineFirstNewsRepository.kt:48'),
C('C4','OfflineFirstNewsRepository syncs the remote data with NewsResourceDao',AJ,'verified','core/database/src/main/kotlin/com/google/samples/apps/nowinandroid/core/database/dao/NewsResourceDao.kt:35'),
C('C5','The data flow is achieved using streams, implemented using Kotlin Flows',AJ,'verified','core/data/src/main/kotlin/com/google/samples/apps/nowinandroid/core/data/repository/OfflineFirstNewsRepository.kt'),
C('C6','Now In Android uses Roborazzi to run screenshot tests','README.md','verified','gradle/libs.versions.toml:61 roborazzi'),
C('C7','screenshot tests NiaAppScreenSizesScreenshotTests verify navigation on different screen sizes','README.md','verified','app/src/testDemo/kotlin/com/google/samples/apps/nowinandroid/ui/NiaAppScreenSizesScreenshotTests.kt'),
C('C8','The baseline profile for this app is located at app/src/main/baseline-prof.txt','README.md','conflict','app/build.gradle.kts:136 baselineProfile(projects.benchmarks) (generated by plugin; file not in repo)'),
C('C9','Find all tests written using Macrobenchmark in the benchmarks module','README.md','verified','benchmarks/'),
C('C10','The app uses Hilt for dependency injection','README.md/docs (Architecture)','verified','app/build.gradle.kts:24 nowinandroid.hilt')]
write('nowinandroid',repo='android/nowinandroid',url='https://github.com/android/nowinandroid',commit='a49ed253d75e61a2b6ab80a8da677b57437b08eb',
platform_roots={'android':['app','feature','core','sync']},screens=scr,not_screens=ns,deeplinks=dl,testids=tids,apis=apis,claims=cl,
notes='Navigation 3 (NavKey + entry<Key>{...} in *EntryProvider.kt); api/impl split per feature. Both NavKey and Screen composable are labelled; the scorer treats entries with alt_of as aliases of the same route (a hit on either counts once). Settings is a Dialog. Retrofit paths are relative to base URL. Clone reused read-only from oss2.')
