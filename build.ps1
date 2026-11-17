<#
.SYNOPSIS
    Builds, tests, and packages the vscode-nikrun Visual Studio Code extension.

.DESCRIPTION
    Unified build script aligned with the Nikrun/Niksphere CI & Release pipeline:
    - Resolves CleanVersion and VersionTag from version.txt (or -Version).
    - Runs build-lib Pester tests and extension validation tests when -RunTests is active.
    - Generates CycloneDX npm SBOM (vscode-nikrun-<VersionTag>-sbom.cdx.json).
    - Bundles TypeScript via esbuild and packages vscode-nikrun-<VersionTag>.vsix (+ .sha256).
    - Generates release-notes.json and manifest.json in -OutDir.
#>
[CmdletBinding(PositionalBinding = $false)]
param (
    [string]$OutDir = ".out",
    [string]$Version = "",
    [switch]$RunTests = $true,
    [switch]$GenerateSpecs = $true
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = $PSScriptRoot
Import-Module (Join-Path $RootDir "build-lib/ps-modules/Common/Common.psd1") -Force

$resolvedVersion = Resolve-BuildVersion -RootDir $RootDir -Version $Version
$VersionTag      = $resolvedVersion.VersionTag
$CleanVersion    = $resolvedVersion.CleanVersion

function Resolve-FullPsPath([string]$RawPath) {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RawPath)
}

$ResolvedOutDir = if ([System.IO.Path]::IsPathRooted($OutDir)) {
    Resolve-FullPsPath $OutDir
} else {
    Resolve-FullPsPath (Join-Path $RootDir $OutDir)
}
if (-not (Test-Path $ResolvedOutDir)) {
    New-Item -ItemType Directory -Path $ResolvedOutDir -Force | Out-Null
}

Write-Host "Building vscode-nikrun..." -ForegroundColor Cyan
Write-Host "  Version:       $VersionTag ($CleanVersion)"
Write-Host "  OutDir:        $ResolvedOutDir"
Write-Host "  RunTests:      $RunTests"
Write-Host "  GenerateSpecs: $GenerateSpecs"

Push-Location $RootDir
$prevEnvVersion = $env:NIKRUN_VERSION_TAG
$pkgPath        = Join-Path $RootDir "package.json"
$lockPath       = Join-Path $RootDir "package-lock.json"
$origPkgRaw     = [System.IO.File]::ReadAllText($pkgPath)
$origLockRaw    = if (Test-Path $lockPath) { [System.IO.File]::ReadAllText($lockPath) } else { $null }
$mutatedPkg     = $false

try {
    $env:NIKRUN_VERSION_TAG = $VersionTag

    if ($RunTests) {
        Write-Host "  -> Running build-lib Pester tests..."
        Invoke-BuildLibTests -RootDir $RootDir
    }

    if (-not (Test-Path "node_modules")) {
        Write-Host "  -> Running npm ci..."
        npm ci
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "npm ci failed" }
    }

    $sbomFile = $null
    if ($GenerateSpecs) {
        $sbomFile = New-NpmCycloneDxSbom `
            -FrontendDir $RootDir `
            -ProductKey "vscode-nikrun" `
            -VersionTag $VersionTag `
            -OutDir $ResolvedOutDir
    } else {
        Write-Host "  -> Skipping SBOM generation (GenerateSpecs = false)"
    }

    if ($RunTests) {
        Write-Host "  -> Running extension compile & asset validation tests..."
        npm test
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "npm test failed" }
    } else {
        Write-Host "  -> Compiling & bundling extension..."
        npm run compile
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "npm run compile failed" }
    }

    $currentPkgVer = ((Get-Content $pkgPath -Raw) | ConvertFrom-Json).version
    if ($currentPkgVer -ne $CleanVersion) {
        $mutatedPkg = $true
        npm version $CleanVersion --no-git-tag-version --allow-same-version | Out-Host
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "npm version failed" }
    }

    $VsixName    = "vscode-nikrun-${VersionTag}.vsix"
    $VsixOutPath = Join-Path $ResolvedOutDir $VsixName

    Write-Host "  -> Packaging VSIX: $VsixOutPath"
    npx --yes @vscode/vsce package -o $VsixOutPath
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "vsce package failed" }

    $VsixSha256 = Get-FileSha256 -FilePath $VsixOutPath

    $downloads = [ordered]@{}
    if (Test-Path $VsixOutPath) {
        $downloads["vsix"] = [ordered]@{
            "url"    = $VsixName
            "size"   = (Get-Item $VsixOutPath).Length
            "sha256" = $VsixSha256
        }
    }

    $releaseNotesFile = $null
    if ($GenerateSpecs) {
        Write-Host "  -> Generating release-notes.json and manifest.json..."
        $changelogPath = Join-Path $RootDir "changelog.yml"
        $releaseNotesFile = New-ReleaseNotesSpec `
            -ChangelogPath $changelogPath `
            -CleanVersion $CleanVersion `
            -ProductKey "vscode-nikrun" `
            -VersionTag $VersionTag `
            -OutDir $ResolvedOutDir

        $mdOutPath = Join-Path (Join-Path $RootDir ".work") "release-notes.md"
        New-ReleaseNotesMarkdown `
            -ChangelogPath $changelogPath `
            -CleanVersion $CleanVersion `
            -ProductName "Nikrun for VS Code (vscode-nikrun)" `
            -VersionTag $VersionTag `
            -OutputPath $mdOutPath | Out-Null
    } else {
        Write-Host "  -> Skipping release-notes.json generation (GenerateSpecs = false); generating manifest.json..."
    }

    $specs = [ordered]@{}
    if ($releaseNotesFile) {
        $specs["release-notes"] = $releaseNotesFile
    }
    if ($sbomFile) {
        $specs["sbom"] = $sbomFile
    }

    New-Manifest `
        -ProductKey "vscode-nikrun" `
        -ProductName "Nikrun VS Code Extension" `
        -VersionTag $VersionTag `
        -OutDir $ResolvedOutDir `
        -Downloads $downloads `
        -Specs $specs | Out-Null

    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_STEP_SUMMARY)) {
        $sizeKb = [math]::Round((Get-Item $VsixOutPath).Length / 1KB, 1)
        $summaryMd = @(
            "### ``vscode-nikrun`` Extension Build"
            ""
            "| Property | Value |"
            "| :--- | :--- |"
            "| **Version** | ``$VersionTag`` |"
            "| **VSIX** | ``$VsixName`` ($sizeKb KB) |"
            "| **SHA-256** | ``$VsixSha256`` |"
            ""
        ) -join "`n"
        [System.IO.File]::AppendAllText($env:GITHUB_STEP_SUMMARY, $summaryMd, [System.Text.UTF8Encoding]::new($false))
    }

    Write-Host "Build complete: $VsixOutPath" -ForegroundColor Green
} finally {
    $env:NIKRUN_VERSION_TAG = $prevEnvVersion
    if ($mutatedPkg) {
        [System.IO.File]::WriteAllText($pkgPath, $origPkgRaw, [System.Text.UTF8Encoding]::new($false))
        if ($null -ne $origLockRaw) {
            [System.IO.File]::WriteAllText($lockPath, $origLockRaw, [System.Text.UTF8Encoding]::new($false))
        }
    }
    Pop-Location
}
