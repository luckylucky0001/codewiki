package com.minishop.ui.products

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.viewmodel.compose.viewModel
import com.minishop.data.Product
import com.minishop.ui.cart.CartViewModel
import com.minishop.ui.components.MiniShopTopBar

@Composable
fun ProductDetailScreen(id: String, onBack: () -> Unit, vm: ProductsViewModel = viewModel(), cart: CartViewModel = viewModel()) {
    var product by remember { mutableStateOf<Product?>(null) }
    LaunchedEffect(id) { product = vm.loadProduct(id) }
    Column {
        MiniShopTopBar(title = product?.title ?: "", onBack = onBack)
        Text(product?.price?.toString() ?: "")
        Button(onClick = { product?.let { cart.addItem(it.id) } }, modifier = Modifier.testTag("add_to_cart")) { Text("Add to cart") }
    }
}
