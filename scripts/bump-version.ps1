param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Validate version format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "Error: Version must be in format x.y.z (e.g. 0.3.6)" -ForegroundColor Red
    exit 1
}

$root = Split-Path -Parent $PSScriptRoot

$files = @(
    @{ Path = "$root\package.json";              Pattern = '"version":\s*"[^"]*"';          Replace = """version"": ""$Version""" },
    @{ Path = "$root\src-tauri\Cargo.toml";      Pattern = '^version\s*=\s*"[^"]*"';       Replace = "version = ""$Version""" },
    @{ Path = "$root\src-tauri\tauri.conf.json";  Pattern = '"version":\s*"[^"]*"';          Replace = """version"": ""$Version""" }
)

foreach ($f in $files) {
    if (-not (Test-Path $f.Path)) {
        Write-Host "Warning: $($f.Path) not found, skipped" -ForegroundColor Yellow
        continue
    }
    $content = Get-Content $f.Path -Raw -Encoding UTF8
    $newContent = $content -replace $f.Pattern, $f.Replace
    [System.IO.File]::WriteAllText($f.Path, $newContent, [System.Text.UTF8Encoding]::new($false))
    $rel = $f.Path.Replace("$root\", "")
    Write-Host "Updated $rel" -ForegroundColor Green
}

# Update Cargo.lock
Write-Host "Updating Cargo.lock..." -ForegroundColor Cyan
Push-Location "$root\src-tauri"
cargo update -p db-designer 2>$null
Pop-Location
# Git commit, tag and push
Write-Host "Committing version bump..." -ForegroundColor Cyan
Push-Location $root
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: bump version to $Version"
git tag -a "v$Version" -m "v$Version"
Write-Host "Pushing to remote..." -ForegroundColor Cyan
git push
git push origin "v$Version"
Pop-Location
Write-Host "Done! Version bumped to $Version, tag v$Version pushed." -ForegroundColor Green
