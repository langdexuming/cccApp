param(
    [string]$EnvRoot = "E:\.env_trains"
)

$cacheRoot = Join-Path $EnvRoot "cache"
$cacheDirs = @(
    $EnvRoot,
    $cacheRoot,
    (Join-Path $cacheRoot "pip"),
    (Join-Path $cacheRoot "huggingface"),
    (Join-Path $cacheRoot "huggingface\hub"),
    (Join-Path $cacheRoot "huggingface\datasets"),
    (Join-Path $cacheRoot "huggingface\assets"),
    (Join-Path $cacheRoot "torch"),
    (Join-Path $cacheRoot "npm"),
    (Join-Path $cacheRoot "modelscope"),
    (Join-Path $cacheRoot "modelscope\models"),
    (Join-Path $cacheRoot "modelscope\datasets"),
    (Join-Path $cacheRoot "ollama"),
    (Join-Path $EnvRoot "tmp")
)

foreach ($dir in $cacheDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$env:PIP_CACHE_DIR = Join-Path $cacheRoot "pip"
$env:HF_HOME = Join-Path $cacheRoot "huggingface"
$env:HF_HUB_CACHE = Join-Path $cacheRoot "huggingface\hub"
$env:HUGGINGFACE_HUB_CACHE = $env:HF_HUB_CACHE
$env:HF_DATASETS_CACHE = Join-Path $cacheRoot "huggingface\datasets"
$env:HUGGINGFACE_ASSETS_CACHE = Join-Path $cacheRoot "huggingface\assets"
$env:TRANSFORMERS_CACHE = Join-Path $cacheRoot "huggingface\hub"
$env:TORCH_HOME = Join-Path $cacheRoot "torch"
$env:MODELSCOPE_CACHE = Join-Path $cacheRoot "modelscope"
$env:XDG_CACHE_HOME = $cacheRoot
$env:TMP = Join-Path $EnvRoot "tmp"
$env:TEMP = $env:TMP
$env:npm_config_cache = Join-Path $cacheRoot "npm"
$env:OLLAMA_MODELS = Join-Path $cacheRoot "ollama"
$env:USE_MODELSCOPE_HUB = "1"

Write-Host "Cache environment applied for current PowerShell session." -ForegroundColor Green
Write-Host "  MODELSCOPE_CACHE = $env:MODELSCOPE_CACHE"
Write-Host "  HF_HOME          = $env:HF_HOME"
Write-Host "  PIP_CACHE_DIR    = $env:PIP_CACHE_DIR"
Write-Host "  TMP/TEMP         = $env:TMP"
