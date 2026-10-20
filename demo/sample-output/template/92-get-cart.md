---
id: features/cart
title: 购物车（cart）
kind: feature
platforms: [android, harmony, ios]
routes: [cart]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service
    hash: 3fe962f0317cd2eb2057b5d5b2a5825fa045583e3425e998d41e5e76a56e1a05
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart
    hash: 04fc4a76c52c7def97e7e7e8c75b25f3609ef967500beb8ffe9b5b493a46ad02
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 298d51bd3abcc95697e472891f857dc8c47d1824e744b533c7f259aa56776ab1
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
    hash: c874d1a813b4bf8aa6817442999368d7da32979bf689f785a5cea94c2ca423bb
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem
    hash: 31497a415b9556bb374e5e6171fae5b2b1eb67ea5b9b009000bd7d2d63366b79
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
    hash: 6933c36bf1380135f949cc722b04f5f4ca17951c7af709a0d83f4a7bc818c3c7
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending
    hash: cdb3e2698d888b400e74a4bbc9d61a3211ed7109a074fa4b698ed66de0209bd7
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload
    hash: f8040fd13f4e75ef09e0cdfe990ad5c1a2d945824d784dc3d9fbc3b9e8854a8f
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total
    hash: 83e05d402203fec9ac172c0203a32fc1bcccf25f2f905b17212c5d2bd4742856
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total
    hash: c4d08fdf62cd8e2854236741b547c3d662d5d8239a2ce00fef56e4488dd51989
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder
    hash: 4329e34be7212fc1576c50d1d48e31a539790b92df2c88a26cfde1d32274d603
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build
    hash: 21d9a3829e98fea009f4723757981bcdb85ad8569734a2938ced0b316a126125
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.body
    hash: a98e27bdf2b7598556a38db6c2a3124dfd935858218baa2ae19751dd87c4cb19
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.dismiss
    hash: d2952ecb413ac8da3f7adf0834b85bb8b8cd61e0c9a337992105bf4394da93c6
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView
    hash: d47d57d059273a31af207e5d5bb372ec0c897bd5da8005b3f15971f95ef12cbf
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.body
    hash: 675fc35157f25a42b23fa2b4d7b40139077431c04f91673ae966060db549724c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.vm
    hash: 898bf98ad4b11c1170a73b9e84e8089933742e2f62b0307ce51ea24979b7103b
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total
    hash: 1c98db8cfa12470f874e7bdbcd317f84b324ebe5ea705dcde9338448e816c1ca
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle
    hash: 4b2d7773068d8cf126bef60046012ded7a2182494966a5907cd13d5ccede6be3
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match
    hash: 4277008b895b029f4caf0522de87de218a6dd86ddea121b01be670c4d227e484
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path
    hash: 8e630fea62710ade5354d04e1e353ff6e1c5b0ac38acbcbed1796eabc8660b98
source_commit: 3db62a4
status: current
---
# 购物车（cart）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `cart` | `minishop://cart` | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` |
| harmony | `cart` | `minishop://cart` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` |
| ios | `cart` | `minishop://cart` | `ios://MiniShop/Features/Cart/CartView.swift#CartView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `cart_checkout` | `android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:17` |
| harmony | `cart_checkout` | `harmony/entry/src/main/ets/pages/CartPage.ets:18` |
| ios | `cart_checkout` | `ios/MiniShop/Features/Cart/CartView.swift:11` |

## 接口

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/cart` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` |

## 关键常量

- `CartViewModel.MAX_CART_ITEMS` = `50`（android）
- `AppRouter.path` = `[]`（ios）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service` — property `val service: ApiService`
- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` — function `@POST("/api/cart") suspend fun addToCart(@Body body: CartRequest): CartResponse`
- `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` — composable `@Composable fun CartScreen(onCheckout: () -> Unit, onBack: () -> Unit, vm: CartViewModel = viewModel())`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` — property `const val MAX_CART_ITEMS`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem` — function `fun addItem(sku: String): Boolean`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items` — property `val items`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending` — property `private val pending`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload` — function `fun preload(sku: String)`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total` — function `fun total(): Int`
- `android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar` — composable `@Composable fun MiniShopTopBar(title: String, onBack: (() -> Unit)? = null)`

**harmony**

- `harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total` — method `static total(): number`
- `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` — function `@Builder export function CartBuilder()`
- `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build` — method `build()`
- `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack` — property `@Consume('pathStack') pathStack: NavPathStack`

**ios**

- `ios://MiniShop/Components/BackButton.swift#BackButton.body` — property `var body: some View`
- `ios://MiniShop/Components/BackButton.swift#BackButton.dismiss` — property `@Environment(\.dismiss) private var dismiss`
- `ios://MiniShop/Features/Cart/CartView.swift#CartView` — struct `struct CartView: View`
- `ios://MiniShop/Features/Cart/CartView.swift#CartView.body` — property `var body: some View`
- `ios://MiniShop/Features/Cart/CartView.swift#CartView.router` — property `@EnvironmentObject var router: AppRouter`
- `ios://MiniShop/Features/Cart/CartView.swift#CartView.vm` — property `@StateObject private var vm`
- `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total` — function `func total() -> Int`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` — function `func handle(url: URL)`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` — function `func match(host: String, segments: [String]) -> Destination?`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path` — property `@Published var path: [Destination]`

## 相关页面

- [总览](../overview.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
