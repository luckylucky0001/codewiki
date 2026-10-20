---
id: features/profile
title: 个人中心（profile）
kind: feature
platforms: [android, harmony, ios]
routes: [profile]
sources:
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.TokenStore
    hash: f549b73c3c010a905c49c7d9e1bc0db31faf1440205dcb28dfda15ff8fc9545c
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.getInstance
    hash: 2b6bd9f0e44082ede243ce416768560b138ca4343a19fe489c75cee166d4e1ae
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.instance
    hash: 06550ca806321e8af94ccb3bfd68ef801ba02cca509c24910d8e10716eb77e7d
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.isLoggedIn
    hash: bcd02170966d0eb98d57168b1701564b7f9ba3e9cb80169e7de6c91c9fcdf782
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save
    hash: 3cae2cf4e99a8abfdeb5a42e53b6a5ad84baeb843fdb390e10684ac9af6457ce
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.token
    hash: 1ca402643adb65135f33a666a2ecebd23f12ca41a870848b7a176ba98dbae1ea
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen
    hash: 526a91830c13966c759e8bef9d683cb92d4df764d41927bc7b2335e2e796c695
  - sym: harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.isLoggedIn
    hash: df6326bae607dab06a55717305f6b957ddd324cb9c6dd63392743b4174bc661e
  - sym: harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save
    hash: 7dddfca852f01d7d973f86ae3e2887090838eaf6839d883ed9b44b71ee4896bd
  - sym: harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder
    hash: 427298d9f218bb76e32738e0d1650ffc5815e7e761fdcc5e11e9fea414c2be0b
  - sym: harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.build
    hash: d51b95fefb201bb36242a2c23f52dfa9ed8e3c70024aa092f86a322bb86d4dd6
  - sym: harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.body
    hash: a98e27bdf2b7598556a38db6c2a3124dfd935858218baa2ae19751dd87c4cb19
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.dismiss
    hash: d2952ecb413ac8da3f7adf0834b85bb8b8cd61e0c9a337992105bf4394da93c6
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView
    hash: c1a22c94f601b720d5f949add4283f8b052dd0d2c237e6419319da4059dd7c04
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.body
    hash: d233512d9a5eba4665d4bbedc9d736cf193c2be5d3c778e6241cc183ccd33300
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle
    hash: 4b2d7773068d8cf126bef60046012ded7a2182494966a5907cd13d5ccede6be3
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match
    hash: 4277008b895b029f4caf0522de87de218a6dd86ddea121b01be670c4d227e484
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path
    hash: 8e630fea62710ade5354d04e1e353ff6e1c5b0ac38acbcbed1796eabc8660b98
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.params
    hash: 2e469b4ecc4f45b1ff796f72e2fecd121208cc549ec25238f0092b7e5832e8ea
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.route
    hash: 12d58fa4f87a306c398635b92e2d024d469918b3e33abd03bd572f833d9d2c82
source_commit: f484520
status: current
---
# 个人中心（profile）

## 概述

个人中心页只做两件事：显示登录状态（已登录显示 `Signed in`，否则显示 `Guest`），以及提供「Log out」按钮。退出登录时三端都会把 token 清空（`save("")`），并跳转回 `login` 路由。页面不调用任何 HTTP 接口，登录状态完全来自本地 TokenStore。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `profile` | `minishop://profile` | `android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen` |
| harmony | `profile` | `minishop://profile` | `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder` |
| ios | `profile` | `minishop://profile` | `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView` |

iOS 深链由 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` 处理：仅接受 scheme 为 `minishop` 的 URL，先读取 query 中的 `token`（写入 TokenStore）与 `cart`（预加载购物车），再用 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` 按 host + path 匹配路由，匹配成功后追加到 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path`。因此 `minishop://profile?token=abc` 会先写入 token，再进入个人中心并显示 `Signed in`。其余两端的深链处理见 facts 中的 routes 文档。

## 三端实现对照

| 项目 | android | harmony | ios |
|---|---|---|---|
| 页面 | `ProfileScreen`（Compose） | `ProfilePage.build`（经 `ProfileBuilder` 暴露给导航） | `ProfileView`（SwiftUI） |
| 登录判断 | `TokenStore.getInstance().isLoggedIn()`：token 非 null 且非空 | `TokenStore.isLoggedIn()`：token 长度 > 0 | `TokenStore.shared.token == nil`（仅判 nil） |
| TokenStore 形态 | 单例（`TokenStore.getInstance` + 私有构造） | 静态方法 | `TokenStore.shared` |
| 返回按钮 | `MiniShopTopBar(title = "Profile", onBack = onBack)`，返回按钮 tag 为 `nav_back` | `BackButton()` | `BackButton`，调用环境的 `dismiss`，identifier 为 `nav_back` |
| 退出后跳转 | 回调 `onLogout()`，由调用方导航 | `pathStack.clear()` 后 `pushPathByName('login', null)` | `router.path = [Destination(route: .login)]` |

### 平台差异与注意点

- **登录判定不一致**：android / harmony 把空字符串视为未登录；iOS 只判断 `token == nil`。iOS 退出时调用 `TokenStore.shared.save("")`，若 `save("")` 存入的是空字符串而非 nil，则页面可能仍显示 `Signed in`（此处只给出 iOS 判定条件，未列出其 `save` 实现，需对照 iOS TokenStore 源码确认）。
- android 的 `ProfileScreen` 自身不做导航，`onLogout` / `onBack` 都由外部传入；harmony 在页面内直接操作 `ProfilePage.pathStack`（`@Consume('pathStack')`）；iOS 通过 `ProfileView.router`（`@EnvironmentObject`）改写导航栈。
- 退出时 harmony 与 iOS 都会重置导航栈，使 login 成为栈底，不能返回个人中心；android 取决于 `onLogout` 的外部实现。

## 数据流

1. 进入页面 → 读取 TokenStore → 渲染 `profile_name` 文案。
2. 点击 `profile_logout` → `TokenStore.save("")` 清空 token → 导航到 `login`。
3. 深链（测试注入）：`?token=<t>` 在进入页面前写入 token（iOS 见 `AppRouter.handle`）。

## testID 与测试要点

| testID | android | harmony | ios |
|---|---|---|---|
| `profile_name` | `ProfileScreen.kt:16` | `ProfilePage.ets:17` | `ProfileView.swift:9` |
| `profile_logout` | `ProfileScreen.kt:17` | `ProfilePage.ets:18` | `ProfileView.swift:10` |

另有返回按钮 `nav_back`（android 在 `MiniShopTopBar`，iOS 在 `BackButton`）。

测试要点：

- 无 token 打开 `minishop://profile`，`profile_name` 应为 `Guest`；带 `?token=` 打开应为 `Signed in`。
- 点击 `profile_logout` 后应到达登录页，且 token 已清空。
- 重点回归 iOS 退出后再次进入个人中心时的文案（见上文判定不一致）。

## 相关页面

- [总览](../overview.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
