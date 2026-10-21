import sys; sys.path.insert(0,'.')
from mk import *
P='mobile/src/main/java/com/google/samples/apps/iosched/'
NG='mobile/src/main/res/navigation/nav_graph.xml'; SD='mobile/src/main/res/navigation/schedule_detail.xml'; SL='mobile/src/main/res/navigation/schedule_list.xml'
def NF(nid,cls,path,graph,**kw): return S('android',nid,P+path,'nav-graph-fragment',symbol=cls,aliases=[cls],graph=graph,**kw)
scr=[NF('navigation_schedule','ScheduleTwoPaneFragment','ui/schedule/ScheduleTwoPaneFragment.kt',NG),
NF('navigation_info','InfoFragment','ui/info/InfoFragment.kt',NG),NF('navigation_agenda','AgendaFragment','ui/agenda/AgendaFragment.kt',NG),
NF('navigation_settings','SettingsFragment','ui/settings/SettingsFragment.kt',NG),NF('navigation_feed','FeedFragment','ui/feed/FeedFragment.kt',NG),
NF('navigation_map','MapFragment','ui/map/MapFragment.kt',NG,note='MapFragment also used for navigation_map_sublevel'),
NF('navigation_codelabs','CodelabsFragment','ui/codelabs/CodelabsFragment.kt',NG),
NF('navigation_no_network_ar','NoNetworkConnectionFragment','ui/ar/NoNetworkConnectionFragment.kt',NG),
NF('navigation_phone_does_not_support_arcore','ArCoreNotSupportedFragment','ui/ar/ArCoreNotSupportedFragment.kt',NG),
NF('announcements_fragment','AnnouncementsFragment','ui/feed/AnnouncementsFragment.kt',NG),
NF('navigation_session_detail','SessionDetailFragment','ui/sessiondetail/SessionDetailFragment.kt',SD),
NF('navigation_speaker_detail','SpeakerFragment','ui/speaker/SpeakerFragment.kt',SD),
NF('navigation_schedule_list','ScheduleFragment','ui/schedule/ScheduleFragment.kt',SL),
NF('navigation_schedule_search','SearchFragment','ui/search/SearchFragment.kt',SL),
S('android','LauncherActivity',P+'ui/LauncherActivity.kt','activity',optional=True,note='launcher trampoline, routes to Main/Onboarding'),
S('android','MainActivity',P+'ui/MainActivity.kt','activity'),
S('android','OnboardingActivity',P+'ui/onboarding/OnboardingActivity.kt','activity'),
S('android','ArActivity','ar/src/main/java/com/google/samples/apps/iosched/ar/ArActivity.kt','activity',optional=True,note='AR module activity'),
S('android','SignInDialogFragment',P+'ui/signin/SignInDialogFragment.kt','dialog',optional=True),
S('android','ThemeSettingDialogFragment',P+'ui/settings/ThemeSettingDialogFragment.kt','dialog',optional=True)]
ns=[N('android','navigation_placeholder',SD,'placeholder destination androidx.fragment.app.Fragment (empty detail pane)'),
N('android','navigation_map_sublevel',NG,'second destination id reusing MapFragment (not a distinct screen)',borderline=True),
N('android','to_session_detail',NG,'<action> id, not a destination'),
N('android','nav_graph',NG,'graph id'),
N('android','CountdownView',P+'widget/CountdownView.kt','custom View widget')]
dls=[D('android','iosched','sessions','','mobile/src/main/AndroidManifest.xml','LauncherActivity intent-filter')]
L='mobile/src/main/res/layout/'
TT='mobile/src/androidTest/java/com/google/samples/apps/iosched/tests/ui/'
tids=[T('android','session_detail_title',L+'item_session_info.xml',56,kind='resource-id',alt_files=[TT+'SessionDetailTest.kt']),
T('android','session_detail_recycler_view',L+'fragment_session_detail.xml',47,kind='resource-id'),
T('android','speaker_item_name',L+'item_speaker.xml',59,kind='resource-id'),
T('android','filter_sheet',L+'fragment_filters.xml',35,kind='resource-id',alt_files=[L+'fragment_search.xml']),
T('android','recyclerview_schedule',L+'fragment_schedule.xml',92,kind='resource-id'),
T('android','filter_label',L+'item_filter_chip_selectable.xml',34,kind='resource-id',alt_files=[L+'item_filter_chip_closeable.xml'])]
SH='shared/src/main/java/com/google/samples/apps/iosched/shared/'
apis=[A('GET','/v0/b/io2019-festivus-prod/o/sessions.json','shared/build.gradle.kts',optional=True,note='BuildConfig.CONFERENCE_DATA_URL used in ConferenceDataDownloader (OkHttp)',alt_files=[SH+'data/ConferenceDataDownloader.kt']),
A('ANY','/_ah/api/registration/v1/register','shared/build.gradle.kts',optional=True,note='BuildConfig.REGISTRATION_ENDPOINT_URL, OkHttp Request.Builder (GET default)',alt_files=[SH+'data/signin/AuthenticatedUserRegistration.kt']),
A('GET','{base}/{x}/{z}/{x}/{y}.png',P+'ui/map/MapTileProvider.kt',dynamic=True,expect=False,note='String.format map tile URL')]
d=dict(repo='google/iosched',url='https://github.com/google/iosched',commit='738e1e008096fad5f36612325275e80c33dbe436',
platform_roots={'android':['mobile','shared','ar']},screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='Navigation XML graphs (nav_graph, schedule_detail, schedule_list); route_id = destination @id (declared with @id/ not @+id/, ids defined in ids.xml), symbol/aliases = fragment class. Only deep link: iosched://sessions (no <deepLink> in graphs). testIDs = resource ids actually used by Espresso androidTest (no Compose testTag). Note: tests also reference filter_fab/recyclerview_filter/filter_description_tags/clear_filters_shortcut which no longer exist in res (stale) -> not labelled. Data is mostly Firestore; HTTP only via BuildConfig URLs (optional).')
check('google_iosched',d); write('google_iosched',**d)
