$ErrorActionPreference = 'Stop'

if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
  throw 'Gradle nao encontrado. Instale Java 17, Android SDK e Gradle, ou gere o APK pelo GitHub Actions.'
}

Push-Location $PSScriptRoot
try {
  gradle assembleDebug
  Write-Host 'APK gerado em app\build\outputs\apk\debug\app-debug.apk'
} finally {
  Pop-Location
}