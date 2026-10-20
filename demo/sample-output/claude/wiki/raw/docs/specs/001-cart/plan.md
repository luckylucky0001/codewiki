# Implementation Plan: 购物车

- Android: `CartViewModel` (Compose + ViewModel)；iOS: `CartViewModel` (ObservableObject)；HarmonyOS: `CartStore`。
- 三端共享上限常量，接口 `POST /api/cart`。
