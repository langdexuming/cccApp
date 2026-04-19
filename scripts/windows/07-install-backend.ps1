param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$ProjectRoot = "E:\ai\ai_trains",
    [string]$EnvRoot = "E:\.env_trains"
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$PythonExe = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

Set-Location "$ProjectRoot\backend"
& $PythonExe -m pip install -e .
