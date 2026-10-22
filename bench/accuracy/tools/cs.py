import sys; sys.path.insert(0,'.')
from mk import *
JS='Jetsnack/app/src/main/java/com/example/jetsnack/ui/'
JC='Jetcaster/mobile/src/main/java/com/example/jetcaster/ui/'
JN='JetNews/app/src/main/java/com/example/jetnews/ui/'
RP='Reply/app/src/main/java/com/example/reply/ui/'
scr=[S('android','home/feed',JS+'home/Home.kt','compose-route',symbol='HomeSections.FEED',screen_fn='Feed',app='Jetsnack'),
S('android','home/search',JS+'home/Home.kt','compose-route',symbol='HomeSections.SEARCH',screen_fn='Search',app='Jetsnack'),
S('android','home/cart',JS+'home/Home.kt','compose-route',symbol='HomeSections.CART',screen_fn='Cart',app='Jetsnack'),
S('android','home/profile',JS+'home/Home.kt','compose-route',symbol='HomeSections.PROFILE',screen_fn='Profile',app='Jetsnack'),
S('android','snack/{snackId}?origin={origin}',JS+'JetsnackApp.kt','compose-route',symbol='MainDestinations.SNACK_DETAIL_ROUTE',screen_fn='SnackDetail',app='Jetsnack',note='route built by string concatenation of constants'),
S('android','home',JS+'navigation/JetsnackNavController.kt','compose-route',symbol='MainDestinations.HOME_ROUTE',app='Jetsnack',note='nested graph root'),
S('android','home',JC+'JetcasterAppState.kt','compose-route',symbol='Screen.Home',screen_fn='MainScreen',app='Jetcaster',aliases=['Jetcaster:home']),
S('android','player/{episodeUri}',JC+'JetcasterAppState.kt','compose-route',symbol='Screen.Player',screen_fn='PlayerScreen',app='Jetcaster'),
S('android','podcast/{podcastUri}',JC+'JetcasterAppState.kt','compose-route',symbol='Screen.PodcastDetails',screen_fn='PodcastDetailsScreen',app='Jetcaster'),
S('android','Route.Inbox',RP+'navigation/ReplyNavigationActions.kt','compose-route',symbol='Inbox',app='Reply',note='type-safe composable<Route.Inbox>'),
S('android','Route.Articles',RP+'navigation/ReplyNavigationActions.kt','compose-route',symbol='Articles',app='Reply'),
S('android','Route.DirectMessages',RP+'navigation/ReplyNavigationActions.kt','compose-route',symbol='DirectMessages',app='Reply'),
S('android','Route.Groups',RP+'navigation/ReplyNavigationActions.kt','compose-route',symbol='Groups',app='Reply'),
S('android','HomeKey',JN+'home/HomeScreens.kt','nav3-navkey',screen_fn='HomeFeedScreen',app='JetNews'),
S('android','InterestsKey',JN+'interests/InterestsScreen.kt','nav3-navkey',screen_fn='InterestsScreen',app='JetNews'),
S('android','PostKey',JN+'post/PostScreen.kt','nav3-navkey',app='JetNews',note='DeepLinkKey')]
ns=[N('android','HomeSections','Jetsnack/app/src/main/java/com/example/jetsnack/ui/home/Home.kt','enum holding routes (container, not a screen)'),
N('android','JetsnackBottomBar',JS+'home/Home.kt','bottom bar component'),
N('android','VerticalGrid',JS+'components/Grid.kt','layout component'),
N('android','CollapsingImageLayout',JS+'snackdetail/SnackDetail.kt','custom layout'),
N('android','DeepLinkPattern','JetNews/app/src/main/java/com/example/jetnews/deeplink/util/DeepLinkPattern.kt','deeplink utility class'),
N('android','ReplyInboxScreen',RP+'ReplyListContent.kt','content composable rendered for Route.Inbox; the route key is Route.Inbox',borderline=True)]
dl=[D('android','https','developer.android.com','/jetnews','JetNews/app/src/main/AndroidManifest.xml','intent-filter pathPrefix'),
D('android','https','developer.android.com','/jetnews/interests',JN+'interests/InterestsScreen.kt','DeepLinkPattern uriPattern (Nav3 custom deeplink matcher)'),
D('android','https','developer.android.com','/jetnews/posts/{postId}',JN+'post/PostScreen.kt','DeepLinkPattern uriPattern'),
D('android','https','jetsnack.example.com','/home/cart',JS+'home/Home.kt','navDeepLink uriPattern (no manifest intent-filter -> only internal)',optional=True)]
cl=[C('C1','Jetcaster: Custom theme based on cover art (Jetcaster/app/src/main/java/com/example/jetcaster/util/DynamicTheming.kt)','README.md','conflict','Jetcaster/app no longer exists (mobile/ tv/ wear/); no DynamicTheming in Jetcaster'),
C('C2','Jetsnack: Grid (Jetsnack/.../ui/components/Grid.kt)','README.md','verified',JS+'components/Grid.kt:27 VerticalGrid'),
C('C3','Jetsnack: CollapsingImageLayout (SnackDetail.kt)','README.md','verified',JS+'snackdetail/SnackDetail.kt:483'),
C('C4','Jetsnack: Custom Design System (ui/theme/Theme.kt)','README.md','verified',JS+'theme/Theme.kt JetsnackColors'),
C('C5','Jetchat: AnimatedFabContent (components/AnimatingFabContent.kt)','README.md','verified','Jetchat/app/src/main/java/com/example/compose/jetchat/components/AnimatingFabContent.kt'),
C('C6','Jetcaster - Supporting Pane (ui/home/Home.kt)','README.md','verified',JC+'home/Home.kt:65 SupportingPaneScaffold'),
C('C7','Jetnews - Window Size Classes (ui/MainActivity.kt)','README.md','conflict',JN+'MainActivity.kt (no WindowSizeClass usage in MainActivity)'),
C('C8','Jetsurvey: AnimatedContent','README.md','conflict','no Jetsurvey directory in repo',note='sample removed; link points to an old PR'),
C('C9','Jetcaster - TV and Wear apps','README.md','verified','Jetcaster/tv, Jetcaster/wear'),
C('C10','Jetsnack: Animating Bottom Bar (ui/home/Home.kt)','README.md','verified',JS+'home/Home.kt JetsnackBottomBar')]
write('android_compose-samples',repo='android/compose-samples',url='https://github.com/android/compose-samples',commit='0bc770fd28510b5a16395349e7281f11386ac82f',
platform_roots={'android':['Jetsnack/app','Jetcaster/mobile','Jetcaster/tv','Jetcaster/wear','JetNews/app','Reply/app','Jetchat/app','JetLagged/app']},screens=scr,not_screens=ns,deeplinks=dl,testids=[],apis=[],claims=cl,
notes='Multi-app repo: same route_id "home" appears in Jetsnack and Jetcaster (disambiguated by file). Mixes string routes (Jetsnack/Jetcaster), type-safe routes (Reply composable<Route.X>) and Navigation3 NavKeys with a custom DeepLinkPattern matcher (JetNews). No testTags in main sources; no network APIs labelled (Jetcaster fetches arbitrary RSS URLs). Clone reused read-only from oss2.')
