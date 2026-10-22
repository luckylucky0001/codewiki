import sys; sys.path.insert(0,'.')
from mk import *
P='entry/src/main/ets/'
def MP(path,struct,**kw): return S('harmony',path,P+path+'.ets','main_pages',symbol=struct,struct=struct,**kw)
scr=[MP('pages/SplashPage','SplashPage'),MP('pages/MainPage','MainPage'),MP('pages/container/ContainerPage','ContainerPage'),
MP('pages/commonDetail/DetailPage','DetailPage'),MP('pages/topicDetail/TopicDetailPage','TopicDetailPage'),MP('pages/categoryDetail/CategoryDetailPage','CategoryDetailPage'),
MP('pages/test/TestPage','TestPage'),MP('pages/hot/CoordinatePage','CoordinatePage'),MP('pages/test/TestHorizontalPage','TestHorizontalPage'),MP('pages/test/TestHorizontalPage2','TestHorizontalPage2'),
S('harmony','HomePage',P+'pages/home/HomePage.ets','tab-page',optional=True,note='Tabs child of MainPage, not routable'),
S('harmony','FindPage',P+'pages/find/FindPage.ets','tab-page',optional=True),
S('harmony','HotPage',P+'pages/hot/HotPage.ets','tab-page',optional=True),
S('harmony','MinePage',P+'pages/mine/MinePage.ets','tab-page',optional=True),
S('harmony','FocusPage',P+'pages/find/focus/FocusPage.ets','tab-page',optional=True,note='also embedded in ContainerPage(containerType=focus)'),
S('harmony','TopicPage',P+'pages/find/topic/TopicPage.ets','tab-page',optional=True),
S('harmony','RankPage',P+'pages/hot/rank/RankPage.ets','tab-page',optional=True)]
ns=[N('harmony','CategoryPage',P+'pages/find/category/CategoryPage.ets','RoutePath.CategoryPage="pages/CategoryPage" is a stale constant (not in main_pages, file lives elsewhere); component is only a Tabs/Container child',borderline=True),
N('harmony','HomeListItemComponent',P+'pages/home/component/HomeListItemComponent.ets','list item component'),
N('harmony','FocusItemComponent',P+'pages/find/focus/component/FocusItemComponent.ets','list item component'),
N('harmony','VideoBottomComponent',P+'pages/commonDetail/component/VideoBottomComponent.ets','sub-component of DetailPage'),
N('harmony','CommonTopBar',P+'views/CommonTopBar.ets','shared view'),
N('harmony','RoutePath',P+'route/RoutePath.ets','route constant table, not a page')]
F=P+'http/apiService.ets'
apis=[A('GET','api/v2/feed',F),A('GET','api/v4/tabs/follow',F),A('GET','api/v4/categories',F),A('GET','api/v3/specialTopics',F),
A('GET','api/v4/rankList/videos',F),A('GET','api/v3/lightTopics/internal/{id}',F,note='baseUrl + "..." + id concatenation'),
A('GET','api/v4/video/related',F),A('GET','api/v4/categories/videoList',F),A('GET','banner/json',F,note='wanAndroidUrl + "/banner/json" (double slash)')]
write('WinWang_HarmoneyOpenEye',repo='WinWang/HarmoneyOpenEye',url='https://github.com/WinWang/HarmoneyOpenEye',commit='57f0542795336009aa0d46fd9fa5b07facc2ae87',
platform_roots={'harmony':['entry']},screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,
notes='API9 style router.pushUrl via wrapper Router.push(RoutePath.X); route_id = main_pages path. Tab children optional. No .id() testIDs, no skills.uris deep links (only entity.system.home). APIs: string concat baseUrl+"api/..." with axios/http wrappers (get<T>({url})).')
