import sys; sys.path.insert(0,'.')
from mk import *
B='features/%s/impl/src/main/kotlin/io/element/android/features/%s/impl/%s.kt'
nodes=[('OnBoardingNode','login','screens/onboarding/OnBoardingNode'),('LoginWithClassicNode','login','screens/classic/loginwithclassic/LoginWithClassicNode'),('LogoutNode','logout','LogoutNode'),('ConfirmAccountProviderNode','login','screens/confirmaccountprovider/ConfirmAccountProviderNode'),('PreferencesRootNode','preferences','root/PreferencesRootNode'),('RoomDetailsNode','roomdetails','RoomDetailsNode'),('MessagesNode','messages','MessagesNode'),('UserProfileNode','userprofile','root/UserProfileNode'),('ReportRoomNode','reportroom','ReportRoomNode'),('SetupPinNode','lockscreen','setup/pin/SetupPinNode'),('NotificationSettingsNode','preferences','notifications/NotificationSettingsNode'),('QrCodeIntroNode','login','screens/qrcode/intro/QrCodeIntroNode'),('ThreadedMessagesNode','messages','threads/ThreadedMessagesNode'),('AnalyticsOptInNode','analytics','AnalyticsOptInNode'),('RoomMemberDetailsNode','roomdetails','members/details/RoomMemberDetailsNode'),('DependencyLicensesListNode','licenses','list/DependencyLicensesListNode'),('SignedOutNode','signedout','SignedOutNode'),('ModerationAndSafetyNode','preferences','moderation/ModerationAndSafetyNode'),('SecureBackupRootNode','securebackup','root/SecureBackupRootNode')]
scr=[S('android',n,B%(m,m,p),'appyx-node',note='@ContributesNode Appyx leaf Node (screen = Node+Presenter+View)') for n,m,p in nodes]
scr.append(S('android','MainActivity','app/src/main/kotlin/io/element/android/x/MainActivity.kt','activity',optional=True))
AN='appnav/src/main/kotlin/io/element/android/appnav/'
ns=[N('android','RootFlowNode',AN+'RootFlowNode.kt','Appyx ParentNode/flow container (backstack host), not a leaf screen',borderline=True),
N('android','LoggedInFlowNode',AN+'LoggedInFlowNode.kt','flow container',borderline=True),
N('android','LoggedInFlowNode.NavTarget.Placeholder',AN+'LoggedInFlowNode.kt','placeholder NavTarget (empty)'),
N('android','RoomFlowNode.NavTarget.Loading',AN+'room/RoomFlowNode.kt','loading state NavTarget'),
N('android','JoinedRoomFlowNode.NavTarget.Loaded',AN+'room/joined/JoinedRoomFlowNode.kt','state NavTarget wrapping child flow'),
N('android','HomeFlowNode','features/home/impl/src/main/kotlin/io/element/android/features/home/impl/HomeFlowNode.kt','flow node (container)',borderline=True)]
M='app/src/main/AndroidManifest.xml'
dl=[D('android','elementx','open','',M,'notification deep link intent-filter; parsed by libraries/deeplink DefaultDeeplinkParser (HOST="open")'),
D('android','@string/login_redirect_scheme','','',M,'OAuth redirect; resValue in app/build.gradle.kts = io.element.android(.debug)',resolved_scheme='io.element.android'),
D('android','https','app.element.io','',M,'autoVerify'),D('android','https','develop.element.io','',M,'autoVerify'),D('android','https','staging.element.io','',M,'autoVerify'),
D('android','https','mobile.element.io','/element/',M,'autoVerify android:path'),
D('android','matrix','','',M,'scheme-only'),D('android','element','user','',M,'element://user'),D('android','element','room','',M,'element://room')]
TT='libraries/testtags/src/main/kotlin/io/element/android/libraries/testtags/TestTags.kt'
F='features/%s/impl/src/main/kotlin/io/element/android/features/%s/impl/%s'
tid=[('onboarding-sign_in',18,F%('login','login','screens/onboarding/OnBoardingView.kt'),306),('login-continue',26,F%('login','login','screens/classic/loginwithclassic/LoginWithClassicView.kt'),168),('login-password',25,F%('deactivation','deactivation','AccountDeactivationView.kt'),268),('verification-recovery_key',31,F%('securebackup','securebackup','setup/views/RecoveryKeyView.kt'),208),('sign-out-submit',38,F%('logout','logout','LogoutView.kt'),153),('change_server-server',43,F%('login','login','screens/confirmaccountprovider/ConfirmAccountProviderView.kt'),173),('home_screen-settings',48,F%('home','home','components/HomeTopBar.kt'),346),('settings-user_profile',54,F%('preferences','preferences','root/PreferencesRootView.kt'),114),('room_detail-avatar',59,F%('roomdetails','roomdetails','RoomDetailsView.kt'),497),('login-email_username',24,None,None)]
tids=[]
for v,dl_,uf,ul in tid:
    d=T('android',v,TT,dl_,note='value declared as TestTag("...") in central TestTags object; applied via Modifier.testTag(TestTags.x) (semantics testTag + testTagsAsResourceId)')
    if uf: d['use_file']=uf; d['use_line']=ul; d['alt_files']=[uf]
    tids.append(d)
apis=[A('POST','_matrix/push/v1/notify','libraries/push/impl/src/main/kotlin/io/element/android/libraries/push/impl/pushgateway/PushGatewayAPI.kt',note='@POST(PushGatewayConfig.URI_PUSH_GATEWAY_PREFIX_PATH + "notify") - constant concatenation'),
A('GET','_matrix/push/v1/notify','libraries/pushproviders/unifiedpush/src/main/kotlin/io/element/android/libraries/pushproviders/unifiedpush/network/UnifiedPushApi.kt')]
cl=[C('C1','Style enforced by Editor config; Hard wrap at 160 chars','AGENTS.md','verified','.editorconfig:7 max_line_length = 160'),
C('C2','We use Timber for logging. Never use android.util.Log','AGENTS.md','conflict','libraries/androidutils/src/main/kotlin/io/element/android/libraries/androidutils/browser/ConsoleMessageLogger.kt:11 imports android.util.Log',note='may only use Log priority constants; strictness debatable'),
C('C3','New English strings go in temporary.xml','AGENTS.md','verified','libraries/ui-strings/src/main/res/values/temporary.xml'),
C('C4','Exactly one pr- label (see .github/release.yml)','AGENTS.md','verified','.github/release.yml'),
C('C5','Update Docs TOC: ./gradlew generateDocsToc','AGENTS.md','verified','build.gradle.kts:214'),
C('C6','Format: ./gradlew ktlintFormat','AGENTS.md','verified','build.gradle.kts:61 org.jlleitschuh.gradle.ktlint'),
C('C7','We use Appyx for navigation and Molecule for Presenters','AGENTS.md','verified','gradle/libs.versions.toml:43 appyx, :204 molecule-runtime'),
C('C8','We use Metro for DI; Use @ContributesNode(RoomScope::class) for Appyx Nodes','AGENTS.md','verified','features/messages/impl/src/main/kotlin/io/element/android/features/messages/impl/MessagesNode.kt'),
C('C9','Features follow a 3-module structure: api, impl, test','AGENTS.md','verified','features/login/{api,impl,test}'),
C('C10','Android Matrix client (Compose UI + matrix-rust-sdk)','AGENTS.md','verified','libraries/rustsdk')]
write('element-hq_element-x-android',repo='element-hq/element-x-android',url='https://github.com/element-hq/element-x-android',commit='85b63e571afc448068164d865285e11385e18723',
platform_roots={'android':['app','appnav','features','libraries']},screens=scr,not_screens=ns,deeplinks=dl,testids=tids,apis=apis,claims=cl,
notes='Appyx navigation: 122 @ContributesNode nodes; sample of 19 leaf Nodes. Route identity in Appyx is the NavTarget sealed member inside a FlowNode - those are labelled as not_screens when they are state placeholders. testTags are declared centrally (TestTags.kt TestTag("...")) and applied elsewhere; label file = declaration, alt_files = use site; either matches. Most HTTP goes through matrix-rust-sdk (not visible). Clone reused read-only from oss2.')
