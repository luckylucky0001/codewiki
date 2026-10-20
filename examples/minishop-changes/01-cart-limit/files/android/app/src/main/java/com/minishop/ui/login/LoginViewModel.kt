package com.minishop.ui.login

import androidx.lifecycle.ViewModel
import com.minishop.data.ApiClient
import com.minishop.data.LoginRequest
import com.minishop.data.TokenStore

/**
 * Username + password login.
 * On success the token is persisted (see TokenStore). Comment-only change: must be a no-op.
 */
class LoginViewModel : ViewModel() {
    var error: String? = null
        private set

    suspend fun login(username: String, password: String): Boolean {
        if (username.isBlank() || password.length < 6) {
            error = "invalid_credentials"
            return false
        }
        val resp = ApiClient.service.login(LoginRequest(username, password))
        TokenStore.getInstance().save(resp.token)
        return true
    }
}
