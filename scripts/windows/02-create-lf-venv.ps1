param(
    [string]$PythonExe = "E:\.env_trains\python311\python.exe",
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$EnvRoot = "E:\.env_trains"
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

& $PythonExe -m venv $VenvPath

$VenvPython = Join-Path $VenvPath "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment python not found: $VenvPython"
}

& $VenvPython -m pip install --upgrade pip setuptools wheel

Write-Host "Created virtual environment: $VenvPath" -ForegroundColor Green
Write-Host "Python: $VenvPython"
