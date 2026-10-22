import sys; sys.path.insert(0,'.')
from mk import *
R='damus/Shared/Utilities/Router.swift'
def RT(case,view,vfile,**kw): return S('ios','Route.'+case,R,'swiftui-route-enum',symbol='Route.'+case,screen_fn=view,view_file=vfile,**kw)
Fe='damus/Features/'
scr=[RT('ProfileByKey','ProfileView',Fe+'Profile/Views/ProfileView.swift',note='Profile and ProfileByKey both render ProfileView'),
RT('Followers','FollowersView',Fe+'Follows/Views/FollowingView.swift',note='FollowersView struct is declared inside FollowingView.swift'),
RT('RelayDetail','RelayDetailView',Fe+'Relays/Views/RelayDetailView.swift'),
RT('MuteList','MutelistView',Fe+'Muting/Views/MutelistView.swift'),RT('RelayConfig','RelayConfigView',Fe+'Relays/Views/RelayConfigView.swift'),
RT('Bookmarks','BookmarksView',Fe+'Bookmarks/Views/BookmarksView.swift'),RT('Config','ConfigView',Fe+'Settings/Views/ConfigView.swift'),
RT('EditMetadata','EditMetadataView',Fe+'Profile/Views/EditMetadataView.swift'),RT('DMChat','DMChatView',Fe+'DMs/Views/DMChatView.swift'),
RT('KeySettings','KeySettingsView',Fe+'Settings/Views/KeySettingsView.swift'),
RT('Thread','ChatroomThreadView',Fe+'Chat/ChatroomThreadView.swift',note='old ThreadView call is commented out'),
RT('Zaps','ZapsView',Fe+'Zaps/Views/ZapsView.swift'),RT('Search','SearchView',Fe+'Search/Views/SearchView.swift'),
RT('EULA','EULAView',Fe+'Onboarding/Views/EULAView.swift'),RT('Login','LoginView',Fe+'Onboarding/Views/LoginView.swift'),
RT('CreateAccount','CreateAccountView',Fe+'Onboarding/Views/CreateAccountView.swift'),RT('SaveKeys','SaveKeysView',Fe+'Onboarding/Views/SaveKeysView.swift'),
RT('Wallet','WalletView',Fe+'Wallet/Views/WalletView.swift'),RT('FollowPack','FollowPackView',Fe+'FollowPack/Views/FollowPackView.swift'),
RT('LiveEvent','LiveStreamView',Fe+'Live/LiveStream/Views/LiveStreamView.swift'),RT('DamusPurple','DamusPurpleView',Fe+'Purple/Views/DamusPurpleView.swift'),
RT('Script','LoadScript',None,note='view is LoadScript (no View suffix)')]
scr[-1].pop('view_file')
ns=[N('ios','Route',R,'the route enum itself'),N('ios','NavigationCoordinator',R,'navigation state object'),
N('ios','ProfileView_Previews',Fe+'Profile/Views/ProfileView.swift','PreviewProvider'),
N('ios','ProfilePicView',Fe+'Profile/Views/ProfilePicView.swift','avatar component'),N('ios','EventView','damus/Features/Events/EventView.swift','timeline row component')]
PL='damus/Info.plist'
dls=[D('ios','damus','','',PL,'CFBundleURLSchemes'),D('ios','nostr','','',PL,'CFBundleURLSchemes'),
D('ios','nostrwalletconnect','','',PL,'CFBundleURLSchemes'),D('ios','nostr+walletconnect','','',PL,'CFBundleURLSchemes'),
D('ios','https','damus.io','','damus/damus.entitlements','applinks'),
D('ios','damus','','purple:verify',Fe+'Purple/Models/DamusPurpleURL.swift','components.path switch',kind='in-app-url',optional=True,note='opaque URL damus:purple:verify?id=..'),
D('ios','damus','','purple:welcome',Fe+'Purple/Models/DamusPurpleURL.swift','components.path switch',kind='in-app-url',optional=True),
D('ios','damus','','purple:landing',Fe+'Purple/Models/DamusPurpleURL.swift','components.path switch',kind='in-app-url',optional=True)]
AI='damus/AppAccessibilityIdentifiers.swift'
def TI(tid,line,use,ul): return T('ios',tid,AI,line,alt_files=[use],use_line=ul,note='enum AppAccessibilityIdentifiers: String case; used as .rawValue')
O='damus/Features/Onboarding/Views/'
tids=[TI('sign_in_option_button',21,O+'SetupView.swift',60),TI('sign_in_nsec_key_entry_field',23,O+'LoginView.swift',382),
TI('sign_in_confirm_button',25,O+'LoginView.swift',107),TI('sign_up_option_button',32,O+'SetupView.swift',47),
TI('onboarding_interest_option_button',49,O+'InterestSelectionView.swift',86),TI('onboarding_interest_page_next_page',52,O+'InterestSelectionView.swift',55),
TI('post_button',82,'damus/Shared/Buttons/PostButton.swift',34),TI('main_side_menu_button',88,'damus/ContentView.swift',895),
TI('main_timeline_filter_accessory',95,'damus/Shared/Components/TimelineFilterAccessory.swift',90),
TI('own_profile_banner_image_edit_button',118,'damus/Shared/Media/Images/BannerImageView.swift',47)]
DP=Fe+'Purple/Models/DamusPurple.swift'; CO=Fe+'Wallet/Models/CoinosDeterministicAccountClient.swift'; TR=Fe+'Translations/Models/Translator.swift'
apis=[A('GET','accounts/{pubkey}',DP,note='api_base_url().appendingPathComponent("accounts/\\(pubkey.hex())")'),
A('GET','/accounts/{pubkey}/account-uuid',DP),A('POST','accounts/{pubkey}/apple-iap/app-store-receipt',DP),
A('GET','ln-checkout/{checkout_id}',DP),A('POST','ln-checkout',DP),
A('POST','https://coinos.io/api/register',CO),A('POST','https://coinos.io/api/login',CO),
A('PUT','user-info/{pubkey}/{token}','damus/Features/Notifications/Models/PushNotificationClient.swift',optional=True,note='chained appendingPathComponent'),
A('POST','/translate',TR,note='nostr.wine / nokyctranslate / libretranslate makeURL(base, path:"/translate")'),A('POST','/v2/translate',TR,note='DeepL')]
d=dict(repo='damus-io/damus',url='https://github.com/damus-io/damus',commit='4a94f666d7e159e380e10b4dbbb2967d1688709e',
platform_roots={'ios':['damus','share extension','highlighter action extension','DamusNotificationService']},screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='SwiftUI NavigationStack driven by `enum Route: Hashable` (Router.swift, ~50 cases sampled 22) with `func view()` switch mapping case->View; route_id = Route.Case, screen_fn = View struct (FollowersView lives in FollowingView.swift; Profile/ProfileByKey share ProfileView). testIDs centralized in enum AppAccessibilityIdentifiers (rawValue = case name), used via .accessibilityIdentifier(X.rawValue). Deep links: 4 Info.plist schemes + applinks damus.io; damus:purple:* opaque in-app URLs optional. APIs via appendingPathComponent on runtime base (Purple api.damus.io), Coinos literals, translator makeURL(path:).')
check('damus-io_damus',d); write('damus-io_damus',**d)
