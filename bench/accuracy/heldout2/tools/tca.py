import sys; sys.path.insert(0,'.')
from mk import *
E='Examples/'; SU=E+'SyncUps/SyncUps/'; CS=E+'CaseStudies/SwiftUICaseStudies/'
def V(v,f,kind='swiftui-destination',**kw): return S('ios',v,f,kind,**kw)
scr=[V('AppView',SU+'AppFeature.swift','swiftui-root',note='SyncUps root NavigationStack(path:); AppView name also in Todos and TicTacToe'),
V('SyncUpsListView',SU+'SyncUpsList.swift','tca-stack-root',reducer='SyncUpsList'),
V('SyncUpDetailView',SU+'SyncUpDetail.swift','tca-path',reducer='SyncUpDetail',aliases=['AppFeature.Path.detail','Path.detail']),
V('MeetingView',SU+'Meeting.swift','tca-path',aliases=['AppFeature.Path.meeting','Path.meeting'],note='no reducer: Path case carries (Meeting, syncUp:)'),
V('RecordMeetingView',SU+'RecordMeeting.swift','tca-path',reducer='RecordMeeting',aliases=['AppFeature.Path.record','Path.record']),
V('SyncUpFormView',SU+'SyncUpForm.swift','tca-destination-sheet',reducer='SyncUpForm',aliases=['SyncUpsList.Destination.add','SyncUpDetail.Destination.edit'],note='presented as sheet from two Destination enums'),
V('CounterDemoView',CS+'01-GettingStarted-Counter.swift'),V('TwoCountersView',CS+'01-GettingStarted-Composition-TwoCounters.swift'),
V('BindingBasicsView',CS+'01-GettingStarted-Bindings-Basics.swift'),V('BindingFormView',CS+'01-GettingStarted-Bindings-Forms.swift'),
V('OptionalBasicsView',CS+'01-GettingStarted-OptionalState.swift'),V('FocusDemoView',CS+'01-GettingStarted-FocusState.swift'),
V('AnimationsView',CS+'01-GettingStarted-Animations.swift'),V('EffectsBasicsView',CS+'03-Effects-Basics.swift'),
V('RefreshableView',CS+'03-Effects-Refreshable.swift'),V('TimersView',CS+'03-Effects-Timers.swift'),V('WebSocketView',CS+'03-Effects-WebSocket.swift'),
V('PresentAndLoadView',CS+'04-Navigation-Sheet-PresentAndLoad.swift'),
V('CitiesView',CS+'05-HigherOrderReducers-ResuableOfflineDownloads/ReusableComponents-Download.swift',note='folder name typo Resuable'),
V('NestedView',CS+'05-HigherOrderReducers-Recursion.swift',note='recursive: NestedView pushes NestedView'),
V('RootView',CS+'00-RootView.swift','swiftui-root',optional=True,note='CaseStudies index list of NavigationLink("...") { Demo(store:) { XView } }')]
ns=[N('ios','MeetingHeaderView',SU+'RecordMeeting.swift','subview of RecordMeetingView'),N('ios','MeetingTimerView',SU+'RecordMeeting.swift','subview'),
N('ios','MeetingFooterView',SU+'RecordMeeting.swift','subview'),N('ios','CardView',SU+'SyncUpsList.swift','list row'),
N('ios','ThemePicker',SU+'SyncUpForm.swift','form control'),N('ios','Demo',CS+'00-RootView.swift','generic wrapper that owns the Store for a case study',borderline=True)]
dls=[D('ios','integration','','',E+'Integration/Integration/Info.plist','CFBundleURLSchemes',optional=True,note='UI-test harness app only')]
IT=E+'Integration/Integration/'; OS=IT+'iOS 17/ObservableSharedStateTestCase.swift'
tids=[T('ios','composable-architecture.debug.logs',IT+'IntegrationApp.swift',13),T('ios','isAppStorageOn1',OS,16),T('ios','isAppStorageOn2',OS,21),
T('ios','isFileStorageOn1',OS,37),T('ios','isFileStorageOn2',OS,42),T('ios','isInMemoryOn1',OS,58),T('ios','isInMemoryOn2',OS,63)]
WC=E+'Search/Search/WeatherClient.swift'
apis=[A('GET','v1/forecast',WC,note='URLComponents(string:"https://api.open-meteo.com/v1/forecast") + queryItems; URLSession.shared.data(from:)'),
A('GET','v1/search',WC,note='geocoding-api.open-meteo.com')]
d=dict(repo='pointfreeco/swift-composable-architecture',url='https://github.com/pointfreeco/swift-composable-architecture',commit='bc2db5ba8ad3a47deba5db32fa340637ba6c9a76',
platform_roots={'ios':['Examples']},scope='Examples/ only (sparse checkout); run extractor on Examples/ or ignore library Sources/',screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='TCA examples. SyncUps: StackState<Path.State> + @Reducer enum Path {detail, meeting, record} mapped in NavigationStack destination: switch; @Reducer enum Destination {add/edit(SyncUpForm), alert} presented as sheets. route_id = View struct, aliases = Path/Destination case. CaseStudies: NavigationLink("title"){ Demo(store:){ XView(store:) } } (sampled 14 of ~25). The SyncUpsList Destination.alert / RecordMeeting alert are not screens. testIDs only in Integration harness. APIs: open-meteo URLComponents literals only.')
check('pointfreeco_swift-composable-architecture',d); write('pointfreeco_swift-composable-architecture',**d)
