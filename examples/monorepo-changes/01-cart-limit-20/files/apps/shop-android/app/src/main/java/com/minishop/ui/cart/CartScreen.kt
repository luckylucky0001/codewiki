package com.minishop.ui.cart

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.viewmodel.compose.viewModel
import com.minishop.ui.components.MiniShopTopBar

@Composable
fun CartScreen(onCheckout: () -> Unit, onBack: () -> Unit, vm: CartViewModel = viewModel()) {
    Column {
        MiniShopTopBar(title = "Cart", onBack = onBack)
        Text("Items: ${vm.total()}", modifier = Modifier.testTag("cart_total"))
        Button(onClick = onCheckout, enabled = vm.total() > 0, modifier = Modifier.testTag("cart_checkout")) { Text("Checkout") }
    }
}
