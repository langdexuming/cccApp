param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$ProjectRoot = "",
    [int]$Interval = 5,
    [switch]$Once = $false,
    [string]$EnvRoot = "E:\.env_trains"
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$PythonExe = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

Set-Location "$ProjectRoot\backend"

if ($Once) {
    & $PythonExe -m app.workers.poller --once
} else {
    & $PythonExe -m app.workers.poller --interval $Interval
}
