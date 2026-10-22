import sys; sys.path.insert(0,'.')
from mk import *
J='app/src/main/java/me/ash/reader/'; K=J+'ui/page/nav3/key/NavKey.kt'; E=J+'ui/page/nav3/AppEntry.kt'; U=J+'ui/page/'
def R(case,page,pfile,**kw): return S('android','Route.'+case,K,'nav3-navkey',symbol='Route.'+case,screen_fn=page,screen_file=U+pfile,alt_files=[U+pfile],**kw)
scr=[R('Startup','StartupPage','startup/StartupPage.kt'),R('Feeds','FeedsPage','home/feeds/FeedsPage.kt'),
R('Reading','ArticleListReaderPage','adaptive/ArticleListReadingPage.kt',note='data class Reading(articleId) ; entry composes ArticleListReaderPage (file name differs: ArticleListReadingPage.kt); old ReadingPage call commented out'),
R('Settings','SettingsPage','settings/SettingsPage.kt'),R('Accounts','AccountsPage','settings/accounts/AccountsPage.kt'),
R('AccountDetails','AccountDetailsPage','settings/accounts/AccountDetailsPage.kt',note='data class with accountId'),
R('AddAccounts','AddAccountsPage','settings/accounts/AddAccountsPage.kt'),R('ColorAndStyle','ColorAndStylePage','settings/color/ColorAndStylePage.kt'),
R('DarkTheme','DarkThemePage','settings/color/DarkThemePage.kt'),R('ReadingPageStyle','ReadingStylePage','settings/color/reading/ReadingStylePage.kt'),
R('ReadingBoldCharacters','BoldCharactersPage','settings/color/reading/BoldCharactersPage.kt'),
R('Interaction','InteractionPage','settings/interaction/InteractionPage.kt'),R('Languages','LanguagesPage','settings/languages/LanguagesPage.kt'),
R('Troubleshooting','TroubleshootingPage','settings/troubleshooting/TroubleshootingPage.kt'),
R('TipsAndSupport','TipsAndSupportPage','settings/tips/TipsAndSupportPage.kt'),R('LicenseList','LicenseListPage','settings/tips/LicenseListPage.kt'),
S('android','MainActivity',J+'infrastructure/android/MainActivity.kt','activity',optional=True,note='single host activity'),
S('android','WidgetConfigActivity',J+'ui/widget/WidgetConfigActivity.kt','activity',optional=True)]
ns=[N('android','RouteName',U+'common/RouteName.kt','legacy string route constants (STARTUP/FEEDS/...) no longer referenced anywhere; Nav3 Route keys replaced them',borderline=True),
N('android','FlowPage',U+'home/flow/FlowPage.kt','Route.Flow is commented out; FlowPage only embedded inside ArticleListReaderPage',borderline=True),
N('android','AddFeverAccountDialog',U+'settings/accounts/addition/AddFeverAccountDialog.kt','dialog, not a route'),
N('android','ArticleListWidgetReceiver',J+'ui/widget/ArticleListWidget.kt','AppWidget receiver'),
N('android','animatedComposable',J+'ui/ext/NavGraphBuilderExt.kt','helper extension, unused nav-compose wrapper')]
M='app/src/main/AndroidManifest.xml'
dls=[D('android','http','*','',M,'intent-filter VIEW mimeType rss/atom',optional=True,note='MIME-driven feed subscribe; host=*'),
D('android','https','*','',M,'intent-filter VIEW mimeType rss/atom',optional=True)]
G=J+'infrastructure/rss/provider/greader/GoogleReaderAPI.kt'; FV=J+'infrastructure/rss/provider/fever/FeverAPI.kt'; ND=J+'infrastructure/net/NetworkDataSource.kt'
def GA(m,p,**kw): return A(m,p,G,note='OkHttp "$serverUrl$query?output=json"',**kw)
apis=[A('POST','accounts/ClientLogin',G,note='"${serverUrl}accounts/ClientLogin"'),A('GET','reader/api/0/token',G),
GA('GET','reader/api/0/user-info'),GA('GET','reader/api/0/subscription/list'),GA('GET','reader/api/0/stream/items/ids'),
GA('POST','reader/api/0/stream/items/contents'),GA('POST','reader/api/0/subscription/quickadd'),GA('POST','reader/api/0/edit-tag'),
GA('POST','reader/api/0/disable-tag'),GA('POST','reader/api/0/rename-tag'),GA('POST','reader/api/0/subscription/edit'),
GA('POST','reader/api/0/mark-all-as-read'),
A('GET','{url}',ND,dynamic=True,expect=False,note='Retrofit @GET @Url getReleaseLatest/downloadFile')]
d=dict(repo='Ashinch/ReadYou',url='https://github.com/Ashinch/ReadYou',commit='d2b979ccad9a3e54b9499929a9dc2824578b0fd9',
platform_roots={'android':['app']},screens=scr,not_screens=ns,deeplinks=dls,testids=[],apis=apis,
notes='Compose Navigation 3: sealed interface Route : NavKey (NavKey.kt) + when(key) entryProvider in AppEntry.kt; route_id = Route.<Case>, screen_fn = Page composable. RouteName.kt string constants are stale (negative). No testTag. APIs: GoogleReader/FreshRSS via raw OkHttp string concat; Fever single endpoint "$serverUrl?api=&$query" (query-string only, not labelled); Retrofit only with @Url.')
check('Ashinch_ReadYou',d); write('Ashinch_ReadYou',**d)
