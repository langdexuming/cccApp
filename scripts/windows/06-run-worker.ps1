param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$ProjectRoot = "E:\ai\ai_trains",
    [int]$Interval = 5,
    [switch]$Once = $false
)

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
