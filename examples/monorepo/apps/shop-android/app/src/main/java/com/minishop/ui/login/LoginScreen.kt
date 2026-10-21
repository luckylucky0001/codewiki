package com.minishop.ui.login

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onLoggedIn: () -> Unit, vm: LoginViewModel = viewModel()) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    Column {
        TextField(value = username, onValueChange = { username = it }, modifier = Modifier.testTag("login_username"))
        TextField(value = password, onValueChange = { password = it }, modifier = Modifier.testTag("login_password"))
        Button(
            onClick = { scope.launch { if (vm.login(username, password)) onLoggedIn() } },
            modifier = Modifier.testTag("login_submit"),
        ) { Text("Sign in") }
    }
}
