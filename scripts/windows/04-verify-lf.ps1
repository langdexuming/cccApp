param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311"
)

$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
$LFCli = Join-Path $VenvPath "Scripts\llamafactory-cli.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment python not found: $VenvPython"
}

Write-Host "Python:" -ForegroundColor Cyan
& $VenvPython --version

Write-Host ""
Write-Host "Torch CUDA check:" -ForegroundColor Cyan
& $VenvPython -c "import torch; print('cuda_available=', torch.cuda.is_available()); print('cuda_device_count=', torch.cuda.device_count())"

if (Test-Path $LFCli) {
    Write-Host ""
    Write-Host "LLaMA-Factory package:" -ForegroundColor Cyan
    & $VenvPython -m pip show llamafactory
    Write-Host ""
    Write-Host "LLaMA-Factory CLI:" -ForegroundColor Cyan
    & $LFCli help
} else {
    Write-Warning "llamafactory-cli.exe not found: $LFCli"
}
