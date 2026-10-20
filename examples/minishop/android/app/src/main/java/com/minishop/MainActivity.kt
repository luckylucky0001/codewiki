package com.minishop

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.minishop.data.TokenStore
import com.minishop.navigation.MiniShopNavHost
import com.minishop.ui.cart.CartViewModel

/** Single-activity host. Deep links arrive as minishop://<route>?token=..&cart=.. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyTestParams(intent?.data)
        setContent { MiniShopNavHost() }
    }

    /** Test-only state injection: ?token=<t>&cart=<sku,sku>. */
    private fun applyTestParams(uri: Uri?) {
        if (uri == null) return
        uri.getQueryParameter("token")?.let { TokenStore.getInstance().save(it) }
        uri.getQueryParameter("cart")?.split(",")?.forEach { sku -> CartViewModel.preload(sku) }
    }
}
