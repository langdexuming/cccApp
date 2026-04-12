param(
    [string]$ProjectRoot = "E:\ai\ai_trains",
    [string]$EnvRoot = "E:\.env_trains"
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

Set-Location "$ProjectRoot\frontend"
npm run dev
