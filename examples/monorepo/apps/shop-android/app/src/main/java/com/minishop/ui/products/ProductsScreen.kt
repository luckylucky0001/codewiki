package com.minishop.ui.products

import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun ProductsScreen(onOpen: (String) -> Unit, onCart: () -> Unit, vm: ProductsViewModel = viewModel()) {
    LaunchedEffect(Unit) { vm.loadProducts() }
    IconButton(onClick = onCart, modifier = Modifier.testTag("tab_cart")) { Text("Cart") }
    LazyColumn(modifier = Modifier.testTag("product_list")) {
        items(vm.products) { p ->
            Text(p.title, modifier = Modifier.testTag("product_item_${p.id}").clickable { onOpen(p.id) })
        }
    }
}
