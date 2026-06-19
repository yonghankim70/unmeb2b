$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

function Read-DotEnv($path) {
  $map = @{}
  if (-not (Test-Path $path)) {
    return $map
  }

  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    $map[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $map
}

function Set-SecretFromValue($key, $value) {
  if (-not $value) {
    Write-Host "[skip] $key value is empty."
    return
  }

  Write-Host "[secret] Uploading $key"
  $value | npx wrangler secret put $key
}

$localEnv = Read-DotEnv ".env.local"
$deployEnv = Read-DotEnv ".env.deploy.local"

$deployToken = $deployEnv["CLOUDFLARE_API_TOKEN"]
if (-not $deployToken) {
  Write-Host ""
  Write-Host ".env.deploy.local file is missing or CLOUDFLARE_API_TOKEN is empty."
  Write-Host "Copy .env.deploy.local.example to .env.deploy.local and paste the Worker deploy token."
  exit 1
}

$env:CLOUDFLARE_API_TOKEN = $deployToken
$env:CLOUDFLARE_ACCOUNT_ID = $localEnv["CF_ACCOUNT_ID"]

if (-not (Test-Path ".open-next\worker.js")) {
  npm run cf:build
}

npm run cf:deploy

Set-SecretFromValue "CF_API_TOKEN" $localEnv["CF_API_TOKEN"]
Set-SecretFromValue "CF_R2_ACCESS_KEY_ID" $localEnv["CF_R2_ACCESS_KEY_ID"]
Set-SecretFromValue "CF_R2_SECRET_ACCESS_KEY" $localEnv["CF_R2_SECRET_ACCESS_KEY"]
Set-SecretFromValue "ADMIN_PASSWORD" $localEnv["ADMIN_PASSWORD"]
Set-SecretFromValue "ADMIN_SESSION_SECRET" $localEnv["ADMIN_SESSION_SECRET"]
Set-SecretFromValue "AUTH_SESSION_SECRET" $localEnv["AUTH_SESSION_SECRET"]

Write-Host ""
Write-Host "Cloudflare deploy finished."
