package com.minishop.ui.products

import androidx.lifecycle.ViewModel
import com.minishop.data.ApiClient
import com.minishop.data.Product

class ProductsViewModel : ViewModel() {
    var products: List<Product> = emptyList()
        private set

    suspend fun loadProducts() {
        products = ApiClient.service.listProducts()
    }

    suspend fun loadProduct(id: String): Product = ApiClient.service.getProduct(id)
}
