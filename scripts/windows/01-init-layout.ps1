param(
    [string]$ProjectRoot = "",
    [string]$EnvRoot = "E:\.env_trains",
    [string]$WslRoot = "E:\wsl",
    [switch]$PersistUserEnv = $true
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$dirs = @(
    $EnvRoot,
    "$EnvRoot\venvs",
    "$EnvRoot\src",
    "$EnvRoot\cache",
    "$EnvRoot\cache\pip",
    "$EnvRoot\cache\huggingface",
    "$EnvRoot\cache\huggingface\hub",
    "$EnvRoot\cache\huggingface\datasets",
    "$EnvRoot\cache\huggingface\assets",
    "$EnvRoot\cache\torch",
    "$EnvRoot\cache\npm",
    "$EnvRoot\cache\modelscope",
    "$EnvRoot\cache\modelscope\models",
    "$EnvRoot\cache\modelscope\datasets",
    "$EnvRoot\cache\ollama",
    "$EnvRoot\tmp",
    $WslRoot,
    "$ProjectRoot\runtime",
    "$ProjectRoot\runtime\sqlite",
    "$ProjectRoot\runtime\datasets",
    "$ProjectRoot\runtime\templates",
    "$ProjectRoot\runtime\experiments",
    "$ProjectRoot\runtime\runs",
    "$ProjectRoot\runtime\artifacts",
    "$ProjectRoot\runtime\artifacts\adapters",
    "$ProjectRoot\runtime\runs",
    "$ProjectRoot\runtime\artifacts\merged",
    "$ProjectRoot\runtime\artifacts\gguf",
    "$ProjectRoot\runtime\artifacts\ollama",
    "$ProjectRoot\runtime\logs",
    "$ProjectRoot\runtime\logs\api",
    "$ProjectRoot\runtime\logs\worker",
    "$ProjectRoot\runtime\logs\train",
    "$ProjectRoot\runtime\logs\eval",
    "$ProjectRoot\runtime\logs\benchmark",
    "$ProjectRoot\runtime\reports",
    "$ProjectRoot\runtime\reports\single",
    "$ProjectRoot\runtime\reports\compare"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if ($PersistUserEnv) {
    [Environment]::SetEnvironmentVariable("PIP_CACHE_DIR", "$EnvRoot\cache\pip", "User")
    [Environment]::SetEnvironmentVariable("HF_HOME", "$EnvRoot\cache\huggingface", "User")
    [Environment]::SetEnvironmentVariable("HF_HUB_CACHE", "$EnvRoot\cache\huggingface\hub", "User")
    [Environment]::SetEnvironmentVariable("HUGGINGFACE_HUB_CACHE", "$EnvRoot\cache\huggingface\hub", "User")
    [Environment]::SetEnvironmentVariable("HF_DATASETS_CACHE", "$EnvRoot\cache\huggingface\datasets", "User")
    [Environment]::SetEnvironmentVariable("HUGGINGFACE_ASSETS_CACHE", "$EnvRoot\cache\huggingface\assets", "User")
    [Environment]::SetEnvironmentVariable("TRANSFORMERS_CACHE", "$EnvRoot\cache\huggingface\hub", "User")
    [Environment]::SetEnvironmentVariable("TORCH_HOME", "$EnvRoot\cache\torch", "User")
    [Environment]::SetEnvironmentVariable("MODELSCOPE_CACHE", "$EnvRoot\cache\modelscope", "User")
    [Environment]::SetEnvironmentVariable("XDG_CACHE_HOME", "$EnvRoot\cache", "User")
    [Environment]::SetEnvironmentVariable("TMP", "$EnvRoot\tmp", "User")
    [Environment]::SetEnvironmentVariable("TEMP", "$EnvRoot\tmp", "User")
    [Environment]::SetEnvironmentVariable("npm_config_cache", "$EnvRoot\cache\npm", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "$EnvRoot\cache\ollama", "User")
    [Environment]::SetEnvironmentVariable("USE_MODELSCOPE_HUB", "1", "User")
}

Write-Host "Initialized directories:" -ForegroundColor Green
$dirs | ForEach-Object { Write-Host "  $_" }

if ($PersistUserEnv) {
    Write-Host ""
    Write-Host "Updated user environment variables." -ForegroundColor Green
    Write-Host "Restart PowerShell and Ollama after this step."
}
