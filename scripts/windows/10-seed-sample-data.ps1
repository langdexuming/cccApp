param(
    [string]$ProjectRoot = "",
    [string]$EnvRoot = "E:\.env_trains"
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$resourceFile = Join-Path $ProjectRoot "resources\alarm_analysis.json"
$prepareScript = Join-Path $ProjectRoot "scripts\prepare_alarm_analysis_datasets.py"

if ((Test-Path $resourceFile) -and (Test-Path $prepareScript) -and (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Preparing alarm analysis datasets from source JSON..." -ForegroundColor Cyan
    & python $prepareScript
    if ($LASTEXITCODE -ne 0) {
        throw "Dataset preparation failed: $prepareScript"
    }
    Write-Host "Prepared datasets generated under runtime\\datasets" -ForegroundColor Green
    return
}

$sourceRoot = Join-Path $ProjectRoot "examples\datasets"
$targetRoot = Join-Path $ProjectRoot "runtime\datasets"

if (-not (Test-Path $sourceRoot)) {
    throw "Examples datasets not found: $sourceRoot"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

Get-ChildItem -Path $sourceRoot -Directory | ForEach-Object {
    $targetDir = Join-Path $targetRoot $_.Name
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -Path (Join-Path $_.FullName "*") -Destination $targetDir -Recurse -Force
}

Write-Host "Sample datasets copied to $targetRoot" -ForegroundColor Green
