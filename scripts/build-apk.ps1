param([switch]$DebugBuild, [switch]$UseBundledAssets, [switch]$Offline)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

# Prefer the single-folder setup prepared by Prepare-Android-Tools.cmd.
$toolRoot = Join-Path $projectRoot 'build-tools'
$localJavaRoot = Join-Path $toolRoot 'java'
if (Test-Path -LiteralPath $localJavaRoot) {
    $localJava = Get-ChildItem -LiteralPath $localJavaRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe')
    } | Sort-Object Name -Descending | Select-Object -First 1
    if ($localJava) { $env:JAVA_HOME = $localJava.FullName }
}
$studioJava = 'C:\Program Files\Android\Android Studio\jbr'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath $studioJava)) { $env:JAVA_HOME = $studioJava }
if (-not $env:JAVA_HOME) { throw 'Run Prepare-Android-Tools.cmd, install Android Studio, or set JAVA_HOME to JDK 17/21.' }
$javaBin = Join-Path $env:JAVA_HOME 'bin'
$env:Path = "$javaBin;$env:Path"
$localSdk = Join-Path $toolRoot 'sdk'
$sdkPath = if (Test-Path -LiteralPath (Join-Path $localSdk 'platforms\android-35\android.jar')) { $localSdk } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $sdkPath 'platforms\android-35\android.jar'))) { throw 'Install Android SDK Platform 35 in Android Studio > SDK Manager.' }
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
$env:npm_config_cache = Join-Path $projectRoot '.tools\npm-cache'
$gradleRoot = Join-Path $toolRoot 'gradle-8.11.1'
$gradleCommand = Join-Path $gradleRoot 'bin\gradle.bat'
if (-not (Test-Path -LiteralPath $gradleCommand)) {
    if ($Offline) { throw 'Gradle is missing. Run Prepare-Android-Tools.cmd first.' }
    New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
    $archive = Join-Path $toolRoot 'gradle-8.11.1-bin.zip'
    $url = 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip'
    Write-Host 'Downloading Gradle 8.11.1 from the official distribution service...'
    Invoke-WebRequest -Uri $url -OutFile $archive
    $expected = (Invoke-RestMethod -Uri "$url.sha256").Trim().ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actualHash) { throw 'Gradle checksum mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
}
if (-not $UseBundledAssets -and -not (Test-Path -LiteralPath 'node_modules\esbuild')) {
    if ($Offline) { throw 'Use -UseBundledAssets for an offline APK build, or install the JavaScript build tools first.' }
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if (-not $UseBundledAssets) {
    & node scripts/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Web application build failed.' }
} elseif (-not (Test-Path -LiteralPath 'android/app/src/main/assets/www/app.js')) { throw 'Bundled app assets are missing. Run the regular build first.' }
('sdk.dir=' + $sdkPath.Replace('\','/')) | Set-Content -LiteralPath android/local.properties -Encoding ascii
if (-not $DebugBuild -and -not (Test-Path -LiteralPath android/keystore.properties)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $signingPassword = [Convert]::ToBase64String($bytes)
    # Password is supplied via an environment variable, not exposed in process arguments.
    $env:POCKET_LEDGER_SIGNING_PASSWORD = $signingPassword
    & (Join-Path $javaBin 'keytool.exe') -genkeypair -keystore android/personal-release.jks -alias pocketledger -keyalg RSA -keysize 3072 -validity 10000 -storepass:env POCKET_LEDGER_SIGNING_PASSWORD -keypass:env POCKET_LEDGER_SIGNING_PASSWORD -dname 'CN=Pocket Ledger Personal, O=Personal, C=IN'
    if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed.' }
    "storeFile=personal-release.jks`nstorePassword=$signingPassword`nkeyAlias=pocketledger`nkeyPassword=$signingPassword" | Set-Content -LiteralPath android/keystore.properties -Encoding ascii
    Remove-Item Env:POCKET_LEDGER_SIGNING_PASSWORD
    Write-Host 'Keep android/personal-release.jks and android/keystore.properties private and backed up: future updates need this key.'
}
$target = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
$gradleArgs = @('-p', 'android', $target, 'lint', '--no-daemon')
if ($Offline) { $gradleArgs += '--offline' }
& $gradleCommand @gradleArgs
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
New-Item -ItemType Directory -Force -Path releases | Out-Null
$variant = if ($DebugBuild) { 'debug' } else { 'release' }
Copy-Item -LiteralPath "android/app/build/outputs/apk/$variant/app-$variant.apk" -Destination "releases/Pocket-Ledger-$variant.apk"
Write-Host "Ready: releases/Pocket-Ledger-$variant.apk"
Write-Host 'Copy the APK to your tablet, open it in Files, and allow installs from that source when Android asks.'
