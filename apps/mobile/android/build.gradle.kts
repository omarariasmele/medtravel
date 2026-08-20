allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// geocoding_android (y otros plugins de Flutter) traen su propio
// build.gradle con compileSdk heredado de flutter.compileSdkVersion
// (hoy 33 en esta versión de Flutter) — insuficiente para dependencias
// transitivas de androidx (fragment/window/lifecycle) que exigen 34+.
// Forzar compileSdk/targetSdk acá pisa el valor de cada subproyecto sin
// tener que tocar el código generado de cada plugin.
subprojects {
    if (project.name != "app") {
        afterEvaluate {
            extensions.findByType(com.android.build.gradle.BaseExtension::class.java)?.apply {
                compileSdkVersion(36)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
