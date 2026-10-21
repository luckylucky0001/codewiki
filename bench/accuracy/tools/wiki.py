import sys; sys.path.insert(0,'.')
from mk import *
W='Wikipedia/Code/'; C_='WMFComponents/Sources/WMFComponents/Components/'
vc=[('ArticleViewController',W,'Router.Destination.article'),('PageHistoryViewController',W,'.articleHistory'),('DiffContainerViewController',W,'.articleDiff'),('SinglePageWebViewController',W,'.inAppLink'),('TalkPageViewController',W,'.talk/.userTalk'),('CreateReadingListViewController',W,'.readingListsImport'),('ExploreViewController',W,'tab'),('HomeViewController',W,'tab'),('SearchViewController',W,'tab/.search'),('PlacesViewController',W,'tab'),('SavedViewController',W,'tab'),('OnThisDayViewController',W,'.onThisDay'),('EditLinkViewController',W,''),('InsertLinkViewController',W,'')]
scr=[S('ios',n,p+n+'.swift','uikit-vc',note=r) for n,p,r in vc]
scr+=[S('ios','WMFWatchlistViewController',C_+'Watchlist/WMFWatchlistViewController.swift','uikit-vc',note='.watchlist (WMFComponents package)'),
S('ios','WMFSettingsViewController',C_+'Settings/WMFSettingsViewController.swift','uikit-vc'),
S('ios','WMFOnboardingViewController',C_+'Shared/Onboarding/WMFOnboardingViewController.swift','uikit-vc'),
S('ios','WMFActivityTabViewController',W+'ActivityTabViewController.swift','uikit-vc',note='file name != class name (ActivityTabViewController.swift)')]
ns=[N('ios','WMFAppViewController',W+'WMFAppViewController.swift','root tab-bar container VC',borderline=True),
N('ios','ArticlePeekPreviewViewController',W+'ArticlePeekPreviewViewController.swift','3D-touch/context-menu peek preview, not a navigable screen'),
N('ios','AVPlayerViewController','(system)','system VC used for .audio destination - not app code'),
N('ios','ViewControllerRouter',W+'ViewControllerRouter.swift','router, not a screen'),
N('ios','AccessibilityIdentifiers','WMFComponents/Sources/WMFComponents/Utility/AccessibilityIdentifiers.swift','constants enum'),
N('ios','WikipediaUITests','WikipediaUITests','UI test target',borderline=True)]
UA=W+'NSUserActivity+WMFExtensions.m'
dl=[D('ios','wikipedia','','','Wikipedia/Wikipedia-Info.plist','CFBundleURLSchemes'),D('ios','wikipedia-official','','','Wikipedia/Wikipedia-Info.plist','CFBundleURLSchemes')]
for h in ['content','explore','home','places','saved','activity','search','random']:
    dl.append(D('ios','wikipedia',h,'',UA,'wmf_activityForWikipediaScheme: url.host == @"%s" (also wikipedia-official)'%h))
dl+=[D('ios','https','*.wikipedia.org','','Wikipedia/Wikipedia.entitlements','applinks wildcard'),D('ios','https','wikipedia.org','','Wikipedia/Wikipedia.entitlements','applinks'),
D('ios','https','en.wikipedia.beta.wmflabs.org','','Wikipedia/Wikipedia.entitlements','applinks (beta)',optional=True),D('ios','https','en.m.wikipedia.beta.wmflabs.org','','Wikipedia/Wikipedia.entitlements','applinks (beta)',optional=True)]
AI='WMFComponents/Sources/WMFComponents/Utility/AccessibilityIdentifiers.swift'
tl=[('Article Lead Image',19,W+'ArticleViewController.swift',355),('Article Search Button',31,W+'ArticleViewController.swift',937),('Article Home Button',17,W+'ArticleViewController.swift',953),('Article View',35,W+'ArticleViewController.swift',1477),('Explore View',45,W+'ExploreViewController.swift',124),('Root Tab Saved Button',52,W+'WMFAppViewController.swift',1602),('profile-button',66,'WMFComponents/Sources/WMFComponents/Extensions/Navigation Bar/WMFNavigationBarConfiguring.swift',109),('Year in Review Close Button',62,'WMFComponents/Sources/WMFComponents/Components/Year in Review/WMFYearInReviewNavigationItems.swift',58),('Home View',58,W+'HomeViewController.swift',47),('Article Save Button',29,W+'ArticleToolbarController.swift',39)]
tids=[T('ios',v,AI,l,alt_files=[uf],use_file=uf,use_line=ul,note='string constant in AccessibilityIdentifiers enum, assigned via x.accessibilityIdentifier = AccessibilityIdentifiers.A.b') for v,l,uf,ul in tl]
U='WMFData/Sources/WMFData/'
apis=[A('GET','/api/rest_v1/page/summary/{title}',U+'Data Controllers/Shared/WMFArticleSummaryDataController.swift',note='wikimediaRestAPIURL(additionalPathComponents:["page","summary",title])'),
A('GET','/api/rest_v1/page/random/summary',U+'Data Controllers/Shared/WMFRandomDataController.swift'),
A('GET','/api/rest_v1/feed/configuration',U+'Extensions/URL+API.swift'),
A('GET','/w/rest.php/growthexperiments/v0/user-impact/{userID}',U+'Data Controllers/Shared/WMFUserImpactDataController.swift'),
A('PUT','/w/rest.php/growthexperiments/v0/suggestions/addimage/feedback/{title}',U+'Data Controllers/Image Recommendations/WMFImageRecommendationsDataController.swift',note='WMFMediaWikiServiceRequest(method: .PUT)'),
A('GET','/wiki/MediaWiki:AppsDonationConfig.json',U+'Extensions/URL+API.swift'),
A('GET','/wiki/MediaWiki:AppsCampaignConfig.json',U+'Extensions/URL+API.swift'),
A('GET','/wiki/MediaWiki:AppsFeatureConfig.json',U+'Extensions/URL+API.swift'),
A('GET','/w/api.php',U+'Extensions/URL+API.swift',note='MediaWiki action API; action=... query params distinguish calls -> path alone is ambiguous'),
A('GET','/api/rest_v1/metrics',U+'Extensions/URL+API.swift',optional=True,note='prefix only; real paths appended at call sites')]
CL='CLAUDE.md'
cl=[C('C1','WMFData is a local Swift package designed to house all of the logic pertaining to the data layer',CL,'verified','WMFData/Package.swift'),
C('C2','Services: Sources > WMFData > Services',CL,'conflict','WMFData/Sources/WMFData/Service (singular)',note='minor path drift'),
C('C3','We have two services: WMFBasicService and mediaWikiService',CL,'verified','WMFData/Sources/WMFData/Service/WMFBasicService.swift; Environment mediaWikiService'),
C('C4','Currently we have 3 stores: userDefaultsStore, sharedCacheStore, coreDataStore',CL,'conflict','WMFData/Sources/WMFData/Environment (4 stores: + crossProcessUserDefaultsStore)'),
C('C5','userDefaultsStore and sharedCacheStore are accessed via a generalized protocol WMFKeyValueStore',CL,'verified','WMFData/Sources/WMFData/Store/Protocol/WMFKeyValueStore.swift'),
C('C6',"coreDataStore - capable of saving and loading to WMFData's own Core Data xcdatamodel",CL,'verified','WMFData/Sources/WMFData/Resources/WMFData.xcdatamodeld'),
C('C7','WMFImageDataController.shared - use this singleton to fetch image data in WMFComponents',CL,'verified','WMFData/Sources/WMFData/Data Controllers/Shared/WMFImageDataController.swift:4'),
C('C8','Data Controllers live in Sources > WMFData > Data Controllers',CL,'verified','WMFData/Sources/WMFData/Data Controllers'),
C('C9','Stores can be accessed via the WMFDataEnvironment.current singleton',CL,'verified','WMFData/Sources/WMFData/Environment'),
C('C10','Stores and services should be strictly feature-agnostic',CL,'unverifiable','(design guideline)')]
write('wikimedia_wikipedia-ios',repo='wikimedia/wikipedia-ios',url='https://github.com/wikimedia/wikipedia-ios',commit='427f61dbf9587cf221c8e6bcc93a4e4ab1c6f35b',
platform_roots={'ios':['Wikipedia','WMF Framework','WMFComponents','WMFData']},screens=scr,not_screens=ns,deeplinks=dl,testids=tids,apis=apis,claims=cl,
notes='Mixed ObjC/Swift UIKit. Router.Destination enum maps URLs to destinations, ViewControllerRouter instantiates VCs. wikipedia:// hosts parsed in ObjC (NSUserActivity+WMFExtensions.m). accessibilityIdentifiers are centralised constants (values are human strings like "Article View"); label file = declaration, alt_files = assignment site. APIs built from base path constants + additionalPathComponents arrays (hard). Clone reused read-only from oss2.')
