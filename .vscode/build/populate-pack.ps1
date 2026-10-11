# Completes the .pack folder, which rollup bundles index.js into, with the other files Vortex needs.
# - Copies the gameart image set in package.json ("gameart") to .pack/gameart.jpg
# - Generates .pack/info.json from package.json

param(
    [string]$WorkspaceFolder = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$packDir = Join-Path $WorkspaceFolder ".pack"

if (-not (Test-Path (Join-Path $packDir "index.js"))) {
    throw ".pack/index.js not found. Run 'npm run build' instead."
}

$pkg = Get-Content (Join-Path $WorkspaceFolder "package.json") -Raw | ConvertFrom-Json

# -- Copy gameart ----------------------------------------------------------------
if (-not $pkg.gameart) {
    throw "package.json has no 'gameart' path."
}

$gameartPath = Join-Path $WorkspaceFolder $pkg.gameart
if (-not (Test-Path $gameartPath -PathType Leaf)) {
    throw "Gameart '$($pkg.gameart)' set in package.json not found."
}
if ([IO.Path]::GetExtension($gameartPath) -ne ".jpg") {
    throw "Gameart '$($pkg.gameart)' must be a .jpg, since the extension registers gameart.jpg as its logo."
}

Copy-Item -Path $gameartPath -Destination (Join-Path $packDir "gameart.jpg") -Force
Write-Host "Gameart: $($pkg.gameart)"

# -- Generate info.json from package.json ---------------------------------------
foreach ($field in @("name", "displayName", "author", "version", "description")) {
    if (-not $pkg.$field) {
        throw "package.json has no '$field', which info.json is generated from."
    }
}

$info = [ordered]@{
    id          = $pkg.name
    name        = $pkg.displayName
    author      = $pkg.author
    version     = $pkg.version
    description = $pkg.description
}

# Vortex reads info.json with JSON.parse, which fails on the BOM Windows PowerShell's UTF-8 encoding writes
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $packDir "info.json"), ($info | ConvertTo-Json), $utf8NoBom)
Write-Host "info.json: generated from package.json (v$($pkg.version))"

Write-Host ".pack populated successfully."
