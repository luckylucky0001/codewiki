---
id: features/login
title: 登录（login）
kind: feature
platforms: [android, harmony, ios]
routes: [login]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.login
    hash: 16d311d2a6158c5d17707cadc88b03bbe10eb3bc49d630600109bbafc5d030d8
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.TokenStore
    hash: f549b73c3c010a905c49c7d9e1bc0db31faf1440205dcb28dfda15ff8fc9545c
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.getInstance
    hash: 2b6bd9f0e44082ede243ce416768560b138ca4343a19fe489c75cee166d4e1ae
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save
    hash: 3cae2cf4e99a8abfdeb5a42e53b6a5ad84baeb843fdb390e10684ac9af6457ce
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.token
    hash: 1ca402643adb65135f33a666a2ecebd23f12ca41a870848b7a176ba98dbae1ea
  - sym: android://app/src/main/java/com/minishop/ui/login/LoginScreen.kt#LoginScreen
    hash: d844335d42fe1a03de8c3fd18fd336b466dda45abb8ca96a36a76086e01ac7bd
  - sym: android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.error
    hash: 146c3904200b8ae4fa964c22ad41cb921e50e711384a5f8583cbdeb296a2d1fe
  - sym: android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login
    hash: 95656a4f2c6e87d65125d80b8512d39d72353bab4897e6fe1a3b5c23a3b76270
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.login
    hash: 97c03ac531110f5db09c79111053b250cf9de6679324f0cd54a9bc72cb56a77d
  - sym: harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save
    hash: 7dddfca852f01d7d973f86ae3e2887090838eaf6839d883ed9b44b71ee4896bd
  - sym: harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.token
    hash: 79332e495cf06236b465cd267c8c1548d3cb48945079bbb23f4be2c9faa974b6
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginBuilder
    hash: 5a1d54114941c42a8701183cc11595cb235188aff64cd444c3721a8fdf996486
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.build
    hash: 8ec8756bc0a9562d2af5fbc26b1364b178df3365b8430d06becc3287917b3f8d
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.onSubmit
    hash: db69ad016a1c4ec545413f899b5ba8e37866be783227f74f25db110da6e3a9b9
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.password
    hash: cc08a6438b3faf98d1ba25e484f0b60064cf35402a5b4a049abe0abc20cb17c0
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.username
    hash: 0793e47a7768058e3b10a4fccf6ea1d698fdde2a70bcb55e27b2ce669f5a5d34
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView
    hash: 13735226ce1bc1845db3b9bb5a9fef4c6b614584b4bcd4112b82d3ef73259537
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.body
    hash: 8b6a7f3eb1b970c92a4e12ebecc245eca3b3351b8e40760349dbf7d55c411004
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.password
    hash: 5d457fbe25c2b96d6ba93f79d70f1ba91060f40dfa8a9eb53867d7d82bf4a7c5
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.username
    hash: 4f061012460b0732643a5649e22b9acb5960250c5c557619525fb8069e6f4ba1
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.vm
    hash: b0ab25a9c4bb1b95548d2982e69b6a98ba44995d79075cbbde4c25e6f2a2c20d
  - sym: ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.error
    hash: 1d93ad5e86f07b6e47e1271d5343948dbe103e138545237207c0e10930def63f
  - sym: ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login
    hash: c7a114bae2e4a6dd1df9f051017b9ec3966962fecbe46f60d258cb0c33f36ed8
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginRequest.password
    hash: d7f1a48269ceb254c79b3dd357d976c890bab9ceb0c6470c1db72796a38d59b3
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginRequest.username
    hash: 69cbe8b7dbde9467c32ddc691a59a74de38c51788a10be79f7937294f5a8e03a
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginResponse.token
    hash: d31dd686a0bb1c46c11e0ebcd19b599d5aa898cb82b6ce956b5f579cba6d3e17
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore.token
    hash: cc9a2bad373da05b2c10efdd69bf76de940bebff0e4ee5477b4b4cd213b4dc72
source_commit: 8b9db05
status: current
---
# 登录（login）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `login` | `minishop://login` | `android://app/src/main/java/com/minishop/ui/login/LoginScreen.kt#LoginScreen` |
| harmony | `login` | `minishop://login` | `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginBuilder` |
| ios | `login` | `minishop://login` | `ios://MiniShop/Features/Login/LoginView.swift#LoginView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `login_password` | `android/app/src/main/java/com/minishop/ui/login/LoginScreen.kt:20` |
| android | `login_submit` | `android/app/src/main/java/com/minishop/ui/login/LoginScreen.kt:23` |
| android | `login_username` | `android/app/src/main/java/com/minishop/ui/login/LoginScreen.kt:19` |
| harmony | `login_password` | `harmony/entry/src/main/ets/pages/LoginPage.ets:29` |
| harmony | `login_submit` | `harmony/entry/src/main/ets/pages/LoginPage.ets:31` |
| harmony | `login_username` | `harmony/entry/src/main/ets/pages/LoginPage.ets:27` |
| ios | `login_password` | `ios/MiniShop/Features/Login/LoginView.swift:12` |
| ios | `login_submit` | `ios/MiniShop/Features/Login/LoginView.swift:13` |
| ios | `login_username` | `ios/MiniShop/Features/Login/LoginView.swift:11` |

## 接口

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/login` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.login` |
| harmony | POST | `/api/login` | `harmony://entry/src/main/ets/common/Api.ets#Api.login` |
| ios | POST | `/api/login` | `ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login` |

## 关键常量

- `TokenStore.token` = `""`（harmony）
- `LoginPage.password` = `""`（harmony）
- `LoginPage.username` = `""`（harmony）
- `LoginView.password` = `""`（ios）
- `LoginView.username` = `""`（ios）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.login` — function `@POST("/api/login") suspend fun login(@Body body: LoginRequest): LoginResponse`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.TokenStore` — constructor `private TokenStore()`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.getInstance` — method `public static synchronized TokenStore getInstance()`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save` — method `public void save(String token)`
- `android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.token` — property `private String token;`
- `android://app/src/main/java/com/minishop/ui/login/LoginScreen.kt#LoginScreen` — composable `@Composable fun LoginScreen(onLoggedIn: () -> Unit, vm: LoginViewModel = viewModel())`
- `android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.error` — property `var error: String?`
- `android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login` — function `suspend fun login(username: String, password: String): Boolean`

**harmony**

- `harmony://entry/src/main/ets/common/Api.ets#Api.login` — method `static async login(username: string, password: string): Promise<string>`
- `harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save` — method `static save(token: string): void`
- `harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.token` — property `private static token: string`
- `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginBuilder` — function `@Builder export function LoginBuilder()`
- `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.build` — method `build()`
- `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.onSubmit` — method `async onSubmit(): Promise<void>`
- `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.password` — property `@State password: string`
- `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.username` — property `@State username: string`

**ios**

- `ios://MiniShop/Features/Login/LoginView.swift#LoginView` — struct `struct LoginView: View`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView.body` — property `var body: some View`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView.password` — property `@State private var password`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView.router` — property `@EnvironmentObject var router: AppRouter`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView.username` — property `@State private var username`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView.vm` — property `@StateObject private var vm`
- `ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.error` — property `@Published var error: String?`
- `ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login` — function `func login(username: String, password: String) async -> Bool`
- `ios://MiniShop/Networking/APIClient.swift#LoginRequest.password` — property `let password: String`
- `ios://MiniShop/Networking/APIClient.swift#LoginRequest.username` — property `let username: String`
- `ios://MiniShop/Networking/APIClient.swift#LoginResponse.token` — property `let token: String`
- `ios://MiniShop/Networking/APIClient.swift#TokenStore.token` — property `private(set) var token: String?`

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
