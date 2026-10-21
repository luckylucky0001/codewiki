import sys,re; sys.path.insert(0,'.')
from mk import *
K='Kickstarter-Framework/Sources/Kickstarter-Framework/Kickstarter-iOS/Features/'
vcs="""MessageThreadsViewController MessageThreads/Controller
ProjectUpdatesViewController ProjectPage/Controller
ProjectPageViewController ProjectPage/Controller
RestrictedCreatorViewController ProjectPage/Controller
VideoViewController ProjectPage/Controller
RootTabBarViewController RootTabBar
ManagePledgeViewController ManagePledge/Controllers
CommentsViewController Comments/Controllers
SettingsViewController Settings/Controller
MessagesViewController Messages/Controller
SearchViewController Search/Controller
SettingsNotificationsViewController SettingsNotifications/Controller
PledgeViewController PledgeView/Controllers
UpdateViewController Update/Controller
MessageDialogViewController MessageDialog/Controller
LoginToutViewController LoginTout/Controller
BackerDashboardViewController BackerDashboardPages/Controller
ActivitiesViewController Activities/Controller
DiscoveryViewController Discovery/Controller
ThanksViewController ThanksProjects/Controller
HelpWebViewController HelpWeb/Controller
PostCampaignCheckoutViewController PledgeView/Controllers
VideoFeedViewController VideoFeed/Controller"""
scr=[S('ios',a,K+b+'/'+a+'.swift','uikit-vc') for a,b in (l.split() for l in vcs.splitlines())]
ns=[N('ios','WebViewController','Kickstarter-Framework/Sources/Kickstarter-Framework/Kickstarter-iOS/Library/WebViewController.swift','base class for web VCs'),
N('ios','SortPagerViewController',K+'SortPager/SortPagerViewController.swift','child VC embedded in DiscoveryViewController'),
N('ios','DiscoveryNavigationHeaderViewController',K+'Discovery/Controller/DiscoveryNavigationHeaderViewController.swift','embedded header child VC'),
N('ios','DiscoveryPageViewController',K+'Discovery/Controller/DiscoveryPageViewController.swift','page child inside DiscoveryViewController UIPageViewController',borderline=True),
N('ios','BackerDashboardProjectsViewController',K+'BackerDashboardProjects/Controller/BackerDashboardProjectsViewController.swift','child page of BackerDashboardViewController'),
N('ios','MessageBannerViewController',K+'MessageBanner/Controller/MessageBannerViewController.swift','banner overlay child VC'),
N('ios','CommentDialogViewController',K+'Comments/Controllers/CommentDialogViewController.swift','modal composer dialog',borderline=True)]
NAV='Library/Sources/Library/Library/Navigation.swift'
paths=['/','/activity','/authorize','/checkouts/:checkout_param/payments','/checkouts/:checkout_param/payments/new','/checkouts/:checkout_param/payments/apple-pay','/checkouts/:checkout_param/payments/use_stored_card','/discover','/discover/advanced','/discover/categories/:category_id','/discover/categories/:parent_category_id/:category_id','/messages/:message_thread_id','/profile/:user_param','/profile/verify_email','/search','/signup','/projects/:creator_param/:project_param','/projects/:creator_param/:project_param/backing/:backing_tab','/projects/:creator_param/:project_param/checkouts/:checkout_param/thanks','/projects/:creator_param/:project_param/comments','/projects/:creator_param/:project_param/creator_bio','/projects/:creator_param/:project_param/description','/projects/:creator_param/:project_param/faqs','/projects/:creator_param/:project_param/friends','/projects/:creator_param/:project_param/messages/new','/projects/:creator_param/:project_param/pledge','/projects/:creator_param/:project_param/pledge/big_print','/projects/:creator_param/:project_param/pledge/change_method','/projects/:creator_param/:project_param/pledge/destroy','/projects/:creator_param/:project_param/pledge/edit','/projects/:creator_param/:project_param/pledge/new','/projects/:creator_param/:project_param/posts','/projects/:creator_param/:project_param/posts/:update_param','/projects/:creator_param/:project_param/updates','/projects/:creator_param/:project_param/posts/:update_param/comments','/projects/:creator_param/:project_param/surveys/:survey_param','/projects/:creator_param/:project_param/surveys/:survey_param/edit','/projects/:creator_param/:project_param/surveys/:survey_param/edit_address','/settings/:notification_param/:enabled_param','/users/:user_param/surveys/:survey_response_id','/projects/:creator_param/:project_param/order_edits/:order_edit_id/checkout','/projects/:creator_param/:project_param/order_edits/new']
dl=[D('ios','ksr','','','Kickstarter-iOS/Info.plist','CFBundleURLSchemes'),D('ios','fb69103156693','','','Kickstarter-iOS/Info.plist','CFBundleURLSchemes (Facebook login callback)',optional=True)]
dl+=[D('ios','https','www.kickstarter.com','','Kickstarter-iOS/Release.entitlements','applinks'),D('ios','https','kickstarter.com','','Kickstarter-iOS/Alpha.entitlements','applinks'),D('ios','https','emails.kickstarter.com','','Kickstarter-iOS/Alpha.entitlements','applinks'),D('ios','https','clicks.kickstarter.com','','Kickstarter-iOS/Alpha.entitlements','applinks')]
dl+=[D('ios','https','www.kickstarter.com',p,NAV,'Navigation.swift route table (pattern -> parser)',kind='route-pattern') for p in paths]
R='KsApi/Sources/KsApi/lib/Route.swift'
apis=[A('GET','/v1/activities',R),A('GET','/v1/projects/{projectId}/backers/{backerId}',R),A('PUT','/v1/projects/{projectId}/backers/{backerId}',R),A('GET','/v1/app/ios/config',R),A('POST','/v1/oauth/authorizations/exchange',R,note='literal lacks leading slash'),A('GET','/v1/discover',R),A('PUT','/v1/facebook/connect',R,note='no leading slash'),A('POST','/xauth/access_token',R),A('GET','/v1/message_threads/{messageThreadId}/messages',R),A('GET','/v1/users/self/notifications',R),A('POST','/v1/users/reset',R),A('DELETE','/v1/users/self/friends/{userId}',R),
A('POST','{statsURL}',R,dynamic=True,expect=False,note='statsURL?.absoluteString; dynamic')]
for a in apis: a.setdefault('note','')
cl=[C('C1','To provide a mock version, set KsApi.Secrets.isOSS = true','README.md','verified','Kickstarter-iOS/AppDelegate.swift:73'),
C('C2','Run all tests from the command line by running make test-all','README.md','verified','Makefile:40'),
C('C3','The snapshots directory ... holds nearly 600 screenshots','README.md','conflict','1609 __Snapshots__ png files in git ls-files'),
C('C4','a creator looking at their dashboard in German on an iPad (DashboardViewControllerTests/testView.lang_de_device_pad.png)','README.md','verified','Kickstarter-Framework/Sources/Kickstarter-Framework-iOSTests/Kickstarter-iOS/Features/Dashboard/Controller/__Snapshots__/DashboardViewControllerTests/testView.lang_de_device_pad.png',note='path in README link is outdated (Kickstarter-iOS/Features/...) but file exists under Kickstarter-Framework'),
C('C5','We use view models ... Library/ViewModels','README.md','conflict','Library/ViewModels does not exist; view models live elsewhere (e.g. Kickstarter-Framework/.../AppDelegateViewModel.swift)',note='concept true, linked path stale'),
C('C6','We make heavy use of Apollo','README.md','verified','apollo-codegen-config.json; GraphAPI/'),
C('C7','We make heavy use of Kingfisher','README.md','verified','Kickstarter.xcodeproj/project.pbxproj (Kingfisher package)'),
C('C8','We make heavy use of Appboy (Appboy-segment-ios)','README.md','conflict','no Appboy reference in project/packages (Braze naming instead)'),
C('C9','We make heavy use of PerimeterX','README.md','conflict','no PerimeterX/px-iOS reference in project/packages'),
C('C10','We currently support Xcode 26.6','README.md','unverifiable','no .xcode-version file; toolchain version not encoded in source')]
write('kickstarter_ios-oss',repo='kickstarter/ios-oss',url='https://github.com/kickstarter/ios-oss',commit='5f5463cfb830413d253efed45bfcec0322c9f152',
platform_roots={'ios':['Kickstarter-iOS','Kickstarter-Framework','Library','KsApi']},screens=scr,not_screens=ns,deeplinks=dl,testids=[],apis=apis,claims=cl,
notes='UIKit app. Deep links: exhaustive 42 route patterns from Navigation.swift allRoutes table (host-agnostic, matched against www.kickstarter.com and ksr://). API (REST v1) from KsApi Route enum tuples (.GET, "/v1/...") with \\(interp) params -> normalized to {param}; some literals lack a leading slash. Also GraphQL via Apollo (not labelled). No accessibilityIdentifier anywhere -> testids empty. Clone reused read-only from oss2.')
