param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$RepoRoot = "E:\.env_trains\src\LLaMA-Factory",
    [string]$RepoUrl = "https://github.com/hiyouga/LLaMA-Factory.git",
    [string]$TorchIndexUrl = "https://download.pytorch.org/whl/cu126",
    [switch]$InstallBitsAndBytes = $false,
    [string]$BitsAndBytesWheelUrl = "https://github.com/jllllll/bitsandbytes-windows-webui/releases/download/wheels/bitsandbytes-0.41.2.post2-py3-none-win_amd64.whl",
    [string]$EnvRoot = "E:\.env_trains"
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
$GitExe = (Get-Command git -ErrorAction SilentlyContinue).Source

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment python not found: $VenvPython"
}

if (-not $GitExe) {
    throw "git not found in PATH."
}

if (-not (Test-Path $RepoRoot)) {
    & $GitExe clone --depth 1 $RepoUrl $RepoRoot
} else {
    & $GitExe -C $RepoRoot pull --ff-only
}

& $VenvPython -m pip uninstall -y torch torchvision torchaudio
& $VenvPython -m pip install torch torchvision torchaudio --index-url $TorchIndexUrl
& $VenvPython -c "import torch; print('torch.cuda.is_available =', torch.cuda.is_available())"

& $VenvPython -m pip install -e $RepoRoot

$MetricsRequirements = Join-Path $RepoRoot "requirements\metrics.txt"
if (Test-Path $MetricsRequirements) {
    & $VenvPython -m pip install -r $MetricsRequirements
}

if ($InstallBitsAndBytes) {
    & $VenvPython -m pip install $BitsAndBytesWheelUrl
}

Write-Host "Installed LLaMA-Factory into $VenvPath" -ForegroundColor Green
Write-Host "Repo: $RepoRoot"
