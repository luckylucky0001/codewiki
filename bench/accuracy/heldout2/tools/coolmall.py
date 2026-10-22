import sys; sys.path.insert(0,'.')
from mk import *
R=[('auth','Login','auth/login','LoginNav','LoginPage'),('auth','AccountLogin','auth/account-login','AccountLoginNav','AccountLoginPage'),
('auth','SmsLogin','auth/sms-login','SmsLoginNav','SmsLoginPage'),('auth','Register','auth/register','RegisterNav','RegisterPage'),
('auth','ResetPassword','auth/reset-password','ResetPasswordNav','ResetPasswordPage'),
('common','About','common/about','AboutNav','AboutPage'),('common','Web','common/web','WebNav','WebPage'),('common','Settings','common/settings','SettingsNav','SettingsPage'),
('common','UserAgreement','common/user-agreement','UserAgreementNav','UserAgreementPage'),('common','PrivacyPolicy','common/privacy-policy','PrivacyPolicyNav','PrivacyPolicyPage'),
('common','Contributors','common/contributors','ContributorsNav','ContributorsPage'),('cs','Chat','cs/chat','ChatNav','ChatPage'),
('feedback','List','feedback/list','FeedbackListNav','FeedbackListPage'),('feedback','Submit','feedback/submit','FeedbackSubmitNav','FeedbackSubmitPage'),
('goods','Detail','goods/detail','GoodsDetailNav','GoodsDetailPage'),('goods','Search','goods/search','GoodsSearchNav','GoodsSearchPage'),
('goods','Category','goods/category','GoodsCategoryNav','GoodsCategoryPage'),('goods','Comment','goods/comment','GoodsCommentNav','GoodsCommentPage'),
('launch','Splash','launch/splash','SplashNav','SplashPage'),('launch','Guide','launch/guide','GuideNav','GuidePage'),
('main','Main','main/main','MainNav','MainPage'),('main','Home','main/home','HomeNav','HomePage'),('main','Category','main/category','CategoryNav','CategoryPage'),
('main','Cart','main/cart','CartNav','CartPage'),('main','Me','main/me','MeNav','MePage'),('market','Coupon','market/coupon','CouponNav','CouponPage'),
('order','List','order/list','OrderListNav','OrderListPage'),('order','Confirm','order/confirm','OrderConfirmNav','OrderConfirmPage'),
('order','Detail','order/detail','OrderDetailNav','OrderDetailPage'),('order','Pay','order/pay','OrderPayNav','OrderPayPage'),
('order','Refund','order/refund','OrderRefundNav','OrderRefundPage'),('order','Comment','order/comment','OrderCommentNav','OrderCommentPage'),
('order','Logistics','order/logistics','OrderLogisticsNav','OrderLogisticsPage'),
('user','Profile','user/profile','ProfileNav','ProfilePage'),('user','AddressList','user/address-list','AddressListNav','AddressListPage'),
('user','AddressDetail','user/address-detail','AddressDetailNav','AddressDetailPage'),('user','Footprint','user/footprint','FootprintNav','FootprintPage')]
scr=[]
for mod,key,rid,nav,page in R:
    M=mod[0].upper()+mod[1:]
    scr.append(S('harmony',rid,f'feature/{mod}/src/main/ets/view/{page}.ets','route-build-register',symbol=page,struct=page,builder=nav,
      const=f'{M}Routes.{key}',registered_in=f'feature/{mod}/src/main/ets/navigation/{M}Graph.ets',const_file=f'core/navigation/src/main/ets/{mod}/{M}Routes.ts'))
scr.append(S('harmony','view/EntryPage','entry/src/main/ets/view/EntryPage.ets','main_pages',symbol='EntryPage',optional=True,note='main_pages shell hosting NavigationHost'))
ns=[N('harmony','AppNavDestination','core/ui/src/main/ets/component/navdestination/AppNavDestination.ets','shared NavDestination wrapper component used by every page'),
N('harmony','AddressCard','core/ui/src/main/ets/component/address/AddressCard.ets','card component'),
N('harmony','OrderCard','feature/order/src/main/ets/component/OrderCard.ets','card component'),
N('harmony','HomeBanner','feature/main/src/main/ets/component/HomeBanner.ets','banner component'),
N('harmony','NavigationHost','entry/src/main/ets/navigation/NavigationHost.ets','Navigation host, not a page',borderline=True),
N('harmony','RouteBuild','core/navigation/src/main/ets/RouteBuild.ets','route registry class')]
D_='core/network/src/main/ets/datasource/'
apis=[A('GET','page/home',D_+'page/PageNetworkDataSourceImpl.ets'),A('GET','page/goodsDetail',D_+'page/PageNetworkDataSourceImpl.ets',note='?goodsId via params'),
A('POST','user/info/updatePerson',D_+'userinfo/UserInfoNetworkDataSourceImpl.ets'),A('GET','user/info/person',D_+'userinfo/UserInfoNetworkDataSourceImpl.ets'),
A('POST','user/login/password',D_+'auth/AuthNetworkDataSourceImpl.ets'),A('GET','user/login/captcha',D_+'auth/AuthNetworkDataSourceImpl.ets'),
A('POST','goods/info/page',D_+'goods/GoodsNetworkDataSourceImpl.ets'),A('GET','goods/info/info',D_+'goods/GoodsNetworkDataSourceImpl.ets'),
A('POST','app/feedback/submit',D_+'feedback/FeedbackNetworkDataSourceImpl.ets',note='BASE_URL already ends in /app/, so full path is /app/app/feedback/submit'),
A('POST','cs/msg/page',D_+'cs/CustomerServiceNetworkDataSourceImpl.ets')]
d=dict(repo='Joker-x-dev/CoolMallArkTS',url='https://github.com/Joker-x-dev/CoolMallArkTS',commit='17b6899086a57a4d48448842a14f9e325e3e35a3',
platform_roots={'harmony':['entry','feature','core']},screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,
notes='Custom Navigation registry: route strings in core/navigation/*/XRoutes.ts consts, registered via RouteBuild.register(XRoutes.Key, wrapBuilder(XNav)) in feature/*/navigation/XGraph.ets; XNav @Builder calls XPage(). No router_map, no @Entry pages besides EntryPage. Routes exhaustive (37). No .id() testIDs, no skills.uris deep links. APIs via axios NetworkClient.http.get/post("relative") with BASE_URL https://mall.dusksnow.top/app/.')
check('Joker-x-dev_CoolMallArkTS',d); write('Joker-x-dev_CoolMallArkTS',**d)
