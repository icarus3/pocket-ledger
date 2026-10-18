param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolRoot = Join-Path $projectRoot 'build-tools'
$downloads = Join-Path $toolRoot 'downloads'
$javaRoot = Join-Path $toolRoot 'java'
$sdkRoot = Join-Path $toolRoot 'sdk'
$gradleRoot = Join-Path $toolRoot 'gradle-8.11.1'
$gradleCommand = Join-Path $gradleRoot 'bin\gradle.bat'
$sdkManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'

function Find-LocalJava {
    if (Test-Path -LiteralPath $javaRoot) {
        return Get-ChildItem -LiteralPath $javaRoot -Directory | Where-Object {
            Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe')
        } | Sort-Object Name -Descending | Select-Object -First 1
    }
}

if ($CheckOnly) {
    [pscustomobject]@{
        Folder = $toolRoot
        Java = [bool](Find-LocalJava)
        Gradle = Test-Path -LiteralPath $gradleCommand
        SDKManager = Test-Path -LiteralPath $sdkManager
        Platform35 = Test-Path -LiteralPath (Join-Path $sdkRoot 'platforms\android-35\android.jar')
        BuildTools35 = Test-Path -LiteralPath (Join-Path $sdkRoot 'build-tools\35.0.0\apksigner.bat')
        Prepared = Test-Path -LiteralPath (Join-Path $toolRoot 'READY.txt')
    } | Format-List
    exit 0
}

New-Item -ItemType Directory -Force -Path $toolRoot, $downloads, $javaRoot | Out-Null
Start-Transcript -Path (Join-Path $toolRoot 'setup.log') -Append | Out-Null
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'

    function Get-VerifiedArchive([string]$Url, [string]$Name, [string]$Sha256) {
        if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid checksum metadata for $Name" }
        $archive = Join-Path $downloads $Name
        if (-not (Test-Path -LiteralPath $archive)) {
            Write-Host "Downloading $Name ..."
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $archive
        } else { Write-Host "Using downloaded file: $Name" }
        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
        if ($actual -ne $Sha256) { throw "Checksum mismatch for $Name. Download a fresh copy to $downloads and run preparation again." }
        return $archive
    }

    Write-Host "All tool installations and build caches will be kept in $toolRoot"
    Write-Host '1/5 - Java 21 (Windows x64 ZIP)'
    $javaInstall = Find-LocalJava
    if (-not $javaInstall) {
        $metadataUrl = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
        $releases = @(Invoke-RestMethod -Uri $metadataUrl)
        $package = ($releases | Select-Object -First 1).binary.package
        if (-not $package.name -or $package.name -notlike 'OpenJDK21U-jdk_x64_windows_hotspot_*.zip') { throw 'Could not identify the official Java 21 Windows x64 ZIP.' }
        $javaArchive = Get-VerifiedArchive $package.link $package.name $package.checksum
        Expand-Archive -LiteralPath $javaArchive -DestinationPath $javaRoot -Force
        $javaInstall = Find-LocalJava
    }
    if (-not $javaInstall) { throw 'The Java ZIP did not contain bin\javac.exe.' }
    $env:JAVA_HOME = $javaInstall.FullName
    $env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
    $env:ANDROID_HOME = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
    $env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
    $env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
    New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME, $env:GRADLE_USER_HOME | Out-Null

    Write-Host '2/5 - Gradle 8.11.1'
    if (-not (Test-Path -LiteralPath $gradleCommand)) {
        $gradleUrl = 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip'
        $gradleHash = ([string](Invoke-RestMethod -Uri "$gradleUrl.sha256")).Trim()
        $gradleArchive = Get-VerifiedArchive $gradleUrl 'gradle-8.11.1-bin.zip' $gradleHash
        Expand-Archive -LiteralPath $gradleArchive -DestinationPath $toolRoot -Force
    }

    Write-Host '3/5 - Android command-line tools'
    if (-not (Test-Path -LiteralPath $sdkManager)) {
        $toolsName = 'commandlinetools-win-15859902_latest.zip'
        # SHA-256 published by developer.android.com/studio for this exact archive.
        $toolsHash = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
        $sdkArchive = Get-VerifiedArchive "https://dl.google.com/android/repository/$toolsName" $toolsName $toolsHash
        $extractRoot = Join-Path $toolRoot 'command-line-archive'
        Expand-Archive -LiteralPath $sdkArchive -DestinationPath $extractRoot -Force
        $cmdlineRoot = Join-Path $sdkRoot 'cmdline-tools\latest'
        New-Item -ItemType Directory -Force -Path $cmdlineRoot | Out-Null
        Get-ChildItem -LiteralPath (Join-Path $extractRoot 'cmdline-tools') | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $cmdlineRoot -Recurse -Force
        }
    }
    if (-not (Test-Path -LiteralPath $sdkManager)) { throw 'Android command-line tools were not extracted correctly.' }

    Write-Host '4/5 - Android SDK Platform 35, Build Tools 35.0.0, and Platform Tools'
    Write-Host 'Read the Android SDK licenses below. Enter y only if you agree.'
    & $sdkManager "--sdk_root=$sdkRoot" --licenses
    if ($LASTEXITCODE -ne 0) { throw 'The SDK license step did not finish. Run preparation again when ready.' }
    & $sdkManager "--sdk_root=$sdkRoot" 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK package download failed.' }

    Write-Host '5/5 - Download project build libraries and run a preliminary release build'
    Write-Host 'This fills the local cache so the assistant can finish the APK without downloading libraries.'
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'android\app\src\main\assets\www\app.js'))) {
        throw 'The bundled application assets are missing. Ask the assistant to rebuild them first.'
    }
    ('sdk.dir=' + $sdkRoot.Replace('\','/')) | Set-Content -LiteralPath (Join-Path $projectRoot 'android\local.properties') -Encoding ascii
    & $gradleCommand -p (Join-Path $projectRoot 'android') assembleRelease lint --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'The preliminary build did not finish. Keep this folder and share build-tools\setup.log with the assistant.' }
    "Prepared on $(Get-Date -Format o)`r`nJAVA_HOME=$env:JAVA_HOME`r`nANDROID_HOME=$sdkRoot`r`nGRADLE_USER_HOME=$env:GRADLE_USER_HOME" | Set-Content -LiteralPath (Join-Path $toolRoot 'READY.txt') -Encoding ascii
    Write-Host ''
    Write-Host 'READY - Tell the assistant: Build tools are ready.' -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Details are in $(Join-Path $toolRoot 'setup.log'). Existing downloads will be reused."
    Stop-Transcript | Out-Null
    exit 1
}
Stop-Transcript | Out-Null
