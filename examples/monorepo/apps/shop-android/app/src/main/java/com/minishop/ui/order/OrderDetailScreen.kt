package com.minishop.ui.order

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.minishop.ui.components.MiniShopTopBar

@Composable
fun OrderDetailScreen(id: String, onBack: () -> Unit) {
    Column {
        MiniShopTopBar(title = "Order $id", onBack = onBack)
        Text("Order placed", modifier = Modifier.testTag("order_status"))
    }
}
