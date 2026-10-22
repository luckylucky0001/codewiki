package com.minishop.ui.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.minishop.data.ApiClient
import com.minishop.data.OrderRequest
import com.minishop.ui.components.MiniShopTopBar
import kotlinx.coroutines.launch

@Composable
fun CheckoutScreen(onOrderPlaced: (String) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    Column {
        MiniShopTopBar(title = "Checkout", onBack = onBack)
        Button(
            onClick = { scope.launch { onOrderPlaced(placeOrder()) } },
            modifier = Modifier.testTag("checkout_submit"),
        ) { Text("Place order") }
    }
}

suspend fun placeOrder(): String = ApiClient.service.createOrder(OrderRequest(paymentMethod = "card")).orderId
