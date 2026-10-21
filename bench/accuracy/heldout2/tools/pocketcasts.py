import sys; sys.path.insert(0,'.')
from mk import *
J='/src/main/java/au/com/shiftyjelly/pocketcasts/'
F='modules/features/'
def A_(cls,path,**kw): return S('android',cls,path,'activity',**kw)
def Fr(cls,path,**kw): return S('android',cls,path,'fragment',**kw)
scr=[A_('MainActivity','app'+J+'ui/MainActivity.kt'),
A_('AccountActivity',F+'account'+J+'account/AccountActivity.kt',note='declared in profile module manifest with FQCN'),
A_('OnboardingActivity',F+'account'+J+'account/onboarding/OnboardingActivity.kt'),
A_('StoriesActivity',F+'endofyear'+J+'endofyear/StoriesActivity.kt'),
A_('VideoActivity',F+'player'+J+'player/view/video/VideoActivity.kt'),
A_('BookmarkActivity',F+'player'+J+'player/view/bookmark/BookmarkActivity.kt'),
A_('ShareListCreateActivity',F+'podcasts'+J+'podcasts/view/share/ShareListCreateActivity.kt'),
A_('AddFileActivity',F+'profile'+J+'profile/cloud/AddFileActivity.kt'),
A_('WebViewActivity','modules/services/views'+J+'views/activity/WebViewActivity.kt'),
A_('SonosAppLinkActivity',F+'profile'+J+'profile/sonos/SonosAppLinkActivity.kt'),
A_('NotificationOpenReceiverActivity','modules/services/repositories'+J+'repositories/notification/NotificationOpenReceiverActivity.kt',optional=True,note='trampoline activity'),
A_('ActivityConfigPlayPlaylist',F+'taskerplugin'+J+'taskerplugin/playplaylist/config/ActivityConfigPlayPlaylist.kt',optional=True,note='Tasker plugin config activity'),
Fr('PodcastFragment',F+'podcasts'+J+'podcasts/view/podcast/PodcastFragment.kt'),
Fr('EpisodeFragment',F+'podcasts'+J+'podcasts/view/episode/EpisodeFragment.kt'),
Fr('PodcastsFragment',F+'podcasts'+J+'podcasts/view/podcasts/PodcastsFragment.kt'),
Fr('DiscoverFragment',F+'discover'+J+'discover/view/DiscoverFragment.kt'),
Fr('ProfileFragment',F+'profile'+J+'profile/ProfileFragment.kt'),
Fr('SettingsFragment',F+'settings'+J+'settings/SettingsFragment.kt',note='same class name exists in filters module (playlists.SettingsFragment)'),
Fr('SettingsFragment',F+'filters'+J+'playlists/SettingsFragment.kt',note='internal playlist settings fragment; same simple name as settings.SettingsFragment'),
Fr('SearchFragment',F+'search'+J+'search/SearchFragment.kt'),
Fr('UpNextFragment',F+'player'+J+'player/view/UpNextFragment.kt'),
Fr('StatsFragment',F+'settings'+J+'settings/stats/StatsFragment.kt'),
Fr('HelpFragment',F+'settings'+J+'settings/HelpFragment.kt'),
Fr('CloudFilesFragment',F+'profile'+J+'profile/cloud/CloudFilesFragment.kt'),
Fr('PlaylistFragment',F+'filters'+J+'playlists/PlaylistFragment.kt'),
Fr('BookmarksFragment',F+'player'+J+'player/view/bookmark/BookmarksFragment.kt',optional=True,note='hosted inside player/BookmarkActivity as well as player tabs')]
M='app/src/main/AndroidManifest.xml'
ns=[N('android','MainActivity_1',M,'<activity-alias> for alternate app icon, targets MainActivity'),
N('android','BaseFragment','modules/services/views'+J+'views/fragments/BaseFragment.kt','abstract base class'),
N('android','BaseDialogFragment','modules/services/views'+J+'views/fragments/BaseDialogFragment.kt','base class'),
N('android','SwipeableStarsPreview',F+'podcasts'+J+'podcasts/view/components/ratings/SwipeableStars.kt','@Preview'),
N('android','PodcastViewHolder',F+'podcasts'+J+'podcasts/view/share/ShareListIncomingAdapter.kt','RecyclerView ViewHolder')]
def DL(scheme,host,path,line,**kw): return D('android',scheme,host,path,M,f'intent-filter@{line}',**kw)
dls=[DL('pktc','*','',96),DL('https','pca.st','',104),DL('https','pcast.pocketcasts.net','',112),
DL('https','pocketcasts.com','/pair',120),DL('https','pocketcasts.net','/pair',129),
DL('https','play.pocketcasts.com','/podcasts/',138,kind='pathPrefix'),DL('https','play.pocketcasts.net','/podcasts/',147,kind='pathPrefix'),
DL('https','pocketcasts.com','/podcasts/',156,kind='pathPrefix'),DL('https','pocketcasts.net','/podcasts/',165,kind='pathPrefix'),
DL('https','pocket-casts-main-development.mystagingwebsite.com','/redeem',174,kind='pathPrefix'),DL('https','pocketcasts.com','/redeem',183,kind='pathPrefix'),
DL('itpc','','',246),DL('pcast','','',246),DL('feed','','',246),DL('rss','','',246),
DL('https','itunes.apple.com','',255,note='pathPattern /.*/podcast/.*'),DL('https','podcasts.apple.com','',255,note='pathPattern /.*/podcast/.*'),
DL('http','podcasts.apple.com','',255,optional=True),
DL('https','subscribeonandroid.com','',307,note='pathPattern; scheme/host split across <data> tags'),DL('https','www.subscribeonandroid.com','',307),
DL('https','lists.pocketcasts.com','',319),DL('https','pocketcasts.com','/get',327,note='split <data> tags: path=/get + pathPrefix=/get/'),
DL('https','pocket-casts-main-development.mystagingwebsite.com','/get',337),
DL('file','*','',65,optional=True,note='mime-type opml file open'),DL('content','*','',79,optional=True,note='mime text/xml')]
tids=[T('android','option_$index','modules/services/compose'+J+'compose/dialogs/OptionsDialogComponent.kt',87,dynamic=True,note='only testTag in main sources')]
SV='modules/services/servers'+J+'servers/'
apis=[A('GET','/discover/{platform}/content_v{version}.json',SV+'server/ListWebService.kt'),
A('POST','import/opml',SV+'refresh/RefreshService.kt'),A('GET','api/v1/update_podcast',SV+'refresh/RefreshService.kt'),
A('GET','/autocomplete/search',SV+'search/AutoCompleteSearchService.kt'),
A('GET','/mobile/podcast/full/{podcastUuid}',SV+'podcast/PodcastCacheService.kt'),
A('GET','/mobile/episode/url/{podcastUuid}/{episodeUuid}',SV+'podcast/PodcastCacheService.kt'),
A('POST','/user/stats/summary',SV+'sync/SyncService.kt'),A('DELETE','/files/{uuid}',SV+'sync/SyncService.kt'),
A('PUT','/user/whats_new/read',SV+'sync/SyncService.kt'),A('GET','{listId}.json',SV+'list/ListDownloadService.kt',optional=True,note='path is only a placeholder + .json'),
A('GET','{url}',SV+'server/ListWebService.kt',dynamic=True,expect=False,note='@Url full dynamic URL (getListFeed)')]
d=dict(repo='Automattic/pocket-casts-android',url='https://github.com/Automattic/pocket-casts-android',commit='87dc00b7bd31dcfaab14549fa4baa2caae1be687',
platform_roots={'android':['app','modules','automotive','wear','tv']},screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='Fragment-based navigation (addFragment/showBottomSheet) + Activities in multi-module manifests. MainActivity_1..18 are activity-alias (icons), not screens. Deep links: app manifest, sampled non-MIME filters nearly exhaustively (wear:// MESSAGE_RECEIVED excluded; several filters split scheme/host/path across separate <data> tags -> cartesian). Only one testTag in main sources (dynamic "option_$index"; scorer tidNorm patched to treat Kotlin $ident as wildcard). APIs: Retrofit, many leading "/" with different base URLs.')
check('Automattic_pocket-casts-android',d); write('Automattic_pocket-casts-android',**d)
