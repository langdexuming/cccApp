param(
    [string]$RunId,
    [string]$MergedDir,
    [string]$ProjectRoot = "",
    [string]$EnvRoot = "E:\.env_trains",
    [string]$Outtype = "f16",
    [string]$OllamaModelName,
    [string]$EvalDatasetPath = "",
    [string]$BenchmarkDatasetPath = "",
    [switch]$SkipBenchmark = $false,
    [switch]$Force = $false
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
if ([string]::IsNullOrWhiteSpace($EvalDatasetPath)) {
    $EvalDatasetPath = Join-Path $ProjectRoot "runtime\datasets\alarm_analysis_eval_v1\smoke_eval.jsonl"
}
if ([string]::IsNullOrWhiteSpace($BenchmarkDatasetPath)) {
    $BenchmarkDatasetPath = Join-Path $ProjectRoot "runtime\datasets\alarm_analysis_eval_v1\benchmark.jsonl"
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-LoggedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$LogPath
    )

    $stdoutPath = "$LogPath.stdout"
    $stderrPath = "$LogPath.stderr"
    foreach ($path in @($LogPath, $stdoutPath, $stderrPath)) {
        if (Test-Path $path) {
            Remove-Item $path -Force
        }
    }

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath

    $mergedOutput = @()
    if (Test-Path $stdoutPath) {
        $mergedOutput += Get-Content $stdoutPath
    }
    if (Test-Path $stderrPath) {
        $mergedOutput += Get-Content $stderrPath
    }
    $mergedOutput | Set-Content -Path $LogPath -Encoding UTF8

    if (Test-Path $stdoutPath) {
        Remove-Item $stdoutPath -Force
    }
    if (Test-Path $stderrPath) {
        Remove-Item $stderrPath -Force
    }

    if ($process.ExitCode -ne 0) {
        throw "Command failed with exit code $($process.ExitCode). Check log: $LogPath"
    }
}

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

$PythonExe = Join-Path $EnvRoot "venvs\lf-py311\Scripts\python.exe"
$ConverterPath = Join-Path $EnvRoot "src\llama.cpp\convert_hf_to_gguf.py"
$EvalScript = Join-Path $ProjectRoot "scripts\run_ollama_eval.py"

if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}
if (-not (Test-Path $ConverterPath)) {
    throw "GGUF converter not found: $ConverterPath"
}
if (-not (Test-Path $EvalScript)) {
    throw "Eval script not found: $EvalScript"
}

if (-not $RunId -and -not $MergedDir) {
    throw "Please provide -RunId or -MergedDir."
}

if ($RunId) {
    $RunRoot = Join-Path $ProjectRoot "runtime\runs\$RunId"
    $MergedModelDir = Join-Path $RunRoot "output\merged"
    $OutputRoot = $RunRoot
} else {
    $MergedModelDir = $MergedDir
    $Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputRoot = Join-Path $ProjectRoot "runtime\smoke\lf_phase1_$Stamp"
}

if (-not (Test-Path $MergedModelDir)) {
    throw "Merged model directory not found: $MergedModelDir"
}

$OutputDir = Join-Path $OutputRoot "output"
$LogDir = Join-Path $OutputRoot "logs"
$EvalDir = Join-Path $OutputRoot "eval"
$BenchmarkDir = Join-Path $OutputRoot "benchmark"

New-Item -ItemType Directory -Force -Path $OutputDir, $LogDir, $EvalDir, $BenchmarkDir | Out-Null

$ModelGgufPath = Join-Path $OutputDir "model.gguf"
$ModelfilePath = Join-Path $OutputDir "Modelfile"
$ConvertLogPath = Join-Path $LogDir "gguf-convert.log"
$OllamaLogPath = Join-Path $LogDir "ollama-create.log"
$EvalLogPath = Join-Path $LogDir "smoke-eval.log"
$BenchmarkLogPath = Join-Path $LogDir "smoke-benchmark.log"
$ModelGgufRef = $ModelGgufPath.Replace("\", "/")

if (-not $OllamaModelName) {
    $Suffix = if ($RunId) { $RunId } else { "merged" }
    $OllamaModelName = "alarm-lf-smoke-$Suffix"
}

if ($Force -or -not (Test-Path $ModelGgufPath)) {
    Invoke-LoggedProcess `
        -FilePath $PythonExe `
        -ArgumentList @($ConverterPath, $MergedModelDir, "--outfile", $ModelGgufPath, "--outtype", $Outtype) `
        -WorkingDirectory $OutputDir `
        -LogPath $ConvertLogPath
}

$modelfile = @(
    "FROM $ModelGgufRef",
    'SYSTEM """/no_think',
    'You are an alarm diagnosis assistant for power-room monitoring. Output diagnosis, handling suggestions, and root cause analysis only."""',
    "PARAMETER temperature 0.1",
    "PARAMETER top_p 0.8",
    "PARAMETER num_ctx 8192",
    ""
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($ModelfilePath, $modelfile, [System.Text.UTF8Encoding]::new($false))

Invoke-LoggedProcess `
    -FilePath "ollama" `
    -ArgumentList @("create", $OllamaModelName, "-f", $ModelfilePath) `
    -WorkingDirectory $OutputDir `
    -LogPath $OllamaLogPath

$OptionsJson = '{"temperature":0.1,"top_p":0.8,"seed":42,"num_ctx":8192,"num_predict":512}'
$EvalOutputPath = Join-Path $EvalDir "eval_results.jsonl"
$EvalSummaryPath = Join-Path $EvalDir "eval_summary.json"

Invoke-LoggedProcess `
    -FilePath $PythonExe `
    -ArgumentList @(
        $EvalScript,
        "--mode", "eval",
        "--model-name", $OllamaModelName,
        "--dataset-path", $EvalDatasetPath,
        "--output-path", $EvalOutputPath,
        "--summary-path", $EvalSummaryPath,
        "--keep-alive", "10m",
        "--options-json", $OptionsJson
    ) `
    -WorkingDirectory $ProjectRoot `
    -LogPath $EvalLogPath

if ((-not $SkipBenchmark) -and (Test-Path $BenchmarkDatasetPath)) {
    $BenchmarkOutputPath = Join-Path $BenchmarkDir "benchmark_results.jsonl"
    $BenchmarkSummaryPath = Join-Path $BenchmarkDir "benchmark_summary.json"

    Invoke-LoggedProcess `
        -FilePath $PythonExe `
        -ArgumentList @(
            $EvalScript,
            "--mode", "benchmark",
            "--model-name", $OllamaModelName,
            "--dataset-path", $BenchmarkDatasetPath,
            "--output-path", $BenchmarkOutputPath,
            "--summary-path", $BenchmarkSummaryPath,
            "--keep-alive", "10m",
            "--options-json", $OptionsJson
        ) `
        -WorkingDirectory $ProjectRoot `
        -LogPath $BenchmarkLogPath
}

Write-Host "Phase-1 smoke test completed." -ForegroundColor Green
Write-Host "  merged_dir   = $MergedModelDir"
Write-Host "  gguf_path    = $ModelGgufPath"
Write-Host "  ollama_model = $OllamaModelName"
Write-Host "  eval_summary = $EvalSummaryPath"
