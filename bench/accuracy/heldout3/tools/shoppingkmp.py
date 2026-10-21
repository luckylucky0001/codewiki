import sys; sys.path.insert(0,'.')
from mk import *
B='app/shared/src/commonMain/kotlin/com/razzaghi/shopingbykmp/'; NV=B+'presentation/navigation/'; U=B+'presentation/ui/'
def R(key,fn,sfile,host,**kw):
    g=key.split('.')[0]
    return S('kmp',key,NV+g+'.kt','compose-typesafe-route',symbol=key,screen_fn=fn,screen_file=U+sfile,nav_host_file=U+host,alt_files=[U+sfile],**kw)
SN='splash/SplashNav.kt'; HN='main/home/HomeNav.kt'; PN='main/profile/ProfileNav.kt'; CN='main/cart/CartNav.kt'; DN='main/detail/DetailNav.kt'; WN='main/wishlist/WishlistNav.kt'
scr=[R('SplashNavigation.Splash','SplashScreen','splash/SplashScreen.kt',SN,note='internal fun'),
R('SplashNavigation.Login','LoginScreen','splash/LoginScreen.kt',SN),R('SplashNavigation.Register','RegisterScreen','splash/RegisterScreen.kt',SN),
R('HomeNavigation.Home','HomeScreen','main/home/HomeScreen.kt',HN),R('HomeNavigation.Notification','NotificationsScreen','main/notifications/NotificationsScreen.kt',HN),
R('HomeNavigation.Categories','CategoriesScreen','main/categories/CategoriesScreen.kt',HN),
R('HomeNavigation.Search','SearchScreen','main/search/SearchScreen.kt',HN,note='data class Search(categoryId, sort), toRoute<>'),
R('DetailNavigation.Detail','DetailScreen','main/detail/DetailScreen.kt',DN,note='nested DetailNav(id) host is used from Home/Cart/Wishlist .Detail(id) keys'),
R('DetailNavigation.Comment','CommentScreen','main/comment/CommentScreen.kt',DN),
R('WishlistNavigation.Wishlist','WishlistScreen','main/wishlist/WishlistScreen.kt',WN),
R('CartNavigation.Cart','CartScreen','main/cart/CartScreen.kt',CN),R('CartNavigation.Checkout','CheckoutScreen','main/checkout/CheckoutScreen.kt',CN),
R('ProfileNavigation.Profile','ProfileScreen','main/profile/ProfileScreen.kt',PN),R('ProfileNavigation.EditProfile','EditProfileScreen','main/edit_profile/EditProfileScreen.kt',PN),
R('ProfileNavigation.MyOrders','MyOrdersScreen','main/my_orders/MyOrdersScreen.kt',PN),R('ProfileNavigation.MyCoupons','MyCouponsScreen','main/my_coupons/MyCouponsScreen.kt',PN),
R('ProfileNavigation.PaymentMethod','PaymentMethodScreen','main/payment_method/PaymentMethodScreen.kt',PN),
R('ProfileNavigation.Address','AddressScreen','main/address/AddressScreen.kt',PN,note='also CartNavigation.Address -> same AddressScreen'),
R('ProfileNavigation.AddAddressInformation','AddAddressInformationScreen','main/add_address/AddAddressInformationScreen.kt',PN,optional=True),
R('ProfileNavigation.Settings','SettingsScreen','main/settings/SettingsScreen.kt',PN,optional=True,note='HomeNavigation.Settings maps to the same SettingsScreen'),
S('kmp','ProfileNavigation.MyWallet',NV+'ProfileNavigation.kt','compose-typesafe-route',screen_fn='MyWalletScreen',optional=True,note='MyWalletScreen(...) is called in ProfileNav.kt but has NO definition anywhere in the repo (broken reference)'),
S('kmp','BottomNavigation.Home',NV+'BottomNavigation.kt','compose-string-route',optional=True,note='string route "Home" hosting nested HomeNav NavHost in MainNav.kt'),
S('kmp','AppNavigation.Main',NV+'AppNavigation.kt','compose-typesafe-route',screen_fn='MainNav',optional=True,note='top-level container hosting bottom bar')]
ns=[N('kmp','FailedNetworkScreen',B+'presentation/component/DefaultScreenUI.kt','error-state composable named *Screen, not a destination'),
N('kmp','LoadingWithLogoScreen',B+'presentation/component/DefaultScreenUI.kt','loading-state composable named *Screen'),
N('kmp','DefaultScreenUI',B+'presentation/component/DefaultScreenUI.kt','scaffold wrapper used by every screen'),
N('kmp','SharedViewModel',B+'presentation/SharedViewModel.kt','view model')]
M=B+'business/datasource/network/main/MainServiceImpl.kt'; SP=B+'business/datasource/network/splash/SplashServiceImpl.kt'
def K(m,p,f=M,**kw): return A(m,p,f,note='Ktor url{ takeFrom(BASE_URL); encodedPath += MainService.CONST }',**kw)
apis=[K('POST','login',SP),K('POST','register',SP),K('GET','home'),K('GET','notifications'),K('GET','orders'),K('POST','basket/buy'),
K('GET','address'),K('POST','address'),K('GET','comment/{id}'),K('POST','comment'),K('GET','search'),K('GET','search/filter'),
K('GET','profile'),K('POST','profile'),K('GET','basket'),K('POST','basket/add'),K('POST','basket/delete'),K('GET','product/{id}'),
K('GET','product/{id}/like'),K('GET','product/wishlist')]
d=dict(repo='razaghimahdi/Shopping-By-KMP',url='https://github.com/razaghimahdi/Shopping-By-KMP',commit='df8d034585f3fd26f7ad78b04b452eefd8100383',
platform_roots={'kmp':['app/shared'],'android':['app/androidApp']},platform_aliases={'kmp':['android','ios','desktop','common']},
screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,
notes='Compose Multiplatform type-safe navigation: @Serializable sealed interface XNavigation { data object/class } + composable<XNavigation.Y>{ YScreen() } in per-feature *Nav.kt NavHosts; route_id = XNavigation.Y. Same case names (Detail, Settings, Address, AddAddress) exist in several graphs. Bottom bar uses string routes BottomNavigation.X.route. Ktor client: url{takeFrom(BASE_URL); encodedPath += CONST (+ "/$id")}. Repo also has a Ktor server/ module (routes not labelled; server side). No testTag, no deep links.')
check('razaghimahdi_Shopping-By-KMP',d); write('razaghimahdi_Shopping-By-KMP',**d)
