package com.minishop.data

import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Retrofit contract for the MiniShop backend. */
interface ApiService {
    @POST("/api/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("/api/products")
    suspend fun listProducts(): List<Product>

    @GET("/api/products/{id}")
    suspend fun getProduct(@Path("id") id: String): Product

    @POST("/api/cart")
    suspend fun addToCart(@Body body: CartRequest): CartResponse

    @POST("/api/orders")
    suspend fun createOrder(@Body body: OrderRequest): OrderResponse
}

object ApiClient {
    const val BASE_URL = "https://api.minishop.example"
    val service: ApiService = Retrofit.Builder().baseUrl(BASE_URL).build().create(ApiService::class.java)
}
