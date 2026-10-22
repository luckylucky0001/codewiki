import sys; sys.path.insert(0,'.')
from mk import *
E='entry/src/main/ets/pages/'
RM='entry/src/main/resources/base/profile/route_map.json'
rm=[('ChatRoom','Chats/ChatRoom.ets','ChatRoomBuilder','ChatRoom'),('Chat','Chats/ChatPrivate.ets','ChatBuilder','Chat'),('RedPacket','RedPacket/Index.ets','RedPacketBuilder','RedPacket'),('RedPacketOpen','RedPacket/Open.ets','RedPacketOpenBuilder','RedPacketOpen'),('ArticleList','Article/Index.ets','ArticleListBuilder','ArticleList'),('BreezeList','Breezemoon/Index.ets','BreezemoonListBuilder','BreezeList'),('Article','Article/ArticleDetail.ets','ArticleBuilder','ArticleDetail'),('Privacy','Profile/Privacy.ets','PrivacyBuilder','Privacy'),('User','User/Index.ets','UserBuilder','User'),('Notice','Notice/Index.ets','NoticeBuilder','Notice')]
scr=[S('harmony',n,E+f,'router_map',symbol=b,struct=s,map_file=RM,note='system routerMap in route_map.json (module.json5 routerMap: $profile:route_map)') for n,f,b,s in rm]
scr+=[S('harmony','pages/Index',E+'Index.ets','main_pages',symbol='Index',note='@Entry; hosts Navigation(pathStack)')]
scr+=[S('harmony','Home',E+'Home.ets','embedded-root',symbol='Home',optional=True,note='rendered inside Index when logged in (not via router)'),S('harmony','Login',E+'Login.ets','embedded-root',symbol='Login',optional=True,note='rendered inside Index when logged out')]
ns=[N('harmony','PrivacyDialog',E+'PrivacyDialog.ets','dialog component'),N('harmony','NoticeList',E+'Notice/NoticeList.ets','list sub-component inside Notice page'),
N('harmony','ChatItem',E+'Chats/ChatItem.ets','list item'),N('harmony','Role',E+'Profile/Role.ets','badge component'),N('harmony','ListButton',E+'Profile/ListButton.ets','row component'),N('harmony','NavItem','entry/src/main/ets/layout/main/nav/navItem.ets','nav bar item that calls router.pushUrl with a variable route')]
U='entry/src/main/ets/libs/utils.ets'
dl=[D('harmony','https','fishpi.cn','/article/{id}',U,'in-app URL dispatcher pushToAppUrl() -> pushPathByName(Article); NOT an OS-registered deep link',optional=True,kind='in-app-url'),
D('harmony','https','fishpi.cn','/tag/{tag}',U,'pushToAppUrl -> ArticleList',optional=True,kind='in-app-url'),D('harmony','https','fishpi.cn','/cr',U,'pushToAppUrl -> ChatRoom',optional=True,kind='in-app-url')]
S_='entry/src/main/ets/service/'
apis=[A('GET','/api/user',S_+'user.ets'),A('POST','/chat-room/send',S_+'chatroom.ets'),A('POST','/chat-room/red-packet/open',S_+'redpacket.ets'),A('GET','/notifications/unread/count',S_+'notice.ets'),A('POST','/api/getKey',S_+'fishpi.ets'),A('POST','/comment',S_+'comment.ets'),A('POST','/breezemoon',S_+'breezemoon.ets'),A('PUT','/article/update',S_+'article.ets',note='template literal with suffix'),A('POST','/point/transfer',S_+'user.ets'),A('GET','/users/emotions',S_+'user.ets'),A('GET','/api/article/{id}',S_+'article.ets',note='`/api/article/${id}?p=..`'),
A('GET','http://music.163.com/api/song/detail/','entry/src/main/ets/components/Message/Music.ets',note='absolute 3rd-party URL with template params',optional=True)]
for a in apis: a.setdefault('note','defHttp.<method><T>(path) wrapper (axios-like), base https://fishpi.cn')
cl=[C('C1','支持聊天室与私聊','README.md','verified',E+'Chats/ChatRoom.ets; '+E+'Chats/ChatPrivate.ets'),
C('C2','支持文章浏览评论','README.md','verified',E+'Article/ArticleDetail.ets; '+S_+'comment.ets'),
C('C3','支持清风明月浏览发布','README.md','verified',E+'Breezemoon/Index.ets; '+S_+'breezemoon.ets POST /breezemoon'),
C('C4','关注/转账等用户功能','README.md','verified',S_+'user.ets:96 /point/transfer'),
C('C5','消息通知与提醒','README.md','verified',E+'Notice/Index.ets'),
C('C6','可以先在 Release (./release) 下载最新版本的 hap 文件','README.md','conflict','no ./release directory in repo',note='link likely meant GitHub Releases page'),
C('C7','摸鱼派 APP 客户端 鸿蒙Next 版本','README.md','verified','entry/src/main/module.json5 (deviceTypes phone/tablet/2in1)'),
C('C8','需要网络权限 ohos.permission.INTERNET','(implicit; module.json5)','verified','entry/src/main/module.json5 requestPermissions',synthetic=True),
C('C9','通过 hdc app install fishpi.hap 安装','README.md','unverifiable','(tooling)'),
C('C10','Flutter 版本由 @Yui 开发','README.md','unverifiable','(external repo)')]
write('FishPiOffical_fishpi-harmony',repo='FishPiOffical/fishpi-harmony',url='https://github.com/FishPiOffical/fishpi-harmony',commit='591cd1254817a7ace28ac5a436774e3f511f8e69',
platform_roots={'harmony':['entry']},screens=scr,not_screens=ns,deeplinks=dl,testids=[],apis=apis,claims=cl,
notes='HarmonyOS NEXT community app. Routes in route_map.json (NOT router_map.json). The Navigation .navDestination() builder in Index.ets is a no-op logger - real resolution is through the system routerMap. No OS-level deep links (skills only entity.system.home); pushToAppUrl handles fishpi.cn URLs in-app (optional). No .id() testIDs. Clone reused read-only from oss2.')
