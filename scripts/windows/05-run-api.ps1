param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$ProjectRoot = "",
    [int]$Port = 18080,
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
& $PythonExe -m uvicorn app.main:app --host 127.0.0.1 --port $Port --reload
