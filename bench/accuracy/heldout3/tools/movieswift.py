import sys; sys.path.insert(0,'.')
from mk import *
C='MovieSwift/MovieSwift/views/components/'
def V(v,f,kind='swiftui-destination',**kw): return S('ios',v,C+f,kind,**kw)
scr=[V('MoviesHome','moviesHome/MoviesHome.swift','swiftui-tab',note='TabbarView tab .movies'),
V('DiscoverView','discover/DiscoverView.swift','swiftui-tab'),V('FanClubHome','fan club/FanClubHome.swift','swiftui-tab'),
V('MyLists','myLists/MyLists.swift','swiftui-tab'),
V('MovieDetail','movieDetail/MovieDetail.swift',note='NavigationLink(destination: MovieDetail(movieId:)) from many lists'),
V('PeopleDetail','peopleDetail/PeopleDetail.swift'),V('MoviesGenreList','moviesList/MoviesGenreList.swift'),
V('MovieKeywordList','moviesList/MovieKeywordList.swift'),V('MovieReviews','movieDetail/reviews/MovieReviews.swift'),
V('CustomListDetail','custom list/CustomListDetail.swift'),V('GenresList','genres/GenresList.swift',optional=True,note='embedded as a page of MoviesHome TabView(PageTabViewStyle) and OutlineMenu .genres (SplitView)'),
V('MoviesList','moviesList/base/MoviesList.swift',note='NavigationLink(destination: MoviesList(movies:...)) in MoviesHomeGrid'),
V('SettingsForm','settings/SettingsForm.swift','swiftui-sheet',note='.sheet from MoviesHome'),
V('CustomListForm','custom list/CustomListForm.swift','swiftui-sheet',note='.sheet from MyLists/MovieDetail/CustomListDetail'),
V('DiscoverFilterForm','discover/DiscoverFilterForm.swift','swiftui-sheet')]
ns=[N('ios','MoviesCrewList',C+'moviesList/MoviesCrewList.swift','View-suffixless list struct only instantiated in its own PreviewProvider (dead)',borderline=True),
N('ios','TabbarView',C+'home/HomeView.swift','tab container (root shell), not a destination',borderline=True),
N('ios','MovieCrosslineRow',C+'movieDetail/rows/MovieCrosslineRow.swift','row component inside MovieDetail'),
N('ios','PeopleDetailHeaderRow',C+'peopleDetail/rows/PeopleDetailHeaderRow.swift','row component'),
N('ios','DraggableCover',C+'discover/DraggableCover.swift','gesture card component'),
N('ios','BottomMenu',C+'bottomMenu/BottomMenu.swift','generic bottom sheet container component')]
F='MovieSwift/Packages/Backend/Sources/Backend/services/APIService.swift'
def E(p,**kw): return A('GET',p,F,note='enum Endpoint.path(); baseURL.appendingPathComponent',**kw)
apis=[E('movie/popular'),E('person/popular'),E('movie/top_rated'),E('movie/upcoming'),E('movie/now_playing'),E('trending/movie/day'),
E('movie/{movie}'),E('movie/{movie}/videos'),E('person/{person}'),E('movie/{movie}/credits'),E('movie/{movie}/reviews'),
E('movie/{movie}/recommendations'),E('movie/{movie}/similar'),E('person/{person}/movie_credits'),E('person/{person}/images'),
E('search/movie'),E('search/keyword'),E('search/person'),E('genre/movie/list'),E('discover/movie')]
d=dict(repo='Dimillian/MovieSwiftUI',url='https://github.com/Dimillian/MovieSwiftUI',commit='72eb4ae7117fbf893be533c9a277c47a7287d87e',
platform_roots={'ios':['MovieSwift']},screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,
notes='SwiftUI + Redux-like flux. Navigation: TabView tabs (TabbarView) + NavigationLink(destination:) + .sheet forms; route_id = View struct. iPad/mac SplitView sidebar (optional GenresList). TMDB API: enum Endpoint with path() switch returning literals and "movie/\\(String(movie))" interpolations; single GET. No accessibilityIdentifier, no URL schemes. MovieSwiftTV target not labelled.')
check('Dimillian_MovieSwiftUI',d); write('Dimillian_MovieSwiftUI',**d)
