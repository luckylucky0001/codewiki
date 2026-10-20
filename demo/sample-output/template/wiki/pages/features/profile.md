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
source_commit: d36d971
status: current
---
# 个人中心（profile）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `profile` | `minishop://profile` | `android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen` |
| harmony | `profile` | `minishop://profile` | `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder` |
| ios | `profile` | `minishop://profile` | `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `profile_logout` | `android/app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt:17` |
| android | `profile_name` | `android/app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt:16` |
| harmony | `profile_logout` | `harmony/entry/src/main/ets/pages/ProfilePage.ets:18` |
| harmony | `profile_name` | `harmony/entry/src/main/ets/pages/ProfilePage.ets:17` |
| ios | `profile_logout` | `ios/MiniShop/Features/Profile/ProfileView.swift:10` |
| ios | `profile_name` | `ios/MiniShop/Features/Profile/ProfileView.swift:9` |

## 接口

（该功能的锚点符号未直接调用 HTTP 接口）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.TokenStore` — constructor `private TokenStore()`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.getInstance` — method `public static synchronized TokenStore getInstance()`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.instance` — property `private static TokenStore instance;`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.isLoggedIn` — method `public boolean isLoggedIn()`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save` — method `public void save(String token)`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.token` — property `private String token;`
- `android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen` — composable `@Composable fun ProfileScreen(onLogout: () -> Unit, onBack: () -> Unit)`

**harmony**

- `harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.isLoggedIn` — method `static isLoggedIn(): boolean`
- `harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save` — method `static save(token: string): void`
- `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder` — function `@Builder export function ProfileBuilder()`
- `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.build` — method `build()`

**ios**

- `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView` — struct `struct ProfileView: View`
- `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.body` — property `var body: some View`
- `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView.router` — property `@EnvironmentObject var router: AppRouter`

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
