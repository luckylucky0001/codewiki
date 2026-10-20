plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.minishop"
    compileSdk = 35
    defaultConfig { applicationId = "com.minishop"; minSdk = 26 }
    buildFeatures { compose = true }
}

dependencies {
    implementation("androidx.navigation:navigation-compose:2.8.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
}
