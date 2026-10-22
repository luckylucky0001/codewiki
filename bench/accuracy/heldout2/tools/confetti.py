import sys; sys.path.insert(0,'.')
from mk import *
DC='shared/src/commonMain/kotlin/dev/johnoreilly/confetti/decompose/'
W='wearApp/src/main/java/dev/johnoreilly/confetti/wear/'
def SC(name,comp,ui,owner,**kw):
    return S('kmp','Config.'+name,DC+owner+'.kt','decompose-config',symbol='Config.'+name,aliases=[f'{owner}.Child.{name}'],
             child_component=comp,screen_fn=ui,**kw)
def WC(name,ui,**kw): return S('android','Config.'+name,W+'navigation/Config.kt','decompose-config',symbol='Config.'+name,aliases=['Child.'+name],screen_fn=ui,**kw)
scr=[SC('Onboarding','OnboardingComponent','OnboardingUI','AppComponent'),SC('Conferences','ConferencesComponent','ConferenceListView','AppComponent'),
SC('Conference','ConferenceComponent','ConferenceView','AppComponent',note='container stack for one conference',optional=True),
SC('Loading',None,None,'AppComponent',optional=True,note='Child.Initializing splash state'),
SC('Home','HomeComponent','HomeView','ConferenceComponent'),SC('SessionDetails','SessionDetailsComponent','SessionDetailsUI','ConferenceComponent'),
SC('SpeakerDetails','SpeakerDetailsComponent','SpeakerDetailsUI','ConferenceComponent'),SC('Settings','SettingsComponent','SettingsUI','ConferenceComponent'),
SC('Agent','ConferenceAgentComponent','ConferenceAgentView','ConferenceComponent'),SC('Venue','VenueComponent','VenueUI','ConferenceComponent'),
SC('Search','SearchComponent','SearchUI','ConferenceComponent'),
SC('Sessions','SessionsComponent','SessionsUI','HomeComponent',note='bottom-nav child stack of HomeComponent'),SC('Speakers','SpeakersComponent','SpeakersUI','HomeComponent'),
SC('Bookmarks','BookmarksComponent','BookmarksUI','HomeComponent'),SC('Account','AccountComponent','AccountUI','HomeComponent'),
WC('Conferences','ConferencesRoute'),WC('ConferenceSessions','SessionsRoute'),WC('SessionDetails','SessionDetailsRoute'),WC('SpeakerDetails','SpeakerDetailsRoute'),
WC('Settings','SettingsRoute'),WC('Bookmarks','BookmarksRoute'),WC('Home','HomeRoute'),WC('Loading',None,optional=True)]
for s in scr:
    for k in ['child_component','screen_fn']:
        if s.get(k) is None: s.pop(k,None)
UI='shared/src/commonMain/kotlin/dev/johnoreilly/confetti/ui/'
ns=[N('kmp','SessionItemView',UI+'sessions/SessionItemView.kt','list row composable'),N('kmp','SpeakerItemView',UI+'speakers/SpeakerItemView.kt','list row'),
N('kmp','ErrorView',UI+'component/ErrorView.kt','state placeholder'),N('kmp','LoadingView',UI+'component/LoadingView.kt','state placeholder',borderline=True),
N('kmp','SessionDetailsKey','shared/src/mobileMain/kotlin/dev/johnoreilly/confetti/navigation/SessionDetailsKey.kt','plain data class named *Key, not a NavKey/route'),
N('kmp','ConferenceDayKey','shared/src/mobileMain/kotlin/dev/johnoreilly/confetti/navigation/ConferenceDayKey.kt','plain data class, not a route')]
AM='androidApp/src/main/AndroidManifest.xml'; WM='wearApp/src/main/AndroidManifest.xml'
dls=[D('android','https','confetti-app.dev','',AM,'MainActivity intent-filter autoVerify'),
D('android','https','confetti-app.dev','/conference/{conference}/session/{session}','androidApp/src/main/java/dev/johnoreilly/confetti/DeepLink.kt','in-code path parse',kind='in-app-url',optional=True),
D('android','confetti','confetti','',WM,'wear MainActivity intent-filter',platform_note='wearApp'),
D('android','https','confetti-app.dev','',WM,'wear MainActivity intent-filter autoVerify',optional=True,note='duplicate of phone app link, in wear manifest')]
tids=[T('kmp','conference.id',UI+'ConferenceListView.kt',209,expect=False,note='testTag(conference.id) pure variable; only testTag in repo')]
apis=[A('POST','/graphql','shared/src/androidMain/kotlin/dev/johnoreilly/confetti/di/KoinAndroid.kt',note='Apollo serverUrl https://confetti-app.dev/graphql; operations are .graphql documents',alt_files=['shared/src/iosMain/kotlin/dev/johnoreilly/confetti/di/KoiniOS.kt'])]
d=dict(repo='joreilly/Confetti',url='https://github.com/joreilly/Confetti',commit='c517e458e032ac4e0073d5d7163adcd5e2d04d05',
platform_roots={'kmp':['shared'],'android':['androidApp','wearApp','automotiveApp','common'],'ios':['iosApp']},platform_aliases={'kmp':['android','ios','desktop','web']},
screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='Decompose navigation: private sealed class Config per component (AppComponent/ConferenceComponent/HomeComponent in shared commonMain; separate Config.kt in wearApp) -> Child -> UI composable. route_id = Config.<Name>; SAME names (Config.Settings, Config.SessionDetails, Config.Conferences, Config.Home, Config.Bookmarks, Config.Loading) exist in shared and wear -> matched per module dir. *Key data classes in mobileMain are NOT routes. Only GraphQL endpoint; testTag only a variable.')
check('joreilly_Confetti',d); write('joreilly_Confetti',**d)
