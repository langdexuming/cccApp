param(
    [string]$ProjectRoot = "",
    [string]$EnvRoot = "E:\.env_trains"
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

Set-Location "$ProjectRoot\frontend"
npm run dev
