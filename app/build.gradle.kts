plugins {
    id("com.android.application")
}

// Número de versión: lo pone GitHub Actions (número de compilación) para que
// cada .apk nuevo se pueda instalar encima del anterior.
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

// Llave de firma fija: GitHub Actions la saca de los secretos del repositorio.
val keystoreFile = System.getenv("THOR_KEYSTORE_FILE")
val keystorePassword = System.getenv("THOR_KEYSTORE_PASSWORD")
val hasReleaseKey = !keystoreFile.isNullOrBlank() && !keystorePassword.isNullOrBlank()

android {
    namespace = "es.thor.showdown"
    compileSdk = 35

    defaultConfig {
        applicationId = "es.thor.showdown"
        minSdk = 30
        targetSdk = 35
        versionCode = buildNumber
        versionName = "0.3.$buildNumber"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("thor") {
                storeFile = file(keystoreFile!!)
                storePassword = keystorePassword
                keyAlias = "thor"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sin llave guardada (solo pruebas) se firma con la de depuración.
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("thor")
                            else signingConfigs.getByName("debug")
        }
    }

    // El estilo y el script del mando viven en /web y van dentro de la app como copia.
    sourceSets["main"].assets.srcDirs("src/main/assets", "../web")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
