import sys; sys.path.insert(0,'.')
from mk import *
P='entry/src/main/ets/'
pages=[('pages/splash/SplashPage','SplashPage'),('pages/home/HomePage','HomePage'),('pages/detail/movie/MoviePage','MoviePage'),('pages/detail/show/ShowPage','ShowPage'),
('pages/detail/show/season/ShowSeasonPage','ShowSeasonPage'),('pages/detail/person/PersonPage','PersonPage'),('pages/media/MediaListPage','MediaListPage'),
('pages/favourite/FavouriteListPage','FavouriteListPage'),('pages/search/SearchPage','SearchPage'),('pages/setting/VideoSettingPage','VideoSettingPage'),
('pages/setting/CodecSettingPage','CodecSettingPage'),('pages/setting/GestureSettingPage','GestureSettingPage'),('pages/setting/SubtitleSettingPage','SubtitleSettingPage'),
('pages/interface/InterfacePage','InterfacePage'),('pages/about/AboutPage','AboutPage')]
scr=[S('harmony',p,P+p+'.ets','main_pages',symbol=s,struct=s) for p,s in pages]
for c,f in [('MainComponent','main'),('MediaComponent','media'),('FavouriteComponent','favourite'),('PreferComponent','prefer')]:
    scr.append(S('harmony',c,P+f'pages/home/{f}/{c}.ets','tab-page',optional=True,note='HomePage tab content'))
ns=[N('harmony','ShowEpisodePage',P+'pages/detail/show/episode/ShowEpisodePage.ets','named *Page and lives under pages/, but not @Entry / not in main_pages; embedded in sheet/ShowEpisodeSheet.ets'),
N('harmony','DetailComponent',P+'pages/detail/DetailComponent.ets','shared detail body component'),
N('harmony','HomeToolBar',P+'widget/bar/HomeToolBar.ets','toolbar widget'),N('harmony','CategoryToolBar',P+'widget/bar/CategoryToolBar.ets','toolbar widget'),
N('harmony','AppRouter',P+'router/AppRouter.ets','router helper class'),N('harmony','MediaRouter',P+'pages/common/MediaRouter.ets','router helper',borderline=True)]
SE=P+'pages/detail/show/season/ShowSeasonPage.ets'; EP=P+'pages/detail/show/episode/ShowEpisodePage.ets'; DC=P+'pages/detail/DetailComponent.ets'
tids=[T('harmony','episode_cover',SE,71,alt_files=[EP],note='same id also at ShowEpisodePage:33'),T('harmony','episode_name',SE,112,alt_files=[EP]),
T('harmony','episode_overview',SE,133),T('harmony','episode_play',DC,111),T('harmony','episode_finish',DC,132),T('harmony','episode_collect',DC,150)]
d=dict(repo='OHPG/FinVideo',url='https://github.com/OHPG/FinVideo',commit='669916b3581c7d92514f7639232565cd5ac3f775',
platform_roots={'harmony':['entry']},screens=scr,not_screens=ns,deeplinks=[],testids=tids,apis=[],
notes='Jellyfin client. main_pages.json (15 pages, exhaustive) + UIContext.getRouter().pushUrl({url:"pages/..."}) literals. Player page pushed via PlayerRouter from git submodule framewrok (not cloned / empty dir) - not labelled. Jellyfin HTTP API lives in sdk submodule (empty in clone) -> zero in-repo APIs (FP probe). testIDs exhaustive (8 .id() calls, 6 distinct ids; duplicates across ShowSeasonPage/ShowEpisodePage). No skills.uris.')
check('OHPG_FinVideo',d); write('OHPG_FinVideo',**d)
