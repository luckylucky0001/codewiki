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
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView
    hash: c1a22c94f601b720d5f949add4283f8b052dd0d2c237e6419319da4059dd7c04
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.body
    hash: d233512d9a5eba4665d4bbedc9d736cf193c2be5d3c778e6241cc183ccd33300
  - sym: ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
source_commit: 8cdd41b
status: current
---
# 个人中心（profile）

## 概述

个人中心页只做两件事：
1. 显示当前登录状态：已登录显示 `Signed in`，否则显示 `Guest`（testID `profile_name`）。
2. 提供 `Log out` 按钮（testID `profile_logout`）：把 token 清空（保存为空字符串），再回到登录页。

页面不调用任何 HTTP 接口，状态完全来自本地 `TokenStore`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `profile` | `minishop://profile` | `android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen` |
| harmony | `profile` | `minishop://profile` | `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder` |
| ios | `profile` | `minishop://profile` | `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## 三端实现对照

| 项 | Android | Harmony | iOS |
|---|---|---|---|
| UI | `ProfileScreen`（Compose），顶部为 `MiniShopTopBar(title = "Profile")` | `ProfilePage.build`，由 `ProfileBuilder` 包装为路由入口 | `ProfileView.body`（SwiftUI `VStack`） |
| 返回 | `onBack` 回调 | `BackButton()` | `BackButton()` |
| 登录判定 | `TokenStore.getInstance().isLoggedIn()`：token 非 null 且非空 | `TokenStore.isLoggedIn()`：`token.length > 0` | `TokenStore.shared.token == nil` 则为 Guest |
| 登出清理 | `TokenStore.getInstance().save("")` | `TokenStore.save('')` | `TokenStore.shared.save("")` |
| 登出跳转 | 调用外部传入的 `onLogout()` | `pathStack.clear()` 后 `pushPathByName('login', null)` | `router.path = [Destination(route: .login)]` |

### TokenStore

- Android：`android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.getInstance` 为 synchronized 懒加载单例（静态字段 `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.instance`，构造函数 `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.TokenStore` 为 private）；token 存于 `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.token`，仅内存保存，由 `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save` 写入。
- Harmony：`harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save` 与 `harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.isLoggedIn` 均为静态方法。
- iOS：通过 `TokenStore.shared` 访问；`ProfileView` 通过 `@EnvironmentObject`（`ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.router`）取得 `AppRouter`。

## 数据流

1. 进入页面（导航或 `minishop://profile` 深链）。
2. 渲染时读取 `TokenStore` → 显示 `Signed in` / `Guest`。
3. 点击 `Log out` → `TokenStore.save("")` → 重置导航栈并落到 `login`。

## 差异与注意点

- **登录判定不完全一致**：Android / Harmony 将空字符串视为未登录；iOS 只判断 `token == nil`，而登出写入的是 `""`。若 iOS 的 `TokenStore.token` 为非可选字符串或空串被存为非 nil，则登出后再次进入个人中心可能仍显示 `Signed in`。此处 `TokenStore` iOS 源码未在本页事实中给出，需另行核实。
- 导航栈处理：Harmony 与 iOS 在登出时重置整个栈（只留 login）；Android 的行为取决于调用方传入的 `onLogout`。

## testID 与测试要点

| 平台 | `profile_name` | `profile_logout` |
|---|---|---|
| android | `android/app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt:16` | `android/app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt:17` |
| harmony | `harmony/entry/src/main/ets/pages/ProfilePage.ets:17` | `harmony/entry/src/main/ets/pages/ProfilePage.ets:18` |
| ios | `ios/MiniShop/Features/Profile/ProfileView.swift:9` | `ios/MiniShop/Features/Profile/ProfileView.swift:10` |

测试要点：
- 用 `?token=<t>` 深链注入后进入 `profile`，`profile_name` 应为 `Signed in`；无 token 时为 `Guest`。
- 点击 `profile_logout` 后应落到登录页，且返回不应回到个人中心（栈已重置，Android 需验证）。
- 登出后再次进入 `profile`，三端都应显示 `Guest`（重点验证 iOS）。

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
