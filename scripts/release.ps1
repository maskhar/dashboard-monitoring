$ErrorActionPreference = "Stop"
if (-not (Test-Path .git)) { throw "Git repository required" }
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $changes) { throw "Commit source changes before production release" }
$revision = git rev-parse --short=12 HEAD
if ($LASTEXITCODE -ne 0) { throw "A Git commit is required before production release" }
$env:BUILD_REVISION = $revision.Trim()
$env:APP_VERSION = (node -p "require('./package.json').version").Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot read application version" }
$configuration = docker compose -f compose.yaml config --format json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Compose configuration invalid" }
if (-not $configuration.services.app.environment.AUTH_GOOGLE_ID -or -not $configuration.services.app.environment.AUTH_GOOGLE_SECRET) {
  throw "Set Google credentials through approved local environment before production release"
}
docker compose -f compose.yaml build app worker init monitor
if ($LASTEXITCODE -ne 0) { throw "Build failed; deployment not started" }
Write-Host "Image ready: utero-dashboard-monitoring:$env:APP_VERSION-$env:BUILD_REVISION"
Write-Host "Review backup and run docker compose -f compose.yaml up -d when ready."
