import sys; sys.path.insert(0,'.')
from mk import *
P='entry/src/main/ets/'
def MP(path,struct,**kw): return S('harmony',path,P+path+'.ets','main_pages',symbol=struct,struct=struct,**kw)
scr=[MP('pages/Splash','Splash'),MP('pages/Index','Index',note='@Entry({routeName: RouterName.Index}) + main_pages'),
MP('pages/Home','Home',note='@Entry but used as Tabs child of Index'),MP('pages/My','My'),MP('pages/HotKey','HotKey'),
MP('pages/Tree','Tree'),MP('pages/TabScaffold','TabScaffold'),MP('pages/WebPage','WebPage',note='PagesConstant.Web / RouterName.Web'),
MP('pages/TreeDetail','TreeDetail'),MP('pages/SearchResult','SearchResult'),MP('pages/Login','Login'),MP('pages/Rank','Rank'),
MP('pages/MyCoin','MyCoin'),MP('pages/MyCollect','MyCollect'),MP('pages/Setting','Setting'),MP('pages/Register','Register'),
MP('pages/WebExample','WebExample',optional=True,note='demo page'),MP('pages/WebComponent','WebComponent',optional=True,note='demo page'),
MP('pages/ObservedV2TestPage','ObservedV2TestPage',optional=True,note='test/demo page')]
ns=[N('harmony','TabsDetail',P+'pages/TabsDetail.ets','@Entry decorated but NOT in main_pages; embedded as Tabs content of TabScaffold',borderline=True),
N('harmony','SearchIcon',P+'pages/Home.ets','private sub-component struct inside Home.ets'),
N('harmony','MyCoinCell',P+'pages/MyCoin.ets','list cell struct inside MyCoin.ets'),
N('harmony','PagesConstant',P+'router/PagesConstant.ets','route constant table'),
N('harmony','TreeCell',P+'views/TreeCell.ets','shared view')]
tids=[T('harmony','SplashHelloWorld',P+'pages/Splash.ets',13)]
V=P+'viewModel/'
apis=[A('GET','banner/json',V+'HomeViewModel.ets'),A('GET','article/top/json',V+'HomeViewModel.ets'),
A('GET','article/list/{page}/json',V+'HomeViewModel.ets',note="'article/list/' + pageString + '/json'; also TabsDetailViewModel with ?cid="),
A('POST','user/login',V+'LoginViewModel.ets',alt_files=[V+'HomeViewModel.ets'],note='query string params concatenated'),
A('POST','user/register',V+'LoginViewModel.ets'),A('GET','user/logout/json',V+'LoginViewModel.ets'),
A('GET','lg/coin/userinfo/json',V+'IndexViewModel.ets',alt_files=[V+'MyCollectViewModel.ets']),
A('GET','lg/coin/list/{page}/json',V+'MyCoinViewModel.ets'),A('GET','lg/collect/list/{page}/json',V+'MyCollectViewModel.ets'),
A('POST','lg/collect/{id}/json',V+'MyCollectViewModel.ets'),A('POST','lg/uncollect_originId/{id}/json',V+'MyCollectViewModel.ets'),
A('GET','coin/rank/{page}/json',V+'RankViewModel.ets'),A('POST','article/query/{page}/json',V+'SearchResultViewModel.ets'),
A('GET','hotkey/json',V+'HotKeyViewModel.ets'),
A('GET','project/tree/json',V+'TabScaffoldViewModel.ets',optional=True,note='assigned in switch(contentType) then httpClient.get(api)'),
A('GET','wxarticle/chapters/json',V+'TabScaffoldViewModel.ets',optional=True),A('GET','tree/json',V+'TabScaffoldViewModel.ets',optional=True),
A('GET','wxarticle/list/{id}/{page}/json',V+'TabsDetailViewModel.ets',optional=True)]
d=dict(repo='seasonZhu/HarmonyStudy',url='https://github.com/seasonZhu/HarmonyStudy',commit='b55e58c962e9b39d5211337590bdd45f2c2349b3',
platform_roots={'harmony':['entry']},screens=scr,not_screens=ns,deeplinks=[],testids=tids,apis=apis,
notes='HarmonyOS Next WanAndroid client. router.pushUrl wrapper Router.push({url: PagesConstant.X}) + named routes @Entry({routeName: RouterName.X}) with dynamic import(); route_id = main_pages path. baseURL https://www.wanandroid.com/ (axios). No skills.uris deep links. Only one .id().')
check('seasonZhu_HarmonyStudy',d); write('seasonZhu_HarmonyStudy',**d)
