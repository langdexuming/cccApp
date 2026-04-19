param(
    [string]$VenvPath = "E:\.env_trains\venvs\lf-py311",
    [string]$RepoRoot = "E:\.env_trains\src\llama.cpp",
    [string]$RepoUrl = "https://github.com/ggerganov/llama.cpp.git",
    [string]$EnvRoot = "E:\.env_trains",
    [switch]$BuildQuantize = $false
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$PythonExe = Join-Path $VenvPath "Scripts\python.exe"
$GitExe = (Get-Command git -ErrorAction SilentlyContinue).Source

if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

if (-not $GitExe) {
    throw "git not found in PATH."
}

if (-not (Test-Path $RepoRoot)) {
    & $GitExe clone --depth 1 $RepoUrl $RepoRoot
} else {
    & $GitExe -C $RepoRoot pull --ff-only
}

$requirementsCandidates = @(
    (Join-Path $RepoRoot "requirements\requirements-convert_hf_to_gguf.txt"),
    (Join-Path $RepoRoot "requirements\requirements-convert-hf-to-gguf.txt"),
    (Join-Path $RepoRoot "requirements.txt")
)

$requirementsPath = $requirementsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($requirementsPath) {
    & $PythonExe -m pip install -r $requirementsPath
}

$converterPath = Join-Path $RepoRoot "convert_hf_to_gguf.py"
if (-not (Test-Path $converterPath)) {
    throw "GGUF converter script not found after install: $converterPath"
}

& $PythonExe $converterPath --help

if ($BuildQuantize) {
    $CmakeExe = (Get-Command cmake -ErrorAction SilentlyContinue).Source
    if (-not $CmakeExe) {
        throw "cmake not found in PATH. Install CMake first, then rerun with -BuildQuantize."
    }

    $BuildDir = Join-Path $RepoRoot "build"
    & $CmakeExe -S $RepoRoot -B $BuildDir -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_TESTS=OFF
    if ($LASTEXITCODE -ne 0) {
        throw "cmake configure failed."
    }

    & $CmakeExe --build $BuildDir --config Release --target llama-quantize
    if ($LASTEXITCODE -ne 0) {
        throw "cmake build failed for llama-quantize."
    }
}

$quantizeCandidates = @(
    (Join-Path $RepoRoot "build\bin\Release\llama-quantize.exe"),
    (Join-Path $RepoRoot "build\bin\llama-quantize.exe"),
    (Join-Path $RepoRoot "build\bin\Debug\llama-quantize.exe")
)
$quantizePath = $quantizeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host "llama.cpp is ready for GGUF conversion." -ForegroundColor Green
Write-Host "Repo: $RepoRoot"
Write-Host "Converter: $converterPath"
if ($quantizePath) {
    Write-Host "Quantize: $quantizePath"
} else {
    Write-Host "Quantize: not built (Windows phase-1 can still use gguf_outtype=f16)" -ForegroundColor Yellow
}
