package com.minishop.data

data class LoginRequest(val username: String, val password: String)
data class LoginResponse(val token: String)
data class Product(val id: String, val title: String, val price: Int)
data class CartRequest(val sku: String, val quantity: Int)
data class CartResponse(val count: Int)
data class OrderRequest(val paymentMethod: String)
data class OrderResponse(val orderId: String, val status: String)
