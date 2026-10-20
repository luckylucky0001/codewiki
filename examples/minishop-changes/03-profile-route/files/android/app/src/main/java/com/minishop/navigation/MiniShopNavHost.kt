package com.minishop.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import com.minishop.ui.cart.CartScreen
import com.minishop.ui.checkout.CheckoutScreen
import com.minishop.ui.login.LoginScreen
import com.minishop.ui.order.OrderDetailScreen
import com.minishop.ui.products.ProductDetailScreen
import com.minishop.ui.products.ProductsScreen
import com.minishop.ui.profile.ProfileScreen

const val DEEPLINK_BASE = "minishop://"

@Composable
fun MiniShopNavHost() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.LOGIN) {
        composable(Routes.LOGIN, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.LOGIN })) {
            LoginScreen(onLoggedIn = { nav.navigate(Routes.PRODUCTS) })
        }
        composable(Routes.PRODUCTS, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.PRODUCTS })) {
            ProductsScreen(
                onOpen = { id -> nav.navigate("product/$id") },
                onCart = { nav.navigate(Routes.CART) },
            )
        }
        composable(Routes.PRODUCT_DETAIL, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.PRODUCT_DETAIL })) { entry ->
            ProductDetailScreen(id = entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() })
        }
        composable(Routes.CART, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.CART })) {
            CartScreen(onCheckout = { nav.navigate(Routes.CHECKOUT) }, onBack = { nav.popBackStack() })
        }
        composable(Routes.CHECKOUT, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.CHECKOUT })) {
            CheckoutScreen(onOrderPlaced = { orderId -> nav.navigate("order/$orderId") }, onBack = { nav.popBackStack() })
        }
        composable(Routes.ORDER_DETAIL, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.ORDER_DETAIL })) { entry ->
            OrderDetailScreen(id = entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() })
        }
        composable(Routes.PROFILE, deepLinks = listOf(navDeepLink { uriPattern = DEEPLINK_BASE + Routes.PROFILE })) {
            ProfileScreen(onLogout = { nav.navigate(Routes.LOGIN) }, onBack = { nav.popBackStack() })
        }
    }
}
