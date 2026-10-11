# Packages the contents of .pack/ into dist/$name-$version.zip (name and version from package.json).

param(
    [string]$WorkspaceFolder = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$packageJson = Join-Path $WorkspaceFolder "package.json"
$pkg = Get-Content $packageJson -Raw | ConvertFrom-Json

$packDir = Join-Path $WorkspaceFolder ".pack"
$distDir = Join-Path $WorkspaceFolder "dist"

if (-not (Test-Path $packDir)) {
    throw ".pack/ directory not found. Run 'npm run build' first."
}

$zipName = "$($pkg.name)-$($pkg.version).zip"
$zipPath = Join-Path $distDir $zipName

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $packDir "*") -DestinationPath $zipPath
Write-Host "Packaged: dist/$zipName"
