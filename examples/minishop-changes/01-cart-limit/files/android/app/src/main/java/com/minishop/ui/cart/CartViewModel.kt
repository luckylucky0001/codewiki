package com.minishop.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minishop.data.ApiClient
import com.minishop.data.CartRequest
import kotlinx.coroutines.launch

/** Cart state. Quantity per order is capped by MAX_CART_ITEMS. */
class CartViewModel : ViewModel() {
    val items = mutableListOf<String>()

    fun addItem(sku: String): Boolean {
        if (items.size >= MAX_CART_ITEMS) return false
        items.add(sku)
        viewModelScope.launch { ApiClient.service.addToCart(CartRequest(sku, 1)) }
        return true
    }

    fun total(): Int = items.size

    companion object {
        const val MAX_CART_ITEMS = 50
        private val pending = mutableListOf<String>()

        fun preload(sku: String) {
            pending.add(sku)
        }
    }
}
