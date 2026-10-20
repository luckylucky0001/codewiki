package com.minishop.ui.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.minishop.data.TokenStore
import com.minishop.ui.components.MiniShopTopBar

@Composable
fun ProfileScreen(onLogout: () -> Unit, onBack: () -> Unit) {
    Column {
        MiniShopTopBar(title = "Profile", onBack = onBack)
        Text(if (TokenStore.getInstance().isLoggedIn()) "Signed in" else "Guest", modifier = Modifier.testTag("profile_name"))
        Button(onClick = { TokenStore.getInstance().save(""); onLogout() }, modifier = Modifier.testTag("profile_logout")) { Text("Log out") }
    }
}
